const { WebSocketServer } = require('ws');
const http = require('http');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 3;

const httpServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/rooms') {
    const list = Object.values(rooms).map(r => ({
      id: r.id, name: r.name,
      players: Object.keys(r.players).length,
      max: MAX_PLAYERS, state: r.state,
      hostName: Object.values(r.players)[0]?.name || '???',
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(list));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Dungeon Expedition Server OK');
});

const wss = new WebSocketServer({ server: httpServer });
httpServer.listen(PORT, () => console.log(`Server on port ${PORT}`));

let rooms = {};
let nextRoomId = 1;
const COLORS = ['#44aaff','#ff6688','#44dd88','#ffaa44','#cc88ff'];

// ── 맵 생성 ───────────────────────────────────────────
const TILE = 40, COLS = 50, ROWS = 50;
const MAP_W = COLS * TILE, MAP_H = ROWS * TILE;

function generateMap(room) {
  room.tiles = new Uint8Array(COLS * ROWS).fill(0);
  room.rooms_data = [];
  for (let i = 0; i < 14 * 15 && room.rooms_data.length < 14; i++) {
    const rw = 4 + Math.floor(Math.random() * 6);
    const rh = 4 + Math.floor(Math.random() * 5);
    const rx = 2 + Math.floor(Math.random() * (COLS - rw - 4));
    const ry = 2 + Math.floor(Math.random() * (ROWS - rh - 4));
    let ok = true;
    for (const r of room.rooms_data) {
      if (rx<r.x+r.w+2 && rx+rw+2>r.x && ry<r.y+r.h+2 && ry+rh+2>r.y) { ok=false; break; }
    }
    if (!ok) continue;
    room.rooms_data.push({ x:rx,y:ry,w:rw,h:rh,cx:rx+Math.floor(rw/2),cy:ry+Math.floor(rh/2) });
    for (let row=ry;row<ry+rh;row++) for (let col=rx;col<rx+rw;col++) room.tiles[row*COLS+col]=1;
  }
  for (let i=1; i<room.rooms_data.length; i++) {
    const a=room.rooms_data[i-1], b=room.rooms_data[i];
    let cx=a.cx, cy=a.cy;
    while(cx!==b.cx){ room.tiles[cy*COLS+cx]=1; cx+=cx<b.cx?1:-1; }
    while(cy!==b.cy){ room.tiles[cy*COLS+cx]=1; cy+=cy<b.cy?1:-1; }
  }
  const last=room.rooms_data[room.rooms_data.length-1];
  room.bossArena={ x:last.x*TILE, y:last.y*TILE, w:last.w*TILE, h:last.h*TILE };
}

// ── 몬스터 ────────────────────────────────────────────
const MTYPE = {
  goblin:    {hp:55,  atk:18,spd:1.9,range:60, cd:115,size:12,score:10,label:'고블린'},
  skeleton:  {hp:70,  atk:22,spd:1.4,range:70, cd:130,size:13,score:15,label:'해골'},
  slime:     {hp:40,  atk:12,spd:1.1,range:50, cd:100,size:11,score:8, label:'슬라임'},
  orc:       {hp:105, atk:32,spd:1.2,range:90, cd:145,size:17,score:20,label:'오크'},
  archer:    {hp:60,  atk:28,spd:1.6,range:220,cd:160,size:13,score:18,label:'아처'},
  berserker: {hp:130, atk:42,spd:1.7,range:80, cd:120,size:16,score:30,label:'버서커'},
  boss:      {hp:800, atk:55,spd:1.3,range:150,cd:140,size:28,score:200,label:'보스'},
};

function isWall(room,x,y){ const c=Math.floor(x/TILE),r=Math.floor(y/TILE); if(c<0||c>=COLS||r<0||r>=ROWS) return true; return room.tiles[r*COLS+c]!==1; }
function dist(a,b){ const dx=a.x-b.x,dy=a.y-b.y; return Math.sqrt(dx*dx+dy*dy); }

function spawnMonster(room, type) {
  const cfg=MTYPE[type]||MTYPE.goblin;
  const r=room.rooms_data[1+Math.floor(Math.random()*(room.rooms_data.length-2))];
  if(!r) return;
  const id='m'+(room.nextId++);
  room.monsters[id]={ id,type,x:(r.x+1+Math.floor(Math.random()*(r.w-2)))*TILE+TILE/2,
    y:(r.y+1+Math.floor(Math.random()*(r.h-2)))*TILE+TILE/2,
    hp:cfg.hp,maxHp:cfg.hp,atk:cfg.atk,spd:cfg.spd,range:cfg.range,
    cd:0,cdMax:cfg.cd,size:cfg.size,score:cfg.score,label:cfg.label,alive:true,enraged:false };
}

function initMonsters(room) {
  room.monsters={};
  const types=['goblin','skeleton','slime','orc','archer','berserker'];
  for(let i=0;i<20+room.stage*6;i++) spawnMonster(room,types[Math.floor(Math.random()*types.length)]);
}

// ── 방 생성 ───────────────────────────────────────────
function createRoom(roomName) {
  const id='room_'+(nextRoomId++);
  const room = {
    id, name:roomName||`방 ${nextRoomId-1}`,
    players:{}, monsters:{}, bullets:[],
    state:'waiting',  // waiting | playing | ended
    hostId: null,
    stage:1, kills:0, totalKills:0, tick:0,
    bossSpawned:false, nextId:1,
    tiles:null, rooms_data:[], bossArena:null,
  };
  generateMap(room);
  rooms[id]=room;
  return room;
}

// ── 대기실 브로드캐스트 ──────────────────────────────
function broadcastWaiting(room) {
  const playerList = Object.values(room.players).map(p=>({
    id:p.id, name:p.name, colorIdx:p.colorIdx
  }));
  broadcastRoom(room, {
    type:'waiting',
    players: playerList,
    hostId: room.hostId,
    roomName: room.name,
  });
}

// ── 게임 시작 ─────────────────────────────────────────
function startGame(room) {
  room.state='playing';
  initMonsters(room);
  // 플레이어 위치 초기화
  const startRoom = room.rooms_data[0];
  Object.values(room.players).forEach((p,i) => {
    p.x = startRoom.cx*TILE + (i-1)*40;
    p.y = startRoom.cy*TILE;
    p.hp=120; p.maxHp=120; p.alive=true; p.iframes=0; p.shieldActive=0; p.score=0;
  });
  broadcastRoom(room, {
    type:'game_start',
    tiles: Array.from(room.tiles),
    mapW: MAP_W, mapH: MAP_H,
    bossArena: room.bossArena,
    rooms: room.rooms_data,
  });
}

// ── 게임 루프 ─────────────────────────────────────────
function gameTick(room) {
  if(room.state!=='playing') return;
  room.tick++;
  const ps=Object.values(room.players);
  const alive=ps.filter(p=>p.alive);

  for(const p of ps){
    if(!p.alive) continue;
    const inp=p.input||{};
    let dx=0,dy=0;
    if(inp.up) dy-=2.8; if(inp.down) dy+=2.8;
    if(inp.left) dx-=2.8; if(inp.right) dx+=2.8;
    if(dx&&dy){dx*=0.707;dy*=0.707;}
    if(!isWall(room,p.x+dx,p.y)) p.x+=dx;
    if(!isWall(room,p.x,p.y+dy)) p.y+=dy;
    if(p.iframes>0) p.iframes--;
    if(p.shieldActive>0) p.shieldActive--;
  }

  room.bullets=room.bullets.filter(b=>{
    b.x+=Math.cos(b.angle)*b.speed; b.y+=Math.sin(b.angle)*b.speed; b.life--;
    if(b.life<=0||isWall(room,b.x,b.y)) return false;
    if(b.isMob){
      for(const p of ps){
        if(!p.alive||p.iframes>0||p.shieldActive>0) continue;
        if(dist(b,p)<18){ p.hp-=b.dmg; p.iframes=60; if(p.hp<=0){p.hp=0;p.alive=false;} return false; }
      }
    } else {
      for(const m of Object.values(room.monsters)){
        if(!m.alive) continue;
        if(dist(b,m)<m.size+8){
          m.hp-=b.dmg;
          if(m.hp<=0){ m.alive=false; room.kills++; room.totalKills++; const op=room.players[b.pid]; if(op) op.score+=m.score||10; }
          return false;
        }
      }
    }
    return true;
  });

  for(const m of Object.values(room.monsters)){
    if(!m.alive) continue;
    if(m.hp<m.maxHp*0.3) m.enraged=true;
    let target=null,minD=Infinity;
    for(const p of alive){ const d=dist(m,p); if(d<minD){minD=d;target=p;} }
    if(!target) continue;
    const spd=m.spd*(m.enraged?1.4:1);
    if(minD>m.size+10){
      const ang=Math.atan2(target.y-m.y,target.x-m.x);
      if(!isWall(room,m.x+Math.cos(ang)*spd,m.y)) m.x+=Math.cos(ang)*spd;
      if(!isWall(room,m.x,m.y+Math.sin(ang)*spd)) m.y+=Math.sin(ang)*spd;
    }
    if(m.cd>0){m.cd--;continue;}
    if(minD<m.range){
      m.cd=m.cdMax;
      const ang=Math.atan2(target.y-m.y,target.x-m.x);
      if(m.range>150){
        room.bullets.push({x:m.x,y:m.y,angle:ang,speed:5,dmg:m.atk,life:80,isMob:true,col:'#f44'});
      } else if(minD<m.size+24&&target.iframes===0&&target.shieldActive===0){
        target.hp-=m.atk; target.iframes=50; if(target.hp<=0){target.hp=0;target.alive=false;}
      }
    }
  }

  if(ps.length>0&&alive.length===0){ broadcastRoom(room,{type:'game_over'}); room.state='ended'; return; }

  const normalAlive=Object.values(room.monsters).filter(m=>m.alive&&m.type!=='boss').length;
  if(normalAlive===0&&!room.bossSpawned){
    room.bossSpawned=true; spawnMonster(room,'boss');
    broadcastRoom(room,{type:'boss_spawn'});
  }
  const bossAlive=Object.values(room.monsters).find(m=>m.type==='boss'&&m.alive);
  if(room.bossSpawned&&!bossAlive){
    if(room.stage>=5){ broadcastRoom(room,{type:'game_won'}); room.state='ended'; return; }
    room.stage++; room.bossSpawned=false; initMonsters(room);
    broadcastRoom(room,{type:'stage_clear',stage:room.stage});
  }

  broadcastRoom(room,{
    type:'state',
    players:ps.map(p=>({id:p.id,name:p.name,x:p.x,y:p.y,hp:p.hp,maxHp:p.maxHp,
      alive:p.alive,iframes:p.iframes,shieldActive:p.shieldActive,
      facing:p.facing,colorIdx:p.colorIdx,score:p.score,charId:p.charId||'photo0'})),
    monsters:Object.values(room.monsters).filter(m=>m.alive).map(m=>({
      id:m.id,type:m.type,x:m.x,y:m.y,hp:m.hp,maxHp:m.maxHp,
      alive:m.alive,size:m.size,enraged:m.enraged,label:m.label})),
    bullets:room.bullets.map(b=>({x:b.x,y:b.y,angle:b.angle,isMob:b.isMob,col:b.col||'#f44'})),
    stage:room.stage,kills:room.kills,totalKills:room.totalKills,tick:room.tick,
  });
}

function broadcastRoom(room,msg,exclude=null){
  const data=JSON.stringify(msg);
  for(const p of Object.values(room.players)){
    if(p.ws&&p.ws!==exclude&&p.ws.readyState===1) p.ws.send(data);
  }
}

// ── WebSocket ─────────────────────────────────────────
wss.on('connection', ws => {
  let playerRoom=null, pid=null;

  ws.on('message', data => {
    let msg; try{ msg=JSON.parse(data); }catch{ return; }

    // 방 목록
    if(msg.type==='list_rooms'){
      const list=Object.values(rooms).filter(r=>r.state==='waiting').map(r=>({
        id:r.id, name:r.name,
        players:Object.keys(r.players).length, max:MAX_PLAYERS,
        hostName:Object.values(r.players)[0]?.name||'???',
      }));
      ws.send(JSON.stringify({type:'room_list',rooms:list})); return;
    }

    // 방 만들기
    if(msg.type==='create_room'){
      const room=createRoom(msg.roomName||((msg.name||'용사')+'의 방'));
      pid='p'+(room.nextId++);
      const ci=0;
      room.players[pid]={ id:pid, name:msg.name||'용사', ws,
        x:0,y:0,hp:120,maxHp:120,alive:true,iframes:0,shieldActive:0,
        facing:0,input:{},colorIdx:ci,score:0,
        charId:msg.charId||'photo0' };
      room.hostId=pid;
      playerRoom=room;
      // init 전송 (맵 정보 포함 - 대기실에서 미리 수신)
      ws.send(JSON.stringify({
        type:'init', pid, colorIdx:ci, roomId:room.id, roomName:room.name,
        tiles:Array.from(room.tiles), mapW:MAP_W, mapH:MAP_H,
        bossArena:room.bossArena, rooms:room.rooms_data,
        isHost:true, charId:msg.charId||'photo0',
      }));
      broadcastWaiting(room); return;
    }

    // 방 참여
    if(msg.type==='join_room'){
      const room=rooms[msg.roomId];
      if(!room){ ws.send(JSON.stringify({type:'error',msg:'방을 찾을 수 없습니다.'})); return; }
      if(room.state!=='waiting'){ ws.send(JSON.stringify({type:'error',msg:'이미 게임이 시작된 방입니다.'})); return; }
      if(Object.keys(room.players).length>=MAX_PLAYERS){ ws.send(JSON.stringify({type:'full'})); return; }
      pid='p'+(room.nextId++);
      const ci=Object.keys(room.players).length%COLORS.length;
      room.players[pid]={ id:pid, name:msg.name||'용사', ws,
        x:0,y:0,hp:120,maxHp:120,alive:true,iframes:0,shieldActive:0,
        facing:0,input:{},colorIdx:ci,score:0,
        charId:msg.charId||'photo0' };
      playerRoom=room;
      ws.send(JSON.stringify({
        type:'init', pid, colorIdx:ci, roomId:room.id, roomName:room.name,
        tiles:Array.from(room.tiles), mapW:MAP_W, mapH:MAP_H,
        bossArena:room.bossArena, rooms:room.rooms_data,
        isHost:false, charId:msg.charId||'photo0',
      }));
      broadcastWaiting(room); return;
    }

    if(!playerRoom||!pid) return;
    const player=playerRoom.players[pid];
    if(!player) return;

    // 이름 변경
    if(msg.type==='name'){ player.name=(msg.name||'용사').slice(0,12); broadcastWaiting(playerRoom); return; }

    // 게임 시작 (방장만)
    if(msg.type==='start_game'){
      if(pid!==playerRoom.hostId){ ws.send(JSON.stringify({type:'error',msg:'방장만 시작할 수 있습니다.'})); return; }
      if(Object.keys(playerRoom.players).length<1){ ws.send(JSON.stringify({type:'error',msg:'최소 1명 필요합니다.'})); return; }
      startGame(playerRoom); return;
    }

    if(playerRoom.state!=='playing') return;
    if(msg.type==='input'){ player.input=msg.input; if(typeof msg.input?.mouseAngle==='number') player.facing=msg.input.mouseAngle; return; }
    if(msg.type==='attack'&&player.alive){
      playerRoom.bullets.push({x:player.x,y:player.y,angle:player.facing||0,speed:9,dmg:30,life:55,isMob:false,pid});
      broadcastRoom(playerRoom,{type:'attack_fx',x:player.x,y:player.y,pid}); return;
    }
    if(msg.type==='bomb'&&player.alive){
      for(let i=0;i<8;i++) playerRoom.bullets.push({x:player.x,y:player.y,angle:i*Math.PI/4,speed:6,dmg:50,life:40,isMob:false,pid}); return;
    }
    if(msg.type==='shield'&&player.alive){ player.shieldActive=180; return; }
    if(msg.type==='thunder'&&player.alive){
      for(const m of Object.values(playerRoom.monsters)){
        if(!m.alive||dist(player,m)>160) continue;
        m.hp-=80; if(m.hp<=0){m.alive=false;playerRoom.kills++;player.score+=m.score||10;}
      }
      broadcastRoom(playerRoom,{type:'thunder_fx',x:player.x,y:player.y,r:160}); return;
    }
  });

  ws.on('close', ()=>{
    if(!playerRoom||!pid) return;
    const name=playerRoom.players[pid]?.name||'???';
    const wasHost=(pid===playerRoom.hostId);
    delete playerRoom.players[pid];
    const remaining=Object.keys(playerRoom.players).length;
    if(remaining===0){ delete rooms[playerRoom.id]; return; }
    // 방장이 나가면 다음 사람이 방장
    if(wasHost){ playerRoom.hostId=Object.keys(playerRoom.players)[0]; }
    broadcastRoom(playerRoom,{type:'player_leave',name,count:remaining});
    if(playerRoom.state==='waiting') broadcastWaiting(playerRoom);
  });
});

setInterval(()=>{ Object.values(rooms).forEach(r=>{ if(r.state==='playing') gameTick(r); }); },1000/60);
