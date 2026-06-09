const { WebSocketServer } = require('ws');
const http = require('http');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 3;

const httpServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/rooms') {
    const list = Object.values(rooms).filter(r=>r.state==='waiting').map(r => ({
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

// ── 싱글과 동일한 맵 설정 ─────────────────────────────
const TILE = 48;
const BASE_MAP_W = 4000, BASE_MAP_H = 3200;

function rng(a, b) { return a + Math.floor(Math.random() * (b - a)); }

function buildMap(stage) {
  const MAP_W = BASE_MAP_W + (stage-1)*800;
  const MAP_H = BASE_MAP_H + (stage-1)*600;
  const COLS = MAP_W/TILE|0;
  const ROWS = MAP_H/TILE|0;

  const tiles = new Uint8Array(COLS*ROWS).fill(1);

  function setTile(c, r, v) {
    if(c>=0&&c<COLS&&r>=0&&r<ROWS) tiles[r*COLS+c]=v;
  }
  function tileAt(c, r) {
    if(c<0||c>=COLS||r<0||r>=ROWS) return 1;
    return tiles[r*COLS+c];
  }

  const rooms_data = [];

  // BSP 분할 (싱글과 동일)
  function splitRect(x, y, w, h, depth) {
    const MIN_SIZE=10, MAX_SIZE=22;
    if(depth<=0||w<MIN_SIZE*2||h<MIN_SIZE*2){
      const rw=rng(8,Math.min(w-2,MAX_SIZE));
      const rh=rng(6,Math.min(h-2,MAX_SIZE));
      const rx=x+rng(1,w-rw-1);
      const ry=y+rng(1,h-rh-1);
      for(let r=ry;r<ry+rh;r++) for(let c=rx;c<rx+rw;c++) setTile(c,r,0);
      rooms_data.push({cx:rx+(rw>>1),cy:ry+(rh>>1),x:rx,y:ry,w:rw,h:rh});
      return;
    }
    if(w>h&&w>=MIN_SIZE*2){
      const cut=rng(Math.floor(w*0.35),Math.floor(w*0.65));
      splitRect(x,y,cut,h,depth-1);
      splitRect(x+cut,y,w-cut,h,depth-1);
    } else if(h>=MIN_SIZE*2){
      const cut=rng(Math.floor(h*0.35),Math.floor(h*0.65));
      splitRect(x,y,w,cut,depth-1);
      splitRect(x,y+cut,w,h-cut,depth-1);
    } else {
      const rw=rng(8,Math.min(w-2,MAX_SIZE));
      const rh=rng(6,Math.min(h-2,MAX_SIZE));
      const rx=x+rng(1,w-rw-1);
      const ry=y+rng(1,h-rh-1);
      for(let r=ry;r<ry+rh;r++) for(let c=rx;c<rx+rw;c++) setTile(c,r,0);
      rooms_data.push({cx:rx+(rw>>1),cy:ry+(rh>>1),x:rx,y:ry,w:rw,h:rh});
    }
  }

  function carveCorridor(ax,ay,bx,by){
    const thick=2;
    if(Math.random()<0.5){
      const minX=Math.min(ax,bx),maxX=Math.max(ax,bx);
      for(let c=minX;c<=maxX;c++) for(let t=-thick;t<=thick;t++) setTile(c,ay+t,0);
      const minY=Math.min(ay,by),maxY=Math.max(ay,by);
      for(let r=minY;r<=maxY;r++) for(let t=-thick;t<=thick;t++) setTile(bx+t,r,0);
    } else {
      const minY=Math.min(ay,by),maxY=Math.max(ay,by);
      for(let r=minY;r<=maxY;r++) for(let t=-thick;t<=thick;t++) setTile(ax+t,r,0);
      const minX=Math.min(ax,bx),maxX=Math.max(ax,bx);
      for(let c=minX;c<=maxX;c++) for(let t=-thick;t<=thick;t++) setTile(c,by+t,0);
    }
  }

  const bspDepth = 4 + Math.min(stage-1, 3);
  splitRect(1,1,COLS-2,ROWS-2,bspDepth);

  if(rooms_data.length>1){
    const connected=new Set([0]);
    while(connected.size<rooms_data.length){
      const edges=[];
      connected.forEach(i=>{
        for(let j=0;j<rooms_data.length;j++){
          if(connected.has(j)) continue;
          const d=Math.hypot(rooms_data[i].cx-rooms_data[j].cx,rooms_data[i].cy-rooms_data[j].cy);
          edges.push({i,j,d});
        }
      });
      edges.sort((a,b)=>a.d-b.d);
      const e=edges[0];
      carveCorridor(rooms_data[e.i].cx,rooms_data[e.i].cy,rooms_data[e.j].cx,rooms_data[e.j].cy);
      connected.add(e.j);
    }
    const extra=Math.floor(rooms_data.length*0.15);
    for(let k=0;k<extra;k++){
      const a=rooms_data[rng(0,rooms_data.length)],b=rooms_data[rng(0,rooms_data.length)];
      if(a!==b) carveCorridor(a.cx,a.cy,b.cx,b.cy);
    }
  }

  // 보스 방 (싱글과 동일 위치)
  const bossArena={x:MAP_W-920,y:MAP_H-840,w:880,h:800};
  const bc=Math.floor(bossArena.x/TILE),br2=Math.floor(bossArena.y/TILE);
  const bw=Math.ceil(bossArena.w/TILE),bh=Math.ceil(bossArena.h/TILE);
  for(let r=br2;r<br2+bh;r++) for(let c=bc;c<bc+bw;c++) setTile(c,r,0);
  const ey=br2+(bh>>1);
  for(let r=ey-5;r<=ey+5;r++) for(let c=bc-10;c<=bc;c++) setTile(c,r,0);
  let closest=rooms_data[0],closestD=Infinity;
  rooms_data.forEach(rm=>{
    const d=Math.hypot(rm.cx*TILE-bossArena.x,rm.cy*TILE-bossArena.y);
    if(d<closestD){closestD=d;closest=rm;}
  });
  carveCorridor(closest.cx,closest.cy,Math.floor(bossArena.x/TILE)+bw/2|0,ey);

  return {tiles,rooms_data,bossArena,MAP_W,MAP_H,COLS,ROWS};
}

// ── 몬스터 ───────────────────────────────────────────
const MTYPE = {
  goblin:    {hp:55, atk:18,spd:1.9,range:60, cd:115,size:12,score:10,label:'고블린'},
  skeleton:  {hp:70, atk:22,spd:1.4,range:70, cd:130,size:13,score:15,label:'해골'},
  slime:     {hp:40, atk:12,spd:1.1,range:50, cd:100,size:11,score:8, label:'슬라임'},
  orc:       {hp:105,atk:32,spd:1.2,range:90, cd:145,size:17,score:20,label:'오크'},
  archer:    {hp:60, atk:28,spd:1.6,range:220,cd:160,size:13,score:18,label:'아처'},
  berserker: {hp:130,atk:42,spd:1.7,range:80, cd:120,size:16,score:30,label:'버서커'},
  boss:      {hp:800,atk:55,spd:1.3,range:150,cd:140,size:28,score:200,label:'보스'},
};

function isWall(room,x,y){
  const c=Math.floor(x/room.TILE),r=Math.floor(y/room.TILE);
  if(c<0||c>=room.COLS||r<0||r>=room.ROWS) return true;
  return room.tiles[r*room.COLS+c]!==0;
}
function dist(a,b){const dx=a.x-b.x,dy=a.y-b.y;return Math.sqrt(dx*dx+dy*dy);}

function spawnMonster(room,type){
  const cfg=MTYPE[type]||MTYPE.goblin;
  const rd=room.rooms_data[1+Math.floor(Math.random()*(room.rooms_data.length-2))];
  if(!rd) return;
  const id='m'+(room.nextId++);
  room.monsters[id]={
    id,type,
    x:(rd.cx+rng(-rd.w/2+2,rd.w/2-2))*room.TILE,
    y:(rd.cy+rng(-rd.h/2+2,rd.h/2-2))*room.TILE,
    hp:cfg.hp,maxHp:cfg.hp,atk:cfg.atk,spd:cfg.spd,range:cfg.range,
    cd:0,cdMax:cfg.cd,size:cfg.size,score:cfg.score,label:cfg.label,
    alive:true,enraged:false
  };
}

function initMonsters(room){
  room.monsters={};
  const types=['goblin','skeleton','slime','orc','archer','berserker'];
  const count=20+room.stage*6;
  for(let i=0;i<count;i++) spawnMonster(room,types[Math.floor(Math.random()*types.length)]);
}

// ── 방 생성 ──────────────────────────────────────────
function createRoom(roomName){
  const id='room_'+(nextRoomId++);
  const room={
    id,name:roomName||`방 ${nextRoomId-1}`,
    players:{},monsters:{},bullets:[],bombs:[],
    state:'waiting',hostId:null,
    stage:1,kills:0,totalKills:0,tick:0,
    bossSpawned:false,nextId:1,
    tiles:null,rooms_data:[],bossArena:null,
    MAP_W:BASE_MAP_W,MAP_H:BASE_MAP_H,COLS:0,ROWS:0,TILE,
    items:[],
  };
  const mapData=buildMap(1);
  Object.assign(room,mapData);
  rooms[id]=room;
  return room;
}

function broadcastWaiting(room){
  const playerList=Object.values(room.players).map(p=>({
    id:p.id,name:p.name,colorIdx:p.colorIdx,charId:p.charId||'photo0'
  }));
  // 아이템 pulse 업데이트 및 수명 관리
  if(room.items){
    room.items.forEach(it=>{ it.pulse=(it.pulse||0)+1; it.life=(it.life||600)-1; });
    room.items=room.items.filter(it=>it.life>0);
  }

  broadcastRoom(room,{type:'waiting',players:playerList,hostId:room.hostId,roomName:room.name});
}

function startGame(room){
  room.state='playing';
  room.items=[];
  initMonsters(room);
  // 싱글과 동일하게 첫 번째 방 왼쪽 상단 근처에서 시작
  const startRoom=room.rooms_data[0];
  const startX=startRoom.cx*room.TILE;
  const startY=startRoom.cy*room.TILE;
  Object.values(room.players).forEach((p,i)=>{
    p.x=startX+(i*50);
    p.y=startY;
    p.hp=120;p.maxHp=120;p.alive=true;p.iframes=0;p.shieldActive=0;p.score=0;
  });
  broadcastRoom(room,{
    type:'game_start',
    tiles:Array.from(room.tiles),
    mapW:room.MAP_W,mapH:room.MAP_H,
    cols:room.COLS,rows:room.ROWS,
    bossArena:room.bossArena,
    rooms:room.rooms_data,
    tile:room.TILE,
  });
}

// ── 게임 루프 ─────────────────────────────────────────
function gameTick(room){
  if(room.state!=='playing') return;
  room.tick++;
  const ps=Object.values(room.players);
  const alive=ps.filter(p=>p.alive);

  for(const p of ps){
    if(!p.alive) continue;
    const inp=p.input||{};
    let dx=0,dy=0;
    if(inp.up)dy-=3.2;if(inp.down)dy+=3.2;
    if(inp.left)dx-=3.2;if(inp.right)dx+=3.2;
    if(dx&&dy){dx*=0.707;dy*=0.707;}
    if(!isWall(room,p.x+dx,p.y))p.x+=dx;
    if(!isWall(room,p.x,p.y+dy))p.y+=dy;
    if(p.iframes>0)p.iframes--;
    if(p.shieldActive>0)p.shieldActive--;
  }

  // ── 폭탄 업데이트 ──
  if(!room.bombs) room.bombs=[];
  room.bombs=room.bombs.filter(b=>{
    if(b.exploded){
      b.explodeTimer++;
      b.radius=b.maxRadius*(b.explodeTimer/20);
      if(b.explodeTimer===5){
        // 폭발 범위 피해
        for(const p of Object.values(room.players)){
          if(!p.alive||p.iframes>0||p.shieldActive>0) continue;
          if(dist(b,p)<b.maxRadius){ p.hp-=80; p.iframes=60; if(p.hp<=0){p.hp=0;p.alive=false;} }
        }
        for(const m of Object.values(room.monsters)){
          if(!m.alive) continue;
          if(dist(b,m)<b.maxRadius){ m.hp-=80; if(m.hp<=0){m.alive=false;room.kills++;} }
        }
      }
      return b.explodeTimer<20;
    } else {
      b.x+=b.vx; b.y+=b.vy; b.dist+=5;
      if(b.dist>b.maxDist||isWall(room,b.x,b.y)){ b.exploded=true; return true; }
      return true;
    }
  });

  room.bullets=room.bullets.filter(b=>{
    b.x+=Math.cos(b.angle)*b.speed;b.y+=Math.sin(b.angle)*b.speed;b.life--;
    if(b.life<=0||isWall(room,b.x,b.y))return false;
    if(b.isMob){
      for(const p of ps){
        if(!p.alive||p.iframes>0||p.shieldActive>0)continue;
        if(dist(b,p)<18){p.hp-=b.dmg;p.iframes=60;if(p.hp<=0){p.hp=0;p.alive=false;}return false;}
      }
    } else {
      for(const m of Object.values(room.monsters)){
        if(!m.alive)continue;
        if(dist(b,m)<m.size+8){
          m.hp-=b.dmg;
          if(m.hp<=0){
            m.alive=false;room.kills++;room.totalKills++;
            const op=room.players[b.pid];if(op)op.score+=m.score||10;
            // 아이템 드랍 (30% 일반, 15% 무기)
            const iTypes=['hp','bomb_charge','shield_charge','thunder_charge','speed'];
            if(Math.random()<0.30){
              room.items.push({id:'i'+(room.nextId++),x:m.x,y:m.y,
                type:iTypes[Math.floor(Math.random()*iTypes.length)],pulse:0,life:600});
            }
            const wPool=['pistol','shotgun','rifle','smg','laser','cannon','twin'];
            if(Math.random()<0.15){
              room.items.push({id:'i'+(room.nextId++),x:m.x+(Math.random()-0.5)*40,y:m.y+(Math.random()-0.5)*40,
                type:'weapon_'+wPool[Math.floor(Math.random()*wPool.length)],pulse:0,life:900});
            }
          }
          return false;
        }
      }
    }
    return true;
  });

  for(const m of Object.values(room.monsters)){
    if(!m.alive)continue;
    if(m.hp<m.maxHp*0.3)m.enraged=true;
    let target=null,minD=Infinity;
    for(const p of alive){const d=dist(m,p);if(d<minD){minD=d;target=p;}}
    if(!target)continue;
    const spd=m.spd*(m.enraged?1.4:1);
    if(minD>m.size+10){
      const ang=Math.atan2(target.y-m.y,target.x-m.x);
      if(!isWall(room,m.x+Math.cos(ang)*spd,m.y))m.x+=Math.cos(ang)*spd;
      if(!isWall(room,m.x,m.y+Math.sin(ang)*spd))m.y+=Math.sin(ang)*spd;
    }
    if(m.cd>0){m.cd--;continue;}
    if(minD<m.range){
      m.cd=m.cdMax;
      const ang=Math.atan2(target.y-m.y,target.x-m.x);
      if(m.range>150){
        room.bullets.push({x:m.x,y:m.y,angle:ang,speed:5,dmg:m.atk,life:80,isMob:true,col:'#f44'});
      } else if(minD<m.size+28&&target.iframes===0&&target.shieldActive===0){
        target.hp-=m.atk;target.iframes=50;if(target.hp<=0){target.hp=0;target.alive=false;}
      }
    }
  }

  if(ps.length>0&&alive.length===0){broadcastRoom(room,{type:'game_over'});room.state='ended';return;}

  const normalAlive=Object.values(room.monsters).filter(m=>m.alive&&m.type!=='boss').length;
  if(normalAlive===0&&!room.bossSpawned){
    room.bossSpawned=true;spawnMonster(room,'boss');
    broadcastRoom(room,{type:'boss_spawn'});
  }
  const bossAlive=Object.values(room.monsters).find(m=>m.type==='boss'&&m.alive);
  if(room.bossSpawned&&!bossAlive){
    if(room.stage>=5){broadcastRoom(room,{type:'game_won'});room.state='ended';return;}
    room.stage++;room.bossSpawned=false;initMonsters(room);
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
    bombs:(room.bombs||[]).map(b=>({x:b.x,y:b.y,exploded:b.exploded,explodeTimer:b.explodeTimer||0,radius:b.radius||0,maxRadius:b.maxRadius})),
    items:(room.items||[]).map(it=>({id:it.id,x:it.x,y:it.y,type:it.type,pulse:it.pulse||0})),
    stage:room.stage,kills:room.kills,totalKills:room.totalKills,tick:room.tick,
    bossSpawned:room.bossSpawned,
  });
}

function broadcastRoom(room,msg,exclude=null){
  const data=JSON.stringify(msg);
  for(const p of Object.values(room.players)){
    if(p.ws&&p.ws!==exclude&&p.ws.readyState===1)p.ws.send(data);
  }
}

// ── WebSocket ─────────────────────────────────────────
wss.on('connection',ws=>{
  let playerRoom=null,pid=null;

  ws.on('message',data=>{
    let msg;try{msg=JSON.parse(data);}catch{return;}

    if(msg.type==='list_rooms'){
      const list=Object.values(rooms).filter(r=>r.state==='waiting').map(r=>({
        id:r.id,name:r.name,
        players:Object.keys(r.players).length,max:MAX_PLAYERS,
        hostName:Object.values(r.players)[0]?.name||'???',
      }));
      ws.send(JSON.stringify({type:'room_list',rooms:list}));return;
    }

    if(msg.type==='create_room'){
      const room=createRoom(msg.roomName||(msg.name||'용사')+'의 방');
      pid='p'+(room.nextId++);
      room.players[pid]={id:pid,name:msg.name||'용사',ws,
        x:0,y:0,hp:120,maxHp:120,alive:true,iframes:0,shieldActive:0,
        facing:0,input:{},colorIdx:0,score:0,charId:msg.charId||'photo0'};
      room.hostId=pid;playerRoom=room;
      ws.send(JSON.stringify({
        type:'init',pid,colorIdx:0,roomId:room.id,roomName:room.name,
        tiles:Array.from(room.tiles),mapW:room.MAP_W,mapH:room.MAP_H,
        cols:room.COLS,rows:room.ROWS,tile:room.TILE,
        bossArena:room.bossArena,rooms:room.rooms_data,
        isHost:true,charId:msg.charId||'photo0',
      }));
      broadcastWaiting(room);return;
    }

    if(msg.type==='join_room'){
      const room=rooms[msg.roomId];
      if(!room){ws.send(JSON.stringify({type:'error',msg:'방을 찾을 수 없습니다.'}));return;}
      if(room.state!=='waiting'){ws.send(JSON.stringify({type:'error',msg:'이미 시작된 방입니다.'}));return;}
      if(Object.keys(room.players).length>=MAX_PLAYERS){ws.send(JSON.stringify({type:'full'}));return;}
      pid='p'+(room.nextId++);
      const ci=Object.keys(room.players).length%COLORS.length;
      room.players[pid]={id:pid,name:msg.name||'용사',ws,
        x:0,y:0,hp:120,maxHp:120,alive:true,iframes:0,shieldActive:0,
        facing:0,input:{},colorIdx:ci,score:0,charId:msg.charId||'photo0'};
      playerRoom=room;
      ws.send(JSON.stringify({
        type:'init',pid,colorIdx:ci,roomId:room.id,roomName:room.name,
        tiles:Array.from(room.tiles),mapW:room.MAP_W,mapH:room.MAP_H,
        cols:room.COLS,rows:room.ROWS,tile:room.TILE,
        bossArena:room.bossArena,rooms:room.rooms_data,
        isHost:false,charId:msg.charId||'photo0',
      }));
      broadcastWaiting(room);return;
    }

    if(!playerRoom||!pid)return;
    const player=playerRoom.players[pid];
    if(!player)return;

    if(msg.type==='name'){player.name=(msg.name||'용사').slice(0,12);broadcastWaiting(playerRoom);return;}

    if(msg.type==='start_game'){
      if(pid!==playerRoom.hostId){ws.send(JSON.stringify({type:'error',msg:'방장만 시작 가능합니다.'}));return;}
      startGame(playerRoom);return;
    }

    if(playerRoom.state!=='playing')return;
    if(msg.type==='ping'){return;}
    if(msg.type==='input'){player.input=msg.input;if(typeof msg.input?.mouseAngle==='number')player.facing=msg.input.mouseAngle;return;}
    if(msg.type==='pickup'){
      const it=playerRoom.items&&playerRoom.items.find(i=>i.id===msg.itemId);
      if(!it){return;}
      if(Math.hypot(it.x-player.x,it.y-player.y)>150){return;}
      playerRoom.items=playerRoom.items.filter(i=>i.id!==msg.itemId);
      if(it.type==='hp')             player.hp=Math.min(player.maxHp||120,player.hp+30);
      if(it.type==='bomb_charge')    player.bombCd=0;
      if(it.type==='shield_charge')  player.shieldActive=180;
      if(it.type==='thunder_charge') player.thunderCd=0;
      if(it.type==='speed')          player.speedBoost=(player.speedBoost||0)+180;
      if(it.type&&it.type.startsWith('weapon_')) player.weapon=it.type.slice(7);
      broadcastRoom(playerRoom,{type:'item_pickup',pid,itemId:it.id,itemType:it.type});
      return;
    }
    if(msg.type==='attack'&&player.alive){
      playerRoom.bullets.push({x:player.x,y:player.y,angle:player.facing||0,speed:11,dmg:30,life:70,isMob:false,pid});
      broadcastRoom(playerRoom,{type:'attack_fx',x:player.x,y:player.y,pid});return;
    }
    if(msg.type==='bomb'&&player.alive){
      if(!playerRoom.bombs) playerRoom.bombs=[];
      const ang=msg.facing!==undefined?msg.facing:(player.facing||0);
      playerRoom.bombs.push({
        x:player.x, y:player.y,
        vx:Math.cos(ang)*5, vy:Math.sin(ang)*5,
        dist:0, maxDist:200,
        exploded:false, explodeTimer:0,
        radius:0, maxRadius:90,
      });
      return;
    }
    if(msg.type==='dash'&&player.alive){
      player.iframes=14;
      broadcastRoom(playerRoom,{type:'dash_fx',pid,x:player.x,y:player.y,facing:player.facing});
      return;
    }
    if(msg.type==='shield'&&player.alive){player.shieldActive=180;return;}
    if(msg.type==='thunder'&&player.alive){
      const THUNDER_R=220;
      for(const m of Object.values(playerRoom.monsters)){
        if(!m.alive||dist(player,m)>THUNDER_R)continue;
        m.hp-=80;if(m.hp<=0){m.alive=false;playerRoom.kills++;player.score+=m.score||10;}
      }
      broadcastRoom(playerRoom,{type:'thunder_fx',x:player.x,y:player.y,r:THUNDER_R});return;
    }
  });

  ws.on('close',()=>{
    if(!playerRoom||!pid)return;
    const name=playerRoom.players[pid]?.name||'???';
    const wasHost=(pid===playerRoom.hostId);
    delete playerRoom.players[pid];
    const remaining=Object.keys(playerRoom.players).length;
    if(remaining===0){delete rooms[playerRoom.id];return;}
    if(wasHost)playerRoom.hostId=Object.keys(playerRoom.players)[0];
    broadcastRoom(playerRoom,{type:'player_leave',name,count:remaining});
    if(playerRoom.state==='waiting')broadcastWaiting(playerRoom);
  });
});

setInterval(()=>{Object.values(rooms).forEach(r=>{if(r.state==='playing')gameTick(r);});},1000/60);
