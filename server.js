'use strict';
const express    = require('express');
const { WebSocketServer } = require('ws');
const http       = require('http');
const path       = require('path');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

// ══════════════════════════════════════════════════════
//  상수 (클라이언트와 동일)
// ══════════════════════════════════════════════════════
const MAP_W = 3200, MAP_H = 2400, TILE = 48;
const COLS = MAP_W/TILE|0, ROWS = MAP_H/TILE|0;
const P_SPEED = 3.0, P_HP = 120, P_ATK = 32;
const P_CD = 22, IFRAMES = 48;
const BULLET_SPEED = 10, BULLET_RANGE = 360;
const CD_BOMB = 360, CD_SHIELD = 480, CD_THUNDER = 300;
const SIGHT_R = 480;
const MAX_PLAYERS = 3;

// ══════════════════════════════════════════════════════
//  맵 생성
// ══════════════════════════════════════════════════════
let tiles;

function tileAt(c,r){ if(c<0||c>=COLS||r<0||r>=ROWS) return 1; return tiles[r*COLS+c]; }
function setTile(c,r,v){ if(c<0||c>=COLS||r<0||r>=ROWS) return; tiles[r*COLS+c]=v; }
function isWall(wx,wy){ return tileAt(wx/TILE|0, wy/TILE|0)===1; }

function moveSlide(ox,oy,nx,ny,r=13){
  const xOk=!isWall(nx+r,oy)&&!isWall(nx-r,oy)&&!isWall(nx,oy+r)&&!isWall(nx,oy-r);
  const yOk=!isWall(ox,ny+r)&&!isWall(ox,ny-r)&&!isWall(ox+r,ny)&&!isWall(ox-r,ny);
  return{x:xOk?nx:ox, y:yOk?ny:oy};
}

function buildMap(){
  tiles = new Uint8Array(COLS*ROWS).fill(1);
  function carveRoom(x,y,w,h){
    for(let r=y;r<y+h;r++) for(let c=x;c<x+w;c++) setTile(c,r,0);
  }
  const roomGrid=[
    [2,2,10,8],[16,2,11,8],[31,2,10,8],[45,2,11,8],[58,2,7,8],
    [2,13,10,9],[15,13,12,9],[30,13,11,9],[44,13,11,9],[57,13,8,9],
    [2,25,10,9],[14,25,13,9],[30,25,12,9],[45,25,11,9],[57,25,8,9],
    [2,37,10,10],[15,37,12,10],[30,37,11,10],[44,37,11,10],[57,37,8,10],
  ];
  roomGrid.forEach(([x,y,w,h])=>carveRoom(x,y,w,h));
  function carveCorridor(ax,ay,bx,by){
    const minX=Math.min(ax,bx),maxX=Math.max(ax,bx);
    for(let c=minX;c<=maxX;c++){setTile(c,ay,0);setTile(c,ay-1,0);setTile(c,ay+1,0);}
    const minY=Math.min(ay,by),maxY=Math.max(ay,by);
    for(let r=minY;r<=maxY;r++){setTile(bx,r,0);setTile(bx-1,r,0);setTile(bx+1,r,0);}
  }
  const rooms=roomGrid.map(([x,y,w,h])=>({cx:x+(w>>1),cy:y+(h>>1)}));
  for(let i=0;i<rooms.length-1;i++) carveCorridor(rooms[i].cx,rooms[i].cy,rooms[i+1].cx,rooms[i+1].cy);
  for(let i=0;i<rooms.length-4;i+=4) if(rooms[i+4]) carveCorridor(rooms[i].cx,rooms[i].cy,rooms[i+4].cx,rooms[i+4].cy);
  // 보스 방
  const bA={x:MAP_W-860,y:MAP_H-780,w:800,h:720};
  const bc=Math.floor(bA.x/TILE),br=Math.floor(bA.y/TILE);
  const bw=Math.ceil(bA.w/TILE),bh=Math.ceil(bA.h/TILE);
  for(let r=br;r<br+bh;r++) for(let c=bc;c<bc+bw;c++) setTile(c,r,0);
  const ey=br+(bh>>1);
  for(let r=ey-4;r<=ey+4;r++) for(let c=bc-8;c<=bc;c++) setTile(c,r,0);
  return bA;
}

// ══════════════════════════════════════════════════════
//  몬스터 타입
// ══════════════════════════════════════════════════════
const MTYPE={
  goblin:{ hp:55,  atk:18, spd:1.9, range:60,  warn:90,  cd:115, size:12, score:10, col:'#3c9', attackStyle:'fill_circle' },
  orc:   { hp:105, atk:32, spd:1.2, range:90,  warn:110, cd:145, size:17, score:20, col:'#e63', attackStyle:'fill_cross'  },
  shade: { hp:45,  atk:22, spd:2.9, range:55,  warn:75,  cd:95,  size:11, score:15, col:'#99f', attackStyle:'fill_scatter'},
  archer:{ hp:65,  atk:24, spd:1.0, range:200, warn:145, cd:155, size:13, score:18, col:'#4c8', attackStyle:'fill_line'   },
  mage:  { hp:75,  atk:30, spd:0.9, range:110, warn:125, cd:165, size:14, score:25, col:'#c7f', attackStyle:'fill_ring'   },
  hunter:{ hp:80,  atk:26, spd:1.5, range:130, warn:120, cd:140, size:15, score:22, col:'#fa4', attackStyle:'fill_cone'   },
  boss:  { hp:900, atk:55, spd:1.3, range:120, warn:155, cd:175, size:30, score:500,col:'#f40', attackStyle:'fill_cross'  },
};

let nextMobId=1;
function createMonster(type,x,y){
  const cfg=MTYPE[type];
  return{
    id:nextMobId++,type,x,y,
    hp:cfg.hp,maxHp:cfg.hp,
    atk:cfg.atk,spd:cfg.spd,
    range:cfg.range,warn:cfg.warn,
    cd:cfg.cd,size:cfg.size,
    score:cfg.score,col:cfg.col,
    attackStyle:cfg.attackStyle,
    attackCd:(Math.random()*cfg.cd)|0,
    warnPhase:false,alive:true,
    enraged:false,phase:0,
    aimAngle:0,bossPhase:0,
  };
}

// ══════════════════════════════════════════════════════
//  게임 상태
// ══════════════════════════════════════════════════════
let gs = null; // game state

function initGameState(){
  const bossArena = buildMap();
  nextMobId = 1;
  gs = {
    tick:0,
    players:{},
    monsters:{},
    bullets:[],
    bombs:[],
    items:[],
    particles:[],
    kills:0,
    bossSpawned:false,
    bossDefeated:false,
    gameOver:false,
    gameWon:false,
    bossArena,
    log:[],
    spawnTimer:0,
    tiles: Array.from(tiles), // 클라이언트 전송용
  };
  // 초기 몬스터
  for(let i=0;i<28;i++) spawnMonster();
}

function addLog(msg,type=''){
  gs.log.unshift({msg,type,t:gs.tick});
  if(gs.log.length>30) gs.log.pop();
}

function spawnMonster(type){
  if(!gs) return;
  const types=['goblin','orc','shade','archer','mage','hunter'];
  type=type||types[Math.random()*types.length|0];
  const alivePlayers=Object.values(gs.players).filter(p=>p.alive);
  let x,y,tries=0;
  const ba=gs.bossArena;
  do{
    x=(1+Math.random()*(COLS-2))*TILE;
    y=(1+Math.random()*(ROWS-2))*TILE;
    tries++;
    const tooClose=alivePlayers.some(p=>Math.hypot(x-p.x,y-p.y)<280);
    const inBoss=x>ba.x-100&&y>ba.y-100;
    if(!isWall(x,y)&&!tooClose&&!inBoss) break;
  }while(tries<80);
  if(tries>=80) return;
  const m=createMonster(type,x,y);
  gs.monsters[m.id]=m;
}

function spawnBoss(){
  if(!gs||gs.bossSpawned) return;
  gs.bossSpawned=true;
  const bx=gs.bossArena.x+gs.bossArena.w/2;
  const by=gs.bossArena.y+gs.bossArena.h/2;
  const m=createMonster('boss',bx,by);
  m.attackCd=80;
  gs.monsters[m.id]=m;
  addLog('👑 던전의 군주가 각성했다!!!','boss');
  broadcast({type:'boss_spawn'});
}

function killMonster(m){
  m.alive=false;
  gs.kills++;
  // 아이템 드랍 30%
  if(Math.random()<0.30){
    const iTypes=['hp','bomb_charge','shield_charge','thunder_charge','speed'];
    const it=iTypes[Math.random()*iTypes.length|0];
    gs.items.push({id:nextMobId++,x:m.x,y:m.y,type:it,life:600,pulse:0});
  }
  if(m.type==='boss'){
    gs.bossDefeated=true;
    gs.gameWon=true;
    addLog('🏆 던전의 군주 처치! 원정 성공!','win');
    broadcast({type:'game_won',kills:gs.kills});
  } else {
    addLog(`${m.type} 처치! +${MTYPE[m.type].score}점`,'kill');
  }
}

function dealDamageToPlayer(pid,dmg){
  const p=gs.players[pid];
  if(!p||!p.alive||p.iframes>0||p.shieldActive>0) return;
  p.hp-=dmg;
  p.iframes=IFRAMES;
  addLog(`${p.name} 피격! -${dmg}HP`,'dmg');
  if(p.hp<=0){
    p.hp=0;p.alive=false;
    addLog(`💀 ${p.name} 전투불능!`,'death');
    checkGameOver();
  }
}

function checkGameOver(){
  if(!gs) return;
  const alive=Object.values(gs.players).filter(p=>p.alive);
  if(alive.length===0&&Object.keys(gs.players).length>0){
    gs.gameOver=true;
    addLog('💀 원정대 전멸...','death');
    broadcast({type:'game_over'});
  }
}

// ══════════════════════════════════════════════════════
//  게임 틱 (60fps)
// ══════════════════════════════════════════════════════
function gameTick(){
  if(!gs||gs.gameOver||gs.gameWon) return;
  gs.tick++;
  const pArr=Object.values(gs.players);
  const alivePArr=pArr.filter(p=>p.alive);

  // ── 플레이어 이동 ──────────────────────────────────
  pArr.forEach(p=>{
    if(!p.alive) return;
    if(p.iframes>0) p.iframes--;
    if(p.attackCd>0) p.attackCd--;
    if(p.skillCd.bomb>0) p.skillCd.bomb--;
    if(p.skillCd.shield>0) p.skillCd.shield--;
    if(p.skillCd.thunder>0) p.skillCd.thunder--;
    if(p.shieldActive>0) p.shieldActive--;
    if(p.speedBoost>0) p.speedBoost--;

    const{up,down,left,right}=p.input;
    let dx=0,dy=0;
    if(up) dy-=1; if(down) dy+=1;
    if(left) dx-=1; if(right) dx+=1;
    if(dx||dy){
      const len=Math.hypot(dx,dy);
      p.facing=Math.atan2(dy,dx);
      const spd=P_SPEED*(p.speedBoost>0?1.7:1);
      const nx=p.x+(dx/len)*spd, ny=p.y+(dy/len)*spd;
      const r=moveSlide(p.x,p.y,nx,ny);
      p.x=Math.max(TILE,Math.min(MAP_W-TILE,r.x));
      p.y=Math.max(TILE,Math.min(MAP_H-TILE,r.y));
    }

    // 보스 방 진입 체크
    if(!gs.bossSpawned){
      const ba=gs.bossArena;
      if(p.x>ba.x&&p.x<ba.x+ba.w&&p.y>ba.y&&p.y<ba.y+ba.h) spawnBoss();
    }
  });

  // ── 아이템 픽업 ───────────────────────────────────
  gs.items.forEach(it=>{
    it.life--; it.pulse++;
    alivePArr.forEach(p=>{
      if(Math.hypot(it.x-p.x,it.y-p.y)<24&&it.life>0){
        it.life=0;
        if(it.type==='hp'){p.hp=Math.min(p.maxHp,p.hp+30);addLog(`❤️ ${p.name} HP+30`,'win');}
        else if(it.type==='bomb_charge'){p.skillCd.bomb=0;addLog(`💣 ${p.name} 폭탄충전`,'win');}
        else if(it.type==='shield_charge'){p.skillCd.shield=0;addLog(`🛡 ${p.name} 방패충전`,'win');}
        else if(it.type==='thunder_charge'){p.skillCd.thunder=0;addLog(`⚡ ${p.name} 번개충전`,'win');}
        else if(it.type==='speed'){p.speedBoost=180;addLog(`👟 ${p.name} 속도부스트`,'win');}
      }
    });
  });
  gs.items=gs.items.filter(it=>it.life>0);

  // ── 총알 업데이트 ─────────────────────────────────
  gs.bullets.forEach(b=>{
    if(!b.alive) return;
    const spd=Math.hypot(b.vx,b.vy);
    b.x+=b.vx; b.y+=b.vy; b.dist+=spd;
    const maxR=b.isMob?(b.pierce?500:350):BULLET_RANGE;
    if(b.dist>maxR||isWall(b.x,b.y)){b.alive=false;return;}
    if(b.isMob){
      alivePArr.forEach(p=>{
        if(!b.alive||p.iframes>0||p.shieldActive>0) return;
        if(Math.hypot(p.x-b.x,p.y-b.y)<14){
          if(!b.pierce) b.alive=false;
          dealDamageToPlayer(p.id,b.dmg);
        }
      });
    } else {
      Object.values(gs.monsters).forEach(m=>{
        if(!m.alive||!b.alive) return;
        if(Math.hypot(m.x-b.x,m.y-b.y)<m.size+4){
          b.alive=false;
          m.hp-=P_ATK;
          if(m.hp<=0) killMonster(m);
        }
      });
    }
  });
  gs.bullets=gs.bullets.filter(b=>b.alive);

  // ── 폭탄 업데이트 ─────────────────────────────────
  gs.bombs.forEach(b=>{
    if(b.exploded){
      b.explodeTimer++;
      b.radius=b.maxRadius*(b.explodeTimer/20);
      if(b.explodeTimer>=20){b.alive=false;return;}
      if(b.explodeTimer===5){
        Object.values(gs.monsters).forEach(m=>{
          if(!m.alive) return;
          if(Math.hypot(m.x-b.x,m.y-b.y)<b.maxRadius){
            m.hp-=80;
            if(m.hp<=0) killMonster(m);
          }
        });
      }
    } else {
      b.x+=b.vx; b.y+=b.vy; b.dist+=5;
      if(b.dist>b.maxDist||isWall(b.x,b.y)) b.exploded=true;
    }
  });
  gs.bombs=gs.bombs.filter(b=>b.alive);

  // ── 몬스터 AI ────────────────────────────────────
  Object.values(gs.monsters).forEach(m=>{
    if(!m.alive) return;
    m.phase++;
    // 가장 가까운 플레이어 타겟
    let target=null,nearD=Infinity;
    alivePArr.forEach(p=>{const d=Math.hypot(p.x-m.x,p.y-m.y);if(d<nearD){nearD=d;target=p;}});
    if(!target) return;
    const dx=target.x-m.x, dy=target.y-m.y, d=nearD;
    const aggroR=m.type==='boss'?700:320;
    if(d<aggroR&&d>m.range*0.75){
      const spd=m.enraged?m.spd*1.55:m.spd;
      const nx=m.x+(dx/d)*spd,ny=m.y+(dy/d)*spd;
      const r=moveSlide(m.x,m.y,nx,ny,m.size*0.7);
      m.x=r.x;m.y=r.y;
    }
    m.attackCd--;
    m.warnPhase=m.attackCd<=m.warn&&m.attackCd>0&&d<m.range*2.2;
    if(m.attackCd===m.warn) m.aimAngle=Math.atan2(dy,dx);
    if(m.type==='boss'&&!m.enraged&&m.hp<m.maxHp*0.5){
      m.enraged=true;m.cd=(m.cd*0.65)|0;
      addLog('🔥 보스가 격노했습니다!','boss');
    }
    if(m.attackCd<=0){
      m.attackCd=m.enraged?(m.cd*0.65)|0:m.cd;
      if(m.type==='boss'){
        m.bossPhase=(m.bossPhase+1)%4;
        const bpats=['fill_cross','fill_scatter','fill_cone','fill_ring'];
        m.attackStyle=m.enraged?['fill_cross','fill_scatter','fill_cone','fill_scatter'][m.bossPhase]:bpats[m.bossPhase];
      }
      const style=m.attackStyle||'fill_circle';
      if(style==='fill_cross'){
        [-0,Math.PI/2,Math.PI,Math.PI*1.5].forEach(off=>{
          const ang=m.aimAngle+off;
          gs.bullets.push({x:m.x,y:m.y,vx:Math.cos(ang)*12,vy:Math.sin(ang)*12,dist:0,angle:ang,alive:true,isMob:true,dmg:m.atk,col:m.col,len:28,w:5});
        });
      } else if(style==='fill_line'){
        gs.bullets.push({x:m.x,y:m.y,vx:Math.cos(m.aimAngle)*14,vy:Math.sin(m.aimAngle)*14,dist:0,angle:m.aimAngle,alive:true,isMob:true,dmg:m.atk,col:m.col,len:40,w:7,pierce:true});
      } else if(style==='fill_scatter'){
        for(let i=0;i<8;i++){
          const ang=m.aimAngle+(Math.PI*2/8)*i;
          gs.bullets.push({x:m.x,y:m.y,vx:Math.cos(ang)*9,vy:Math.sin(ang)*9,dist:0,angle:ang,alive:true,isMob:true,dmg:m.atk,col:m.col,len:18,w:4});
        }
      } else {
        // fill_circle, fill_cone, fill_ring: 직접 데미지
        alivePArr.forEach(p=>{
          if(p.iframes>0||p.shieldActive>0) return;
          const pd=Math.hypot(p.x-m.x,p.y-m.y);
          let hit=false;
          if(style==='fill_circle'&&pd<m.range) hit=true;
          if(style==='fill_cone'){
            const da=Math.atan2(p.y-m.y,p.x-m.x)-m.aimAngle;
            const nda=Math.atan2(Math.sin(da),Math.cos(da));
            if(pd<m.range*1.1&&Math.abs(nda)<Math.PI/4) hit=true;
          }
          if(style==='fill_ring'&&pd>m.range*0.4&&pd<m.range*1.15) hit=true;
          if(hit) dealDamageToPlayer(p.id,m.atk);
        });
      }
    }
  });
  Object.keys(gs.monsters).forEach(k=>{ if(!gs.monsters[k].alive) delete gs.monsters[k]; });

  // ── 리스폰 ────────────────────────────────────────
  gs.spawnTimer++;
  if(gs.spawnTimer>260){
    gs.spawnTimer=0;
    const normal=Object.values(gs.monsters).filter(m=>m.type!=='boss').length;
    if(normal<22) for(let i=0;i<4;i++) spawnMonster();
  }

  // ── 상태 브로드캐스트 ─────────────────────────────
  broadcastState();
}

// ══════════════════════════════════════════════════════
//  플레이어 액션 핸들러
// ══════════════════════════════════════════════════════
function handleAttack(pid){
  const p=gs.players[pid];
  if(!p||!p.alive||p.attackCd>0) return;
  p.attackCd=P_CD;
  const ang=p.facing||0;
  gs.bullets.push({x:p.x,y:p.y,vx:Math.cos(ang)*BULLET_SPEED,vy:Math.sin(ang)*BULLET_SPEED,dist:0,angle:ang,alive:true,isMob:false});
  broadcastFx({type:'attack_fx',pid,x:p.x,y:p.y});
}

function handleBomb(pid){
  const p=gs.players[pid];
  if(!p||!p.alive||p.skillCd.bomb>0) return;
  p.skillCd.bomb=CD_BOMB;
  const ang=p.facing||0;
  gs.bombs.push({x:p.x,y:p.y,vx:Math.cos(ang)*5,vy:Math.sin(ang)*5,dist:0,maxDist:200,exploded:false,explodeTimer:0,radius:0,maxRadius:90,alive:true});
  addLog(`💣 ${p.name} 폭탄 투척!`);
}

function handleShield(pid){
  const p=gs.players[pid];
  if(!p||!p.alive||p.skillCd.shield>0) return;
  p.skillCd.shield=CD_SHIELD;
  p.shieldActive=120;
  addLog(`🛡 ${p.name} 방패막!`);
}

function handleThunder(pid){
  const p=gs.players[pid];
  if(!p||!p.alive||p.skillCd.thunder>0) return;
  p.skillCd.thunder=CD_THUNDER;
  const THUNDER_R=180,THUNDER_DMG=55;
  let hit=0;
  Object.values(gs.monsters).forEach(m=>{
    if(!m.alive) return;
    if(Math.hypot(m.x-p.x,m.y-p.y)<THUNDER_R){
      m.hp-=THUNDER_DMG; hit++;
      if(m.hp<=0) killMonster(m);
    }
  });
  addLog(`⚡ ${p.name} 번개! ${hit}마리 피격`,'kill');
  broadcastFx({type:'thunder_fx',x:p.x,y:p.y,r:THUNDER_R});
}

// ══════════════════════════════════════════════════════
//  브로드캐스트
// ══════════════════════════════════════════════════════
const PCOLORS=['#44aaff','#ff8844','#aa44ff'];
const PNAMES=['용사','궁수','마법사'];

function broadcast(msg){
  const d=JSON.stringify(msg);
  wss.clients.forEach(ws=>{ if(ws.readyState===1) ws.send(d); });
}

function broadcastFx(msg){
  const d=JSON.stringify(msg);
  wss.clients.forEach(ws=>{ if(ws.readyState===1) ws.send(d); });
}

function broadcastState(){
  if(!gs) return;
  const mArr=Object.values(gs.monsters);
  const pArr=Object.values(gs.players);
  // 각 클라이언트에게 본인 ID와 시야 정보 포함 전송
  pArr.forEach(p=>{
    const ws=p.ws;
    if(!ws||ws.readyState!==1) return;
    // 시야 내 몬스터만 (팀 전체 시야 공유)
    const visM=mArr.filter(m=>{
      return pArr.some(pp=>Math.hypot(pp.x-m.x,pp.y-m.y)<SIGHT_R*1.5);
    });
    const payload={
      type:'state',
      tick:gs.tick,
      myId:p.id,
      players:pArr.map(pl=>({
        id:pl.id,name:pl.name,colorIdx:pl.colorIdx,
        x:pl.x,y:pl.y,hp:pl.hp,maxHp:pl.maxHp,
        alive:pl.alive,iframes:pl.iframes,
        facing:pl.facing,
        skillCd:pl.skillCd,shieldActive:pl.shieldActive,
        speedBoost:pl.speedBoost,attackCd:pl.attackCd,
      })),
      monsters:visM.map(m=>({
        id:m.id,type:m.type,x:m.x,y:m.y,
        hp:m.hp,maxHp:m.maxHp,alive:m.alive,
        warnPhase:m.warnPhase,attackCd:m.attackCd,warn:m.warn,
        size:m.size,col:m.col,enraged:m.enraged,
        range:m.range,aimAngle:m.aimAngle,attackStyle:m.attackStyle,
      })),
      bullets:gs.bullets.filter(b=>b.alive),
      bombs:gs.bombs.filter(b=>b.alive),
      items:gs.items,
      kills:gs.kills,
      log:gs.log.slice(0,8),
      bossSpawned:gs.bossSpawned,
      bossDefeated:gs.bossDefeated,
      bossArena:gs.bossArena,
    };
    ws.send(JSON.stringify(payload));
  });
}

// ══════════════════════════════════════════════════════
//  WebSocket 연결 관리
// ══════════════════════════════════════════════════════
let playerSeq=0;
let roomReady=false;

wss.on('connection',(ws)=>{
  // 최대 3명
  const activePids=Object.keys(gs?.players||{});
  if(activePids.length>=MAX_PLAYERS){
    ws.send(JSON.stringify({type:'full'}));
    ws.close(); return;
  }

  // 첫 번째 접속 시 게임 초기화
  if(!gs||Object.keys(gs.players).length===0) initGameState();

  const idx=playerSeq%3;
  playerSeq++;
  const pid='p'+playerSeq;

  const startPos=[
    {x:120,y:120},{x:155,y:145},{x:130,y:170}
  ][idx];

  gs.players[pid]={
    id:pid, ws,
    name:PNAMES[idx],
    colorIdx:idx,
    x:startPos.x, y:startPos.y,
    hp:P_HP, maxHp:P_HP,
    alive:true, iframes:0, attackCd:0,
    facing:0,
    input:{up:false,down:false,left:false,right:false},
    skillCd:{bomb:0,shield:0,thunder:0},
    shieldActive:0, speedBoost:0,
  };

  addLog(`${PNAMES[idx]} 입장!`);

  // 초기화 패킷 (맵 타일 포함)
  ws.send(JSON.stringify({
    type:'init',
    pid,
    name:PNAMES[idx],
    colorIdx:idx,
    tiles:gs.tiles,
    mapW:MAP_W, mapH:MAP_H, tileSize:TILE,
    sightRadius:SIGHT_R,
    bossArena:gs.bossArena,
    playerCount:Object.keys(gs.players).length,
  }));

  // 현재 접속자 수 알림
  broadcast({type:'player_join',name:PNAMES[idx],count:Object.keys(gs.players).length});

  ws.on('message',(raw)=>{
    try{
      const msg=JSON.parse(raw);
      if(msg.type==='input') gs.players[pid].input=msg.input;
      else if(msg.type==='attack') handleAttack(pid);
      else if(msg.type==='bomb')   handleBomb(pid);
      else if(msg.type==='shield') handleShield(pid);
      else if(msg.type==='thunder')handleThunder(pid);
    }catch(e){}
  });

  ws.on('close',()=>{
    const name=gs.players[pid]?.name||pid;
    delete gs.players[pid];
    addLog(`${name} 퇴장`);
    broadcast({type:'player_leave',name,count:Object.keys(gs.players).length});
    // 모두 나가면 게임 리셋
    if(Object.keys(gs.players).length===0){ gs=null; }
  });
});

// ══════════════════════════════════════════════════════
//  게임 루프
// ══════════════════════════════════════════════════════
setInterval(gameTick, 1000/60);

// ══════════════════════════════════════════════════════
//  서버 시작
// ══════════════════════════════════════════════════════
const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`🎮 던전 원정대 서버: http://localhost:${PORT}`));
