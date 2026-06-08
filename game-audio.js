'use strict';
function _getACtx(){
  if(!_audioCtx)_audioCtx=new(window.AudioContext||window.webkitAudioContext)();
  if(_audioCtx.state==='suspended')_audioCtx.resume();
  return _audioCtx;
}
function _tone(freq,type,dur,vol,detune,delay){
  vol=(vol||0.25)*0.45*(multiMode?0.35:1.0); // 볼륨 감소 (멀티 추가 감소)detune=detune||0;delay=delay||0;
  if(_sfxMuted)return;
  try{
    const ac=_getACtx(),o=ac.createOscillator(),g=ac.createGain();
    o.connect(g);g.connect(ac.destination);
    o.type=type;o.frequency.value=freq;o.detune.value=detune;
    const t=ac.currentTime+delay;
    g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    o.start(t);o.stop(t+dur+0.05);
  }catch(e){}
}
function _noise(dur,vol,hi,delay){
  vol=(vol||0.15)*0.45*(multiMode?0.35:1.0); // 볼륨 감소 (멀티 추가 감소)hi=hi||800;delay=delay||0;
  if(_sfxMuted)return;
  try{
    const ac=_getACtx(),sz=ac.sampleRate*dur|0;
    const buf=ac.createBuffer(1,sz,ac.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<sz;i++)d[i]=Math.random()*2-1;
    const s2=ac.createBufferSource();s2.buffer=buf;
    const fl=ac.createBiquadFilter();fl.type='highpass';fl.frequency.value=hi;
    const g=ac.createGain();
    s2.connect(fl);fl.connect(g);g.connect(ac.destination);
    const t=ac.currentTime+delay;
    g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    s2.start(t);s2.stop(t+dur+0.05);
  }catch(e){}
}
const SFX={
  shoot:function(){_tone(780,'square',0.06,0.15);_noise(0.04,0.06,2200);},
  hitMonster:function(){_tone(200,'sawtooth',0.08,0.18,-200);_noise(0.05,0.08,700);},
  hitPlayer:function(){_tone(140,'sawtooth',0.2,0.32,-200);_noise(0.1,0.18,200);_tone(90,'sine',0.25,0.18,0,0.06);},
  kill:function(){_tone(440,'square',0.04,0.18);_tone(550,'square',0.04,0.2,0,0.05);_tone(660,'square',0.09,0.22,0,0.1);},
  bossSpawn:function(){[55,70,88,110].forEach(function(f,i){_tone(f,'sawtooth',0.7,0.4,0,i*0.14);});_noise(0.35,0.22,40);_tone(220,'sine',0.9,0.28,0,0.55);},
  bossKill:function(){[880,1100,1320,1760].forEach(function(f,i){_tone(f,'square',0.25,0.28,0,i*0.1);});[220,330,440,550].forEach(function(f,i){_tone(f,'sine',0.7,0.35,0,0.45+i*0.12);});},
  explode:function(){_noise(0.45,0.38,30);_tone(75,'sawtooth',0.4,0.45,-400);_tone(55,'sine',0.55,0.35,0,0.06);},
  shield:function(){[660,880,1100].forEach(function(f,i){_tone(f,'sine',0.15,0.22,0,i*0.07);});},
  thunder:function(){_noise(0.12,0.32,3000);_tone(105,'sawtooth',0.28,0.38,-80);},
  item:function(){[523,659,784,1047].forEach(function(f,i){_tone(f,'sine',0.1,0.18,0,i*0.055);});},
  stageClear:function(){[523,659,784,1047,784,880,1047,1319].forEach(function(f,i){_tone(f,'square',0.13,0.2,0,i*0.11);});},
  gameOver:function(){[440,330,220,165,110].forEach(function(f,i){_tone(f,'sawtooth',0.4,0.28,0,i*0.22);});},
  warning:function(){_tone(920,'sine',0.04,0.07);},
  door:function(){[220,330,440].forEach(function(f,i){_tone(f,'sine',0.18,0.18,0,i*0.09);});},
  step:function(){_noise(0.035,0.03,500);},
  click:function(){_tone(440,'sine',0.05,0.09);},
   dash:function(){_noise(0.07,0.05,800);_tone(330,'sine',0.06,0.06,0,0.03);}
};
function startBGM(){
  if(_sfxMuted)return;
  stopBGM();
  try{
    const ac=_getACtx();
    _bgmGain=ac.createGain();_bgmGain.gain.value=0.055;_bgmGain.connect(ac.destination);

    // 저음 드론 베이스
    [55,82.4].forEach(function(freq){
      const o=ac.createOscillator(),g=ac.createGain();
      o.type='sawtooth';o.frequency.value=freq;g.gain.value=0.28;
      o.connect(g);g.connect(_bgmGain);o.start();_bgmOscs.push(o);
    });

    // 멜로디 패턴 (던전 분위기)
    const melody=[220,247,262,220, 196,220,165,196, 220,247,294,262, 247,220,196,165];
    const bass  =[55,55,55,55,    44,44,44,44,     55,55,55,55,    44,44,44,44];
    let beat=0;
    const BPM=108, SPB=60000/BPM;
    const rid=setInterval(function(){
      if(_sfxMuted||!_bgmGain){clearInterval(rid);return;}
      const b=beat%melody.length;
      // 멜로디
      if(beat%2===0){
        const o=ac.createOscillator(),g=ac.createGain();
        o.type='triangle';o.frequency.value=melody[b];
        const t=ac.currentTime;
        g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.38,t+0.04);
        g.gain.exponentialRampToValueAtTime(0.001,t+SPB/1000*1.8);
        o.connect(g);g.connect(_bgmGain);o.start(t);o.stop(t+SPB/1000*2);
      }
      // 킥
      if(beat%4===0){_noise(0.08,0.014,60);}
      // 하이햇
      if(beat%2===0){_noise(0.03,0.008,3500);}
      // 베이스 펄스
      if(beat%4===0){
        const o=ac.createOscillator(),g=ac.createGain();
        o.type='sine';o.frequency.value=bass[b];
        const t=ac.currentTime;
        g.gain.setValueAtTime(0.45,t);g.gain.exponentialRampToValueAtTime(0.001,t+SPB/1000*3.5);
        o.connect(g);g.connect(_bgmGain);o.start(t);o.stop(t+SPB/1000*4);
      }
      beat++;
    },SPB/2);
    _bgmOscs.push({stop:function(){clearInterval(rid);}});
  }catch(e){}
}
function stopBGM(){
  _bgmOscs.forEach(function(o){try{o.stop();}catch(e){}});
  _bgmOscs=[];
  if(_bgmGain){try{_bgmGain.disconnect();}catch(e){}_bgmGain=null;}
}
function setBGMStage(s){if(_bgmGain)_bgmGain.gain.value=0.045+Math.min(s,5)*0.008;}
function addMuteButton(){
  if(document.getElementById('mute-btn'))return;
  const btn=document.createElement('button');
  btn.id='mute-btn';btn.textContent='🔊';
  btn.style.cssText='position:fixed;bottom:16px;right:192px;z-index:20;background:#0a0c1acc;border:1px solid #2a2d50;border-radius:6px;padding:4px 10px;color:#aab;font-size:.72rem;cursor:pointer;backdrop-filter:blur(4px);opacity:.65;';
  btn.onclick=function(){
    _sfxMuted=!_sfxMuted;btn.textContent=_sfxMuted?'🔇':'🔊';
    if(_sfxMuted)stopBGM();else{SFX.click();startBGM();}
  };
  document.getElementById('game').appendChild(btn);
}


// ═══════════════════════════════════════════════════════
//  효과음 시스템 — Web Audio API 합성음
// ═══════════════════════════════════════════════════════



// ═══════════════════════════════════════════════════════
//  효과음 시스템 — Web Audio API 합성음
// ═══════════════════════════════════════════════════════



// ═══════════════════════════════════════════════════════
//  모바일 컨트롤
// ═══════════════════════════════════════════════════════
let isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
let mobileActive = false;

// 조이스틱 상태
const joyState = { dx:0, dy:0, active:false, id:-1 };
const aimState  = { x:0, y:0, active:false, id:-1 };

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

function buildCharSelectUI(){
  const container = document.getElementById('char-cards');
  if(!container) return;
  container.innerHTML='';

  CHAR_LIST.forEach(ch=>{
    // 미리보기 캔버스
    const cv = document.createElement('canvas');
    cv.width=80; cv.height=95;
    const cc = cv.getContext('2d');
    cc.fillStyle='#0d0f20';
    cc.fillRect(0,0,80,95);

    // 캐릭터 그리기
    const drawFn = CUSTOM_CHAR_DRAW[ch.id]||CUSTOM_CHAR_DRAW.player;
    // 사진 미리보기 (비동기, Image 로드 후 그리기)
    const pPhotoMap={
      photo0:'photo0', photo1:'photo1',
      photo2:'photo2', photo3:'photo3', photo4:'photo4',
    };
    const pkey=pPhotoMap[ch.id]||'photo0';
    // 즉시 그리기 시도, 실패 시 로드 후 재시도
    function renderPreview(){
      cc.clearRect(0,0,80,95);
      cc.fillStyle='#0d0f20'; cc.fillRect(0,0,80,95);
      const pimg=PHOTO_IMGS[pkey];
      if(pimg&&pimg.complete&&pimg.naturalWidth){
        cc.save(); cc.beginPath(); cc.arc(40,42,32,0,Math.PI*2); cc.clip();
        cc.drawImage(pimg,8,10,64,64); cc.restore();
        cc.beginPath(); cc.arc(40,42,32,0,Math.PI*2);
        cc.strokeStyle='rgba(255,255,255,0.3)'; cc.lineWidth=2; cc.stroke();
      } else {
        cc.fillStyle='#333'; cc.beginPath(); cc.arc(40,42,32,0,Math.PI*2); cc.fill();
      }
    }
    renderPreview();
    // 로드 완료 후 재렌더
    const pimg2=PHOTO_IMGS[pkey];
    if(pimg2&&!pimg2.complete){
      pimg2.onload=()=>renderPreview();
    }

    const card = document.createElement('div');
    card.className='char-card'+(ch.id===selectedChar?' selected':'');
    card.dataset.id=ch.id;
    card.innerHTML=`<div class="cn">${ch.name}</div><div class="ct">${ch.desc}</div>`;
    card.insertBefore(cv, card.firstChild);

    card.addEventListener('click',()=>{
      selectedChar=ch.id;
      document.querySelectorAll('.char-card').forEach(c=>c.classList.remove('selected'));
      card.classList.add('selected');
    });
    container.appendChild(card);
  });
}

// 선택된 캐릭터로 플레이어 스프라이트 교체
function applySelectedChar(){
  const drawFn = CUSTOM_CHAR_DRAW[selectedChar]||CUSTOM_CHAR_DRAW.player;
  // drawPlayerSprite 를 동적으로 교체
  window._activePlayerDraw = drawFn;
}


// ── hex → rgba 변환 헬퍼 ──────────────────────────────