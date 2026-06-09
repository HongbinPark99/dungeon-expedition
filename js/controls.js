function initMobileControls(){
  if(!isMobile) return;
  mobileActive = true;
  const mc = document.getElementById('mobile-controls');
  if(mc) mc.style.display = 'block';

  // ── 조이스틱 ──────────────────────────────────────
  const jZone = document.getElementById('joystick-zone');
  const stick  = document.getElementById('joystick-stick');
  const BASE_R = 65; // 조이스틱 반지름

  function joyMove(cx, cy, ox, oy){
    let dx = cx - ox, dy = cy - oy;
    const dist = Math.hypot(dx, dy);
    if(dist > BASE_R){ dx *= BASE_R/dist; dy *= BASE_R/dist; }
    stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    joyState.dx = dx / BASE_R;
    joyState.dy = dy / BASE_R;
  }

  jZone.addEventListener('touchstart', e=>{
    e.preventDefault();
    const t = e.changedTouches[0];
    const r = jZone.getBoundingClientRect();
    joyState.id = t.identifier;
    joyState.active = true;
    joyMove(t.clientX, t.clientY, r.left + r.width/2, r.top + r.height/2);
  },{passive:false});

  jZone.addEventListener('touchmove', e=>{
    e.preventDefault();
    for(const t of e.changedTouches){
      if(t.identifier !== joyState.id) continue;
      const r = jZone.getBoundingClientRect();
      joyMove(t.clientX, t.clientY, r.left + r.width/2, r.top + r.height/2);
      // 조준 조이스틱이 없을 때만 이동방향으로 facing 업데이트
      if(player && (joyState.dx||joyState.dy) && !(typeof aimJoyState!=='undefined'&&aimJoyState.active))
        player.facing = Math.atan2(joyState.dy, joyState.dx);
    }
  },{passive:false});

  function joyEnd(e){
    e.preventDefault();
    for(const t of e.changedTouches){
      if(t.identifier !== joyState.id) continue;
      joyState.dx = 0; joyState.dy = 0;
      joyState.active = false; joyState.id = -1;
      stick.style.transform = 'translate(-50%, -50%)';
    }
  }
  jZone.addEventListener('touchend',   joyEnd, {passive:false});
  jZone.addEventListener('touchcancel',joyEnd, {passive:false});

  // ── 오른쪽 통합 조준+공격 조이스틱 ─────────────────
  const aimJZone   = document.getElementById('aim-joystick-zone');
  const aimBase    = document.getElementById('aim-joystick-base');
  const aimStick   = document.getElementById('aim-joystick-stick');
  const AIM_BASE_R  = 72; // 더 큰 반지름
  const aimJoyState = {dx:0, dy:0, active:false, id:-1};
  let   aimFireInterval = null;

  function aimJoyMove(cx, cy, ox, oy){
    let dx=cx-ox, dy=cy-oy;
    const dist=Math.hypot(dx,dy);
    const clamped=Math.min(dist,AIM_BASE_R);
    const nx=dist>0?dx/dist*clamped:0;
    const ny=dist>0?dy/dist*clamped:0;
    aimStick.style.transform=`translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
    aimJoyState.dx=nx/AIM_BASE_R;
    aimJoyState.dy=ny/AIM_BASE_R;
    // 조이스틱 방향으로 즉시 조준 (데드존 15%)
    if(player&&player.alive&&dist>AIM_BASE_R*0.15){
      player.facing=Math.atan2(dy,dx);
      if(gameRunning){
        const psx=player.x-camX, psy=player.y-camY;
        mouse.x=psx+Math.cos(player.facing)*130;
        mouse.y=psy+Math.sin(player.facing)*130;
      }
    }
  }

  function startFiring(){
    // 즉시 첫 발사
    if(gameRunning&&player&&player.alive) doAttack();
    // 연사 (100ms 간격)
    if(aimFireInterval) clearInterval(aimFireInterval);
    aimFireInterval=setInterval(()=>{
      if(gameRunning&&player&&player.alive){
        if(aimJoyState.dx||aimJoyState.dy)
          player.facing=Math.atan2(aimJoyState.dy,aimJoyState.dx);
        doAttack();
      }
    },180);
    aimBase.classList.add('firing');
    const wp=WEAPONS&&WEAPONS[player&&player.weapon];
    if(aimStick) aimStick.textContent=wp?wp.emoji:'🔫';
  }

  function stopFiring(){
    if(aimFireInterval){ clearInterval(aimFireInterval); aimFireInterval=null; }
    aimBase.classList.remove('firing');
  }

  aimJZone.addEventListener('touchstart',e=>{
    e.preventDefault();
    const t=e.changedTouches[0];
    const r=aimJZone.getBoundingClientRect();
    aimJoyState.id=t.identifier; aimJoyState.active=true;
    aimJoyMove(t.clientX,t.clientY,r.left+r.width/2,r.top+r.height/2);
    startFiring();
  },{passive:false});

  aimJZone.addEventListener('touchmove',e=>{
    e.preventDefault();
    for(const t of e.changedTouches){
      if(t.identifier!==aimJoyState.id) continue;
      const r=aimJZone.getBoundingClientRect();
      aimJoyMove(t.clientX,t.clientY,r.left+r.width/2,r.top+r.height/2);
    }
  },{passive:false});

  function aimJoyEnd(e){
    e.preventDefault();
    for(const t of e.changedTouches){
      if(t.identifier!==aimJoyState.id) continue;
      aimJoyState.active=false; aimJoyState.id=-1;
      aimJoyState.dx=0; aimJoyState.dy=0;
      aimStick.style.transform='translate(-50%,-50%)';
      stopFiring();
    }
  }
  aimJZone.addEventListener('touchend',   aimJoyEnd,{passive:false});
  aimJZone.addEventListener('touchcancel',aimJoyEnd,{passive:false});

  // ── 공격 버튼 ────────────────────────────────────────
  // 공격 버튼은 조준 조이스틱에 통합됨 — 이벤트 불필요
  const btnAtk = document.getElementById('btn-attack'); // 숨겨진 상태

  // ── 스킬 버튼들 ──────────────────────────────────────
  document.getElementById('m-bomb').addEventListener('touchstart', e=>{
    e.preventDefault(); doSkillBomb();
  },{passive:false});
  document.getElementById('m-shield').addEventListener('touchstart', e=>{
    e.preventDefault(); doSkillShield();
  },{passive:false});
  document.getElementById('m-thunder').addEventListener('touchstart', e=>{
    e.preventDefault(); doSkillThunder();
  },{passive:false});
  // 대시 버튼
  const _mDash=document.getElementById('m-dash');
  if(_mDash) _mDash.addEventListener('touchstart',e=>{e.preventDefault();doDash();},{passive:false});
}

// 조이스틱 입력을 키보드 입력에 합산
function getMobileInput(){
  if(!mobileActive || !joyState.active) return {up:false,down:false,left:false,right:false};
  const deadzone = 0.25;
  return {
    up:    joyState.dy < -deadzone,
    down:  joyState.dy >  deadzone,
    left:  joyState.dx < -deadzone,
    right: joyState.dx >  deadzone,
  };
}

// 모바일 쿨다운 HUD 업데이트
function updateMobileSkillHUD(){
  if(!mobileActive) return;
  // 멀티모드: Date.now() 기반 쿨다운 계산
  let bombCd=skillCd.bomb, shieldCd=skillCd.shield, thunderCd=skillCd.thunder;
  if(multiMode){
    const now=Date.now();
    bombCd    = Math.max(0, Math.ceil((6000-(now-(window._multiLastBomb||0)))/1000*60));
    shieldCd  = Math.max(0, Math.ceil((8000-(now-(window._multiLastShield||0)))/1000*60));
    thunderCd = Math.max(0, Math.ceil((5000-(now-(window._multiLastThunder||0)))/1000*60));
  }
  const skills = [
    {id:'m-bomb',    cdId:'m-cd-bomb',    cd:bombCd,    max:CD_BOMB},
    {id:'m-shield',  cdId:'m-cd-shield',  cd:shieldCd,  max:CD_SHIELD},
    {id:'m-thunder', cdId:'m-cd-thunder', cd:thunderCd, max:CD_THUNDER},
  ];
  skills.forEach(s=>{
    const el  = document.getElementById(s.id);
    const cdEl= document.getElementById(s.cdId);
    if(!el||!cdEl) return;
    if(s.cd<=0){
      el.className='m-skill-btn m-ready';
      cdEl.textContent='준비';
    } else {
      el.className='m-skill-btn';
      cdEl.textContent=(s.cd/60).toFixed(1)+'s';
    }
  });
  // 조준 조이스틱 스틱에 무기 이모지 표시
  const wp = WEAPONS&&WEAPONS[player&&player.weapon]||{emoji:'🔫'};
  const aimSt = document.getElementById('aim-joystick-stick');
  if(aimSt&&!aimJoyState.active) aimSt.textContent = wp.emoji||'🔫';
}

// ══════════════════════════════════════════════════════
//  캐릭터 선택 시스템
// ══════════════════════════════════════════════════════
const CHAR_LIST = [
  { id:'photo0', name:'자는 남자', desc:'숙면 전사',   color:'#88aaff' },
  { id:'photo1', name:'부산 남자', desc:'해양대 용사', color:'#44dd88' },
  { id:'photo2', name:'안경 남자', desc:'뿜뿜 마법사', color:'#ffaa44' },
  { id:'photo3', name:'입벌린 남자', desc:'입술 전사',  color:'#ff6688' },
  { id:'photo4', name:'눌린 남자', desc:'압박 헌터',   color:'#cc88ff' },
];

// 커스텀 캐릭터 드로우 함수 맵
const CUSTOM_CHAR_DRAW = {
  photo0: (c,x,y,sz,f,t)=>drawPhotoChar(c,'photo0',x,y,sz,'#88aaff',t),
  photo1: (c,x,y,sz,f,t)=>drawPhotoChar(c,'photo1',x,y,sz,'#44dd88',t),
  photo2: (c,x,y,sz,f,t)=>drawPhotoChar(c,'photo2',x,y,sz,'#ffaa44',t),
  photo3: (c,x,y,sz,f,t)=>drawPhotoChar(c,'photo3',x,y,sz,'#ff6688',t),
  photo4: (c,x,y,sz,f,t)=>drawPhotoChar(c,'photo4',x,y,sz,'#cc88ff',t),
};

let selectedChar = 'photo0';
