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
  // 선택된 캐릭터 패시브 적용 (안전하게)
  const _foundChar = (typeof CHAR_LIST!=='undefined' && CHAR_LIST.find(c=>c.id===selectedChar)) || null;
  const _charPassive = (_foundChar && _foundChar.passive) ? _foundChar.passive : {};
  const _pHpMul   = +(_charPassive.hpMul)||1;
  const _pSpdMul  = +(_charPassive.spdMul)||1;
  window._charCdMul      = +(_charPassive.cdMul)||1;
  window._charAtkMul     = +(_charPassive.atkMul)||1;
  window._charDashCdMul  = +(_charPassive.dashCdMul)||1;
  window._charBombRange  = +(_charPassive.bombRangeMul)||1;
  window._charSpdMul     = _pSpdMul;
  const _baseHp = Math.round(P_HP * _pHpMul);

  player = {
    x: sr.cx * TILE, y: sr.cy * TILE,
    hp: _baseHp, maxHp: _baseHp,
    alive: true, iframes: 0, attackCd: 0,
    dashCd: 0, dashVx: 0, dashVy: 0, dashFrames: 0,
    facing: 0,
    weapon: 'sword',
    weaponAmmo: {},
    charId: selectedChar,
  };
  // 패시브 레이블 표시
  if(_charPassive.label && typeof addLog==='function') addLog(`[${_charPassive.label}] 패시브 적용!`,'win');
  camX = player.x - canvas.width/2;
  camY = player.y - canvas.height/2;
  // 캐시 초기화
  _tilesDirty=true; _tileCanvas=null; _tileCtx=null;
  _mmDirty=true; _mmCanvas=null; _mmCtx2=null;
  window._fog=null; window._fogC=null;

  // 초기 몬스터 (스테이지 올라갈수록 더 많이)
  const initCount = 28 + (stage-1)*8;
  for(let i=0;i<initCount;i++) spawnMonster();
  // 보스를 보스 방 중앙에 미리 배치 (비활성 상태 - 방 진입 시 활성화)
  if(bossArena) spawnBoss();

  // 캐릭터/닉네임 (최초 스테이지만)
  if(stage===1){
    applySelectedChar();
    const nn=window.playerNickname||'용사';
    const el=document.getElementById('player-hud-name');
    if(el) el.textContent=nn;
  }

  // 재생 반지 효과
  if(window._regenActive && keepStage){ player.hp=Math.min(player.maxHp, player.hp+10); }

  // 공통 초기화 (모든 스테이지)
  startBGM(); setBGMStage(stage); addMuteButton();
  updateWeaponHUD();
  if(isMobile&&!mobileActive) initMobileControls();

  const themeName = (typeof MAP_THEMES!=='undefined'&&MAP_THEMES) ? MAP_THEMES[Math.min(stage-1,MAP_THEMES.length-1)].name : '';
  if(stage===1){
    addLog('⚔ 던전 탐험을 시작합니다!','win');
    addLog('보스 방을 찾아 던전의 군주를 처치하라!');
  } else {
    addLog(`🗺 스테이지 ${stage} 진입! ${themeName} 탐험 시작`,'win');
    addLog(`💰 보유 골드: ${gold}G — 보스를 처치하라!`,'win');
    const bCfg=MTYPE[getBossType(stage)];
    if(bCfg) addLog(`👑 이번 스테이지 보스: ${bCfg.label} — ${bCfg.desc||''}`, 'boss');
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
var MTYPEE = {
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

// nextId: map.js에서 선언

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
    (x>bossArena.x-TILE&&x<bossArena.x+bossArena.w+TILE&&
    y>bossArena.y-TILE&&y<bossArena.y+bossArena.h+TILE))&&tries<80
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
  // 보스를 보스 방 중앙에 미리 배치 (bossSpawned=false, 비활성 상태)
  const bossType=getBossType(stage);
  const cfg=MTYPE[bossType];
  const bx=bossArena.x+bossArena.w/2;
  const by=bossArena.y+bossArena.h/2;
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
    attackStyle: ['fill_cross','fill_scatter','fill_ring','fill_cone','fill_line'][Math.random()*5|0],
    attackCd:80, warnPhase:false, alive:true,
    enraged:false, phase:0,
    aimAngle:0, bossPhase:0,
    colVariant: ['#f40','#c0f','#0af','#ff0','#f00','#4f0','#f80'][Math.random()*7|0],
    _prePlaced: true,   // 미리 배치됨 표시
  });
  // bossSpawned는 false 유지 - 방 진입 시 true로 변경됨
}

// ═══════════════════════════════════════════════════════
//  공격
// ═══════════════════════════════════════════════════════
// ── 구르기(대시) ──────────────────────────────────
var DASH_SPEED = 18;    // 대시 속도
var DASH_FRAMES = 20;   // 대시 지속 프레임
var DASH_CD = 180;      // 대시 쿨다운 (3초)
var DASH_IFRAMES = 20;  // 무적 프레임

function doDash(){
  // 공통 조건 체크
  if(!player||!player.alive||player.dashCd>0) return;
  // 방향 계산 (싱글/멀티 동일)
  let dx=(keys['ArrowRight']||keys['d']||keys['D']?1:0)-(keys['ArrowLeft']||keys['a']||keys['A']?1:0);
  let dy=(keys['ArrowDown']||keys['s']||keys['S']?1:0)-(keys['ArrowUp']||keys['w']||keys['W']?1:0);
  if(!dx&&!dy&&typeof joyState!=='undefined'&&joyState&&joyState.active){
    dx=joyState.dx||0; dy=joyState.dy||0;
  }
  const ang=(dx||dy)?Math.atan2(dy,dx):(player.facing||0);
  // 로컬 물리 즉시 적용 (싱글: 실제 이동, 멀티: 클라이언트 예측)
  player.dashVx=Math.cos(ang)*DASH_SPEED;
  player.dashVy=Math.sin(ang)*DASH_SPEED;
  player.dashFrames=DASH_FRAMES;
  player.dashCd=Math.round(DASH_CD*(window._charDashCdMul||1));
  player.iframes=DASH_IFRAMES;
  try{SFX.dash();}catch(e){}
  // 멀티: 서버에도 알림
  if(multiMode) wsSend({type:'dash', angle:ang});
}

function doAttack(){
  // 공통 조건 체크
  if(!player||!player.alive||player.attackCd>0) return;
  if(!gameRunning && !multiMode) return;
  const wp=WEAPONS[player.weapon]||WEAPONS.sword;
  player.attackCd=wp.cd;
  const angle=player.facing!==undefined?player.facing:0;
  try{_getACtx();SFX.shoot();}catch(e){}
  if(multiMode){
    // 멀티: 서버에만 알림, 총알은 서버 state로 렌더링
    wsSend({type:'attack'});
    return;
  }
  // 싱글: 클라이언트에서 직접 총알 생성
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
  // 공통 조건 체크
  if(!player||!player.alive||skillCd.bomb>0) return;
  if(!gameRunning && !multiMode) return;
  skillCd.bomb=Math.round(CD_BOMB*(window._charCdMul||1));
  try{SFX.explode();}catch(e){}
  const angle=player.facing!==undefined?player.facing:0;
  addLog('💣 폭탄 투척!');
  if(multiMode){
    // 멀티: 서버에만 알림, 폭탄은 서버 state로 렌더링
    wsSend({type:'bomb', facing:angle});
    return;
  }
  // 싱글: 클라이언트에서 직접 폭탄 생성
  bombs.push({
    x:player.x, y:player.y,
    vx:Math.cos(angle)*5, vy:Math.sin(angle)*5,
    dist:0, maxDist:200, exploded:false, explodeTimer:0,
    radius:0, maxRadius:90*(window._charBombRange||1), alive:true,
  });
}

function doSkillShield(){
  // 공통 조건 체크
  if(!player||!player.alive||skillCd.shield>0) return;
  if(!gameRunning && !multiMode) return;
  skillCd.shield=Math.round(CD_SHIELD*(window._charCdMul||1));
  try{SFX.shield();}catch(e){}
  shieldActive=120;
  addLog('🛡 방패막 발동! 2초간 무적');
  // 멀티: 서버에도 알림
  if(multiMode) wsSend({type:'shield'});
}

function doSkillThunder(){
  // 공통 조건 체크
  if(!player||!player.alive||skillCd.thunder>0) return;
  if(!gameRunning && !multiMode) return;
  skillCd.thunder=Math.round(CD_THUNDER*(window._charCdMul||1));
  try{SFX.thunder&&SFX.thunder();}catch(e){}
  if(multiMode){
    // 멀티: 서버에만 알림 (이펙트는 thunder_fx 수신 시 표시)
    wsSend({type:'thunder'});
    addLog('⚡ 번개 발동!');
    return;
  }
  // 싱글: 클라이언트에서 직접 처리
  const THUNDER_R=180, THUNDER_DMG=55;
  dangerZonesFx.push({x:player.x,y:player.y,r:THUNDER_R,life:25,col:'#aaf',type:'thunder'});
  spawnParticles(player.x,player.y,'#ccf',12);
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
  addLog(`⚡ 번개 범위공격! ${hit}마리 피격`,'kill');
}

function killMonster(m){
  m.alive=false; kills++;
  spawnParticles(m.x,m.y,'#ffd700',16);
  // ── 콤보 시스템 ──
  comboCount++;
  comboTimer=180; // 3초(60fps*3) 이내 다음 킬 없으면 리셋
  let goldMul=1;
  if(comboCount>=10){ goldMul=3; if(comboCount%10===0) addLog(`🔥 COMBO x${comboCount}!! 골드 3배!`,'win'); screenShake=Math.min(screenShake+15,40); }
  else if(comboCount>=5){ goldMul=2; if(comboCount===5) addLog(`⚡ COMBO x5! 골드 2배!`,'win'); }
  else if(comboCount>=3){ goldMul=1.5; if(comboCount===3) addLog(`✨ COMBO x3! 골드 1.5배`,'win'); }
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
    const bossGold = stage * 80;
    gold += bossGold;
    const nextBossType=getBossType(stage+1);
    const nextBossCfg=MTYPE[nextBossType];
    SFX.stageClear(); setBGMStage(stage+1);
    addLog(`🏆 스테이지 ${stage} 보스 처치! +${bossGold}💰`,'win');
    if(nextBossCfg) addLog(`다음: ${MEMOJI[nextBossType]||'👑'} ${nextBossCfg.label}이(가) 기다린다...`,'boss');
    setTimeout(()=>showStageCleared(),800);
  } else {
    const g = Math.round((m.elite ? (m.score/2|0)+15 : (m.score/4|0)+3) * goldMul);
    gold += g;
    if(g>=5) addLog(`${MEMOJI[m.type]||'👾'} ${m.label||m.type} 처치! +${g}💰`,'kill');
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
var MAX_PARTICLES=120;
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
  if(!gameRunning && !multiMode) return;
  if(multiMode && !player) return;
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
    // 마우스 홀드 연사 (싱글/멀티 공통 - doAttack 내부에서 multiMode 처리)
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
      const spd2 = P_SPEED*(window._charSpdMul||1)*(player.speedBoost>0?1.7:1);
      const nx=player.x+(dx/len)*spd2;
      const ny=player.y+(dy/len)*spd2;
      const r=moveSlide(player.x,player.y,nx,ny);
      player.x=Math.max(TILE,Math.min(MAP_W-TILE,r.x));
      player.y=Math.max(TILE,Math.min(MAP_H-TILE,r.y));
    }
    // 대시 쿨다운
    if(player.dashCd>0) player.dashCd--;

    // ── 팀 부활 (멀티) ──────────────────────────────
    if(multiMode){
      _reviveTarget=null;
      if(player.alive){
        // 근처 사망 플레이어 탐색
        if(multiState&&multiState.players){
          for(const op of multiState.players){
            if(op.id===myMultiId||op.alive) continue;
            if(Math.hypot(player.x-op.x,player.y-op.y)<80){
              _reviveTarget=op; break;
            }
          }
        }
        if(_reviveTarget && (keys['f']||keys['F'])){
          _reviveHold++;
          wsSend({type:'revive_hold', targetPid:_reviveTarget.id});
          if(_reviveHold>=90){ _reviveHold=0; addLog('💚 부활 완료!','win'); }
        } else {
          if(_reviveHold>0){ wsSend({type:'revive_cancel'}); _reviveHold=0; }
        }
      }
    }
    // 멀티 입력 전송: multi.js setInterval에서 처리
    }

    // 보스 방 진입
    if(!bossSpawned){
      const ba=bossArena;
      if(player.x>ba.x&&player.x<ba.x+ba.w&&player.y>ba.y&&player.y<ba.y+ba.h){
        // 방 진입 시 보스 활성화 (이미 배치됨)
        bossSpawned=true;
        screenShake=60;
        SFX.bossSpawn&&SFX.bossSpawn();
        const boss=monsters.find(m=>m.type&&m.type.startsWith('boss'));
        if(boss){
          const cfg=MTYPE[boss.type];
          const bossEmoji=MEMOJI[boss.type]||'👑';
          showAlert(`${bossEmoji} ${cfg.label} 각성!`);
          addLog(`${bossEmoji} ${cfg.label}이(가) 각성했다!!!`,'boss');
          document.getElementById('boss-bar').style.display='block';
        }
      }
    }
  }

  // ── 몬스터 AI (싱글: 직접처리 / 멀티: 서버처리) ──
  monsters.forEach(m=>{
    if(multiMode) return;  // 멀티는 서버가 처리
    if(!m.alive) return;
    m.phase++;
    const dx=player.x-m.x, dy=player.y-m.y;
    const d2=dx*dx+dy*dy, d=Math.sqrt(d2);
    if(d2>SIGHT_R*SIGHT_R*9&&tick%2!==0) return;
    const isBoss = m.type&&m.type.startsWith('boss');
    // 보스는 플레이어가 보스 방 안에 들어올 때만 움직임
    const playerInBossArena = bossArena &&
      player.x>bossArena.x && player.x<bossArena.x+bossArena.w &&
      player.y>bossArena.y && player.y<bossArena.y+bossArena.h;
    const aggroR = isBoss ? (playerInBossArena ? 9999 : 0) : 300;

    // 이동
    if(d<aggroR && d>m.range*0.75){
      const spd=m.enraged?m.spd*1.55:m.spd;
      const nx=m.x+(dx/d)*spd, ny=m.y+(dy/d)*spd;
      const r=moveSlide(m.x,m.y,nx,ny,m.size*0.7);
      m.x=r.x; m.y=r.y;
    }

    if(!isBoss || playerInBossArena) m.attackCd--;
    // ── 엘리트 특수 패턴 (체력 50% 이하, 180틱마다) ──
    if(m.elite && m.hp < m.maxHp*0.5 && tick%180===0 && d<300){
      const elType = m.type;
      if(elType==='goblin'||elType==='orc'||elType==='berserker'){
        // 돌진: 잠시 속도 2배 + 연속 공격
        m.attackCd=Math.floor(m.attackCd/2);
        spawnParticles(m.x,m.y,'#f80',8);
        addLog(`💥 엘리트 ${m.label} 분노!`);
      } else if(elType==='archer'||elType==='hunter'){
        // 관통 화살 3방향
        if(!multiMode){
          for(let ai=0;ai<3;ai++){
            const aa=Math.atan2(player.y-m.y,player.x-m.x)+(ai-1)*0.35;
            bullets.push({x:m.x,y:m.y,vx:Math.cos(aa)*9,vy:Math.sin(aa)*9,
              dist:0,angle:aa,alive:true,dmgOverride:m.atk*1.5,
              pierce:true,range:550,col:'#f84',len:22,w:3,isMob:true});
          }
          addLog(`🏹 엘리트 ${m.label} 관통 화살!`);
        }
      } else if(elType==='mage'||elType==='shade'||elType==='lich'){
        // 플레이어 주변에 번개 써클
        dangerZonesFx.push({x:player.x,y:player.y,r:65,life:90,col:'#ccf',type:'thunder'});
        addLog(`⚡ 엘리트 ${m.label} 번개 소환!`);
      }
    }
    m.warnPhase = m.attackCd<=m.warn && m.attackCd>0 && d<m.range*2.2 && (!isBoss||playerInBossArena);

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

  // ── 몬스터 리스폰 (싱글만) ──────────────────────
  if(!multiMode){ spawnTimer++;
  if(spawnTimer>Math.max(150,280-(stage-1)*15)){
    spawnTimer=0;
    const normal=monsters.filter(m=>m.alive&&m.type!=='boss').length;
    const toSpawn=Math.min(4,30-normal);
    for(let i=0;i<toSpawn;i++) spawnMonster();
  }
  let mfi=0;
  for(let i=0;i<monsters.length;i++){if(monsters[i].alive)monsters[mfi++]=monsters[i];}
  monsters.length=mfi; }

  // ── 쿨다운 감소 ──────────────────────────────────
  if(skillCd.bomb>0)    skillCd.bomb--;
  if(skillCd.shield>0)  skillCd.shield--;
  if(skillCd.thunder>0) skillCd.thunder--;
  if(shieldActive>0)    shieldActive--;

  // ── 아이템 픽업 (싱글/멀티 공통) ─────────────────
  if(!window._pickedItems) window._pickedItems=new Set();
  {
    items.forEach(it=>{
      it.life--; it.pulse++;
      if(!player.alive) return;
      if(Math.hypot(it.x-player.x,it.y-player.y)<22 && !window._pickedItems.has(it.id)){
        window._pickedItems.add(it.id);
        it.life=0;
        try{SFX.item();}catch(e){}
        if(multiMode) wsSend({type:'pickup', itemId:it.id});
        if(it.type==='hp'){
          player.hp=Math.min(player.maxHp,player.hp+30);
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
        } else if(it.type&&it.type.startsWith('weapon_')){
          const wid=it.type.slice(7);
          const wp2=WEAPONS[wid];
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
  }
  if(player && player.speedBoost>0) player.speedBoost--;

  // ── 폭탄/총알 (싱글만 - 멀티는 서버처리) ────────
  if(!multiMode){ bombs.forEach(b=>{
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
  // dangerZonesFx life 감소 (gameRunning 상관없이 항상 실행)
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
  bullets.length=bi; } // end if(!multiMode) 폭탄/총알

  // ── 콤보 타이머 감소 ──
  if(comboTimer>0){
    comboTimer--;
    if(comboTimer===0 && comboCount>0){
      comboCount=0; // 콤보 리셋
    }
  }

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
  var boss=monsters.find(m=>m.type&&m.type.startsWith('boss')&&m.alive);
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
  // ── 보스 2페이즈 처리 ──────────────────────────
  if(bossSpawned && boss && boss.alive){
    const cfg=MTYPE[boss.type];
    if(cfg){
      const hpRatio=boss.hp/boss.maxHp;
      // 2페이즈 전환
      if(cfg.phase2Hp && hpRatio<=cfg.phase2Hp && !boss._phase2){
        boss._phase2=true;
        boss.attackStyle=cfg.phase2Style||boss.attackStyle;
        boss.col=cfg.phase2Col||boss.col;
        boss.spd=(boss.spd||1)*(cfg.phase2SpdMul||1.5);
        boss.cd=Math.max(80,(boss.cd||120)*0.7);
        addLog(`💀 ${cfg.label} - 분노 상태!`,'boss');
        screenShake=30; spawnParticles(boss.x,boss.y,boss.col,30);
        if(cfg.summonCount){
          for(let s=0;s<cfg.summonCount;s++){
            const ang=s/cfg.summonCount*Math.PI*2;
            const st=cfg.summonType||'zombie';
            const sc=MTYPE[st];
            if(sc) monsters.push({
              id:nextId++,type:st,x:boss.x+Math.cos(ang)*80,y:boss.y+Math.sin(ang)*80,
              hp:sc.hp,maxHp:sc.hp,atk:sc.atk,spd:sc.spd,
              range:sc.range||80,warn:sc.warn||120,cd:sc.cd||120,cdMax:sc.cd||120,
              size:sc.size||16,score:0,col:sc.col||'#888',
              attackStyle:sc.attackStyle||'fill_circle',
              alive:true,phase:0,warnPhase:false,aimAngle:0,attackCd:60,
            });
          }
          addLog(`👥 분신 ${cfg.summonCount}체 소환!`,'boss');
        }
      }
      // 3페이즈 (boss5)
      if(cfg.phase3Hp && hpRatio<=cfg.phase3Hp && !boss._phase3){
        boss._phase3=true;
        boss.attackStyle=cfg.phase3Style||boss.attackStyle;
        boss.col=cfg.phase3Col||boss.col;
        boss.spd=(boss.spd||1)*(cfg.phase3SpdMul||1.5);
        boss.cd=Math.max(60,(boss.cd||120)*0.6);
        addLog(`💀 ${cfg.label} - 최후의 분노!`,'boss');
        screenShake=50;
        for(let i=0;i<4;i++) spawnParticles(boss.x,boss.y,boss.col,12);
      }
      // 빙결 장판 (boss3)
      if(cfg.iceZone && tick%200===0){
        dangerZonesFx.push({x:boss.x,y:boss.y,r:120,life:150,col:'#0af',type:'ice'});
        addLog('❄️ 빙결 장판!','boss');
      }
      // 연쇄 낙뢰 (boss4) - 2페이즈 이후
      if(cfg.chainLightning && boss._phase2 && tick%100===0 && player && player.alive){
        dangerZonesFx.push({x:player.x,y:player.y,r:55,life:45,col:'#ff4',type:'thunder'});
        if(player.iframes<=0){ player.hp-=18; player.iframes=25; spawnParticles(player.x,player.y,'#ff4',8); }
      }
    }
  }

  if(boss && player.alive && gameRunning){
    document.getElementById('boss-bar').style.display='block';
    document.getElementById('boss-hp-fill').style.width=(boss.hp/boss.maxHp*100)+'%';
    const phase=boss._phase3?'💀 [최후]':boss._phase2?'🔥 [격노]':'👑 ';
    document.getElementById('boss-title').textContent=phase+(boss.label||'던전의 군주');
    document.getElementById('boss-hp-fill').style.background=
      boss._phase3?'linear-gradient(90deg,#800,#f00,#f80)':
      boss._phase2?'linear-gradient(90deg,#a00,#f40,#fa0)':
      'linear-gradient(90deg,#c00,#f40,#f80)';
  } else {
    document.getElementById('boss-bar').style.display='none';
  }


// ── Fog ─────────────────────────────────────────────
function updateFog(){
  if(!player||!player.alive) return;
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
// 스테이지별 맵 테마
var MAP_THEMES=[
  {floor:'#111228',wall:'#1e2040',wallTop:'#252848',wallAcc:'#2a305a',boss:'#1e0808',bg:'#050810',name:'던전'},      // 1: 클래식 던전 (청색)
  {floor:'#1a0820',wall:'#2a0835',wallTop:'#380a45',wallAcc:'#4a1060',boss:'#200010',bg:'#080510',name:'암흑 미로'}, // 2: 암흑 (보라)
  {floor:'#081818',wall:'#0d2828',wallTop:'#103535',wallAcc:'#155050',boss:'#081a20',bg:'#050a08',name:'빙하 동굴'}, // 3: 빙하 (청록)
  {floor:'#181808',wall:'#282808',wallTop:'#353510',wallAcc:'#504810',boss:'#1a1800',bg:'#080808',name:'사막 유적'}, // 4: 황토 (노랑)
  {floor:'#200808',wall:'#350a0a',wallTop:'#450c0c',wallAcc:'#600808',boss:'#250000',bg:'#0a0500',name:'마왕 성채'}, // 5: 화염 (빨강)
];
function getTheme(){ return MAP_THEMES[Math.min(stage-1,MAP_THEMES.length-1)]; }
var bossFloor='#1e0808', dimFloor='#0a0a18', dimWall='#0d0e1e';

// ── 타일맵 오프스크린 캐시 ──────────────────────────
// 맵 전체를 하나의 큰 오프스크린 캔버스에 그려두고
// 화면에 보이는 영역만 drawImage로 잘라서 그림
// explored/inSight는 fog로 처리하므로 여기선 전체 타일만 캐시
// _exploredVersion: map.js 전역변수 블록에서 선언

function _rebuildTileCache(){
  if(!_tileCanvas||_tileCanvas.width!==MAP_W||_tileCanvas.height!==MAP_H){
    _tileCanvas=document.createElement('canvas');
    _tileCanvas.width=MAP_W; _tileCanvas.height=MAP_H;
    _tileCtx=_tileCanvas.getContext('2d');
  }
  const tc=_tileCtx, ts=TILE;
  const th=getTheme(); tc.fillStyle=th.bg; tc.fillRect(0,0,MAP_W,MAP_H);
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      const idx=r*COLS+c;
      if(!explored[idx]) continue;
      const wx=c*ts, wy=r*ts;
      const t=tiles[idx];
      const inBoss=bossArena&&wx>=bossArena.x-ts&&wx<bossArena.x+bossArena.w+ts
                &&wy>=bossArena.y-ts&&wy<bossArena.y+bossArena.h+ts;
      if(t===1){
        tc.fillStyle=th.wall;    tc.fillRect(wx,wy,ts,ts);
        tc.fillStyle=th.wallTop; tc.fillRect(wx+2,wy+2,ts-4,ts-4);
        tc.fillStyle=th.wallAcc; tc.fillRect(wx+2,wy+2,ts-4,3);
        tc.fillStyle=th.wallAcc; tc.fillRect(wx+2,wy+2,3,ts-4);
      } else {
        tc.fillStyle=inBoss?th.boss:th.floor; tc.fillRect(wx,wy,ts,ts);
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
