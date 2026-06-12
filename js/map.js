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
let player, monsters=[], particles=[], attackFx=[];
let camX=0, camY=0;
let kills=0, tick=0, gold=0;
let bullets=[], bombs=[], dangerZonesFx=[], items=[];
let skillCd={bomb:0, shield:0, thunder:0};
let shieldActive=0;
let bossArena=null, bossSpawned=false, bossDefeated=false;
let gameRunning=false, gameWon=false, gameOver=false;
let screenShake=0;
let spawnTimer=0;
let logEntries=[];
let selectedChar='photo0'; // 선택된 캐릭터 ID
let _shopNextStage=1;
let alertTimer=0;
let mouseAttacking=false;
let _exploredVersion=0, _lastExploredVersion=-1;
let nextId=1; // 아이템 ID 생성용


// ═══════════════════════════════════════════════════════
//  효과음 시스템 — Web Audio API 합성음
// ═══════════════════════════════════════════════════════
let _audioCtx=null,_sfxMuted=false,_bgmGain=null,_bgmOscs=[];

const MAP_THEMES=[
  {floor:'#111228',wall:'#1e2040',wallTop:'#252848',wallAcc:'#2a305a',boss:'#1e0808',bg:'#050810',name:'던전'},      // 1: 클래식 던전 (청색)
  {floor:'#1a0820',wall:'#2a0835',wallTop:'#380a45',wallAcc:'#4a1060',boss:'#200010',bg:'#080510',name:'암흑 미로'}, // 2: 암흑 (보라)
  {floor:'#081818',wall:'#0d2828',wallTop:'#103535',wallAcc:'#155050',boss:'#081a20',bg:'#050a08',name:'빙하 동굴'}, // 3: 빙하 (청록)
  {floor:'#181808',wall:'#282808',wallTop:'#353510',wallAcc:'#504810',boss:'#1a1800',bg:'#080808',name:'사막 유적'}, // 4: 황토 (노랑)
  {floor:'#200808',wall:'#350a0a',wallTop:'#450c0c',wallAcc:'#600808',boss:'#250000',bg:'#0a0500',name:'마왕 성채'}, // 5: 화염 (빨강)
];
