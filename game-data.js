'use strict';
'use strict';
// ═══════════════════════════════════════════════════════
//  상수
// ═══════════════════════════════════════════════════════
// 스테이지별 맵 크기 (스테이지 올라갈수록 넓어짐)
const BASE_MAP_W = 4000, BASE_MAP_H = 3200;
let MAP_W = BASE_MAP_W, MAP_H = BASE_MAP_H;
let COLS = MAP_W / 48 | 0;
let ROWS = MAP_H / 48 | 0;
const TILE = 48;
let stage = 1;
let totalKills = 0; // 전체 누적 킬
const SIGHT_R = 480;
const P_SPEED = 2.0;
const P_HP    = 120;
const P_ATK   = 32;
const P_RANGE = 180;
const P_CD    = 36;
const IFRAMES = 48;
const BULLET_SPEED = 10;
const BULLET_LEN   = 24;
const BULLET_RANGE = 360;

// ── 무기 정의 ──────────────────────────────────────────
const WEAPONS = {
  sword:   { id:'sword',  name:'기본 검',    emoji:'🗡',  cd:36,  dmg:32, spd:10, range:360, spread:0,   count:1, pierce:false, desc:'기본 근접 공격',      col:'#88ddff' },
  pistol:  { id:'pistol', name:'권총',       emoji:'🔫',  cd:30,  dmg:22, spd:13, range:420, spread:0.1, count:1, pierce:false, desc:'빠른 단발 권총',       col:'#ffdd44' },
  shotgun: { id:'shotgun',name:'산탄총',     emoji:'💥',  cd:65,  dmg:28, spd:9,  range:260, spread:0.35,count:5, pierce:false, desc:'5발 산탄 — 근거리 강력',col:'#ff8844' },
  rifle:   { id:'rifle',  name:'저격 소총',  emoji:'🎯',  cd:80,  dmg:70, spd:18, range:700, spread:0,   count:1, pierce:true,  desc:'관통 · 고데미지',      col:'#44ff88' },
  smg:     { id:'smg',    name:'기관단총',   emoji:'⚡',  cd:18,   dmg:12, spd:12, range:320, spread:0.18,count:1, pierce:false, desc:'초고속 연사',           col:'#aaaaff' },
  laser:   { id:'laser',  name:'레이저',     emoji:'🔴',  cd:55,  dmg:55, spd:22, range:600, spread:0,   count:1, pierce:true,  desc:'고속 관통 레이저',     col:'#ff2244' },
  cannon:  { id:'cannon', name:'캐논',       emoji:'💣',  cd:120,  dmg:120,spd:7,  range:380, spread:0,   count:1, pierce:false, desc:'초고데미지 단발',       col:'#ff6600' },
  twin:    { id:'twin',   name:'쌍권총',     emoji:'🔫',  cd:24,  dmg:18, spd:12, range:380, spread:0.08,count:2, pierce:false, desc:'2발 동시 발사',         col:'#ffaa00' },
};

// 무기 드랍 풀 (sword 제외 — 기본 무기)
const WEAPON_DROP_POOL = ['pistol','shotgun','rifle','smg','laser','cannon','twin'];
// 스킬 쿨다운 (프레임)
const CD_BOMB    = 360;  // Z: 폭탄 6초
const CD_SHIELD  = 480;  // X: 방패 8초
const CD_THUNDER = 300;  // C: 번개 5초

// ═══════════════════════════════════════════════════════
//  캔버스
// ═══════════════════════════════════════════════════════
const canvas = document.getElementById('c');
const ctx    = canvas.getContext('2d');
const mmCv   = document.getElementById('mm');
const mmCtx  = mmCv.getContext('2d');

function resizeCanvas(){
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ═══════════════════════════════════════════════════════
//  맵 생성
// ═══════════════════════════════════════════════════════
let tiles;   // Uint8Array COLS*ROWS  0=floor 1=wall
let explored;// Uint8Array COLS*ROWS  0/1

function tileAt(c,r){
  if(c<0||c>=COLS||r<0||r>=ROWS) return 1;
  return tiles[r*COLS+c];
}
function setTile(c,r,v){
  if(c<0||c>=COLS||r<0||r>=ROWS) return;
  tiles[r*COLS+c]=v;
}

// ── 랜덤 BSP 던전 생성기 ──────────────────────────────
function rng(min,max){ return min+Math.random()*(max-min)|0; }
