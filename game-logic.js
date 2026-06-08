'use strict';
function buildMap(){
  // 스테이지별 맵 크기 증가
  MAP_W = BASE_MAP_W + (stage-1)*800;
  MAP_H = BASE_MAP_H + (stage-1)*600;
  COLS  = MAP_W/TILE|0;
  ROWS  = MAP_H/TILE|0;

  tiles    = new Uint8Array(COLS*ROWS).fill(1);
  explored = new Uint8Array(COLS*ROWS);

  const rooms = [];

  // ── BSP 분할 ──────────────────────────────────────
  function splitRect(x,y,w,h,depth){
    const MIN_SIZE=10, MAX_SIZE=22;
    if(depth<=0||w<MIN_SIZE*2||h<MIN_SIZE*2){
      // 리프: 방 생성
      const rw=rng(8,Math.min(w-2,MAX_SIZE));
      const rh=rng(6,Math.min(h-2,MAX_SIZE));
      const rx=x+rng(1,w-rw-1);
      const ry=y+rng(1,h-rh-1);
      for(let r=ry;r<ry+rh;r++)
        for(let c=rx;c<rx+rw;c++) setTile(c,r,0);
      rooms.push({cx:rx+(rw>>1), cy:ry+(rh>>1), x:rx,y:ry,w:rw,h:rh});
      return;
    }
    // 가로/세로 중 긴 쪽으로 분할 (약간 랜덤)
    if(w>h && w>=MIN_SIZE*2){
      const cut=rng(Math.floor(w*0.35), Math.floor(w*0.65));
      splitRect(x,y,cut,h,depth-1);
      splitRect(x+cut,y,w-cut,h,depth-1);
    } else if(h>=MIN_SIZE*2){
      const cut=rng(Math.floor(h*0.35), Math.floor(h*0.65));
      splitRect(x,y,w,cut,depth-1);
      splitRect(x,y+cut,w,h-cut,depth-1);
    } else {
      const rw=rng(8,Math.min(w-2,MAX_SIZE));
      const rh=rng(6,Math.min(h-2,MAX_SIZE));
      const rx=x+rng(1,w-rw-1);
      const ry=y+rng(1,h-rh-1);
      for(let r=ry;r<ry+rh;r++)
        for(let c=rx;c<rx+rw;c++) setTile(c,r,0);
      rooms.push({cx:rx+(rw>>1), cy:ry+(rh>>1), x:rx,y:ry,w:rw,h:rh});
    }
  }

  // 맵 전체를 BSP로 분할 (깊이는 스테이지에 따라 증가)
  const bspDepth = 4 + Math.min(stage-1, 3);
  splitRect(1,1,COLS-2,ROWS-2,bspDepth);

  // ── 방 연결 통로 (최소 스패닝 트리 방식) ──────────
  function carveCorridor(ax,ay,bx,by){
    // L자 통로 (랜덤으로 꺾이는 방향 선택)
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

  // Prim's algorithm로 MST 연결
  if(rooms.length>1){
    const connected=new Set([0]);
    const edges=[];
    while(connected.size<rooms.length){
      edges.length=0;
      connected.forEach(i=>{
        for(let j=0;j<rooms.length;j++){
          if(connected.has(j)) continue;
          const d=Math.hypot(rooms[i].cx-rooms[j].cx,rooms[i].cy-rooms[j].cy);
          edges.push({i,j,d});
        }
      });
      edges.sort((a,b)=>a.d-b.d);
      const e=edges[0];
      carveCorridor(rooms[e.i].cx,rooms[e.i].cy,rooms[e.j].cx,rooms[e.j].cy);
      connected.add(e.j);
    }
    // 추가 연결 (순환 경로, 맵의 15%)
    const extra=Math.floor(rooms.length*0.15);
    for(let k=0;k<extra;k++){
      const a=rooms[rng(0,rooms.length)], b=rooms[rng(0,rooms.length)];
      if(a!==b) carveCorridor(a.cx,a.cy,b.cx,b.cy);
    }
  }

  // ── 특수 구조물 (스테이지별 랜덤) ─────────────────
  // 넓은 광장 (랜덤 위치 1~3개)
  const plazaCount=rng(1,3+stage);
  for(let p=0;p<plazaCount;p++){
    const pr=rooms[rng(0,rooms.length)];
    const pw=rng(12,20), ph=rng(10,16);
    const px2=Math.max(1,pr.cx-(pw>>1)), py2=Math.max(1,pr.cy-(ph>>1));
    for(let r=py2;r<Math.min(ROWS-1,py2+ph);r++)
      for(let c=px2;c<Math.min(COLS-1,px2+pw);c++) setTile(c,r,0);
  }

  // ── 보스 방 (오른쪽 하단, 고정) ───────────────────
  // 보스방 위치 랜덤 (맵 바깥 여백 제외, 4분면 중 랜덤 선택)
  const BW=880, BH=800;
  const quadrants=[
    {x:COLS-Math.ceil(BW/TILE)-4, y:ROWS-Math.ceil(BH/TILE)-4}, // 우하
    {x:4,                          y:ROWS-Math.ceil(BH/TILE)-4}, // 좌하
    {x:COLS-Math.ceil(BW/TILE)-4, y:4},                          // 우상
    {x:4,                          y:4},                          // 좌상
  ];
  // 플레이어 시작(좌상)에서 멀리: 스테이지별 다른 분면
  const qIdx=(stage-1)%4;
  const chosen=quadrants[qIdx];
  const bArena={x:chosen.x*TILE, y:chosen.y*TILE, w:BW, h:BH};
  const bc=chosen.x, br2=chosen.y;
  const bw=Math.ceil(BW/TILE), bh=Math.ceil(BH/TILE);
  for(let r=br2;r<br2+bh;r++)
    for(let c=bc;c<bc+bw;c++) setTile(c,r,0);
  // 입구 통로 (보스방 방향에 따라)
  const ey=br2+(bh>>1);
  const ex=bc+(bw>>1);
  for(let r=ey-5;r<=ey+5;r++)
    for(let c=Math.max(1,bc-8);c<=bc+bw+8&&c<COLS-1;c++) setTile(c,r,0);
  for(let c=ex-5;c<=ex+5;c++)
    for(let r=Math.max(1,br2-8);r<=br2+bh+8&&r<ROWS-1;r++) setTile(c,r,0);
  // 보스방과 가장 가까운 방 연결
  let closest=rooms[0]||{cx:ex,cy:ey}, closestD=Infinity;
  rooms.forEach(rm=>{
    const d=Math.hypot(rm.cx-ex, rm.cy-ey);
    if(d<closestD){closestD=d;closest=rm;}
  });
  carveCorridor(closest.cx,closest.cy,ex,ey);

  return { rooms, bArena };
}

// ═══════════════════════════════════════════════════════
//  충돌
// ═══════════════════════════════════════════════════════
function isWall(wx,wy){
  return tileAt(wx/TILE|0, wy/TILE|0) === 1;
}
function moveSlide(ox,oy,nx,ny,r=13){
  // X축 시도
  const xOk = !isWall(nx+r,oy) && !isWall(nx-r,oy) && !isWall(nx,oy+r) && !isWall(nx,oy-r);
  const yOk = !isWall(ox,ny+r) && !isWall(ox,ny-r) && !isWall(ox+r,ny) && !isWall(ox-r,ny);
  return { x: xOk?nx:ox, y: yOk?ny:oy };
}

// ═══════════════════════════════════════════════════════
//  게임 상태
// ═══════════════════════════════════════════════════════
let player, monsters, particles, attackFx;
let camX=0, camY=0;
let kills=0, tick=0, gold=0;
let bullets=[], bombs=[], dangerZonesFx=[], items=[];
let skillCd={bomb:0, shield:0, thunder:0};
let shieldActive=0; // 방패 지속 프레임
let bossArena, bossSpawned=false, bossDefeated=false;
let gameRunning=false, gameWon=false, gameOver=false;
let screenShake=0;
let spawnTimer=0;
let logEntries=[];


// ═══════════════════════════════════════════════════════
//  효과음 시스템 — Web Audio API 합성음
// ═══════════════════════════════════════════════════════
let _audioCtx=null,_sfxMuted=false,_bgmGain=null,_bgmOscs=[];

function initGame(keepStage=false){
  if(!keepStage){ stage=1; totalKills=0; }
  const {rooms, bArena} = buildMap();
  bossArena    = bArena;
  bossSpawned  = false;
  bossDefeated = false;
  gameRunning  = true;
  gameWon      = false;
  gameOver     = false;
  kills        = 0;
  tick         = 0;
  if(!keepStage){ gold=0; window._atkBonus=0; }
  spawnTimer   = 0;
  logEntries   = [];
  screenShake  = 0;
  particles    = [];
  attackFx     = [];
  bullets      = [];
  bombs        = [];
  dangerZonesFx= [];
  items        = [];
  skillCd      = {bomb:0, shield:0, thunder:0};
  shieldActive = 0;
  monsters     = [];
  nextId       = 1;

  // 시작 위치 (첫 번째 방 중앙)
  const sr = rooms[0];
  player = {
    x: sr.cx * TILE, y: sr.cy * TILE,
    hp: P_HP, maxHp: P_HP,
    alive: true, iframes: 0, attackCd: 0,
    dashCd: 0, dashVx: 0, dashVy: 0, dashFrames: 0,
    facing: 0,
    weapon: 'sword',   // 현재 무기
    weaponAmmo: {},    // 무기별 남은 탄약 (무한=null)
  };
  camX = player.x - canvas.width/2;
  camY = player.y - canvas.height/2;
  // 캐시 초기화
  _tilesDirty=true; _tileCanvas=null; _tileCtx=null;
  _mmDirty=true; _mmCanvas=null; _mmCtx2=null;
  window._fog=null; window._fogC=null;

  // 초기 몬스터 (스테이지 올라갈수록 더 많이)
  const initCount = 28 + (stage-1)*8;
  for(let i=0;i<initCount;i++) spawnMonster();

  if(stage===1){
    applySelectedChar();
    const nn=window.playerNickname||'용사';
    const el=document.getElementById('player-hud-name');
    if(el) el.textContent=nn;
  startBGM(); setBGMStage(stage); addMuteButton();
  updateWeaponHUD();
  if(isMobile&&!mobileActive) initMobileControls();
  addLog('⚔ 던전 탐험을 시작합니다!','win');
    addLog('보스 방을 찾아 던전의 군주를 처치하라!');
  } else {
    addLog(`🗺 스테이지 ${stage} 진입! 맵이 넓어졌다...`,'win');
    addLog('더 강한 몬스터들이 기다리고 있다!','dmg');
  }

  // 게임 UI
  document.getElementById('lobby').style.display='none';
  document.getElementById('game').style.display='block';
  document.getElementById('ending').style.display='none';

  if(!rafId) loop();
}

// ═══════════════════════════════════════════════════════
//  몬스터 타입 정의
//  tier: 등장 최소 스테이지
//  attackStyle: fill_circle/cone/cross/line/ring/scatter/burst/dash
// ═══════════════════════════════════════════════════════
const MTYPE = {
  // ── 티어 1 (스테이지 1~) ─────────────────────────
  goblin:   { tier:1, hp:55,  atk:18, spd:1.9, range:60,  warn:90,  cd:115, size:12, score:10,  col:'#3c9', attackStyle:'fill_circle',  label:'고블린'  },
  skeleton: { tier:1, hp:45,  atk:14, spd:2.2, range:50,  warn:80,  cd:100, size:11, score:8,   col:'#ccc', attackStyle:'fill_scatter', label:'스켈레톤' },
  slime:    { tier:1, hp:70,  atk:12, spd:1.0, range:55,  warn:95,  cd:120, size:13, score:9,   col:'#6d4', attackStyle:'fill_circle',  label:'슬라임'  },

  // ── 티어 2 (스테이지 2~) ─────────────────────────
  orc:      { tier:2, hp:105, atk:32, spd:1.2, range:90,  warn:110, cd:145, size:17, score:20,  col:'#e63', attackStyle:'fill_cross',   label:'오크'    },
  archer:   { tier:2, hp:65,  atk:24, spd:1.0, range:200, warn:145, cd:155, size:13, score:18,  col:'#4c8', attackStyle:'fill_line',    label:'아처'    },
  shade:    { tier:2, hp:45,  atk:22, spd:2.9, range:55,  warn:75,  cd:95,  size:11, score:15,  col:'#99f', attackStyle:'fill_scatter', label:'섀도'    },
  berserker:{ tier:2, hp:130, atk:38, spd:2.4, range:70,  warn:85,  cd:110, size:16, score:28,  col:'#f55', attackStyle:'fill_cone',    label:'광전사'  },

  // ── 티어 3 (스테이지 3~) ─────────────────────────
  mage:     { tier:3, hp:75,  atk:30, spd:0.9, range:110, warn:125, cd:165, size:14, score:25,  col:'#c7f', attackStyle:'fill_ring',    label:'마법사'  },
  hunter:   { tier:3, hp:80,  atk:26, spd:1.5, range:130, warn:120, cd:140, size:15, score:22,  col:'#fa4', attackStyle:'fill_cone',    label:'헌터'    },
  bomber:   { tier:3, hp:60,  atk:45, spd:1.3, range:100, warn:130, cd:180, size:14, score:30,  col:'#f80', attackStyle:'fill_circle',  label:'폭격수'  },
  vampire:  { tier:3, hp:90,  atk:28, spd:2.1, range:80,  warn:100, cd:130, size:14, score:32,  col:'#d4f', attackStyle:'fill_scatter', label:'뱀파이어' },

  // ── 티어 4 (스테이지 4~) ─────────────────────────
  golem:    { tier:4, hp:280, atk:42, spd:0.7, range:95,  warn:140, cd:200, size:22, score:55,  col:'#888', attackStyle:'fill_cross',   label:'골렘'    },
  wraith:   { tier:4, hp:70,  atk:35, spd:3.2, range:90,  warn:90,  cd:120, size:12, score:40,  col:'#8af', attackStyle:'fill_line',    label:'망령'    },
  hydra:    { tier:4, hp:160, atk:30, spd:1.1, range:120, warn:115, cd:135, size:18, score:48,  col:'#4fa', attackStyle:'fill_ring',    label:'히드라'  },

  // ── 티어 5 (스테이지 5~) ─────────────────────────
  lich:     { tier:5, hp:200, atk:50, spd:1.2, range:160, warn:140, cd:155, size:18, score:80,  col:'#b8f', attackStyle:'fill_scatter', label:'리치'    },
  dragon:   { tier:5, hp:350, atk:58, spd:1.8, range:140, warn:150, cd:170, size:24, score:120, col:'#f84', attackStyle:'fill_cone',    label:'드래곤'  },
  demon:    { tier:5, hp:240, atk:48, spd:1.6, range:130, warn:130, cd:145, size:20, score:95,  col:'#c22', attackStyle:'fill_cross',   label:'데몬'    },

  // ── 보스 (스테이지별 다른 보스) ───────────────────
  boss:     { tier:1, hp:900, atk:55, spd:1.3, range:120, warn:155, cd:175, size:30, score:500, col:'#f40', attackStyle:'fill_cross',   label:'던전의 군주' },
  boss2:    { tier:2, hp:1200,atk:65, spd:1.4, range:130, warn:150, cd:165, size:32, score:700, col:'#c0f', attackStyle:'fill_scatter', label:'암흑 군주' },
  boss3:    { tier:3, hp:1600,atk:75, spd:1.5, range:140, warn:145, cd:155, size:34, score:1000,col:'#0af', attackStyle:'fill_ring',    label:'빙하 군주' },
  boss4:    { tier:4, hp:2200,atk:88, spd:1.6, range:150, warn:140, cd:145, size:36, score:1400,col:'#ff0', attackStyle:'fill_cone',    label:'번개 군주' },
  boss5:    { tier:5, hp:3000,atk:100,spd:1.7, range:160, warn:135, cd:135, size:38, score:2000,col:'#f00', attackStyle:'fill_scatter', label:'마왕'     },
};

const MEMOJI={
  goblin:'👺', skeleton:'💀', slime:'🟢',
  orc:'👹', archer:'🏹', shade:'👻', berserker:'😡',
  mage:'🔮', hunter:'🏃', bomber:'💥', vampire:'🧛',
  golem:'🗿', wraith:'👁', hydra:'🐍',
  lich:'☠️', dragon:'🐉', demon:'😈',
  boss:'👑', boss2:'🌑', boss3:'❄️', boss4:'⚡', boss5:'💀',
};

let nextId=1;

// ── 스테이지별 몬스터 풀 계산 ─────────────────────────
function getMonsterPool(stg){
  // 해당 스테이지에서 나올 수 있는 몬스터 목록 + 가중치
  const pool=[];
  Object.entries(MTYPE).forEach(([key,cfg])=>{
    if(key.startsWith('boss')) return; // 보스 제외
    if(cfg.tier>stg) return;           // 아직 등장 안 함
    // 낮은 티어일수록 가중치 낮아짐 (희귀도 자연 반영)
    const tierGap=stg-cfg.tier;
    const weight=tierGap>=3?1:tierGap===2?3:tierGap===1?6:10;
    for(let i=0;i<weight;i++) pool.push(key);
  });
  return pool.length>0 ? pool : ['goblin'];
}

// ── 스테이지별 보스 결정 ──────────────────────────────
function getBossType(stg){
  if(stg>=5) return 'boss5';
  if(stg>=4) return 'boss4';
  if(stg>=3) return 'boss3';
  if(stg>=2) return 'boss2';
  return 'boss';
}

// ── 엘리트 여부 (10% 확률, 스테이지 3+부터) ──────────
function isElite(stg){ return stg>=3 && Math.random()<0.10; }

function spawnMonster(type){
  // 타입 미지정 시 스테이지 풀에서 랜덤 선택
  if(!type){
    const pool=getMonsterPool(stage);
    type=pool[Math.random()*pool.length|0];
  }
  let x,y,tries=0;
  do{
    x=(1+Math.random()*(COLS-2))*TILE;
    y=(1+Math.random()*(ROWS-2))*TILE;
    tries++;
  }while(
    (isWall(x,y)||
    Math.hypot(x-player.x,y-player.y)<280||
    (x>bossArena.x-100&&y>bossArena.y-100))&&tries<80
  );
  if(tries>=80) return;

  const cfg=MTYPE[type];
  if(!cfg) return;

  // 스테이지 기본 강화
  const boost=1+(stage-1)*0.18;
  // 엘리트 처리
  const elite=isElite(stage);
  const eb=elite?1.8:1; // 엘리트 배율

  monsters.push({
    id:nextId++, type, x, y,
    label: cfg.label+(elite?'★':''),
    elite,
    hp:   (cfg.hp   *boost*eb)|0,
    maxHp:(cfg.hp   *boost*eb)|0,
    atk:  (cfg.atk  *boost*eb)|0,
    spd:   cfg.spd  *(1+(stage-1)*0.07)*(elite?1.3:1),
    range: cfg.range,
    warn:  cfg.warn,
    cd:    Math.max(55, cfg.cd-(stage-1)*5)|0,
    size:  cfg.size+(elite?3:0),
    score: (cfg.score*stage*(elite?3:1))|0,
    col:   elite?'#ffd700':cfg.col,
    attackStyle: cfg.attackStyle||'fill_circle',
    attackCd:(Math.random()*cfg.cd)|0,
    warnPhase:false, alive:true,
    enraged:false, phase:0,
    aimAngle:0, bossPhase:0,
  });
}

function spawnBoss(){
  const bossType=getBossType(stage);
  const cfg=MTYPE[bossType];
  const bx=bossArena.x+bossArena.w/2;
  const by=bossArena.y+bossArena.h/2;
  // 보스는 스테이지마다 자체 스탯이 다르므로 boost를 작게
  const boost=1+(stage-1)*0.15;
  monsters.push({
    id:nextId++, type:bossType, x:bx, y:by,
    label: cfg.label,
    elite: false,
    hp:   (cfg.hp  *boost)|0,
    maxHp:(cfg.hp  *boost)|0,
    atk:  (cfg.atk *boost)|0,
    spd:   cfg.spd *(1+(stage-1)*0.06),
    range: cfg.range, warn:cfg.warn,
    cd:Math.max(90, cfg.cd-(stage-1)*10)|0,
    size:  cfg.size+Math.min(stage-1,5),
    score: (cfg.score*stage)|0,
    col:   cfg.col,
    // 보스 패턴 랜덤 (매 스폰마다 다름)
    attackStyle: ['fill_cross','fill_scatter','fill_ring','fill_cone','fill_line'][Math.random()*5|0],
    attackCd:80, warnPhase:false, alive:true,
    enraged:false, phase:0,
    aimAngle:0, bossPhase:0,
    // 생김새 변형 (색조 랜덤)
    colVariant: ['#f40','#c0f','#0af','#ff0','#f00','#4f0','#f80'][Math.random()*7|0],
  });
  bossSpawned=true;
  screenShake=60;
  SFX.bossSpawn();
  const bossEmoji=MEMOJI[bossType]||'👑';
  showAlert(`${bossEmoji} ${cfg.label} 등장!`);
  addLog(`${bossEmoji} ${cfg.label}이(가) 각성했다!!!`,'boss');
  document.getElementById('boss-bar').style.display='block';
}

// ═══════════════════════════════════════════════════════
//  공격
// ═══════════════════════════════════════════════════════
// ── 구르기(대시) ──────────────────────────────────
const DASH_SPEED = 9.5;   // 대시 속도
const DASH_FRAMES = 12;   // 대시 지속 프레임
const DASH_CD = 180;      // 대시 쿨다운 (3초)
const DASH_IFRAMES = 14;  // 무적 프레임

function doDash(){
  if(multiMode){
    const now=Date.now();
    if(!window._multiLastDash) window._multiLastDash=0;
    if(now-window._multiLastDash < 3000) return;
    window._multiLastDash=now;
    if(multiWs&&multiWs.readyState===1)
      multiWs.send(JSON.stringify({type:'dash'}));
    // 클라이언트 즉시 예측 (싱글과 동일 물리)
    if(player&&player.alive){
      const ang=player.facing||0;
      player.dashVx=Math.cos(ang)*DASH_SPEED;
      player.dashVy=Math.sin(ang)*DASH_SPEED;
      player.dashFrames=DASH_FRAMES;
      player.dashCd=DASH_CD;
      player.iframes=DASH_IFRAMES;
    }
    try{SFX.dash();}catch(e){}
    return;
  }
  if(!gameRunning||!player.alive) return;
  if(player.dashCd>0) return;
  // 이동 방향 또는 facing 방향으로 대시
  const dx=(keys['ArrowRight']||keys['d']||keys['D'])-(keys['ArrowLeft']||keys['a']||keys['A']);
  const dy=(keys['ArrowDown']||keys['s']||keys['S'])-(keys['ArrowUp']||keys['w']||keys['W']);
  let ang;
  if(dx||dy) ang=Math.atan2(dy,dx);
  else ang=player.facing||0;
  player.dashVx=Math.cos(ang)*DASH_SPEED;
  player.dashVy=Math.sin(ang)*DASH_SPEED;
  player.dashFrames=DASH_FRAMES;
  player.dashCd=DASH_CD;
  player.iframes=DASH_IFRAMES;
  SFX.dash();
}

function doAttack(){
  if(multiMode){
    const now=Date.now();
    if(!window._multiLastAttack) window._multiLastAttack=0;
    if(now-window._multiLastAttack < 400) return;
    window._multiLastAttack=now;
    if(multiWs&&multiWs.readyState===1){
      multiWs.send(JSON.stringify({type:'attack'}));
      try{_getACtx();SFX.shoot();}catch(e){}
    }
    return;
  }
  if(!gameRunning||!player||!player.alive||player.attackCd>0) return;
  const wp=WEAPONS[player.weapon]||WEAPONS.sword;
  player.attackCd=wp.cd;
  const angle=player.facing!==undefined?player.facing:0;
  try{_getACtx();SFX.shoot();}catch(e){}
  for(let i=0;i<wp.count;i++){
    const sp=wp.count>1?((i-(wp.count-1)/2)*wp.spread*1.1):(Math.random()-0.5)*wp.spread;
    const a=angle+sp;
    bullets.push({
      x:player.x,y:player.y,
      vx:Math.cos(a)*wp.spd,
      vy:Math.sin(a)*wp.spd,
      dist:0,angle:a,alive:true,
      dmgOverride:wp.dmg+(window._atkBonus||0),
      pierce:wp.pierce,
      range:wp.range,
      col:wp.col,
      len:wp.id==='laser'?36:wp.id==='rifle'?30:24,
      w:wp.id==='cannon'?8:wp.id==='laser'?3:4,
      isMob:false,
    });
  }
}

function doSkillBomb(){
  if(multiMode){
    if(!player||!player.alive) return;
    if(skillCd.bomb>0) return;
    skillCd.bomb=CD_BOMB;      // 즉시 쿨다운 적용
    if(multiWs&&multiWs.readyState===1)
      multiWs.send(JSON.stringify({type:'bomb'}));
    // 클라이언트 즉시 폭탄 생성 (시각 피드백)
    if(player&&player.alive){
      const angle=player.facing||0;
      bombs.push({x:player.x,y:player.y,
        vx:Math.cos(angle)*5,vy:Math.sin(angle)*5,
        dist:0,maxDist:200,exploded:false,explodeTimer:0,
        radius:0,maxRadius:90,alive:true});
    }
    try{SFX.explode();}catch(e){}
    return;
  }
  if(!gameRunning||!player||!player.alive||skillCd.bomb>0) return;
  skillCd.bomb=CD_BOMB;
  SFX.explode();
  const angle=player.facing!==undefined?player.facing:0;
  bombs.push({
    x:player.x, y:player.y,
    vx:Math.cos(angle)*5, vy:Math.sin(angle)*5,
    dist:0, maxDist:200, exploded:false, explodeTimer:0,
    radius:0, maxRadius:90, alive:true,
  });
  addLog('💣 폭탄 투척!');
}

function doSkillShield(){
  if(multiMode){
    if(!player||!player.alive) return;
    if(skillCd.shield>0) return;
    skillCd.shield=CD_SHIELD;
    shieldActive=120;
    if(multiWs&&multiWs.readyState===1)
      multiWs.send(JSON.stringify({type:'shield'}));
    try{SFX.shield();}catch(e){}
    return;
  }
  if(!gameRunning||!player||!player.alive||skillCd.shield>0) return;
  skillCd.shield=CD_SHIELD;
  SFX.shield();
  shieldActive=120; // 2초 방패
  addLog('🛡 방패막 발동! 2초간 무적');
}

function doSkillThunder(){
  if(multiMode){
    if(!player||!player.alive) return;
    if(skillCd.thunder>0) return;
    skillCd.thunder=CD_THUNDER;
    if(multiWs&&multiWs.readyState===1)
      multiWs.send(JSON.stringify({type:'thunder'}));
    // 클라이언트 즉시 이펙트
    if(player&&player.alive){
      spawnParticles(player.x,player.y,'#aaff00',12);
      dangerZonesFx.push({x:player.x,y:player.y,r:180,life:25,col:'#ccff44',type:'thunder'});
    }
    try{SFX.thunder&&SFX.thunder();}catch(e){}
    return;
  }
  if(!gameRunning||!player||!player.alive||skillCd.thunder>0) return;
  skillCd.thunder=CD_THUNDER;
  // 주변 반경 180 내 모든 몬스터에 번개 피해
  const THUNDER_R=180, THUNDER_DMG=55;
  let hit=0;
  monsters.forEach(m=>{
    if(!m.alive) return;
    if(Math.hypot(m.x-player.x,m.y-player.y)<THUNDER_R){
      m.hp-=THUNDER_DMG;
      spawnParticles(m.x,m.y,'#ccf',10);
      hit++;
      if(m.hp<=0) killMonster(m);
    }
  });
  // 번개 시각 이펙트
  dangerZonesFx.push({x:player.x,y:player.y,r:THUNDER_R,life:25,col:'#aaf',type:'thunder'});
  addLog(`⚡ 번개 범위공격! ${hit}마리 피격`,'kill');
}

function killMonster(m){
  m.alive=false; kills++;
  // 골드 획득 (몬스터 점수 기반)
  const earnedGold = m.elite ? (m.score/3|0)+10 : (m.score/5|0)+2;
  gold += earnedGold;
  spawnParticles(m.x,m.y,'#ffd700',16);
  // 골드 획득 텍스트 (간헐적)
  if(earnedGold>=5) addLog(`💰 +${earnedGold}G`,'win');
  // 아이템 드랍 (30% 확률)
  if(Math.random()<0.30){
    const iTypes=['hp','bomb_charge','shield_charge','thunder_charge','speed'];
    const it=iTypes[Math.random()*iTypes.length|0];
    items.push({id:nextId++,x:m.x,y:m.y,type:it,life:600,pulse:0});
  }
  // 무기 드랍 (스테이지 2+, 15%)
  if(stage>=2&&Math.random()<0.15){
    const wt=WEAPON_DROP_POOL[Math.random()*WEAPON_DROP_POOL.length|0];
    items.push({id:nextId++,x:m.x+(Math.random()-0.5)*40,y:m.y+(Math.random()-0.5)*40,type:'weapon_'+wt,life:900,pulse:0});
  }
  if(m.type&&m.type.startsWith('boss')){
    bossDefeated=true; gameRunning=false;
    totalKills+=kills;
    const nextBossType=getBossType(stage+1);
    const nextBossCfg=MTYPE[nextBossType];
    gold += stage * 80; // 보스 처치 골드 보너스
    SFX.stageClear(); setBGMStage(stage+1);
    addLog(`🏆 스테이지 ${stage} 보스 처치! +${stage*80}💰`,'win');
    if(nextBossCfg) addLog(`다음: ${MEMOJI[nextBossType]||'👑'} ${nextBossCfg.label}이(가) 기다린다...`,'boss');
    setTimeout(()=>showStageCleared(),800);
  } else {
    const g=Math.floor(m.score/2)+Math.floor(Math.random()*5);
    gold+=g;
    addLog(`${MEMOJI[m.type]||'👾'} ${m.label||m.type} 처치! +${g}💰`,'kill');
  }
}

const ITEM_EMOJI={hp:'❤️',bomb_charge:'💣',shield_charge:'🛡',thunder_charge:'⚡',speed:'👟',
  weapon_pistol:'🔫',weapon_shotgun:'💥',weapon_rifle:'🎯',weapon_smg:'⚡',
  weapon_laser:'🔴',weapon_cannon:'💣',weapon_twin:'🔫'};
const ITEM_COL  ={hp:'#f44',bomb_charge:'#fa0',shield_charge:'#4af',thunder_charge:'#ccf',speed:'#4f8',
  weapon_pistol:'#ffdd44',weapon_shotgun:'#ff8844',weapon_rifle:'#44ff88',
  weapon_smg:'#aaaaff',weapon_laser:'#ff2244',weapon_cannon:'#ff6600',weapon_twin:'#ffaa00'};

// ═══════════════════════════════════════════════════════
//  파티클
// ═══════════════════════════════════════════════════════
const MAX_PARTICLES=120;
function spawnParticles(x,y,col,n=6){
  n=Math.min(n,6);
  if(particles.length>MAX_PARTICLES) return;
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2, sp=1.2+Math.random()*3;
    particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,
      life:25+Math.random()*20|0, col, r:1.5+Math.random()*2.5});
  }
}

// ═══════════════════════════════════════════════════════
//  업데이트
// ═══════════════════════════════════════════════════════
function update(){
  // 멀티모드도 update() 실행 (서버 처리 부분만 스킵)
  if(!gameRunning && !multiMode) return;
  if(!player) return; // player 주입 전 guard
  tick++;

  // ── 플레이어 이동 ─────────────────────────────────
  if(player.alive){
    if(player.iframes>0) player.iframes--;
    if(player.attackCd>0) player.attackCd--;

    // 마우스 방향으로 facing 매 틱 갱신 (이동 없어도 조준 유지)
    if(gameRunning){
      player.facing=Math.atan2(
        (mouse.y+camY)-player.y,
        (mouse.x+camX)-player.x
      );
    }
    // 마우스 홀드 연사
    if(mouseAttacking) doAttack();

    let dx=0,dy=0;
    if(keys['ArrowUp']   ||keys['w']||keys['W']) dy-=1;
    if(keys['ArrowDown'] ||keys['s']||keys['S']) dy+=1;
    if(keys['ArrowLeft'] ||keys['a']||keys['A']) dx-=1;
    if(keys['ArrowRight']||keys['d']||keys['D']) dx+=1;
    // 조이스틱 입력 합산
    if(mobileActive&&joyState.active){
      const mi=getMobileInput();
      if(mi.up) dy-=1; if(mi.down) dy+=1;
      if(mi.left) dx-=1; if(mi.right) dx+=1;
      if(!dx&&!dy){ dx=joyState.dx; dy=joyState.dy; }
    }
    // 조준 조이스틱 facing 실시간 반영
    if(mobileActive && typeof aimJoyState!=='undefined' && aimJoyState.active){
      player.facing = Math.atan2(aimJoyState.dy, aimJoyState.dx);
    }
    // 대시 처리
    if(player.dashFrames>0){
      const dr=moveSlide(player.x,player.y,player.x+player.dashVx,player.y+player.dashVy);
      player.x=Math.max(TILE,Math.min(MAP_W-TILE,dr.x));
      player.y=Math.max(TILE,Math.min(MAP_H-TILE,dr.y));
      player.dashFrames--;
    } else if(dx||dy){
      const len=Math.hypot(dx,dy);
      if(tick%18===0) SFX.step();
      const spd2 = P_SPEED*(player.speedBoost>0?1.7:1);
      const nx=player.x+(dx/len)*spd2;
      const ny=player.y+(dy/len)*spd2;
      const r=moveSlide(player.x,player.y,nx,ny);
      player.x=Math.max(TILE,Math.min(MAP_W-TILE,r.x));
      player.y=Math.max(TILE,Math.min(MAP_H-TILE,r.y));
    }
    // 대시 쿨다운
    if(player.dashCd>0) player.dashCd--;

    // 보스 방 진입
    if(!bossSpawned){
      const ba=bossArena;
      if(player.x>ba.x&&player.x<ba.x+ba.w&&player.y>ba.y&&player.y<ba.y+ba.h){
        SFX.door();
        spawnBoss();
      }
    }
  }

  // ── 몬스터 AI (서버 처리 → 멀티에서 스킵) ───────
  if(!multiMode) monsters.forEach(m=>{
    if(!m.alive) return;
    m.phase++;
    const dx=player.x-m.x, dy=player.y-m.y;
    const d2=dx*dx+dy*dy, d=Math.sqrt(d2);
    if(d2>SIGHT_R*SIGHT_R*9&&tick%2!==0) return;
    const aggroR = m.type&&m.type.startsWith('boss')?700:300;

    // 이동
    if(d<aggroR && d>m.range*0.75){
      const spd=m.enraged?m.spd*1.55:m.spd;
      const nx=m.x+(dx/d)*spd, ny=m.y+(dy/d)*spd;
      const r=moveSlide(m.x,m.y,nx,ny,m.size*0.7);
      m.x=r.x; m.y=r.y;
    }
    // 보스는 bossArena 안에서만 이동
    if(m.type&&m.type.startsWith('boss')&&bossArena){
      const pad=m.size;
      m.x=Math.max(bossArena.x+pad, Math.min(bossArena.x+bossArena.w-pad, m.x));
      m.y=Math.max(bossArena.y+pad, Math.min(bossArena.y+bossArena.h-pad, m.y));
    }

    m.attackCd--;
    m.warnPhase = m.attackCd<=m.warn && m.attackCd>0 && d<m.range*2.2;

    // 격노
    if(m.type&&m.type.startsWith('boss')&&!m.enraged&&m.hp<m.maxHp*0.5){
      m.enraged=true; m.cd=(m.cd*0.62)|0;
      addLog('🔥 보스가 격노했습니다!','boss');
    }

    // 경고 시작 시 각도 고정
    if(m.attackCd===m.warn){
      m.aimAngle = Math.atan2(dy, dx);
    }

    // 공격 발동
    if(m.attackCd<=0){
      m.attackCd = m.enraged ? (m.cd*0.65)|0 : m.cd;
      if(!player.alive) return;
      const style = m.attackStyle||'fill_circle';
      const shielded = shieldActive>0 || player.iframes>0;

      // 보스 페이즈마다 패턴 순환
      if(m.type&&m.type.startsWith('boss')){
        m.bossPhase=(m.bossPhase+1)%4;
        const bpat=['fill_cross','fill_scatter','fill_cone','fill_ring'][m.bossPhase];
        m.attackStyle = m.enraged
          ? ['fill_cross','fill_scatter','fill_cone','fill_scatter'][m.bossPhase]
          : bpat;
      }

      // ── 각 스타일별 공격 실행 ──────────────────────
      function dealDamage(extra=0){
        if(shielded) return;
        SFX.hitPlayer();
        const dmg = m.atk + extra;
        player.hp -= dmg;
        player.iframes = IFRAMES;
        spawnParticles(player.x,player.y,'#44aaff',5);
        screenShake = m.type==='boss'?22:14;
        addLog(`피격! -${dmg}HP`,'dmg');
        if(player.hp<=0){
          player.hp=0; player.alive=false;
          addLog('💀 전투 불능...','death');
          SFX.gameOver();
          gameRunning=false;
          setTimeout(()=>showEnding(false),900);
        }
      }

      if(style==='fill_circle'){
        // 원형 전방위 폭발
        if(d < m.range) dealDamage();

      } else if(style==='fill_cross'){
        // 십자: 상하좌우 4개 직선 레이저 — 레이저 투사체 생성
        [-0, Math.PI/2, Math.PI, Math.PI*1.5].forEach(offset=>{
          const ang = m.aimAngle + offset;
          bullets.push({
            x:m.x, y:m.y,
            vx:Math.cos(ang)*12, vy:Math.sin(ang)*12,
            dist:0, angle:ang, alive:true,
            isMob:true, dmg:m.atk, col:m.col, len:28, w:5,
          });
        });

      } else if(style==='fill_cone'){
        // 원뿔: aim 각도 기준 ±45도 안에 있으면 피해
        const da = Math.atan2(dy,dx) - m.aimAngle;
        const nda = Math.atan2(Math.sin(da),Math.cos(da));
        if(d < m.range*1.1 && Math.abs(nda) < Math.PI/4) dealDamage(8);

      } else if(style==='fill_line'){
        // 레이저 직선: aim 각도로 긴 레이저 투사체 1발
        bullets.push({
          x:m.x, y:m.y,
          vx:Math.cos(m.aimAngle)*14, vy:Math.sin(m.aimAngle)*14,
          dist:0, angle:m.aimAngle, alive:true,
          isMob:true, dmg:m.atk, col:m.col, len:40, w:7, pierce:true,
        });

      } else if(style==='fill_ring'){
        // 링: 도넛 영역 피해 (range*0.5 ~ range*1.1)
        if(d > m.range*0.4 && d < m.range*1.15) dealDamage();

      } else if(style==='fill_scatter'){
        // 산탄: 8방향으로 총알 퍼뜨림
        for(let i=0;i<8;i++){
          const ang = m.aimAngle + (Math.PI*2/8)*i;
          bullets.push({
            x:m.x, y:m.y,
            vx:Math.cos(ang)*9, vy:Math.sin(ang)*9,
            dist:0, angle:ang, alive:true,
            isMob:true, dmg:m.atk, col:m.col, len:18, w:4,
          });
        }
      }
    }
  });

  // ── 몬스터 리스폰 (절대 상한 30, 멀티에서 스킵) ──
  if(!multiMode){ spawnTimer++;
  if(spawnTimer>Math.max(150,280-(stage-1)*15)){
    spawnTimer=0;
    const normal=monsters.filter(m=>m.alive&&m.type!=='boss').length;
    const toSpawn=Math.min(4,30-normal);
    for(let i=0;i<toSpawn;i++) spawnMonster();
  }
  // 몬스터 filter는 싱글에서만 (멀티는 서버가 관리)
  if(!multiMode){
    let mfi=0;
    for(let i=0;i<monsters.length;i++){if(monsters[i].alive)monsters[mfi++]=monsters[i];}
    monsters.length=mfi;
  }

  // ── 쿨다운 감소 ──────────────────────────────────
  if(skillCd.bomb>0)    skillCd.bomb--;
  if(skillCd.shield>0)  skillCd.shield--;
  if(skillCd.thunder>0) skillCd.thunder--;
  if(shieldActive>0)    shieldActive--;

  // ── 아이템 픽업 ──────────────────────────────────
  items.forEach(it=>{
    it.life--; it.pulse++;
    if(!player.alive) return;
    if(Math.hypot(it.x-player.x,it.y-player.y)<22){
      it.life=0;
      if(multiMode && it.id){
        _pickedItemIds.add(it.id);
        // 서버에 픽업 알림 (서버가 items에서 제거)
        if(multiWs&&multiWs.readyState===1)
          multiWs.send(JSON.stringify({type:'pickup',itemId:it.id}));
      }
      SFX.item();
      if(it.type==='hp'){
        player.hp=Math.min(player.maxHp,player.hp+30);
        // HP 숫자 즉시 업데이트 (버그 수정)
        const hn=document.getElementById('hn0');
        const hf=document.getElementById('hf0');
        if(hn) hn.textContent=Math.max(0,player.hp)+' / '+player.maxHp;
        if(hf) hf.style.width=Math.max(0,player.hp/player.maxHp*100)+'%';
        addLog('❤️ HP +30 회복','win');
      } else if(it.type==='bomb_charge'){
        skillCd.bomb=0;
        addLog('💣 폭탄 충전!','win');
      } else if(it.type==='shield_charge'){
        skillCd.shield=0;
        addLog('🛡 방패 충전!','win');
      } else if(it.type==='thunder_charge'){
        skillCd.thunder=0;
        addLog('⚡ 번개 충전!','win');
      } else if(it.type==='speed'){
        player.speedBoost=(player.speedBoost||0)+180;
        addLog('👟 속도 부스트 3초!','win');
      }
      else if(it.type&&it.type.startsWith('weapon_')){
        const wid=it.type.slice(7);const wp2=WEAPONS[wid];
        if(wp2){
          const prev=WEAPONS[player.weapon]||WEAPONS.sword;
          player.weapon=wid; player.attackCd=0;
          addLog(`${wp2.emoji} ${wp2.name} 획득! (${prev.emoji}→${wp2.emoji})  ${wp2.desc}`,'win');
          updateWeaponHUD();
        }
      }
      const icol=it.type.startsWith('weapon_')?WEAPONS[it.type.slice(7)]?.col||'#ffd':ITEM_COL[it.type]||'#ffd';
      spawnParticles(it.x,it.y,icol,12);
    }
  });
  items=items.filter(it=>it.life>0);
  if(player.speedBoost>0) player.speedBoost--;

  // ── 폭탄 업데이트 ────────────────────────────────
  bombs.forEach(b=>{
    if(b.exploded){
      b.explodeTimer++;
      b.radius=b.maxRadius*(b.explodeTimer/20);
      if(b.explodeTimer>=20){ b.alive=false; return; }
      // 폭발 피해
      if(b.explodeTimer===5){
        monsters.forEach(m=>{
          if(!m.alive) return;
          if(Math.hypot(m.x-b.x,m.y-b.y)<b.maxRadius){
            m.hp-=80;
            spawnParticles(m.x,m.y,'#f84',8);
            if(m.hp<=0) killMonster(m);
          }
        });
        screenShake=25;
        dangerZonesFx.push({x:b.x,y:b.y,r:b.maxRadius,life:18,col:'#f84',type:'bomb'});
      }
    } else {
      b.x+=b.vx; b.y+=b.vy; b.dist+=5;
      if(b.dist>b.maxDist||isWall(b.x,b.y)) b.exploded=true;
    }
  });
  bombs=bombs.filter(b=>b.alive);
  dangerZonesFx.forEach(d=>d.life--);
  dangerZonesFx=dangerZonesFx.filter(d=>d.life>0);

  // ── 총알 업데이트 ────────────────────────────────
  bullets.forEach(b=>{
    if(!b.alive) return;
    const spd=Math.hypot(b.vx,b.vy);
    b.x+=b.vx; b.y+=b.vy; b.dist+=spd;
    const maxR = b.isMob ? (b.pierce?500:350) : BULLET_RANGE;
    if(b.dist>maxR||isWall(b.x,b.y)){ b.alive=false; return; }

    if(b.isMob){
      // 몬스터 투사체 → 플레이어 공격
      if(player.alive && shieldActive<=0 && player.iframes<=0){
        if(Math.hypot(player.x-b.x,player.y-b.y)<14){
          if(!b.pierce) b.alive=false;
          player.hp-=b.dmg;
          player.iframes=IFRAMES;
          spawnParticles(player.x,player.y,'#44aaff',5);
          screenShake=14;
          addLog(`투사체 피격! -${b.dmg}HP`,'dmg');
          if(player.hp<=0){
            player.hp=0; player.alive=false;
            addLog('💀 전투 불능...','death');
            gameRunning=false;
            setTimeout(()=>showEnding(false),900);
          }
        }
      }
    } else {
      // 플레이어 투사체 → 몬스터 공격
      monsters.forEach(m=>{
        if(!m.alive||!b.alive) return;
        if(Math.hypot(m.x-b.x,m.y-b.y)<m.size+4){
          if(!b.pierce) b.alive=false;
          const dmg=b.dmgOverride||P_ATK;
          m.hp-=dmg;
          SFX.hitMonster();
          spawnParticles(m.x,m.y,m.col,6);
          if(m.hp<=0) killMonster(m);
        }
      });
    }
  });
  if(bullets.length>80)bullets.splice(0,bullets.length-80);
  let bi=0;
  for(let i=0;i<bullets.length;i++){if(bullets[i].alive)bullets[bi++]=bullets[i];}
  bullets.length=bi;

  // ── 파티클 ───────────────────────────────────────
  let pi=0;
  for(let i=0;i<particles.length;i++){const p=particles[i];p.x+=p.vx;p.y+=p.vy;p.vx*=0.88;p.vy*=0.88;p.life--;if(p.life>0)particles[pi++]=p;}
  particles.length=pi;
  let ai=0;
  for(let i=0;i<attackFx.length;i++){attackFx[i].life--;if(attackFx[i].life>0)attackFx[ai++]=attackFx[i];}
  attackFx.length=ai;

  // ── 시야 업데이트 (4프레임마다) ───────────────────
  if(tick%4===0) updateFog();

  // ── 카메라 (싱글+멀티 공통) ──────────────────────
  if(player){
    const tx=player.x-canvas.width/2, ty=player.y-canvas.height/2;
    camX+=(tx-camX)*0.12; camY+=(ty-camY)*0.12;
    camX=Math.max(0,Math.min(MAP_W-canvas.width,camX));
    camY=Math.max(0,Math.min(MAP_H-canvas.height,camY));
  }
  if(screenShake>0) screenShake--;

  // ── HUD (6프레임마다 DOM 업데이트) ─────────────────
  if(tick%6===0) updateMobileSkillHUD();
  const boss=monsters.find(m=>m.type&&m.type.startsWith('boss')&&m.alive);
  if(tick%6===0){
    const pct=Math.max(0,player.hp/player.maxHp*100);
    document.getElementById('hf0').style.width=pct+'%';
    document.getElementById('hn0').textContent=Math.max(0,player.hp)+' / '+player.maxHp;
    document.getElementById('s-kills').textContent=kills;
    document.getElementById('s-stage').textContent=stage;
    document.getElementById('s-total').textContent=totalKills+kills;
    const goldEl=document.getElementById('s-gold');
    if(goldEl) goldEl.textContent=gold;
    const sg=document.getElementById('s-gold');
    if(sg) sg.textContent=gold;
    const skillDefs=[
      {id:'sk0',cd:player.attackCd,max:P_CD},
      {id:'sk1',cd:skillCd.bomb,max:CD_BOMB},
      {id:'sk2',cd:skillCd.shield,max:CD_SHIELD},
      {id:'sk3',cd:skillCd.thunder,max:CD_THUNDER},
    ];
    skillDefs.forEach(s=>{
      const el=document.getElementById(s.id);
      const cdEl=document.getElementById(s.id+'cd');
      if(!el||!cdEl) return;
      el.className=s.cd<=0?'skill-slot ready':'skill-slot';
      cdEl.textContent=s.cd<=0?'준비':`${(s.cd/60).toFixed(1)}s`;
    });
    const sk2=document.getElementById('sk2');
    if(sk2&&shieldActive>0) sk2.className='skill-slot active';
    const itemCounts={};
    items.forEach(it=>{ itemCounts[it.type]=(itemCounts[it.type]||0)+1; });
    const itEl=document.getElementById('item-list');
    if(itEl){
      const entries=Object.entries(itemCounts);
      itEl.innerHTML=entries.length===0
        ?'<div class="it-row" style="color:#556">없음</div>'
        :entries.map(([t,n])=>`<div class="it-row">${ITEM_EMOJI[t]} x${n}</div>`).join('');
    }
  }
  if(boss && player.alive && gameRunning){
    document.getElementById('boss-bar').style.display='block';
    document.getElementById('boss-hp-fill').style.width=(boss.hp/boss.maxHp*100)+'%';
    document.getElementById('boss-title').textContent=
      (boss.enraged?'🔥 ':'👑 ')+(boss.label||'던전의 군주')+(boss.enraged?' [격노]':'');
  } else {
    document.getElementById('boss-bar').style.display='none';
  }
}

// ── Fog ─────────────────────────────────────────────
function updateFog(){
  if(!player.alive) return;
  const r=Math.ceil(SIGHT_R/TILE)+1;
  const cx=player.x/TILE|0, cy=player.y/TILE|0;
  for(let dy=-r;dy<=r;dy++){
    for(let dx=-r;dx<=r;dx++){
      if(dx*dx*TILE*TILE+dy*dy*TILE*TILE>(SIGHT_R+TILE)*(SIGHT_R+TILE)) continue;
      const c=cx+dx, rr=cy+dy;
      if(c>=0&&c<COLS&&rr>=0&&rr<ROWS) explored[rr*COLS+c]=1;
    }
  }
}

// ═══════════════════════════════════════════════════════
//  렌더
// ═══════════════════════════════════════════════════════
// 타일 색상
const floorColor='#111228', wallColor='#1e2040', wallTop='#252848';
const bossFloor='#1e0808', dimFloor='#0a0a18', dimWall='#0d0e1e';

// ── 타일맵 오프스크린 캐시 ──────────────────────────
// 맵 전체를 하나의 큰 오프스크린 캔버스에 그려두고
// 화면에 보이는 영역만 drawImage로 잘라서 그림
// explored/inSight는 fog로 처리하므로 여기선 전체 타일만 캐시
let _tileCanvas=null, _tileCtx=null, _tilesDirty=true;
let _mmCanvas=null, _mmCtx2=null, _mmDirty=true;
let _exploredVersion=0, _lastExploredVersion=-1;

function _rebuildTileCache(){
  if(!_tileCanvas||_tileCanvas.width!==MAP_W||_tileCanvas.height!==MAP_H){
    _tileCanvas=document.createElement('canvas');
    _tileCanvas.width=MAP_W; _tileCanvas.height=MAP_H;
    _tileCtx=_tileCanvas.getContext('2d');
  }
  const tc=_tileCtx, ts=TILE;
  tc.fillStyle='#050810'; tc.fillRect(0,0,MAP_W,MAP_H);
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      const idx=r*COLS+c;
      if(!explored[idx]) continue;
      const wx=c*ts, wy=r*ts;
      const t=tiles[idx];
      const inBoss=bossArena&&wx>=bossArena.x-ts&&wx<bossArena.x+bossArena.w+ts
                &&wy>=bossArena.y-ts&&wy<bossArena.y+bossArena.h+ts;
      if(t===1){
        tc.fillStyle=wallColor;  tc.fillRect(wx,wy,ts,ts);
        tc.fillStyle=wallTop;    tc.fillRect(wx+2,wy+2,ts-4,ts-4);
        tc.fillStyle='#2a305a';  tc.fillRect(wx+2,wy+2,ts-4,3);
        tc.fillStyle='#2a305a';  tc.fillRect(wx+2,wy+2,3,ts-4);
      } else {
        tc.fillStyle=inBoss?bossFloor:floorColor; tc.fillRect(wx,wy,ts,ts);
        tc.strokeStyle=inBoss?'#2a1010':'#151530';
        tc.lineWidth=.5; tc.strokeRect(wx,wy,ts,ts);
      }
    }
  }
  _tilesDirty=false;
}

// updateFog 호출 후 dirty 마크
const _origUpdateFog=()=>{
  if(!player.alive) return;
  const r=Math.ceil(SIGHT_R/TILE)+1;
  const cx=player.x/TILE|0, cy=player.y/TILE|0;
  let changed=false;
  for(let dy=-r;dy<=r;dy++){
    for(let dx=-r;dx<=r;dx++){
      if(dx*dx*TILE*TILE+dy*dy*TILE*TILE>(SIGHT_R+TILE)*(SIGHT_R+TILE)) continue;
      const c=cx+dx, rr=cy+dy;
      if(c>=0&&c<COLS&&rr>=0&&rr<ROWS&&!explored[rr*COLS+c]){
        explored[rr*COLS+c]=1; changed=true;
      }
    }
  }
  if(changed) _tilesDirty=true;
};

function draw(){
  // 멀티: player가 없으면 대기
  if(multiMode && !player) return;  // 멀티: player 주입 전만 대기
  if(!multiMode && !gameRunning) return;
  if(!player) return;

  const W=canvas.width, H=canvas.height;
  const shX=screenShake>0?(Math.random()-.5)*screenShake*.3:0;
  const shY=screenShake>0?(Math.random()-.5)*screenShake*.3:0;

  ctx.save();
  ctx.translate(shX,shY);
  ctx.clearRect(-10,-10,W+20,H+20);
  ctx.fillStyle='#050810'; ctx.fillRect(-10,-10,W+20,H+20);

  // ── 타일 렌더링 (탐험 여부 + 시야 여부 2단계) ──────
  const px=player.x, py=player.y, sr2=SIGHT_R*SIGHT_R;
  {
    const ts=TILE;
    const c0=Math.max(0,(camX/ts)|0)-1;
    const c1=Math.min(COLS,((camX+W)/ts|0)+2);
    const r0=Math.max(0,(camY/ts)|0)-1;
    const r1=Math.min(ROWS,((camY+H)/ts|0)+2);

    for(let r=r0;r<r1;r++){
      for(let c=c0;c<c1;c++){
        const idx=r*COLS+c;
        const exp=explored[idx];
        const wx=c*ts, wy=r*ts;
        const sx2=wx-camX|0, sy2=wy-camY|0;
        const t=tiles[idx];

        if(!exp){
          // 미탐험: 완전히 검정
          ctx.fillStyle='#000';
          ctx.fillRect(sx2,sy2,ts,ts);
          continue;
        }

        // 탐험됨: 시야 안팎 구분
        const ddx=wx+ts/2-px, ddy=wy+ts/2-py;
        const inSight=ddx*ddx+ddy*ddy<sr2*1.05;
        const inBoss=bossArena&&wx>=bossArena.x-ts&&wx<bossArena.x+bossArena.w+ts
                  &&wy>=bossArena.y-ts&&wy<bossArena.y+bossArena.h+ts;

        if(inSight){
          // 시야 안 — 밝게
          if(t===1){
            ctx.fillStyle='#1e2040'; ctx.fillRect(sx2,sy2,ts,ts);
            ctx.fillStyle='#252848'; ctx.fillRect(sx2+2,sy2+2,ts-4,ts-4);
            ctx.fillStyle='#2a305a'; ctx.fillRect(sx2+2,sy2+2,ts-4,3);
            ctx.fillStyle='#2a305a'; ctx.fillRect(sx2+2,sy2+2,3,ts-4);
          } else {
            ctx.fillStyle=inBoss?'#1e0808':'#111228';
            ctx.fillRect(sx2,sy2,ts,ts);
            ctx.strokeStyle=inBoss?'#2a1010':'#151530';
            ctx.lineWidth=.5; ctx.strokeRect(sx2,sy2,ts,ts);
          }
        } else {
          // 탐험됐지만 시야 밖 — 어둡게 (기억된 지도)
          if(t===1){
            ctx.fillStyle='#0d0e20'; ctx.fillRect(sx2,sy2,ts,ts);
          } else {
            ctx.fillStyle=inBoss?'#120404':'#090a16';
            ctx.fillRect(sx2,sy2,ts,ts);
          }
        }
      }
    }
  }

  // ── 보스 방 테두리 ────────────────────────────────
  {
    const ba=bossArena;
    const ddx=ba.x+ba.w/2-px, ddy=ba.y+ba.h/2-py;
    const visible=ddx*ddx+ddy*ddy<(SIGHT_R+300)*(SIGHT_R+300);
    const bExplored=explored[(Math.floor(ba.y/TILE))*COLS+Math.floor(ba.x/TILE)];
    if(visible&&bExplored){
      ctx.save();
      const pulse=.55+.45*Math.sin(tick*.04);
      ctx.globalAlpha=pulse*.8;
      ctx.strokeStyle='#f40'; ctx.lineWidth=3;
      ctx.setLineDash([9,7]);
      ctx.strokeRect(ba.x-camX,ba.y-camY,ba.w,ba.h);
      ctx.globalAlpha=.04*pulse;
      ctx.fillStyle='#ff4400';
      ctx.fillRect(ba.x-camX,ba.y-camY,ba.w,ba.h);
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // ── 위험 범위 — 패턴별 시각화 (채워지면 그 모양으로 공격) ──
  monsters.forEach(m=>{
    if(!m.alive||!m.warnPhase) return;
    const sx=m.x-camX, sy=m.y-camY;
    const ddx=m.x-px, ddy=m.y-py;
    if(ddx*ddx+ddy*ddy>(SIGHT_R+m.range+60)*(SIGHT_R+m.range+60)) return;

    const ratio = 1 - m.attackCd/m.warn;  // 0→1
    const r2=ratio*ratio;
    const red = Math.min(255, 60+195*r2|0);
    const grn = Math.min(255, 230-200*r2|0);
    const fillC = `rgb(${red},${grn},20)`;  // 초록→노랑→빨강 (fc와 다른 이름 — fog ctx 충돌 방지)
    const style = m.attackStyle||'fill_circle';
    const ang = m.aimAngle||0;
    ctx.save();

    // ── fill_circle: 원이 안에서 밖으로 채워짐 ──────
    if(style==='fill_circle'){
      // 외곽 테두리 (고정)
      ctx.globalAlpha=0.45; ctx.strokeStyle='#663';
      ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(sx,sy,m.range,0,Math.PI*2); ctx.stroke();
      // 채워지는 원 (작은→큰)
      const fillR = m.range * ratio;
      ctx.globalAlpha=0.18+ratio*0.22;
      ctx.fillStyle=fillC;
      ctx.beginPath(); ctx.arc(sx,sy,fillR,0,Math.PI*2); ctx.fill();
      // 테두리 원
      ctx.globalAlpha=0.5+ratio*0.45;
      ctx.strokeStyle=fillC; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(sx,sy,fillR,0,Math.PI*2); ctx.stroke();
    }

    // ── fill_cross: 십자 4방향 바가 뻗어나옴 ────────
    else if(style==='fill_cross'){
      const arm = m.range * ratio;
      const thick = 18+ratio*10;
      ctx.globalAlpha=0.12+ratio*0.22;
      ctx.fillStyle=fillC;
      // 십자 4방향 막대 (ang 기준 회전)
      ctx.save(); ctx.translate(sx,sy); ctx.rotate(ang);
      ctx.fillRect(-arm,-thick/2,arm*2,thick);
      ctx.fillRect(-thick/2,-arm,thick,arm*2);
      ctx.restore();
      // 외곽 십자 테두리 (최대 범위)
      ctx.globalAlpha=0.35+ratio*0.5;
      ctx.strokeStyle=fillC; ctx.lineWidth=2;
      ctx.save(); ctx.translate(sx,sy); ctx.rotate(ang);
      ctx.strokeRect(-m.range,-thick/2*1.2,m.range*2,thick*1.2);
      ctx.strokeRect(-thick/2*1.2,-m.range,thick*1.2,m.range*2);
      ctx.restore();
    }

    // ── fill_cone: 원뿔(쐐기)이 ratio만큼 채워짐 ────
    else if(style==='fill_cone'){
      const coneAngle = Math.PI/4; // 45도 반각 → 90도 원뿔
      // 최대 범위 윤곽
      ctx.globalAlpha=0.35;
      ctx.strokeStyle='#663'; ctx.lineWidth=1.5;
      ctx.beginPath();
      ctx.moveTo(sx,sy);
      ctx.arc(sx,sy,m.range*1.1,ang-coneAngle,ang+coneAngle);
      ctx.closePath(); ctx.stroke();
      // 채워지는 원뿔
      const coneR = m.range * ratio;
      ctx.globalAlpha=0.18+ratio*0.28;
      ctx.fillStyle=fillC;
      ctx.beginPath();
      ctx.moveTo(sx,sy);
      ctx.arc(sx,sy,coneR,ang-coneAngle,ang+coneAngle);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha=0.45+ratio*0.5;
      ctx.strokeStyle=fillC; ctx.lineWidth=2;
      ctx.beginPath();
      ctx.moveTo(sx,sy);
      ctx.arc(sx,sy,coneR,ang-coneAngle,ang+coneAngle);
      ctx.closePath(); ctx.stroke();
    }

    // ── fill_line: 직선 바가 ratio만큼 뻗어나옴 ─────
    else if(style==='fill_line'){
      const maxLen = m.range*1.8;
      const lineLen = maxLen * ratio;
      const thick = 22;
      // 최대 범위 외곽
      ctx.globalAlpha=0.3; ctx.strokeStyle='#446';
      ctx.lineWidth=1.5;
      ctx.save(); ctx.translate(sx,sy); ctx.rotate(ang);
      ctx.strokeRect(0,-thick/2,maxLen,thick);
      ctx.restore();
      // 채워지는 막대
      ctx.globalAlpha=0.15+ratio*0.25;
      ctx.fillStyle=fillC;
      ctx.save(); ctx.translate(sx,sy); ctx.rotate(ang);
      ctx.fillRect(0,-thick/2,lineLen,thick);
      ctx.restore();
      // 테두리 막대
      ctx.globalAlpha=0.5+ratio*0.45;
      ctx.strokeStyle=fillC; ctx.lineWidth=2.5;
      ctx.save(); ctx.translate(sx,sy); ctx.rotate(ang);
      ctx.strokeRect(0,-thick/2,lineLen,thick);
      ctx.restore();
    }

    // ── fill_ring: 바깥 링이 안으로 수축 ─────────────
    else if(style==='fill_ring'){
      const outerR = m.range * 1.2;
      const innerR = outerR * (1 - ratio * 0.6); // 수축
      // 외곽 고정
      ctx.globalAlpha=0.35; ctx.strokeStyle='#663';
      ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(sx,sy,outerR,0,Math.PI*2); ctx.stroke();
      // 수축하는 링 도넛
      ctx.globalAlpha=0.15+ratio*0.28;
      ctx.fillStyle=fillC;
      ctx.beginPath();
      ctx.arc(sx,sy,outerR,0,Math.PI*2,false);
      ctx.arc(sx,sy,innerR,0,Math.PI*2,true);
      ctx.fill();
      ctx.globalAlpha=0.5+ratio*0.45;
      ctx.strokeStyle=fillC; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(sx,sy,innerR,0,Math.PI*2); ctx.stroke();
    }

    // ── fill_scatter: 원 안에서 방사형 화살표들이 퍼짐 ─
    else if(style==='fill_scatter'){
      // 배경 원
      ctx.globalAlpha=0.3; ctx.strokeStyle='#663';
      ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(sx,sy,m.range,0,Math.PI*2); ctx.stroke();
      // 8방향 화살표 선 (ratio만큼 길어짐)
      ctx.globalAlpha=0.55+ratio*0.4;
      ctx.strokeStyle=fillC; ctx.lineWidth=2; ctx.lineCap='round';
      for(let i=0;i<8;i++){
        const a = ang + (Math.PI*2/8)*i;
        const alen = m.range*0.85*ratio;
        const ex = sx+Math.cos(a)*alen, ey=sy+Math.sin(a)*alen;
        ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ex,ey); ctx.stroke();
        // 화살 머리
        if(ratio>0.5){
          const ha=0.4;
          ctx.beginPath();
          ctx.moveTo(ex,ey);
          ctx.lineTo(ex-Math.cos(a-ha)*10,ey-Math.sin(a-ha)*10);
          ctx.moveTo(ex,ey);
          ctx.lineTo(ex-Math.cos(a+ha)*10,ey-Math.sin(a+ha)*10);
          ctx.stroke();
        }
      }
    }

    // 경고 아이콘 (마지막 20%)
    if(ratio>0.8){
      const alertRatio=(ratio-0.8)/0.2;
      ctx.globalAlpha=alertRatio;
      ctx.fillStyle='#fff';
      ctx.font=`bold ${(12+ratio*5)|0}px serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('⚠', sx, sy - m.range - 12);
    }
    ctx.restore();
  });

  // ── 총알 렌더링 ──────────────────────────────────
  bullets.forEach(b=>{
    const sx=b.x-camX, sy=b.y-camY;
    const blen = b.len||BULLET_LEN;
    const tailX=sx-Math.cos(b.angle)*blen;
    const tailY=sy-Math.sin(b.angle)*blen;
    ctx.save();
    if(b.isMob){
      // 몬스터 투사체: 붉은/주황 색
      const mc = b.col||'#f44';
      ctx.shadowColor=mc; ctx.shadowBlur=12;
      const grad=ctx.createLinearGradient(tailX,tailY,sx,sy);
      grad.addColorStop(0,'rgba(0,0,0,0)');
      grad.addColorStop(0.3,mc);   // hex+aa 는 잘못된 색상 → 그냥 mc 사용
      grad.addColorStop(1,mc);
      ctx.strokeStyle=grad;
      ctx.lineWidth=b.w||4; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(tailX,tailY); ctx.lineTo(sx,sy); ctx.stroke();
      ctx.fillStyle='#fff'; ctx.shadowBlur=18;
      ctx.beginPath(); ctx.arc(sx,sy,3,0,Math.PI*2); ctx.fill();
    } else {
      const pc=b.col||'#88ddff';
      ctx.shadowColor=pc; ctx.shadowBlur=12;
      const gp=ctx.createLinearGradient(tailX,tailY,sx,sy);
      gp.addColorStop(0,'rgba(0,0,0,0)'); gp.addColorStop(0.4,pc); gp.addColorStop(1,pc);
      ctx.strokeStyle=gp; ctx.lineWidth=b.w||3.5; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(tailX,tailY); ctx.lineTo(sx,sy); ctx.stroke();
      ctx.shadowBlur=16; ctx.fillStyle='#fff';
      ctx.beginPath(); ctx.arc(sx,sy,2.5,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  });

    // ── 몬스터 ───────────────────────────────────────
  monsters.forEach(m=>{
    if(!m.alive) return;
    const ddx=m.x-px, ddy=m.y-py;
    if(ddx*ddx+ddy*ddy>sr2*2.5) return;
    const sx=m.x-camX, sy=m.y-camY;
    const isBoss=m.type&&m.type.startsWith('boss');
    const dispSz=isBoss?m.size*1.8:m.size*1.5;
    const hpBarY=sy-dispSz-4;

    ctx.save();
    drawMonsterSprite(ctx, m, sx, sy);
    ctx.shadowBlur=0;

    // HP 바
    const bw=Math.max(dispSz*2.2, 40)|0;
    ctx.fillStyle='#000a'; ctx.fillRect(sx-bw/2-1, hpBarY-6, bw+2, 7);
    ctx.fillStyle=isBoss?(m.enraged?'#f60':'#f84'):(m.elite?'#ffd700':'#e44');
    ctx.fillRect(sx-bw/2, hpBarY-5, bw*(m.hp/m.maxHp), 5);

    // 이름
    if(isBoss){
      const _ml=m.label||m.type; const _me=MEMOJI[m.type]||'👑';
      ctx.fillStyle=m.enraged?'#f96':'#fda'; ctx.font='bold 12px Noto Sans KR';
      ctx.textAlign='center'; ctx.textBaseline='bottom';
      ctx.fillText(m.enraged?`🔥 격노 ${_ml}`:`${_me} ${_ml}`, sx, hpBarY-10);
    } else if(m.elite){
      ctx.fillStyle='#ffd700'; ctx.font='bold 9px Noto Sans KR';
      ctx.textAlign='center'; ctx.textBaseline='bottom';
      ctx.fillText(`★ ${m.label||m.type}`, sx, hpBarY-8);
    }
    ctx.restore();
  });

    // ── 폭탄 렌더 ────────────────────────────────────
  bombs.forEach(b=>{
    const sx=b.x-camX, sy=b.y-camY;
    ctx.save();
    if(b.exploded){
      const t=b.explodeTimer/20;
      ctx.globalAlpha=(1-t)*0.7;
      ctx.fillStyle='#f84';
      ctx.beginPath(); ctx.arc(sx,sy,b.radius,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#ff0'; ctx.lineWidth=3; ctx.globalAlpha=(1-t)*0.9;
      ctx.beginPath(); ctx.arc(sx,sy,b.radius,0,Math.PI*2); ctx.stroke();
    } else {
      ctx.shadowColor='#f84'; ctx.shadowBlur=12;
      ctx.fillStyle='#f84';
      const pulse=0.8+0.2*Math.sin(tick*0.3);
      ctx.beginPath(); ctx.arc(sx,sy,8*pulse,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#ff0';
      ctx.beginPath(); ctx.arc(sx,sy,4,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  });

  // ── 스킬 이펙트 FX ───────────────────────────────
  dangerZonesFx.forEach(d=>{
    const sx=d.x-camX, sy=d.y-camY;
    const t=d.life/(d.type==='thunder'?25:18);
    ctx.save();
    ctx.globalAlpha=t*0.35;
    ctx.fillStyle=d.col;
    ctx.beginPath(); ctx.arc(sx,sy,d.r,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=t*0.8;
    ctx.strokeStyle=d.col; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(sx,sy,d.r,0,Math.PI*2); ctx.stroke();
    ctx.restore();
  });

  // ── 아이템 렌더 ─────────────────────────────────
  items.forEach(it=>{
    const ddx=it.x-player.x, ddy=it.y-player.y;
    if(ddx*ddx+ddy*ddy>SIGHT_R*SIGHT_R*1.2) return;
    const sx=it.x-camX, sy=it.y-camY;
    const pulse=0.85+0.15*Math.sin(it.pulse*0.1);
    ctx.save();
    ctx.globalAlpha=0.9;
    ctx.shadowColor=ITEM_COL[it.type]; ctx.shadowBlur=14;
    ctx.fillStyle=ITEM_COL[it.type];
    ctx.beginPath(); ctx.arc(sx,sy,10*pulse,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
    ctx.font='12px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(ITEM_EMOJI[it.type],sx,sy);
    ctx.restore();
  });

  // ── Fog — 시야 경계 소프트 마스크 ──────────────────
  {
    const psx=player.x-camX|0, psy=player.y-camY|0;
    if(!window._fog||window._fog.width!==W||window._fog.height!==H){
      window._fog=document.createElement('canvas');
      window._fog.width=W; window._fog.height=H;
      window._fogC=window._fog.getContext('2d');
    }
    const fc2=window._fogC;
    fc2.clearRect(0,0,W,H);
    // 시야 밖은 약간 어둡게 (탐험된 어두운 타일을 더 강조)
    fc2.fillStyle='rgba(2,3,8,0.72)';
    fc2.fillRect(0,0,W,H);
    // 시야 원 구멍 뚫기
    fc2.globalCompositeOperation='destination-out';
    const fg=fc2.createRadialGradient(psx,psy,SIGHT_R*0.5,psx,psy,SIGHT_R);
    fg.addColorStop(0,   'rgba(0,0,0,1)');
    fg.addColorStop(0.72,'rgba(0,0,0,0.97)');
    fg.addColorStop(1,   'rgba(0,0,0,0)');
    fc2.fillStyle=fg;
    fc2.beginPath(); fc2.arc(psx,psy,SIGHT_R,0,Math.PI*2); fc2.fill();
    fc2.globalCompositeOperation='source-over';
    ctx.drawImage(window._fog,0,0);
  }
  // ── 파티클 (fog 위) ───────────────────────────────
  particles.forEach(p=>{
    const ddx=p.x-player.x, ddy=p.y-player.y;
    if(ddx*ddx+ddy*ddy>SIGHT_R*SIGHT_R*1.1) return;
    ctx.save();
    ctx.globalAlpha=p.life/40;
    ctx.fillStyle=p.col;
    ctx.beginPath(); ctx.arc(p.x-camX,p.y-camY,p.r,0,Math.PI*2); ctx.fill();
    ctx.restore();
  });

  // ── 조준선 ───────────────────────────────────────
  if(player.alive&&gameRunning){
    const psx=player.x-camX, psy=player.y-camY;
    const ang=player.facing||0;
    const atkReady=player.attackCd<=0;

    ctx.save();
    // 방향 점선
    ctx.setLineDash([6,5]);
    ctx.strokeStyle=atkReady?'rgba(100,200,255,0.55)':'rgba(100,200,255,0.2)';
    ctx.lineWidth=1.5;
    ctx.beginPath();
    ctx.moveTo(psx+Math.cos(ang)*18, psy+Math.sin(ang)*18);
    ctx.lineTo(psx+Math.cos(ang)*P_RANGE, psy+Math.sin(ang)*P_RANGE);
    ctx.stroke();
    ctx.setLineDash([]);

    // 크로스헤어 (마우스 위치)
    const msx=mouse.x, msy=mouse.y;
    const cr=10; // 크로스헤어 반지름
    ctx.strokeStyle=atkReady?'rgba(100,220,255,0.85)':'rgba(100,180,255,0.4)';
    ctx.lineWidth=1.5;
    // 원
    ctx.beginPath(); ctx.arc(msx,msy,cr,0,Math.PI*2); ctx.stroke();
    // 십자선
    ctx.beginPath();
    ctx.moveTo(msx-cr-4,msy); ctx.lineTo(msx-cr+3,msy);
    ctx.moveTo(msx+cr-3,msy); ctx.lineTo(msx+cr+4,msy);
    ctx.moveTo(msx,msy-cr-4); ctx.lineTo(msx,msy-cr+3);
    ctx.moveTo(msx,msy+cr-3); ctx.lineTo(msx,msy+cr+4);
    ctx.stroke();
    // 쿨다운 호 (공격 준비 중)
    if(!atkReady){
      const cdRatio=1-player.attackCd/P_CD;
      ctx.strokeStyle='rgba(100,220,255,0.7)';
      ctx.lineWidth=2;
      ctx.beginPath();
      ctx.arc(msx,msy,cr,-Math.PI/2,-Math.PI/2+Math.PI*2*cdRatio);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── 플레이어 (fog 위 → 항상 보임) ────────────────
  {
    const sx=player.x-camX, sy=player.y-camY;
    ctx.save();
    const blinking=player.iframes>0&&Math.floor(tick/4)%2===0;

    // 그림자
    ctx.fillStyle='rgba(0,100,255,0.18)';
    ctx.beginPath(); ctx.ellipse(sx, sy+20, 14, 5, 0, 0, Math.PI*2); ctx.fill();

    // 방패 링
    if(shieldActive>0){
      const sp=0.8+0.2*Math.sin(tick*0.2);
      ctx.globalAlpha=0.55*sp;
      ctx.strokeStyle='#88eeff'; ctx.lineWidth=4;
      ctx.shadowColor='#88eeff'; ctx.shadowBlur=14;
      ctx.beginPath(); ctx.arc(sx,sy,26,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=0.13*sp;
      ctx.fillStyle='#88eeff';
      ctx.beginPath(); ctx.arc(sx,sy,26,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=0;
    }

    // 대시/속도부스트 잔상
    if(player.dashFrames>0||player.speedBoost>0){
      ctx.globalAlpha=0.3;
      const trailDx=player.dashFrames>0?-player.dashVx*0.5:0;
      const trailDy=player.dashFrames>0?-player.dashVy*0.5:0;
      drawPlayerSprite(ctx, sx+trailDx, sy+trailDy, player.facing, false, player.alive);
      ctx.globalAlpha=0.15;
      drawPlayerSprite(ctx, sx+trailDx*2, sy+trailDy*2, player.facing, false, player.alive);
      ctx.globalAlpha=1;
    }

    // 플레이어 스프라이트
    ctx.globalAlpha=!player.alive?0.3:blinking?0.45:1;
    if(!blinking){
      ctx.shadowColor='#4af'; ctx.shadowBlur=10;
    }
    drawPlayerSprite(ctx, sx, sy, player.facing, blinking, player.alive);
    ctx.shadowBlur=0;
    ctx.globalAlpha=1;

    // 이름
    ctx.fillStyle='#aaddff'; ctx.font='bold 10px Noto Sans KR';
    ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillText((window.playerNickname||'용사')+' ★', sx, sy - 22);

    // HP 바
    const bw=36;
    ctx.fillStyle='#000a'; ctx.fillRect(sx-bw/2-1, sy-21, bw+2, 6);
    ctx.fillStyle='#44aaff'; ctx.fillRect(sx-bw/2, sy-20, bw*(Math.max(0,player.hp)/player.maxHp), 4);
    ctx.restore();
  }

  ctx.restore(); // shake

  // ── 미니맵 ───────────────────────────────────────
  drawMinimap();
}


// ═══════════════════════════════════════════════════════
//  벡터 캐릭터 그리기 — Canvas 2D API 직접 드로잉
//  각 함수: drawXxx(c, x, y, size, facing, t) → 애니메이션
//  t = tick (애니메이션용)
// ═══════════════════════════════════════════════════════

// ── 공통 유틸 ─────────────────────────────────────────
function shadow(c, col, blur){ c.shadowColor=col; c.shadowBlur=blur; }
function noShadow(c){ c.shadowBlur=0; }
function grad(c,x,y,r,col1,col2){
  const g=c.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,col1); g.addColorStop(1,col2); return g;
}
function linGrad(c,x0,y0,x1,y1,stops){
  const g=c.createLinearGradient(x0,y0,x1,y1);
  stops.forEach(([p,col])=>g.addColorStop(p,col)); return g;
}


// ══════════════════════════════════════════════════════
//  사진 기반 커스텀 캐릭터 4인방
// ══════════════════════════════════════════════════════

// 캐릭터2: 모자 궁수 (캡모자+안경+흰티)
function drawCharArcherFriend(c,x,y,sz,facing,t,elite){
  const fl=Math.cos(facing||0)<0?-1:1;
  const bob=Math.sin(t*0.2)*2;
  c.save(); c.translate(x,y+bob);
  // 다리
  [-1,1].forEach(s=>{
    const ls=Math.sin(t*0.2)*sz*0.06*(s===1?1:-1);
    c.beginPath(); c.roundRect(s*sz*0.08,sz*0.42+ls,sz*0.13,sz*0.34,3);
    c.fillStyle='#334'; c.fill();
    c.beginPath(); c.ellipse(s*sz*0.1,sz*0.77+ls,sz*0.1,sz*0.06,0,0,Math.PI*2);
    c.fillStyle='#222'; c.fill();
  });
  // 몸통(흰티)
  c.beginPath(); c.ellipse(0,sz*0.12,sz*0.28,sz*0.34,0,0,Math.PI*2);
  c.fillStyle='#eeeef0'; c.fill(); c.strokeStyle='#ccc'; c.lineWidth=1; c.stroke();
  // 팔
  [-1,1].forEach(s=>{
    const armS=Math.sin(t*0.2)*0.22;
    c.save(); c.translate(s*sz*0.28,0); c.rotate(s*(-0.2+armS*(s===fl?1:-1)));
    c.beginPath(); c.roundRect(-sz*0.06,-sz*0.02,sz*0.12,sz*0.3,3);
    c.fillStyle='#eeeef0'; c.fill();
    c.beginPath(); c.ellipse(0,sz*0.3,sz*0.075,sz*0.065,0,0,Math.PI*2);
    c.fillStyle='#e0c0a0'; c.fill(); c.restore();
  });
  // 목
  c.beginPath(); c.rect(-sz*0.07,-sz*0.09,sz*0.14,sz*0.12); c.fillStyle='#e0c0a0'; c.fill();
  // 얼굴
  c.beginPath(); c.ellipse(0,-sz*0.26,sz*0.22,sz*0.22,0,0,Math.PI*2);
  c.fillStyle=grad(c,0,-sz*0.4,sz*0.22,'#f0d0b0','#d0a880'); c.fill();
  // 눈썹
  [-1,1].forEach(s=>{
    c.beginPath(); c.moveTo(s*sz*0.05,-sz*0.31); c.lineTo(s*sz*0.15,-sz*0.33);
    c.strokeStyle='#2a1a0a'; c.lineWidth=sz*0.03; c.lineCap='round'; c.stroke();
  });
  // 눈
  [-1,1].forEach(s=>{
    c.beginPath(); c.ellipse(s*sz*0.1,-sz*0.25,sz*0.04,sz*0.04,0,0,Math.PI*2);
    c.fillStyle='#1a1a1a'; c.fill();
  });
  // 안경
  [-1,1].forEach(s=>{
    c.beginPath(); c.roundRect(s*sz*0.02-sz*0.1,-sz*0.29,sz*0.12,sz*0.09,sz*0.025);
    c.strokeStyle='#111'; c.lineWidth=sz*0.028; c.stroke();
    c.fillStyle='rgba(180,220,255,0.1)'; c.fill();
  });
  c.beginPath(); c.moveTo(-sz*0.08,-sz*0.25); c.lineTo(sz*0.02,-sz*0.25);
  c.strokeStyle='#111'; c.lineWidth=sz*0.022; c.stroke();
  // 코+입
  c.beginPath(); c.arc(0,-sz*0.18,sz*0.025,0,Math.PI*2); c.fillStyle='#c09070'; c.fill();
  c.beginPath(); c.arc(0,-sz*0.12,sz*0.055,0.1,Math.PI-0.1); c.strokeStyle='#a07050'; c.lineWidth=sz*0.022; c.stroke();
  // 머리
  c.beginPath(); c.ellipse(0,-sz*0.28,sz*0.22,sz*0.2,0,0,Math.PI*2); c.fillStyle='#1a1208'; c.fill();
  // 캡모자 (회색, 특징!)
  c.beginPath(); c.ellipse(0,-sz*0.38,sz*0.24,sz*0.12,-0.05,Math.PI,0); c.fillStyle='#7a7a82'; c.fill();
  c.beginPath(); c.ellipse(0,-sz*0.38,sz*0.24,sz*0.1,-0.05,0,Math.PI); c.fillStyle='#6a6a72'; c.fill();
  c.beginPath(); c.ellipse(fl*sz*0.1,-sz*0.38,sz*0.18,sz*0.055,fl*0.1,0,Math.PI*2); c.fillStyle='#6a6a72'; c.fill();
  c.fillStyle='#ddd'; c.font=`bold ${sz*0.06}px sans-serif`; c.textAlign='center'; c.textBaseline='middle';
  c.fillText('A',-fl*sz*0.03,-sz*0.38);
  c.restore();
}

// 캐릭터3: 엄지척 마법사 (검정 폴로, 긴 머리)
function drawCharMageFriend(c,x,y,sz,facing,t,elite){
  const fl=Math.cos(facing||0)<0?-1:1;
  const bob=Math.sin(t*0.15)*2;
  c.save(); c.translate(x,y+bob);
  // 다리
  [-1,1].forEach(s=>{
    const ls=Math.sin(t*0.15)*sz*0.05*(s===1?1:-1);
    c.beginPath(); c.roundRect(s*sz*0.08,sz*0.43+ls,sz*0.13,sz*0.33,3); c.fillStyle='#111'; c.fill();
    c.beginPath(); c.ellipse(s*sz*0.1,sz*0.77+ls,sz*0.1,sz*0.06,0,0,Math.PI*2); c.fillStyle='#222'; c.fill();
  });
  // 몸통(검정 폴로)
  c.beginPath(); c.ellipse(0,sz*0.12,sz*0.27,sz*0.33,0,0,Math.PI*2);
  c.fillStyle='#0d0d0d'; c.fill(); c.strokeStyle='#333'; c.lineWidth=1.5; c.stroke();
  c.beginPath(); c.moveTo(-sz*0.07,-sz*0.07); c.lineTo(0,sz*0.01); c.lineTo(sz*0.07,-sz*0.07);
  c.strokeStyle='#444'; c.lineWidth=2; c.stroke();
  // 팔
  c.save(); c.translate(-fl*sz*0.27,0); c.rotate(-fl*(-0.15));
  c.beginPath(); c.roundRect(-sz*0.06,-sz*0.02,sz*0.12,sz*0.3,3); c.fillStyle='#0d0d0d'; c.fill();
  c.beginPath(); c.ellipse(0,sz*0.3,sz*0.07,sz*0.065,0,0,Math.PI*2); c.fillStyle='#e0c0a0'; c.fill(); c.restore();
  // 엄지척 팔
  c.save(); c.translate(fl*sz*0.27,-sz*0.05); c.rotate(fl*0.25);
  c.beginPath(); c.roundRect(-sz*0.06,-sz*0.02,sz*0.12,sz*0.27,3); c.fillStyle='#0d0d0d'; c.fill();
  c.beginPath(); c.ellipse(0,sz*0.27,sz*0.08,sz*0.09,0,0,Math.PI*2); c.fillStyle='#e0c0a0'; c.fill();
  c.beginPath(); c.roundRect(-sz*0.03,sz*0.1,sz*0.065,sz*0.16,sz*0.03);
  c.fillStyle='#e0c0a0'; c.fill(); c.strokeStyle='#c09070'; c.lineWidth=1; c.stroke(); c.restore();
  // 목+얼굴
  c.beginPath(); c.rect(-sz*0.07,-sz*0.09,sz*0.14,sz*0.12); c.fillStyle='#e0c0a0'; c.fill();
  c.beginPath(); c.ellipse(0,-sz*0.26,sz*0.21,sz*0.22,0,0,Math.PI*2);
  c.fillStyle=grad(c,0,-sz*0.4,sz*0.22,'#f0d0b0','#d0a880'); c.fill();
  [-1,1].forEach(s=>{
    c.beginPath(); c.moveTo(s*sz*0.04,-sz*0.32); c.lineTo(s*sz*0.14,-sz*0.34);
    c.strokeStyle='#1a1208'; c.lineWidth=sz*0.032; c.lineCap='round'; c.stroke();
    c.beginPath(); c.ellipse(s*sz*0.09,-sz*0.26,sz*0.042,sz*0.042,0,0,Math.PI*2);
    c.fillStyle='#1a1a1a'; c.fill();
  });
  c.beginPath(); c.arc(0,-sz*0.18,sz*0.024,0,Math.PI*2); c.fillStyle='#c09070'; c.fill();
  c.beginPath(); c.arc(0,-sz*0.12,sz*0.06,0.15,Math.PI-0.15); c.strokeStyle='#a07050'; c.lineWidth=sz*0.025; c.stroke();
  // 머리(긴 앞머리)
  c.beginPath(); c.ellipse(0,-sz*0.28,sz*0.21,sz*0.18,0,0,Math.PI*2); c.fillStyle='#1a1208'; c.fill();
  [-sz*0.12,0,sz*0.12].forEach(hx=>{
    c.beginPath(); c.moveTo(hx,-sz*0.35); c.quadraticCurveTo(hx+sz*0.03,-sz*0.44,hx-sz*0.02,-sz*0.47);
    c.strokeStyle='#1a1208'; c.lineWidth=sz*0.05; c.lineCap='round'; c.stroke();
  });
  c.restore();
}

// 캐릭터4: 키큰 보스헌터 (안경+검정폴로+반바지+엄지척)
function drawCharTallHero(c,x,y,sz,facing,t,elite){
  const fl=Math.cos(facing||0)<0?-1:1;
  const bob=Math.sin(t*0.16)*1.8;
  c.save(); c.translate(x,y+bob);
  // 다리(긴 편, 반바지)
  [-1,1].forEach(s=>{
    const ls=Math.sin(t*0.16)*sz*0.06*(s===1?1:-1);
    c.beginPath(); c.roundRect(s*sz*0.09,sz*0.42+ls,sz*0.14,sz*0.18,3); c.fillStyle='#111'; c.fill();
    c.beginPath(); c.roundRect(s*sz*0.09,sz*0.6+ls,sz*0.13,sz*0.2,3); c.fillStyle='#e0c0a0'; c.fill();
    c.beginPath(); c.ellipse(s*sz*0.11,sz*0.81+ls,sz*0.11,sz*0.06,0,0,Math.PI*2); c.fillStyle='#5a3a20'; c.fill();
  });
  c.beginPath(); c.rect(-sz*0.24,sz*0.42,sz*0.48,sz*0.18); c.fillStyle='#111'; c.fill();
  // 몸통
  c.beginPath(); c.ellipse(0,sz*0.1,sz*0.3,sz*0.35,0,0,Math.PI*2); c.fillStyle='#0d0d0d'; c.fill();
  c.strokeStyle='#2a2a2a'; c.lineWidth=1.5; c.stroke();
  // 카하트 로고
  c.fillStyle='#b8860b'; c.font=`bold ${sz*0.08}px sans-serif`; c.textAlign='center'; c.textBaseline='middle';
  c.fillText('C',fl*sz*0.14,sz*0.02);
  c.beginPath(); c.moveTo(-sz*0.08,-sz*0.07); c.lineTo(0,sz*0.01); c.lineTo(sz*0.08,-sz*0.07);
  c.strokeStyle='#333'; c.lineWidth=2; c.stroke();
  // 팔
  c.save(); c.translate(-fl*sz*0.3,sz*0.01);
  c.beginPath(); c.roundRect(-sz*0.07,-sz*0.02,sz*0.14,sz*0.32,3); c.fillStyle='#0d0d0d'; c.fill();
  c.beginPath(); c.ellipse(0,sz*0.32,sz*0.075,sz*0.07,0,0,Math.PI*2); c.fillStyle='#e0c0a0'; c.fill(); c.restore();
  // 엄지척 팔
  c.save(); c.translate(fl*sz*0.3,-sz*0.04); c.rotate(fl*(-0.45));
  c.beginPath(); c.roundRect(-sz*0.07,-sz*0.02,sz*0.14,sz*0.3,3); c.fillStyle='#0d0d0d'; c.fill();
  c.beginPath(); c.ellipse(0,sz*0.3,sz*0.08,sz*0.09,0,0,Math.PI*2); c.fillStyle='#e0c0a0'; c.fill();
  c.beginPath(); c.roundRect(-sz*0.03,sz*0.12,sz*0.065,sz*0.17,sz*0.03);
  c.fillStyle='#e0c0a0'; c.fill(); c.strokeStyle='#c09070'; c.lineWidth=1; c.stroke(); c.restore();
  // 목+얼굴
  c.beginPath(); c.rect(-sz*0.08,-sz*0.1,sz*0.16,sz*0.14); c.fillStyle='#e0c0a0'; c.fill();
  c.beginPath(); c.ellipse(0,-sz*0.27,sz*0.24,sz*0.24,0,0,Math.PI*2);
  c.fillStyle=grad(c,0,-sz*0.44,sz*0.24,'#f0d0b0','#d0a880'); c.fill();
  [-1,1].forEach(s=>{
    c.beginPath(); c.moveTo(s*sz*0.04,-sz*0.33); c.quadraticCurveTo(s*sz*0.1,-sz*0.37,s*sz*0.17,-sz*0.32);
    c.strokeStyle='#1a1208'; c.lineWidth=sz*0.038; c.lineCap='round'; c.stroke();
    c.beginPath(); c.ellipse(s*sz*0.1,-sz*0.265,sz*0.044,sz*0.04,0,0,Math.PI*2);
    c.fillStyle='#1a1a1a'; c.fill();
    c.beginPath(); c.arc(s*sz*0.1+sz*0.01,-sz*0.27,sz*0.016,0,Math.PI*2); c.fillStyle='#fff'; c.fill();
  });
  // 안경
  [-1,1].forEach(s=>{
    c.beginPath(); c.roundRect(s*sz*0.03-sz*0.13,-sz*0.31,sz*0.15,sz*0.1,sz*0.03);
    c.strokeStyle='#111'; c.lineWidth=sz*0.03; c.stroke(); c.fillStyle='rgba(180,220,255,0.1)'; c.fill();
  });
  c.beginPath(); c.moveTo(-sz*0.1,-sz*0.265); c.lineTo(sz*0.03,-sz*0.265);
  c.strokeStyle='#111'; c.lineWidth=sz*0.025; c.stroke();
  c.beginPath(); c.arc(0,-sz*0.18,sz*0.03,0,Math.PI*2); c.fillStyle='#c09070'; c.fill();
  c.beginPath(); c.arc(0,-sz*0.11,sz*0.07,0.2,Math.PI-0.2); c.strokeStyle='#a07050'; c.lineWidth=sz*0.025; c.stroke();
  // 머리
  c.beginPath(); c.ellipse(0,-sz*0.3,sz*0.24,sz*0.18,0,0,Math.PI*2); c.fillStyle='#0d0d10'; c.fill();
  c.beginPath(); c.ellipse(0,-sz*0.42,sz*0.22,sz*0.12,0,0,Math.PI*2); c.fillStyle='#0d0d10'; c.fill();
  c.restore();
}


// ═══════════════════════════════════════════════════════
//  관람차 4인 — 실사형 고품질 얼굴 캐릭터
//  얼굴이 캐릭터의 중심, 실제 인물 특징 최대 반영
// ═══════════════════════════════════════════════════════

// ── 실사 피부 그라디언트 ─────────────────────────────
function skinGrad(c, cx, cy, r, light, dark){
  const g=c.createRadialGradient(cx-r*0.25,cy-r*0.3,r*0.05, cx,cy,r*1.1);
  g.addColorStop(0,light); g.addColorStop(0.6,dark); g.addColorStop(1,hex2rgba(dark,0.6));
  return g;
}

// ── 실사 눈 그리기 (핵심) ────────────────────────────
function realisticEye(c, cx, cy, w, h, iris, pupil, facing, brow){
  c.save();
  // 눈 흰자 — 모양 클립
  c.beginPath();
  c.moveTo(cx-w,cy);
  c.bezierCurveTo(cx-w*0.5,cy-h*1.4, cx+w*0.5,cy-h*1.4, cx+w,cy);
  c.bezierCurveTo(cx+w*0.5,cy+h*0.8, cx-w*0.5,cy+h*0.8, cx-w,cy);
  c.clip();
  // 흰자
  const wg=c.createRadialGradient(cx,cy-h*0.3,0,cx,cy,w);
  wg.addColorStop(0,'#fdfcfa'); wg.addColorStop(1,'#f0eee8');
  c.fillStyle=wg; c.fill();
  // 홍채
  const ig=c.createRadialGradient(cx+w*0.08,cy-h*0.1,0,cx,cy,h*1.1);
  ig.addColorStop(0,hex2rgba(iris,0.93)); ig.addColorStop(0.5,iris); ig.addColorStop(1,'#0a0808');
  c.beginPath(); c.arc(cx,cy,h*0.95,0,Math.PI*2); c.fillStyle=ig; c.fill();
  // 동공
  c.beginPath(); c.arc(cx,cy,h*0.48,0,Math.PI*2); c.fillStyle='#050303'; c.fill();
  // 하이라이트
  c.beginPath(); c.arc(cx+w*0.18,cy-h*0.28,h*0.22,0,Math.PI*2); c.fillStyle='rgba(255,255,255,0.85)'; c.fill();
  c.beginPath(); c.arc(cx-w*0.08,cy+h*0.18,h*0.1,0,Math.PI*2); c.fillStyle='rgba(255,255,255,0.35)'; c.fill();
  c.restore();

  // 눈꺼풀 윤곽선
  c.beginPath();
  c.moveTo(cx-w,cy);
  c.bezierCurveTo(cx-w*0.5,cy-h*1.4, cx+w*0.5,cy-h*1.4, cx+w,cy);
  c.strokeStyle='#1a1208'; c.lineWidth=h*0.18; c.stroke();
  // 아랫눈꺼풀
  c.beginPath();
  c.moveTo(cx-w,cy);
  c.bezierCurveTo(cx-w*0.5,cy+h*0.8, cx+w*0.5,cy+h*0.8, cx+w,cy);
  c.strokeStyle='#2a1a10aa'; c.lineWidth=h*0.09; c.stroke();
  // 속눈썹
  const lashCount=5;
  for(let i=0;i<lashCount;i++){
    const t=i/(lashCount-1);
    const lx=cx-w+t*w*2;
    const ly=cy-h*(0.8+0.4*Math.sin(t*Math.PI));
    const la=Math.PI*(-0.2+t*0.4)-Math.PI/2;
    c.beginPath(); c.moveTo(lx,ly);
    c.lineTo(lx+Math.cos(la)*h*0.5, ly+Math.sin(la)*h*0.5);
    c.strokeStyle='#080604'; c.lineWidth=h*0.12; c.lineCap='round'; c.stroke();
  }
  // 눈썹
  const [bx1,by1,bx2,by2,bx3,by3]=brow;
  c.beginPath(); c.moveTo(bx1,by1); c.quadraticCurveTo(bx2,by2,bx3,by3);
  c.strokeStyle='#1a1008'; c.lineWidth=h*0.38; c.lineCap='round'; c.stroke();
  // 눈썹 하이라이트
  c.beginPath(); c.moveTo(bx1,by1); c.quadraticCurveTo(bx2,by2-h*0.08,bx3,by3);
  c.strokeStyle='rgba(80,50,20,0.3)'; c.lineWidth=h*0.12; c.stroke();
}

// ── 실사 코 ──────────────────────────────────────────
function realisticNose(c, cx, cy, w, h, skin){
  // 콧대 음영
  c.beginPath(); c.moveTo(cx,cy-h*0.5); c.bezierCurveTo(cx-w*0.15,cy,cx-w*0.2,cy+h*0.4,cx-w*0.35,cy+h*0.5);
  c.strokeStyle='rgba(0,0,0,0.12)'; c.lineWidth=w*0.25; c.lineCap='round'; c.stroke();
  c.beginPath(); c.moveTo(cx,cy-h*0.5); c.bezierCurveTo(cx+w*0.15,cy,cx+w*0.2,cy+h*0.4,cx+w*0.35,cy+h*0.5);
  c.strokeStyle='rgba(0,0,0,0.12)'; c.lineWidth=w*0.25; c.lineCap='round'; c.stroke();
  // 코끝
  const ng=c.createRadialGradient(cx,cy+h*0.3,0,cx,cy+h*0.3,w*0.6);
  ng.addColorStop(0,skin); ng.addColorStop(1,hex2rgba(skin,0.53));
  c.beginPath(); c.ellipse(cx,cy+h*0.35,w*0.55,h*0.38,0,0,Math.PI*2); c.fillStyle=ng; c.fill();
  // 콧구멍
  [-1,1].forEach(s=>{
    c.beginPath(); c.ellipse(cx+s*w*0.3,cy+h*0.55,w*0.22,h*0.2,-s*0.3,0,Math.PI*2);
    c.fillStyle='rgba(0,0,0,0.35)'; c.fill();
  });
}

// ── 실사 입 ──────────────────────────────────────────
function realisticMouth(c, cx, cy, w, style, skin){
  if(style==='smile'){
    // 윗입술
    c.beginPath(); c.moveTo(cx-w,cy);
    c.bezierCurveTo(cx-w*0.5,cy-w*0.3, cx-w*0.15,cy-w*0.35, cx,cy-w*0.15);
    c.bezierCurveTo(cx+w*0.15,cy-w*0.35, cx+w*0.5,cy-w*0.3, cx+w,cy);
    c.strokeStyle='#8a4030'; c.lineWidth=w*0.12; c.stroke();
    // 입꼬리 올라감
    c.beginPath(); c.moveTo(cx-w,cy); c.quadraticCurveTo(cx-w*1.05,cy-w*0.25,cx-w*0.92,cy-w*0.35);
    c.strokeStyle='rgba(0,0,0,0.25)'; c.lineWidth=w*0.1; c.stroke();
    c.beginPath(); c.moveTo(cx+w,cy); c.quadraticCurveTo(cx+w*1.05,cy-w*0.25,cx+w*0.92,cy-w*0.35);
    c.strokeStyle='rgba(0,0,0,0.25)'; c.lineWidth=w*0.1; c.stroke();
    // 이
    c.beginPath(); c.moveTo(cx-w*0.75,cy+w*0.05); c.bezierCurveTo(cx-w*0.4,cy-w*0.12, cx+w*0.4,cy-w*0.12, cx+w*0.75,cy+w*0.05);
    c.lineTo(cx+w*0.75,cy+w*0.3); c.bezierCurveTo(cx+w*0.4,cy+w*0.28, cx-w*0.4,cy+w*0.28, cx-w*0.75,cy+w*0.3);
    c.closePath();
    const tg=c.createLinearGradient(cx,cy-w*0.1,cx,cy+w*0.3);
    tg.addColorStop(0,'#fff'); tg.addColorStop(1,'#eee');
    c.fillStyle=tg; c.fill();
    c.strokeStyle='rgba(200,180,170,0.5)'; c.lineWidth=w*0.04;
    // 치아 선
    for(let i=-2;i<=2;i++){
      c.beginPath(); c.moveTo(cx+i*w*0.18,cy+w*0.05); c.lineTo(cx+i*w*0.18,cy+w*0.28);
      c.strokeStyle='rgba(200,190,185,0.4)'; c.lineWidth=w*0.05; c.stroke();
    }
    // 아랫입술
    c.beginPath(); c.moveTo(cx-w*0.75,cy+w*0.3);
    c.bezierCurveTo(cx-w*0.4,cy+w*0.52, cx+w*0.4,cy+w*0.52, cx+w*0.75,cy+w*0.3);
    c.fillStyle='#c07060'; c.fill();
    const llg=c.createLinearGradient(cx,cy+w*0.3,cx,cy+w*0.52);
    llg.addColorStop(0,'rgba(255,200,180,0.4)'); llg.addColorStop(1,'rgba(0,0,0,0)');
    c.fillStyle=llg; c.fill();
  } else {
    // 입술 (다문)
    const llc='#b06858';
    // 윗입술
    c.beginPath(); c.moveTo(cx-w,cy);
    c.bezierCurveTo(cx-w*0.5,cy-w*0.28, cx-w*0.15,cy-w*0.32, cx,cy-w*0.12);
    c.bezierCurveTo(cx+w*0.15,cy-w*0.32, cx+w*0.5,cy-w*0.28, cx+w,cy);
    c.fillStyle=llc+'cc'; c.fill();
    c.strokeStyle='#7a3828'; c.lineWidth=w*0.06; c.stroke();
    // 입술 경계선
    c.beginPath(); c.moveTo(cx-w,cy); c.lineTo(cx+w,cy);
    c.strokeStyle='rgba(0,0,0,0.3)'; c.lineWidth=w*0.08; c.stroke();
    // 아랫입술
    c.beginPath(); c.moveTo(cx-w,cy);
    c.bezierCurveTo(cx-w*0.5,cy+w*0.35, cx+w*0.5,cy+w*0.35, cx+w,cy);
    c.fillStyle=llc; c.fill();
    // 하이라이트
    c.beginPath(); c.ellipse(cx,cy+w*0.18,w*0.3,w*0.08,0,0,Math.PI*2);
    c.fillStyle='rgba(255,220,200,0.3)'; c.fill();
  }
}

// ── 실사 안경 (둥근 뿔테) ────────────────────────────
function realisticGlasses(c, cx, cy, sz){
  const r=sz*0.19;
  const lx=cx-sz*0.21, rx=cx+sz*0.21;
  // 렌즈 (블루라이트 반사)
  [lx,rx].forEach(gx=>{
    const lg=c.createRadialGradient(gx-r*0.3,cy-r*0.3,0,gx,cy,r);
    lg.addColorStop(0,'rgba(120,180,255,0.08)');
    lg.addColorStop(0.7,'rgba(100,160,240,0.04)');
    lg.addColorStop(1,'rgba(80,120,200,0.02)');
    c.beginPath(); c.arc(gx,cy,r,0,Math.PI*2); c.fillStyle=lg; c.fill();
    // 반사 하이라이트
    c.beginPath(); c.moveTo(gx-r*0.55,cy-r*0.7);
    c.lineTo(gx-r*0.15,cy-r*0.85); c.lineTo(gx-r*0.1,cy-r*0.55);
    c.closePath(); c.fillStyle='rgba(255,255,255,0.15)'; c.fill();
  });
  // 프레임
  [lx,rx].forEach(gx=>{
    c.beginPath(); c.arc(gx,cy,r,0,Math.PI*2);
    c.strokeStyle='#111'; c.lineWidth=sz*0.032; c.stroke();
  });
  // 코받침
  c.beginPath(); c.moveTo(lx+r*0.7,cy+r*0.15); c.bezierCurveTo(cx-r*0.15,cy+r*0.5, cx+r*0.15,cy+r*0.5, rx-r*0.7,cy+r*0.15);
  c.strokeStyle='#333'; c.lineWidth=sz*0.022; c.stroke();
  // 안경다리
  [-1,1].forEach(s=>{
    const gx=s>0?rx:lx;
    c.beginPath(); c.moveTo(gx+s*r*0.95,cy); c.lineTo(gx+s*r*1.8,cy-r*0.12);
    c.strokeStyle='#111'; c.lineWidth=sz*0.025; c.stroke();
  });
}

// ══════════════════════════════════════════════════════
//  실사 캐릭터 4인 본체
// ══════════════════════════════════════════════════════

// ── [왼쪽] 검정 터틀넥 / 쌍꺼풀 / 날카로운 인상 ────────
function drawCharFerrisLeft(c,x,y,sz,facing,t,elite){
  const fl=Math.cos(facing||0)<0?-1:1;
  const bob=Math.sin(t*0.16)*2;
  c.save(); c.translate(x,y+bob);

  // 몸 (간단하게)
  [-1,1].forEach(s=>{
    const ls=Math.sin(t*0.16)*sz*0.05*(s===1?1:-1);
    c.beginPath(); c.roundRect(s*sz*0.08,sz*0.48+ls,sz*0.13,sz*0.38,3);
    c.fillStyle='#0a0a0a'; c.fill();
  });
  c.beginPath(); c.ellipse(0,sz*0.2,sz*0.32,sz*0.36,0,0,Math.PI*2);
  c.fillStyle='#0a0a0a'; c.fill();
  [-1,1].forEach(s=>{
    c.save(); c.translate(s*sz*0.33,sz*0.1);
    c.beginPath(); c.roundRect(-sz*0.08,0,sz*0.15,sz*0.38,4);
    c.fillStyle='#0a0a0a'; c.fill(); c.restore();
  });
  // 터틀넥
  c.beginPath(); c.rect(-sz*0.09,-sz*0.12,sz*0.18,sz*0.18);
  c.fillStyle='#0a0a0a'; c.fill();
  c.beginPath(); c.ellipse(0,-sz*0.04,sz*0.1,sz*0.06,0,0,Math.PI*2);
  c.fillStyle='#111'; c.fill();

  // 얼굴 기반
  const FH=sz*1.05, FW=sz*0.82;
  const fy=-sz*0.38;

  // 목
  c.beginPath(); c.rect(-sz*0.09,fy+FH*0.72,sz*0.18,sz*0.18);
  const nsk=skinGrad(c,0,fy+FH*0.75,sz*0.12,'#f5d8b5','#e2c09a');
  c.fillStyle=nsk; c.fill();

  // 볼 음영
  [-1,1].forEach(s=>{
    const sg=c.createRadialGradient(s*FW*0.48,fy+FH*0.12,0,s*FW*0.48,fy+FH*0.12,FW*0.28);
    sg.addColorStop(0,'rgba(220,140,100,0.12)'); sg.addColorStop(1,'rgba(0,0,0,0)');
    c.beginPath(); c.ellipse(s*FW*0.48,fy+FH*0.12,FW*0.28,FH*0.22,0,0,Math.PI*2);
    c.fillStyle=sg; c.fill();
  });

  // 얼굴 본체
  c.beginPath(); c.ellipse(0,fy,FW*0.5,FH*0.5,0,0,Math.PI*2);
  c.fillStyle=skinGrad(c,-FW*0.12,fy-FH*0.18,FW*0.5,'#f8dcba','#e5c09a'); c.fill();
  c.strokeStyle='rgba(0,0,0,0.08)'; c.lineWidth=1; c.stroke();

  // 눈 (왼쪽: 쌍꺼풀 강함, 날카로운)
  const eyY=fy-FH*0.07, eyW=FW*0.22, eyH=FH*0.094;
  [-1,1].forEach(s=>{
    const ex=s*FW*0.265;
    realisticEye(c, ex, eyY, eyW, eyH, '#2a1808', '#0a0504', fl,
      [ex-eyW*1.1, eyY-eyH*2.1, ex, eyY-eyH*2.5, ex+eyW*1.1, eyY-eyH*1.9]
    );
    // 쌍꺼풀 강조선
    c.beginPath();
    c.moveTo(ex-eyW*0.8,eyY-eyH*0.2);
    c.quadraticCurveTo(ex,eyY-eyH*1.6,ex+eyW*0.8,eyY-eyH*0.2);
    c.strokeStyle='rgba(30,15,5,0.3)'; c.lineWidth=eyH*0.18; c.stroke();
  });

  // 코
  realisticNose(c, 0, fy+FH*0.14, FW*0.14, FH*0.18, '#e8c898');

  // 입 (다문, 약간 긴장)
  realisticMouth(c, 0, fy+FH*0.31, FW*0.28, 'closed', '#f5d8b5');

  // 머리카락 (검정, 사이드 스타일, 세련됨)
  // 배경 볼륨
  c.beginPath(); c.ellipse(0,fy-FH*0.48,FW*0.55,FH*0.48,0,0,Math.PI*2);
  c.fillStyle='#0c0c10'; c.fill();
  // 옆머리
  [-1,1].forEach(s=>{
    c.beginPath(); c.ellipse(s*FW*0.5,fy-FH*0.15,FW*0.15,FH*0.4,s*0.12,0,Math.PI*2);
    c.fillStyle='#0c0c10'; c.fill();
  });
  // 앞머리 (오른쪽으로 흘러내림)
  c.beginPath();
  c.moveTo(-FW*0.55,fy-FH*0.38);
  c.bezierCurveTo(-FW*0.2,fy-FH*0.88, FW*0.3,fy-FH*0.82, FW*0.5,fy-FH*0.42);
  c.lineTo(FW*0.52,fy-FH*0.18);
  c.bezierCurveTo(FW*0.1,fy-FH*0.52, -FW*0.25,fy-FH*0.6, -FW*0.5,fy-FH*0.28);
  c.closePath(); c.fillStyle='#0d0d12'; c.fill();
  // 머리카락 윤기
  c.beginPath();
  c.moveTo(-FW*0.15,fy-FH*0.7);
  c.quadraticCurveTo(FW*0.05,fy-FH*0.82,FW*0.25,fy-FH*0.65);
  c.strokeStyle='rgba(80,70,60,0.25)'; c.lineWidth=FW*0.06; c.stroke();

  // 귀
  [-1,1].forEach(s=>{
    c.beginPath(); c.ellipse(s*FW*0.52,fy+FH*0.04,FW*0.09,FH*0.14,0,0,Math.PI*2);
    c.fillStyle='#f0cca0'; c.fill(); c.strokeStyle='rgba(0,0,0,0.1)'; c.lineWidth=0.8; c.stroke();
  });

  c.restore();
}

// ── [가운데뒤] 베이지 코트+흰 니트 / 긴 얼굴 / 무표정 ──
function drawCharFerrisMid(c,x,y,sz,facing,t,elite){
  const fl=Math.cos(facing||0)<0?-1:1;
  const bob=Math.sin(t*0.14)*2;
  c.save(); c.translate(x,y+bob);

  // 베이지 코트 몸통
  [-1,1].forEach(s=>{
    const ls=Math.sin(t*0.14)*sz*0.05*(s===1?1:-1);
    c.beginPath(); c.roundRect(s*sz*0.09,sz*0.48+ls,sz*0.14,sz*0.38,3);
    c.fillStyle='#c8a870'; c.fill();
  });
  c.beginPath(); c.ellipse(0,sz*0.2,sz*0.34,sz*0.36,0,0,Math.PI*2);
  const coatG=c.createLinearGradient(-sz*0.34,0,sz*0.34,0);
  coatG.addColorStop(0,'#c0a068'); coatG.addColorStop(0.5,'#d4b47a'); coatG.addColorStop(1,'#c0a068');
  c.fillStyle=coatG; c.fill();
  // 흰 니트 (안쪽)
  c.beginPath(); c.ellipse(0,sz*0.15,sz*0.18,sz*0.2,0,0,Math.PI*2);
  c.fillStyle='#f8f5f0'; c.fill();
  // 코트 라펠
  [-1,1].forEach(s=>{
    c.beginPath(); c.moveTo(s*sz*0.06,-sz*0.09);
    c.lineTo(s*sz*0.22,sz*0.08); c.lineTo(s*sz*0.18,sz*0.28);
    c.lineTo(s*sz*0.06,sz*0.08); c.closePath();
    c.fillStyle='#b89860'; c.fill();
  });
  [-1,1].forEach(s=>{
    c.save(); c.translate(s*sz*0.35,sz*0.08);
    c.beginPath(); c.roundRect(-sz*0.08,0,sz*0.16,sz*0.4,4);
    c.fillStyle='#c8a870'; c.fill(); c.restore();
  });

  // 얼굴 (약간 긴 타원형)
  const FH=sz*1.1, FW=sz*0.78;
  const fy=-sz*0.42;

  c.beginPath(); c.rect(-sz*0.08,fy+FH*0.68,sz*0.16,sz*0.2);
  c.fillStyle=skinGrad(c,0,fy+FH*0.72,sz*0.1,'#f5d5b0','#e0b888'); c.fill();

  c.beginPath(); c.ellipse(0,fy,FW*0.5,FH*0.5,0,0,Math.PI*2);
  c.fillStyle=skinGrad(c,-FW*0.1,fy-FH*0.2,FW*0.5,'#f8d8b2','#e4bc90'); c.fill();

  // 눈 (가늘고 무표정)
  const eyY2=fy-FH*0.06, eyW2=FW*0.22, eyH2=FH*0.075;
  [-1,1].forEach(s=>{
    const ex=s*FW*0.27;
    realisticEye(c, ex, eyY2, eyW2, eyH2*0.85, '#1e1006', '#050302', fl,
      [ex-eyW2, eyY2-eyH2*2.2, ex+eyW2*0.1, eyY2-eyH2*2.6, ex+eyW2, eyY2-eyH2*2.1]
    );
  });

  realisticNose(c, 0, fy+FH*0.13, FW*0.13, FH*0.17, '#e4bc90');
  realisticMouth(c, 0, fy+FH*0.3, FW*0.25, 'closed', '#f5d5b0');

  // 머리카락 (자연스러운 검정, 앞머리 내려옴)
  c.beginPath(); c.ellipse(0,fy-FH*0.46,FW*0.54,FH*0.46,0,0,Math.PI*2);
  c.fillStyle='#0c0c0f'; c.fill();
  [-1,1].forEach(s=>{
    c.beginPath(); c.ellipse(s*FW*0.5,fy-FH*0.12,FW*0.12,FH*0.42,s*0.08,0,Math.PI*2);
    c.fillStyle='#0c0c0f'; c.fill();
  });
  c.beginPath();
  c.moveTo(-FW*0.54,fy-FH*0.32);
  c.bezierCurveTo(-FW*0.4,fy-FH*0.85, FW*0.4,fy-FH*0.85, FW*0.54,fy-FH*0.32);
  c.lineTo(FW*0.5,fy-FH*0.05);
  c.bezierCurveTo(FW*0.25,fy-FH*0.6, -FW*0.25,fy-FH*0.6, -FW*0.5,fy-FH*0.05);
  c.closePath(); c.fillStyle='#0d0d11'; c.fill();
  // 윤기
  c.beginPath(); c.moveTo(-FW*0.2,fy-FH*0.62); c.quadraticCurveTo(0,fy-FH*0.75,FW*0.2,fy-FH*0.62);
  c.strokeStyle='rgba(70,60,50,0.22)'; c.lineWidth=FW*0.08; c.stroke();

  [-1,1].forEach(s=>{
    c.beginPath(); c.ellipse(s*FW*0.52,fy+FH*0.05,FW*0.09,FH*0.14,0,0,Math.PI*2);
    c.fillStyle='#f0cca0'; c.fill();
  });

  c.restore();
}

// ── [오른쪽뒤] 검정 패딩 / 통통 볼살 / 귀여운 인상 ────
function drawCharFerrisRight(c,x,y,sz,facing,t,elite){
  const fl=Math.cos(facing||0)<0?-1:1;
  const bob=Math.sin(t*0.18)*2;
  c.save(); c.translate(x,y+bob);

  // 검정 패딩 (두툼하게)
  [-1,1].forEach(s=>{
    const ls=Math.sin(t*0.18)*sz*0.05*(s===1?1:-1);
    c.beginPath(); c.roundRect(s*sz*0.1,sz*0.46+ls,sz*0.15,sz*0.4,4);
    c.fillStyle='#141414'; c.fill();
  });
  c.beginPath(); c.ellipse(0,sz*0.22,sz*0.38,sz*0.38,0,0,Math.PI*2);
  const padG=c.createLinearGradient(-sz*0.38,0,sz*0.38,0);
  padG.addColorStop(0,'#111'); padG.addColorStop(0.5,'#222'); padG.addColorStop(1,'#111');
  c.fillStyle=padG; c.fill();
  // 패딩 누빔선
  for(let i=-1;i<=1;i++){
    c.beginPath(); c.moveTo(i*sz*0.15,sz*0.0); c.lineTo(i*sz*0.15,sz*0.45);
    c.strokeStyle='rgba(255,255,255,0.06)'; c.lineWidth=1.5; c.stroke();
  }
  [-1,1].forEach(s=>{
    c.save(); c.translate(s*sz*0.38,sz*0.12);
    c.beginPath(); c.roundRect(-sz*0.09,0,sz*0.18,sz*0.42,5);
    c.fillStyle='#141414'; c.fill(); c.restore();
  });

  // 얼굴 (통통하고 둥글게)
  const FH=sz*1.0, FW=sz*0.88;
  const fy=-sz*0.36;

  // 볼살 (핑크빛)
  [-1,1].forEach(s=>{
    const cg=c.createRadialGradient(s*FW*0.44,fy+FH*0.14,0,s*FW*0.44,fy+FH*0.14,FW*0.3);
    cg.addColorStop(0,'rgba(230,150,120,0.22)'); cg.addColorStop(1,'rgba(0,0,0,0)');
    c.beginPath(); c.ellipse(s*FW*0.44,fy+FH*0.14,FW*0.32,FH*0.25,0,0,Math.PI*2);
    c.fillStyle=cg; c.fill();
  });

  c.beginPath(); c.ellipse(0,fy,FW*0.5,FH*0.5,0,0,Math.PI*2);
  c.fillStyle=skinGrad(c,-FW*0.1,fy-FH*0.18,FW*0.52,'#fcdab8','#ecc09a'); c.fill();

  const eyY3=fy-FH*0.08, eyW3=FW*0.2, eyH3=FH*0.082;
  [-1,1].forEach(s=>{
    realisticEye(c, s*FW*0.26, eyY3, eyW3, eyH3, '#1e1208', '#050302', fl,
      [s*FW*0.06, eyY3-eyH3*2.1, s*FW*0.26, eyY3-eyH3*2.55, s*FW*0.46, eyY3-eyH3*2.1]
    );
  });

  realisticNose(c, 0, fy+FH*0.15, FW*0.16, FH*0.19, '#ecc09a');
  realisticMouth(c, 0, fy+FH*0.33, FW*0.27, 'closed', '#fcdab8');

  // 머리카락 (일자 앞머리, 통통한 얼굴에 맞게 옆으로 퍼짐)
  c.beginPath(); c.ellipse(0,fy-FH*0.44,FW*0.56,FH*0.44,0,0,Math.PI*2);
  c.fillStyle='#0c0c0f'; c.fill();
  [-1,1].forEach(s=>{
    c.beginPath(); c.ellipse(s*FW*0.52,fy-FH*0.1,FW*0.14,FH*0.42,s*0.06,0,Math.PI*2);
    c.fillStyle='#0c0c0f'; c.fill();
  });
  c.beginPath();
  c.moveTo(-FW*0.56,fy-FH*0.28);
  c.bezierCurveTo(-FW*0.56,fy-FH*0.82, FW*0.56,fy-FH*0.82, FW*0.56,fy-FH*0.28);
  c.lineTo(FW*0.54,fy-FH*0.05);
  c.quadraticCurveTo(0,fy-FH*0.65,-FW*0.54,fy-FH*0.05);
  c.closePath(); c.fillStyle='#0e0e12'; c.fill();

  // 귀 (볼살로 인해 약간만 보임)
  [-1,1].forEach(s=>{
    c.beginPath(); c.ellipse(s*FW*0.54,fy+FH*0.06,FW*0.085,FH*0.13,0,0,Math.PI*2);
    c.fillStyle='#f2c8a0'; c.fill();
  });

  c.restore();
}

// ── [앞 셀카] 둥근 뿔테 안경 / 웃는 표정 / 볼살 ─────────
function drawCharFerrisFront(c,x,y,sz,facing,t,elite){
  const fl=Math.cos(facing||0)<0?-1:1;
  const bob=Math.sin(t*0.15)*2;
  c.save(); c.translate(x,y+bob);

  // 검정 패딩+후드
  [-1,1].forEach(s=>{
    const ls=Math.sin(t*0.15)*sz*0.05*(s===1?1:-1);
    c.beginPath(); c.roundRect(s*sz*0.1,sz*0.46+ls,sz*0.15,sz*0.4,4);
    c.fillStyle='#111'; c.fill();
  });
  c.beginPath(); c.ellipse(0,sz*0.2,sz*0.37,sz*0.37,0,0,Math.PI*2);
  c.fillStyle='#111'; c.fill();
  // 후드 끈
  [-1,1].forEach(s=>{
    c.beginPath(); c.moveTo(s*sz*0.06,sz*0.0); c.lineTo(s*sz*0.04,sz*0.32);
    c.strokeStyle='#888'; c.lineWidth=sz*0.025; c.stroke();
  });
  [-1,1].forEach(s=>{
    c.save(); c.translate(s*sz*0.37,sz*0.1);
    c.beginPath(); c.roundRect(-sz*0.09,0,sz*0.18,sz*0.4,5);
    c.fillStyle='#111'; c.fill(); c.restore();
  });

  // 얼굴 (둥글고 볼살, 웃어서 눈 살짝 올라감)
  const FH=sz*1.0, FW=sz*0.9;
  const fy=-sz*0.35;

  // 볼살 핑크
  [-1,1].forEach(s=>{
    const cg=c.createRadialGradient(s*FW*0.46,fy+FH*0.18,0,s*FW*0.46,fy+FH*0.18,FW*0.32);
    cg.addColorStop(0,'rgba(235,145,115,0.28)'); cg.addColorStop(1,'rgba(0,0,0,0)');
    c.beginPath(); c.ellipse(s*FW*0.46,fy+FH*0.18,FW*0.34,FH*0.26,0,0,Math.PI*2);
    c.fillStyle=cg; c.fill();
  });

  c.beginPath(); c.ellipse(0,fy,FW*0.5,FH*0.5,0,0,Math.PI*2);
  c.fillStyle=skinGrad(c,-FW*0.1,fy-FH*0.2,FW*0.52,'#fcddb8','#ecbe98'); c.fill();

  // 눈 (웃어서 약간 올라감, 눈꼬리 올라감)
  const eyY4=fy-FH*0.1, eyW4=FW*0.2, eyH4=FH*0.076;
  [-1,1].forEach(s=>{
    c.save(); c.translate(s*FW*0.25, eyY4); c.rotate(s*0.06); // 웃는 각도
    realisticEye(c, 0, 0, eyW4, eyH4*0.88, '#201408', '#050302', fl,
      [-eyW4*1.05, -eyH4*2.0, 0, -eyH4*2.45, eyW4*1.05, -eyH4*1.9]
    );
    // 웃을 때 눈 아래 주름
    c.beginPath(); c.moveTo(-eyW4*0.8,eyH4*1.0); c.quadraticCurveTo(0,eyH4*1.6,eyW4*0.8,eyH4*1.0);
    c.strokeStyle='rgba(0,0,0,0.18)'; c.lineWidth=eyH4*0.25; c.stroke();
    c.restore();
  });

  realisticNose(c, 0, fy+FH*0.15, FW*0.15, FH*0.18, '#ecbe98');
  // 웃는 입
  realisticMouth(c, 0, fy+FH*0.33, FW*0.3, 'smile', '#fcddb8');

  // 안경 (특징! 둥근 뿔테)
  realisticGlasses(c, 0, fy-FH*0.06, sz);

  // 머리카락 (앞머리 일자, 귀여운 스타일)
  c.beginPath(); c.ellipse(0,fy-FH*0.44,FW*0.56,FH*0.44,0,0,Math.PI*2);
  c.fillStyle='#0d0d12'; c.fill();
  [-1,1].forEach(s=>{
    c.beginPath(); c.ellipse(s*FW*0.54,fy-FH*0.08,FW*0.14,FH*0.43,s*0.05,0,Math.PI*2);
    c.fillStyle='#0d0d12'; c.fill();
  });
  c.beginPath();
  c.moveTo(-FW*0.56,fy-FH*0.28);
  c.bezierCurveTo(-FW*0.58,fy-FH*0.84, FW*0.58,fy-FH*0.84, FW*0.56,fy-FH*0.28);
  c.lineTo(FW*0.52,fy-FH*0.04);
  c.quadraticCurveTo(0,fy-FH*0.62,-FW*0.52,fy-FH*0.04);
  c.closePath(); c.fillStyle='#0f0f14'; c.fill();
  // 윤기
  c.beginPath(); c.moveTo(-FW*0.18,fy-FH*0.65); c.quadraticCurveTo(0,fy-FH*0.76,FW*0.18,fy-FH*0.65);
  c.strokeStyle='rgba(75,65,55,0.2)'; c.lineWidth=FW*0.07; c.stroke();

  [-1,1].forEach(s=>{
    c.beginPath(); c.ellipse(s*FW*0.55,fy+FH*0.07,FW*0.085,FH*0.13,0,0,Math.PI*2);
    c.fillStyle='#f4caa0'; c.fill();
  });

  c.restore();
}


// ── 보스 픽셀아트 (스테이지별 완전 다른 생김새) ─────
function drawBossReplace(c,x,y,sz,f,t,enraged,type,m){
  const s=Math.max(2,sz*0.22)|0;
  const pulse=0.92+0.08*Math.sin(t*0.08);
  const ox=x-7*s, oy=y-9*s;
  c.save();
  c.imageSmoothingEnabled=false;

  if(type==='boss'){
    // ─ 스테이지1: 던전의 군주 (갈색 해골왕, 왕관) ─
    const crown=enraged?'#ff8800':'#ffd700';
    const bone=enraged?'#ffe0a0':'#d4b896';
    const dark='#8b6040'; const eye='#ff0000';
    // 왕관
    px(c,ox+s,oy,s,2*s,crown); px(c,ox+3*s,oy-s,2*s,3*s,crown); px(c,ox+6*s,oy,s,2*s,crown);
    px(c,ox,oy+s,8*s,s,crown);
    // 머리
    px(c,ox,oy+2*s,8*s,6*s,bone);
    px(c,ox+s,oy+3*s,2*s,2*s,eye); px(c,ox+5*s,oy+3*s,2*s,2*s,eye); // 눈
    px(c,ox+s,oy+7*s,6*s,s,dark); // 입
    px(c,ox+2*s,oy+7*s,s,s,'#fff'); px(c,ox+4*s,oy+7*s,s,s,'#fff'); px(c,ox+6*s,oy+7*s,s,s,'#fff');
    // 몸통
    px(c,ox+s,oy+8*s,6*s,5*s,dark);
    px(c,ox,oy+9*s,s,3*s,bone); px(c,ox+7*s,oy+9*s,s,3*s,bone); // 팔
    // 다리
    px(c,ox+s,oy+13*s,3*s,3*s,dark); px(c,ox+4*s,oy+13*s,3*s,3*s,dark);

  } else if(type==='boss2'){
    // ─ 스테이지2: 암흑 군주 (보라빛 망령, 눈만 보임) ─
    const col=enraged?'#dd00ff':'#9900cc'; const glow=enraged?'#ff88ff':'#cc66ff';
    const dark2='#220033'; const eyeC='#ffffff';
    // 망토 (물결 형태)
    px(c,ox+2*s,oy,4*s,s,col);
    px(c,ox+s,oy+s,6*s,s,col);
    px(c,ox,oy+2*s,8*s,8*s,col);
    px(c,ox+s,oy+10*s,6*s,s,col);
    // 내부 어둠
    px(c,ox+s,oy+3*s,6*s,4*s,dark2);
    // 눈 (빛남)
    px(c,ox+2*s,oy+4*s,s,2*s,eyeC); px(c,ox+5*s,oy+4*s,s,2*s,eyeC);
    px(c,ox+2*s,oy+4*s,s,s,glow); px(c,ox+5*s,oy+4*s,s,s,glow);
    // 물결 밑단
    for(let i=0;i<4;i++) px(c,ox+i*2*s,oy+11*s,s,s+Math.floor(Math.sin(t*0.15+i)*s),col);
    // 촉수
    px(c,ox-s,oy+5*s,s,4*s,col); px(c,ox+8*s,oy+5*s,s,4*s,col);

  } else if(type==='boss3'){
    // ─ 스테이지3: 빙하 군주 (얼음 골렘, 파란색) ─
    const ice=enraged?'#88eeff':'#aaddff'; const crystal='#ffffff'; const dark3='#004466';
    // 얼음 결정 머리 (각진 형태)
    px(c,ox+2*s,oy,4*s,s,crystal);
    px(c,ox+s,oy+s,6*s,2*s,ice);
    px(c,ox,oy+3*s,8*s,4*s,ice);
    // 눈 (검은 구멍)
    px(c,ox+s,oy+4*s,2*s,2*s,dark3); px(c,ox+5*s,oy+4*s,2*s,2*s,dark3);
    // 얼음 결정 돌기
    px(c,ox-s,oy+s,s,3*s,crystal); px(c,ox+8*s,oy+s,s,3*s,crystal);
    px(c,ox,oy,s,s,ice); px(c,ox+7*s,oy,s,s,ice);
    // 두꺼운 몸통
    px(c,ox,oy+7*s,8*s,6*s,ice);
    px(c,ox+s,oy+8*s,6*s,4*s,crystal);
    // 팔 (얼음 블록)
    px(c,ox-2*s,oy+7*s,2*s,4*s,ice); px(c,ox+8*s,oy+7*s,2*s,4*s,ice);
    // 다리
    px(c,ox,oy+13*s,3*s,3*s,dark3); px(c,ox+5*s,oy+13*s,3*s,3*s,dark3);

  } else if(type==='boss4'){
    // ─ 스테이지4: 번개 군주 (전기 마왕, 노란색) ─
    const bolt=enraged?'#ffffff':'#ffee00'; const body='#ff8800'; const spark='#ffff00';
    // 번개 뿔
    px(c,ox+s,oy-2*s,s,3*s,bolt); px(c,ox+6*s,oy-2*s,s,3*s,bolt);
    px(c,ox+2*s,oy-s,s,s,bolt); px(c,ox+5*s,oy-s,s,s,bolt);
    // 머리
    px(c,ox,oy,8*s,6*s,body);
    px(c,ox+s,oy+s,2*s,2*s,spark); px(c,ox+5*s,oy+s,2*s,2*s,spark); // 눈
    // 번개 패턴 (몸통)
    px(c,ox,oy+6*s,8*s,7*s,body);
    px(c,ox+3*s,oy+7*s,2*s,5*s,bolt); // 번개 무늬
    px(c,ox+2*s,oy+9*s,s,s,bolt); px(c,ox+5*s,oy+9*s,s,s,bolt);
    // 날개
    px(c,ox-2*s,oy+6*s,2*s,3*s,bolt); px(c,ox+8*s,oy+6*s,2*s,3*s,bolt);
    // 다리
    px(c,ox+s,oy+13*s,2*s,3*s,body); px(c,ox+5*s,oy+13*s,2*s,3*s,body);

  } else if(type==='boss5'){
    // ─ 스테이지5: 마왕 (암흑 드래곤, 빨간+검정) ─
    const scale=enraged?'#ff2200':'#cc0000'; const wing='#880000'; const claw='#ffaa00';
    // 날개 (넓게)
    px(c,ox-3*s,oy+2*s,3*s,6*s,wing); px(c,ox+8*s,oy+2*s,3*s,6*s,wing);
    px(c,ox-4*s,oy+3*s,s,4*s,wing); px(c,ox+11*s,oy+3*s,s,4*s,wing);
    // 뿔
    px(c,ox+s,oy-3*s,s,4*s,'#333'); px(c,ox+6*s,oy-3*s,s,4*s,'#333');
    px(c,ox+2*s,oy-s,s,s,claw); px(c,ox+5*s,oy-s,s,s,claw);
    // 머리 (용 형태)
    px(c,ox,oy,8*s,5*s,scale);
    px(c,ox+s,oy+s,2*s,2*s,claw); px(c,ox+5*s,oy+s,2*s,2*s,claw); // 눈
    px(c,ox,oy+4*s,8*s,s,'#ff4400'); // 불꽃 입
    // 몸통 (비늘 패턴)
    px(c,ox,oy+5*s,8*s,8*s,scale);
    for(let i=0;i<4;i++) px(c,ox+i*2*s,oy+6*s,s,s,wing); // 비늘
    for(let i=0;i<4;i++) px(c,ox+i*2*s+s,oy+8*s,s,s,wing);
    // 꼬리
    px(c,ox+5*s,oy+13*s,4*s,s,scale); px(c,ox+7*s,oy+14*s,3*s,s,scale);
    // 발
    px(c,ox,oy+13*s,3*s,3*s,scale); px(c,ox+4*s,oy+13*s,3*s,3*s,scale);
    px(c,ox-s,oy+15*s,2*s,s,claw); px(c,ox+4*s,oy+15*s,2*s,s,claw); // 발톱
  }

  // 공통: 격노 오라 효과
  if(enraged){
    c.globalAlpha=0.25+0.1*Math.sin(t*0.12);
    c.strokeStyle=type==='boss5'?'#ff0000':type==='boss4'?'#ffff00':type==='boss3'?'#00ffff':type==='boss2'?'#ff00ff':'#ff4400';
    c.lineWidth=4;
    c.beginPath(); c.arc(x,y,sz*0.7*pulse,0,Math.PI*2); c.stroke();
    c.globalAlpha=0.1;
    c.fillStyle=c.strokeStyle;
    c.beginPath(); c.arc(x,y,sz*0.7*pulse,0,Math.PI*2); c.fill();
  }
  c.restore();
}
// ── 캐릭터 타입 → 드로우 함수 매핑 ──────────────────
const CHAR_DRAW = {
  // ── 플레이어 스킨 ──────────────────────────────────
  player:    (c,x,y,sz,f,t,e)=>drawCharFerrisLeft(c,x,y,sz,f,t,e),
  char_headphone:   (c,x,y,sz,f,t,e)=>drawCharFerrisLeft(c,x,y,sz,f,t,e),
  char_cap:         (c,x,y,sz,f,t,e)=>drawCharArcherFriend(c,x,y,sz,f,t,e),
  char_thumbsup:    (c,x,y,sz,f,t,e)=>drawCharMageFriend(c,x,y,sz,f,t,e),
  char_tall:        (c,x,y,sz,f,t,e)=>drawCharTallHero(c,x,y,sz,f,t,e),
  char_longcoat:    (c,x,y,sz,f,t,e)=>drawCharFerrisMid(c,x,y,sz,f,t,e||false),
  char_ferris_left: (c,x,y,sz,f,t,e)=>drawCharFerrisLeft(c,x,y,sz,f,t,e||false),
  char_ferris_mid:  (c,x,y,sz,f,t,e)=>drawCharFerrisMid(c,x,y,sz,f,t,e||false),
  char_ferris_right:(c,x,y,sz,f,t,e)=>drawCharFerrisRight(c,x,y,sz,f,t,e||false),
  char_ferris_front:(c,x,y,sz,f,t,e)=>drawCharFerrisFront(c,x,y,sz,f,t,e||false),

  // ── 몬스터 — 존재하는 함수로만 매핑 ────────────────
  goblin:    (c,x,y,sz,f,t,e)=>drawCharFerrisRight(c,x,y,sz,f,t,e),   // 통통 얼굴
  skeleton:  (c,x,y,sz,f,t,e)=>drawCharArcherFriend(c,x,y,sz,f,t,e),
  slime:     (c,x,y,sz,f,t,e)=>drawCharFerrisFront(c,x,y,sz,f,t,e),   // 웃는 얼굴
  orc:       (c,x,y,sz,f,t,e)=>drawCharFerrisLeft(c,x,y,sz,f,t,e),    // 날카로운 인상
  archer:    (c,x,y,sz,f,t,e)=>drawCharArcher(c,x,y,sz,f,t,e),
  shade:     (c,x,y,sz,f,t,e)=>drawCharArcherFriend(c,x,y,sz,f,t,e),
  berserker: (c,x,y,sz,f,t,e)=>drawCharFerrisMid(c,x,y,sz,f,t,e),     // 무표정
  mage:      (c,x,y,sz,f,t,e)=>drawCharMage(c,x,y,sz,f,t,e),
  hunter:    (c,x,y,sz,f,t,e)=>drawCharMageFriend(c,x,y,sz,f,t,e),
  bomber:    (c,x,y,sz,f,t,e)=>drawCharTallHero(c,x,y,sz,f,t,e),
  vampire:   (c,x,y,sz,f,t,e)=>drawCharMageFriend(c,x,y,sz,f,t,e),
  golem:     (c,x,y,sz,f,t,e)=>drawCharFerrisLeft(c,x,y,sz,f,t,e),
  wraith:    (c,x,y,sz,f,t,e)=>drawCharFerrisMid(c,x,y,sz,f,t,e||false),
  hydra:     (c,x,y,sz,f,t,e)=>drawCharFerrisMid(c,x,y,sz,f,t,e),
  lich:      (c,x,y,sz,f,t,e)=>drawCharFerrisLeft(c,x,y,sz,f,t,e),
  dragon:    (c,x,y,sz,f,t,e)=>drawCharFerrisMid(c,x,y,sz,f,t,e),
  demon:     (c,x,y,sz,f,t,e)=>drawCharFerrisRight(c,x,y,sz,f,t,e),
  boss:      (c,x,y,sz,f,t,e)=>drawBossReplace(c,x,y,sz,f,t,e,'boss'),
  boss2:     (c,x,y,sz,f,t,e,m)=>drawBossReplace(c,x,y,sz,f,t,e,'boss2',m),
  boss3:     (c,x,y,sz,f,t,e,m)=>drawBossReplace(c,x,y,sz,f,t,e,'boss3',m),
  boss4:     (c,x,y,sz,f,t,e,m)=>drawBossReplace(c,x,y,sz,f,t,e,'boss4',m),
  boss5:     (c,x,y,sz,f,t,e,m)=>drawBossReplace(c,x,y,sz,f,t,e,'boss5',m),
};

// ── 몬스터 그리기 래퍼 ───────────────────────────────
// 몬스터 타입별 사진 매핑
const MONSTER_PHOTO = {
  goblin:'photo0', skeleton:'photo1', slime:'photo2',
  orc:'photo3', archer:'photo4', shade:'photo0',
  berserker:'photo1', mage:'photo2', hunter:'photo3',
  bomber:'photo4', vampire:'photo0',
  golem:'photo1', wraith:'photo2', hydra:'photo3',
  lich:'photo4', dragon:'photo0', demon:'photo1',
  boss:'photo2', boss2:'photo3', boss3:'photo4',
  boss4:'photo0', boss5:'photo1',
};
const MONSTER_COLOR = {
  goblin:'#2a4a1a', skeleton:'#2a2a3a', slime:'#1a3a1a',
  orc:'#3a1a0a', archer:'#1a3a1a', shade:'#1a0a3a',
  berserker:'#4a0a0a', mage:'#1a0a4a', hunter:'#3a2a0a',
  bomber:'#4a2a0a', vampire:'#3a0a3a',
  golem:'#2a2a2a', wraith:'#0a1a3a', hydra:'#0a3a2a',
  lich:'#2a0a4a', dragon:'#4a1a0a', demon:'#3a0a0a',
  boss:'#4a0000', boss2:'#2a004a', boss3:'#004a4a',
  boss4:'#3a3a00', boss5:'#4a0a0a',
};

// ── 픽셀아트 몬스터 드로우 ───────────────────────────
function drawMonsterSprite(c, m, sx, sy){
  const isBoss=m.type&&m.type.startsWith('boss');
  const enraged=m.enraged;
  const warn=m.warnPhase;
  const sc=isBoss?3.2:m.size<14?1.6:2.2;
  c.save();
  c.imageSmoothingEnabled=false;
  if(enraged){c.shadowColor='#f60';c.shadowBlur=18;}
  else if(warn){c.shadowColor='#f44';c.shadowBlur=10;}
  const type=m.type||'goblin';
  drawPixelMonster(c, type, sx, sy, sc, enraged);
  c.restore();
}

// 픽셀 블록 단위 그리기 헬퍼
function px(c,x,y,w,h,col){c.fillStyle=col;c.fillRect(x,y,w,h);}

function drawPixelMonster(c,type,cx,cy,sc,enraged){
  // 각 몬스터별 픽셀아트 (8x8 기준, sc 배율)
  const s=sc|0||1;
  const ox=cx-4*s, oy=cy-6*s; // 중심 기준
  if(type==='goblin'){
    // 고블린: 초록 피부, 뾰족 귀, 빨간 눈
    const skin=enraged?'#2d7':'#3c9';
    const dark='#1a5c33'; const eye='#f22';
    px(c,ox+2*s,oy,4*s,s,'#555'); // 모자
    px(c,ox+s,oy+s,6*s,4*s,skin); // 머리
    px(c,ox,oy+2*s,s,2*s,skin);   // 왼쪽 귀
    px(c,ox+7*s,oy+2*s,s,2*s,skin); // 오른쪽 귀
    px(c,ox+2*s,oy+2*s,s,s,eye);  // 왼눈
    px(c,ox+5*s,oy+2*s,s,s,eye);  // 오른눈
    px(c,ox+3*s,oy+4*s,2*s,s,dark); // 입
    px(c,ox+2*s,oy+5*s,4*s,3*s,skin); // 몸통
    px(c,ox+s,oy+8*s,2*s,3*s,dark);  // 왼다리
    px(c,ox+5*s,oy+8*s,2*s,3*s,dark); // 오른다리
    px(c,ox,oy+5*s,2*s,2*s,dark);  // 왼팔
    px(c,ox+6*s,oy+5*s,2*s,2*s,dark); // 오른팔
  } else if(type==='skeleton'){
    // 해골: 흰뼈, 검은 눈구멍
    const bone=enraged?'#eee':'#ccd';
    const shadow='#8899aa'; const hole='#111';
    px(c,ox+s,oy,6*s,s,bone);     // 머리 위
    px(c,ox,oy+s,8*s,4*s,bone);   // 머리
    px(c,ox+s,oy+2*s,2*s,2*s,hole); // 왼눈
    px(c,ox+5*s,oy+2*s,2*s,2*s,hole); // 오른눈
    px(c,ox+2*s,oy+4*s,s,s,hole); // 코
    px(c,ox+2*s,oy+5*s,4*s,s,bone); // 턱
    px(c,ox+s,oy+5*s,s,s,shadow); px(c,ox+3*s,oy+5*s,s,s,shadow); px(c,ox+5*s,oy+5*s,s,s,shadow);
    px(c,ox+3*s,oy+6*s,2*s,4*s,shadow); // 척추
    px(c,ox+s,oy+6*s,2*s,2*s,bone); px(c,ox+5*s,oy+6*s,2*s,2*s,bone); // 어깨
    px(c,ox,oy+8*s,s,3*s,bone); px(c,ox+7*s,oy+8*s,s,3*s,bone); // 팔뼈
    px(c,ox+2*s,oy+10*s,2*s,s,bone); px(c,ox+4*s,oy+10*s,2*s,s,bone); // 다리뼈
  } else if(type==='slime'){
    // 슬라임: 파란 물방울 형태
    const col=enraged?'#0ff':'#0de'; const dark='#09a';
    px(c,ox+2*s,oy+2*s,4*s,s,col); // 상단
    px(c,ox+s,oy+3*s,6*s,4*s,col); // 몸
    px(c,ox,oy+4*s,8*s,2*s,col);
    px(c,ox+s,oy+6*s,2*s,s,dark); px(c,ox+5*s,oy+6*s,2*s,s,dark); // 눈
    px(c,ox+2*s,oy+7*s,4*s,s,col); // 하단
    // 반짝임
    px(c,ox+5*s,oy+3*s,s,s,'#fff');
  } else if(type==='orc'){
    // 오크: 갈색, 큰 덩치, 어깨패드
    const skin=enraged?'#b44':'#c63'; const armor='#664';
    const eye='#ff0'; const dark='#7a2';
    px(c,ox+s,oy,6*s,s,armor);    // 투구
    px(c,ox,oy+s,8*s,5*s,skin);   // 머리
    px(c,ox+s,oy+2*s,2*s,2*s,eye); px(c,ox+5*s,oy+2*s,2*s,2*s,eye); // 눈
    px(c,ox+2*s,oy+5*s,4*s,s,'#822'); // 이빨
    px(c,ox,oy+6*s,8*s,4*s,armor); // 갑옷 몸통
    px(c,ox,oy+4*s,s,4*s,skin);px(c,ox+7*s,oy+4*s,s,4*s,skin); // 팔
    px(c,ox+s,oy+10*s,3*s,2*s,armor); px(c,ox+4*s,oy+10*s,3*s,2*s,armor); // 다리
  } else if(type==='archer'){
    // 아처: 초록망토, 활
    const cape='#2a5'; const skin='#e8a'; const bow='#852';
    px(c,ox+2*s,oy,4*s,s,'#2a5');    // 모자
    px(c,ox+s,oy+s,6*s,4*s,skin);    // 얼굴
    px(c,ox+2*s,oy+2*s,s,s,'#422'); px(c,ox+5*s,oy+2*s,s,s,'#422'); // 눈
    px(c,ox+s,oy+5*s,6*s,4*s,cape);  // 몸
    px(c,ox,oy+4*s,s,6*s,bow);       // 활
    px(c,ox+7*s,oy+3*s,s,5*s,'#cc8'); // 화살
    px(c,ox+2*s,oy+9*s,2*s,3*s,cape); px(c,ox+4*s,oy+9*s,2*s,3*s,cape);
  } else if(type==='shade'){
    // 쉐이드: 보라 그림자 유령
    const col=enraged?'#c4f':'#84c'; const dark='#416';
    px(c,ox+2*s,oy+s,4*s,s,col);
    px(c,ox+s,oy+2*s,6*s,5*s,col);
    px(c,ox,oy+3*s,8*s,3*s,col);
    px(c,ox+2*s,oy+3*s,s,s,'#fff'); px(c,ox+5*s,oy+3*s,s,s,'#fff'); // 눈
    // 아랫부분 물결
    for(let i=0;i<4;i++) px(c,ox+i*2*s,oy+7*s,s,s,col);
    px(c,ox+2*s,oy+8*s,s,s,dark); px(c,ox+5*s,oy+8*s,s,s,dark);
  } else if(type==='berserker'){
    // 버서커: 붉은 갑옷, 도끼
    const arm=enraged?'#f00':'#a22'; const body='#622';
    px(c,ox,oy,8*s,s,'#333');       // 뿔 투구
    px(c,ox,oy+s,8*s,5*s,arm);      // 머리
    px(c,ox+s,oy+2*s,2*s,2*s,'#ff8'); px(c,ox+5*s,oy+2*s,2*s,2*s,'#ff8');
    px(c,ox,oy+6*s,8*s,4*s,body);   // 몸
    // 도끼
    px(c,ox-2*s,oy+3*s,2*s,4*s,'#888');
    px(c,ox-3*s,oy+2*s,3*s,s,'#aaa');
    px(c,ox-3*s,oy+6*s,3*s,s,'#aaa');
    px(c,ox+2*s,oy+10*s,2*s,3*s,body); px(c,ox+4*s,oy+10*s,2*s,3*s,body);
  } else if(type==='lich'){
    // 리치: 검은 로브, 빛나는 눈
    const robe='#1a0a2a'; const glow=enraged?'#f0f':'#a0f';
    px(c,ox+2*s,oy,4*s,s,glow);     // 왕관
    px(c,ox+s,oy+s,6*s,4*s,robe);   // 머리
    px(c,ox+2*s,oy+2*s,s,2*s,glow); px(c,ox+5*s,oy+2*s,s,2*s,glow); // 눈
    px(c,ox,oy+5*s,8*s,6*s,robe);   // 로브
    px(c,ox-s,oy+5*s,s,5*s,robe);   // 왼소매
    px(c,ox+8*s,oy+5*s,s,5*s,robe); // 오른소매
    // 마법구
    px(c,ox+3*s,oy+11*s,2*s,2*s,'#80f');
    px(c,ox+3*s,oy+12*s,2*s,s,glow);
  } else if(type==='dragon'){
    // 드래곤: 빨간 거대 용
    const sc2=sc>2?sc:sc*1.5;
    const col=enraged?'#f80':'#e64'; const wing='#c30'; const eye='#ff0';
    px(c,ox-2*s,oy+s,4*s,3*s,wing); px(c,ox+6*s,oy+s,4*s,3*s,wing); // 날개
    px(c,ox+s,oy,6*s,6*s,col);      // 머리
    px(c,ox+2*s,oy+s,s,2*s,eye); px(c,ox+5*s,oy+s,s,2*s,eye);
    px(c,ox+s,oy+5*s,6*s,s,'#f88'); // 이빨
    px(c,ox+2*s,oy+6*s,4*s,4*s,col); // 목
    px(c,ox,oy+10*s,8*s,3*s,col);   // 몸
    px(c,ox+s,oy+13*s,2*s,2*s,wing); px(c,ox+5*s,oy+13*s,2*s,2*s,wing); // 다리
  } else if(type==='demon'){
    // 데몬: 검붉은, 날개
    const col=enraged?'#f44':'#c22'; const wing='#611'; const horn='#333';
    px(c,ox+s,oy,s,2*s,horn); px(c,ox+6*s,oy,s,2*s,horn); // 뿔
    px(c,ox+s,oy+2*s,6*s,4*s,col);   // 머리
    px(c,ox+2*s,oy+3*s,2*s,s,'#ff8'); px(c,ox+4*s,oy+3*s,2*s,s,'#ff8');
    px(c,ox,oy+6*s,8*s,5*s,col);     // 몸
    px(c,ox-2*s,oy+4*s,3*s,5*s,wing); px(c,ox+7*s,oy+4*s,3*s,5*s,wing); // 날개
    px(c,ox+s,oy+11*s,3*s,3*s,col); px(c,ox+4*s,oy+11*s,3*s,3*s,col);
  } else {
    // 기본: 빨간 박스
    px(c,ox+s,oy,6*s,8*s,'#e22');
    px(c,ox+2*s,oy+2*s,s,s,'#ff0'); px(c,ox+5*s,oy+2*s,s,s,'#ff0');
  }
}

// ── 플레이어 그리기 래퍼 ─────────────────────────────
function drawPlayerSprite(c, sx, sy, facing, blinking, alive, colorIdx, charId){
  c.globalAlpha = !alive?0.3:blinking?0.5:1;
  const bob=Math.sin(tick*0.18)*2;
  const photoMap = {
    // photo0~4만 PHOTO_B64에 있음
    player:'photo0', char_headphone:'photo0',
    char_cap:'photo1', char_thumbsup:'photo2',
    char_tall:'photo3', char_longcoat:'photo4',
    char_ferris_left:'photo0', char_ferris_mid:'photo1',
    char_ferris_right:'photo2', char_ferris_front:'photo3',
    photo0:'photo0', photo1:'photo1', photo2:'photo2', photo3:'photo3', photo4:'photo4',
  };
  // charId 결정: 전달된 charId → charIdMap → selectedChar → 기본값
  const cid = charId || (window._charIdMap&&window._charIdMap[window._drawingPid]) || selectedChar || 'photo0';
  const key = photoMap[cid] || cid || 'photo0';
  // PHOTO_IMGS에 없으면 photo0 폴백
  const img = PHOTO_IMGS[key] || PHOTO_IMGS['photo0'];
  if(img && img.complete && img.naturalWidth){
    drawPhotoChar(c, key, sx, sy+bob, 26, '#1a1a2a', blinking&&alive);
  } else if(PHOTO_IMGS['photo0'] && PHOTO_IMGS['photo0'].complete){
    drawPhotoChar(c, 'photo0', sx, sy+bob, 26, '#1a1a2a', blinking&&alive);
  } else {
    drawPixelPlayer(c, sx, sy+bob, colorIdx||0, blinking&&alive);
  }
  c.globalAlpha=1;
}

// 멀티 전용 픽셀아트 플레이어 (colorIdx로 구분)
function drawPixelPlayer(c, cx, cy, colorIdx, blinking){
  if(blinking) c.globalAlpha*=0.5;
  const s=2;
  const ox=cx-4*s, oy=cy-7*s;
  // 색상 팔레트 (5가지)
  const palettes=[
    {skin:'#f5c5a0',hair:'#3a1a00',body:'#2266cc',leg:'#1a1a3a'}, // 파란 기사
    {skin:'#f5c5a0',hair:'#cc2200',body:'#cc2244',leg:'#3a0a0a'}, // 빨간 전사
    {skin:'#c8e8b0',hair:'#004400',body:'#228833',leg:'#0a2a0a'}, // 초록 궁수
    {skin:'#f5e0a0',hair:'#886600',body:'#cc8800',leg:'#3a2a00'}, // 노란 마법사
    {skin:'#e0b8f0',hair:'#440066',body:'#8833cc',leg:'#220044'}, // 보라 닌자
  ];
  const pal=palettes[colorIdx%palettes.length];

  // 머리
  px(c,ox+s,oy,   6*s,s,  pal.hair);    // 머리카락 위
  px(c,ox,  oy+s, 8*s,4*s,pal.skin);    // 얼굴
  px(c,ox,  oy+s, s,  2*s,pal.hair);    // 왼쪽 머리카락
  px(c,ox+7*s,oy+s,s, 2*s,pal.hair);   // 오른쪽 머리카락
  px(c,ox+2*s,oy+2*s,s,s,'#222');      // 왼눈
  px(c,ox+5*s,oy+2*s,s,s,'#222');      // 오른눈
  px(c,ox+3*s,oy+4*s,2*s,s,'#c87');    // 입
  // 몸통
  px(c,ox+s,oy+5*s,6*s,4*s,pal.body);  // 상체
  px(c,ox,  oy+6*s,s,  3*s,pal.body);  // 왼팔
  px(c,ox+7*s,oy+6*s,s,3*s,pal.body);  // 오른팔
  // 다리
  px(c,ox+s,  oy+9*s,3*s,3*s,pal.leg); // 왼다리
  px(c,ox+4*s,oy+9*s,3*s,3*s,pal.leg); // 오른다리
  // 발
  px(c,ox,    oy+11*s,3*s,s,'#333');   // 왼발
  px(c,ox+5*s,oy+11*s,3*s,s,'#333');   // 오른발
}

function drawMinimap(){
  const mW=mmCv.width, mH=mmCv.height;
  const scX=mW/MAP_W, scY=mH/MAP_H;

  // 탐험 변경 시에만 오프스크린 재렌더
  if(_tilesDirty||!_mmCanvas){
    if(!_mmCanvas){
      _mmCanvas=document.createElement('canvas');
      _mmCanvas.width=mW; _mmCanvas.height=mH;
      _mmCtx2=_mmCanvas.getContext('2d');
    }
    _mmCtx2.fillStyle='#05080f'; _mmCtx2.fillRect(0,0,mW,mH);
    for(let r=0;r<ROWS;r++){
      for(let c=0;c<COLS;c++){
        if(!explored[r*COLS+c]) continue;
        _mmCtx2.fillStyle=tiles[r*COLS+c]===1?'#2a2d50':'#191c36';
        _mmCtx2.fillRect(c*TILE*scX|0,r*TILE*scY|0,Math.ceil(TILE*scX+.5),Math.ceil(TILE*scY+.5));
      }
    }
  }
  mmCtx.clearRect(0,0,mW,mH);
  if(_mmCanvas) mmCtx.drawImage(_mmCanvas,0,0);

  // 보스 방 펄스
  const bExp=explored[Math.floor(bossArena.y/TILE)*COLS+Math.floor(bossArena.x/TILE)];
  if(bExp){
    const pulse=.5+.5*Math.sin(tick*.04);
    mmCtx.strokeStyle=`rgba(255,68,0,${pulse})`; mmCtx.lineWidth=1.5;
    mmCtx.strokeRect(bossArena.x*scX,bossArena.y*scY,bossArena.w*scX,bossArena.h*scY);
  }
  // 플레이어 점
  mmCtx.fillStyle='#fff';
  mmCtx.beginPath(); mmCtx.arc(player.x*scX,player.y*scY,3.5,0,Math.PI*2); mmCtx.fill();
  // 뷰포트
  mmCtx.strokeStyle='#ffffff22'; mmCtx.lineWidth=1;
  mmCtx.strokeRect(camX*scX,camY*scY,canvas.width*scX,canvas.height*scY);
}


function addLog(msg,type=''){
  logEntries.unshift({msg,type});
  if(logEntries.length>20) logEntries.pop();
  const el=document.getElementById('log-list');
  el.innerHTML=logEntries.slice(0,7).map(e=>`<div class="le${e.type?' '+e.type:''}">${e.msg}</div>`).join('');
}

let alertTimer=0;
function showAlert(msg){
  const el=document.getElementById('alert');
  document.getElementById('alert-msg').textContent=msg;
  el.style.display='block';
  clearTimeout(alertTimer);
  alertTimer=setTimeout(()=>el.style.display='none',3200);
}

// ── 무기 HUD 업데이트 ────────────────────────────────
function updateWeaponHUD(){
  if(!player) return;
  const wp=WEAPONS[player.weapon]||WEAPONS.sword;
  const ee=document.getElementById('weapon-emoji');
  const en=document.getElementById('weapon-name');
  const ed=document.getElementById('weapon-desc');
  if(ee) ee.textContent=wp.emoji;
  if(en) en.textContent=wp.name;
  if(ed) ed.textContent=wp.desc;
}

// ── 스테이지 클리어 화면 ──────────────────────────────
function showStageCleared(){
  const ov=document.getElementById('ending');
  const title=document.getElementById('end-title');
  const msg=document.getElementById('end-msg');
  title.style.color='#ffd700';
  title.textContent=`⚔ 스테이지 ${stage} 클리어!`;
  const nextPool=[...new Set(getMonsterPool(stage+1))].slice(0,6);
  const nextPreview=nextPool.map(t=>MEMOJI[t]||'?').join(' ');
  const nextBossT=getBossType(stage+1);
  const nextBossL=MTYPE[nextBossT]?.label||'???';
  msg.innerHTML=`
    처치: ${kills}마리 &nbsp;|&nbsp; 누적: ${totalKills+kills}마리<br>
    <span style="font-size:.8rem;color:#aac">다음 스테이지 등장: ${nextPreview}</span><br>
    <span style="font-size:.8rem;color:#f84">보스: ${MEMOJI[nextBossT]||'👑'} ${nextBossL}</span>
  `;
  // 버튼을 "다음 스테이지"로 변경
  const btn=document.getElementById('retry-btn');
  btn.textContent='🛒 상점에서 강화하기';
  btn.onclick=()=>{
    ov.style.display='none';
    showShop(stage+1); // 상점 표시
  };
  // 처음부터 버튼 추가
  let restartBtn=document.getElementById('restart-from-1');
  if(!restartBtn){
    restartBtn=document.createElement('button');
    restartBtn.id='restart-from-1';
    restartBtn.style.cssText='background:#555;color:#ddd;border:none;border-radius:8px;padding:10px 28px;font-family:inherit;font-size:.9rem;cursor:pointer;margin-top:4px;';
    ov.appendChild(restartBtn);
  }
  restartBtn.textContent='처음부터 다시';
  restartBtn.onclick=()=>{ ov.style.display='none'; initGame(false); };
  ov.style.display='flex';
}

function showEnding(won){
  document.getElementById('boss-bar').style.display='none';
  const ov=document.getElementById('ending');
  const title=document.getElementById('end-title');
  const msg=document.getElementById('end-msg');
  if(won){
    title.textContent='🏆 원정 성공!';
    title.style.color='#3de8a0';
    msg.textContent=`던전의 군주를 처치했습니다! 처치 수: ${kills}`;
  } else {
    title.textContent='💀 전멸...';
    title.style.color='#ff3a3a';
    msg.textContent='원정대가 쓰러졌습니다. 다시 도전하세요!';
  }
  ov.style.display='flex';
}

// ═══════════════════════════════════════════════════════
//  메인 루프
// ═══════════════════════════════════════════════════════
let rafId=null;
let lastT=0, accumT=0;
const FIXED_DT=1000/60; // 고정 60fps 업데이트

// ── 멀티 클라이언트 업데이트 (카메라·dash·fog) ────────
function updateMultiClient(){
  tick++;
  if(!player) return;

  // ── 마우스 facing ─────────────────────────────────
  if(player.alive){
    player.facing=Math.atan2(
      (mouse.y+camY)-player.y,
      (mouse.x+camX)-player.x
    );
  }

  // ── 클라이언트 예측 이동 ───────────────────────────
  if(player.alive){
    const inp=buildInput();
    let dx=0,dy=0;
    if(inp.up)    dy-=1;
    if(inp.down)  dy+=1;
    if(inp.left)  dx-=1;
    if(inp.right) dx+=1;
    if(dx&&dy){dx*=0.707;dy*=0.707;}
    const spd=P_SPEED*(player.speedBoost>0?1.7:1);
    if(dx||dy){
      const nx=player.x+dx*spd, ny=player.y+dy*spd;
      if(!isWall(nx,player.y)) player.x=nx;
      if(!isWall(player.x,ny)) player.y=ny;
      player.x=Math.max(TILE,Math.min(MAP_W-TILE,player.x));
      player.y=Math.max(TILE,Math.min(MAP_H-TILE,player.y));
    }
  }

  // ── 구르기 물리 ────────────────────────────────────
  if(player.dashFrames>0){
    const nx=player.x+player.dashVx;
    const ny=player.y+player.dashVy;
    if(!isWall(nx,player.y)) player.x=nx;
    if(!isWall(player.x,ny)) player.y=ny;
    player.dashFrames--;
    player.dashVx*=0.88;
    player.dashVy*=0.88;
  }
  } // end if(!multiMode) respawn

  // ── 쿨다운 감소 (싱글과 동일) ─────────────────────
  if(player.dashCd>0)     player.dashCd--;
  if(player.iframes>0)    player.iframes--;
  if(player.attackCd>0)   player.attackCd--;
  if(player.speedBoost>0) player.speedBoost--;
  if(skillCd.bomb>0)      skillCd.bomb--;
  if(skillCd.shield>0)    skillCd.shield--;
  if(skillCd.thunder>0)   skillCd.thunder--;
  if(shieldActive>0)      shieldActive--;
  if(screenShake>0)       screenShake--;

  // ── 아이템 픽업 (싱글과 동일 로직) ───────────────
  if(player.alive){
    items.forEach(it=>{
      it.life--; it.pulse++;
      if(it.life<=0) return;
      if(Math.hypot(it.x-player.x,it.y-player.y)<22){
        it.life=0;
        if(it.id) _pickedItemIds.add(it.id); // 픽업 ID 기록
        try{SFX.item();}catch(e){}
        if(it.type==='hp'){
          player.hp=Math.min(player.maxHp,player.hp+30);
          addLog('❤️ HP +30','win');
        } else if(it.type==='bomb_charge'){
          skillCd.bomb=0; addLog('💣 폭탄 충전!','win');
        } else if(it.type==='shield_charge'){
          skillCd.shield=0; addLog('🛡 방패 충전!','win');
        } else if(it.type==='thunder_charge'){
          skillCd.thunder=0; addLog('⚡ 번개 충전!','win');
        } else if(it.type==='speed'){
          player.speedBoost=(player.speedBoost||0)+180;
          addLog('👟 속도 부스트!','win');
        } else if(it.type&&it.type.startsWith('weapon_')){
          const wid=it.type.slice(7);
          const wp2=WEAPONS&&WEAPONS[wid];
          if(wp2){ player.weapon=wid; addLog(`${wp2.emoji} ${wp2.name} 획득!`,'win'); }
        }
      }
    });
    items=items.filter(it=>it.life>0 && !_pickedItemIds.has(it.id));
  }

  // ── 파티클 ────────────────────────────────────────
  let pi=0;
  for(let i=0;i<particles.length;i++){
    const p=particles[i];
    p.x+=p.vx;p.y+=p.vy;p.vx*=0.88;p.vy*=0.88;p.life--;
    if(p.life>0) particles[pi++]=p;
  }
  particles.length=pi;

  // ── fog 업데이트 ──────────────────────────────────
  if(tick%4===0) updateFog();

  // ── 카메라 추적 ───────────────────────────────────
  if(player){
    const tx=player.x-canvas.width/2, ty=player.y-canvas.height/2;
    camX+=(tx-camX)*0.12; camY+=(ty-camY)*0.12;
    camX=Math.max(0,Math.min(MAP_W-canvas.width,camX));
    camY=Math.max(0,Math.min(MAP_H-canvas.height,camY));
  }

  // ── HUD ───────────────────────────────────────────
  if(tick%6===0) updateMobileSkillHUD();
}

