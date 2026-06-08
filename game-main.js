'use strict';
function loop(t=0){
  rafId=requestAnimationFrame(loop);
  const dt=Math.min(t-lastT, 100);
  lastT=t;

  if(multiMode){
    // 멀티: update()에서 서버 처리 부분만 스킵하고 나머지는 싱글과 동일
    update();
    draw();
    multiDrawPlayers();
    return;
  }

  accumT+=dt;
  let steps=0;
  while(accumT>=FIXED_DT && steps<3){
    update();
    accumT-=FIXED_DT;
    steps++;
  }
  draw();
}

// ── 버튼 ─────────────────────────────────────────────
document.getElementById('start-btn').addEventListener('click',()=>{
  SFX.click();
  window.playerNickname = (document.getElementById('nickname-input').value.trim()) || '용사';
  initGame();
});
// 로비 캐릭터 선택 UI
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',buildCharSelectUI);
else buildCharSelectUI();
document.getElementById('retry-btn').addEventListener('click',()=>{
  document.getElementById('ending').style.display='none';
  if(multiMode) connectMultiWs(currentServerUrl, {type:'join_room', roomId:window._lastRoomId||'', name:window.playerNickname||'용사'});
  else initGame(false);
});
document.getElementById('game').addEventListener('click',()=>canvas.focus());

// ══════════════════════════════════════════════════════
//  멀티플레이어
// ══════════════════════════════════════════════════════
let multiMode=false, multiWs=null, currentServerUrl='';
let multiState=null;
let myMultiId=null, myColorIdx=0;
const _pickedItemIds=new Set(); // 이미 픽업한 아이템 ID 추적

function setMultiStatus(msg){ document.getElementById('multi-status').textContent=msg; }
function getNickname(){ return (document.getElementById('nickname-input').value.trim())||'용사'; }
function getServerUrl(){
  const raw=(document.getElementById('server-url').value.trim()) || 'wss://dungeon-expedition.onrender.com';
  // https→wss, http→ws 자동 변환
  let url = raw.replace(/^https:/,'wss:').replace(/^http:/,'ws:');
  // wss:// 로 시작 안 하면 앞에 붙이기
  if(!url.startsWith('wss://') && !url.startsWith('ws://')) url = 'wss://'+url;
  return url;
}

// ── 방 목록 새로고침 ──────────────────────────────────
function fetchRooms(){
  const url=getServerUrl();
  setMultiStatus('방 목록 불러오는 중...');
  // WebSocket으로 방 목록 요청 (fetch 대신 - file:// 환경 호환)
  try{
    const tmpWs=new WebSocket(url);
    tmpWs.onopen=()=>{ tmpWs.send(JSON.stringify({type:'list_rooms'})); };
    tmpWs.onmessage=(e)=>{
      const msg=JSON.parse(e.data);
      if(msg.type==='room_list'){
        renderRoomList(msg.rooms||[]);
        setMultiStatus(msg.rooms&&msg.rooms.length>0?'':'현재 열린 방이 없습니다');
        tmpWs.close();
      }
    };
    tmpWs.onerror=()=>{ setMultiStatus('❌ 서버 연결 실패. URL을 확인하세요.'); renderRoomList([]); };
    setTimeout(()=>{ if(tmpWs.readyState!==3) tmpWs.close(); },5000);
  }catch(e){
    setMultiStatus('❌ '+e.message);
    renderRoomList([]);
  }
}

function renderRoomList(list){
  const el=document.getElementById('room-list');
  if(list.length===0){
    el.innerHTML='<div style="font-size:.68rem;color:#445;text-align:center;padding:10px;">열린 방이 없습니다. 방을 만들어 보세요!</div>';
    return;
  }
  el.innerHTML=list.map(r=>`
    <div style="display:flex;justify-content:space-between;align-items:center;
      background:#0d0f20;border:1px solid #2a2d50;border-radius:8px;padding:8px 12px;">
      <div>
        <span style="color:#d4a832;font-size:.8rem;font-weight:700;">${r.name}</span>
        <span style="color:#556;font-size:.65rem;margin-left:8px;">${r.players}/${r.max}명</span>
        <span style="color:#667;font-size:.6rem;margin-left:6px;">👑${r.hostName||''}</span>
      </div>
      ${r.players>=r.max
        ? '<span style="font-size:.65rem;color:#f44;">방 가득참</span>'
        : `<button onclick="joinRoom('${r.id}')"
            style="background:linear-gradient(135deg,#2a6,#4b8);color:#fff;border:none;
            border-radius:6px;padding:5px 14px;font-size:.75rem;cursor:pointer;">참여</button>`
      }
    </div>
  `).join('');
}

document.getElementById('refresh-rooms-btn').addEventListener('click', fetchRooms);

// ── 방 만들기 ─────────────────────────────────────────
document.getElementById('create-room-btn').addEventListener('click',()=>{
  window.playerNickname=getNickname();
  const url=getServerUrl();
  if(!url){ setMultiStatus('❌ 서버 URL을 입력해주세요'); return; }
  const roomName=(document.getElementById('room-name-input').value.trim())||(window.playerNickname+'의 방');
  connectMultiWs(url, {type:'create_room', name:window.playerNickname, roomName, charId:selectedChar||'photo0'});
});

// ── 방 참여 ───────────────────────────────────────────
function joinRoom(roomId){
  window.playerNickname=getNickname();
  const url=getServerUrl();
  if(!url){ setMultiStatus('❌ 서버 URL을 입력해주세요'); return; }
  window._lastRoomId=roomId;
  connectMultiWs(url, {type:'join_room', roomId:roomId, name:window.playerNickname, charId:selectedChar||'photo0'});
}

// ── WebSocket 연결 ────────────────────────────────────
function connectMultiWs(url, joinMsg){
  currentServerUrl=url;
  setMultiStatus('접속 중...');
  if(multiWs){ try{multiWs.close();}catch(e){} }
  multiWs=new WebSocket(url);
  multiWs.onopen=()=>{
    setMultiStatus('연결됨! 방 입장 중...');
    multiWs.send(JSON.stringify(joinMsg));
  };
  multiWs.onerror=()=>setMultiStatus('❌ 연결 실패. URL을 확인해주세요.');
  multiWs.onclose=()=>{ if(multiMode) setMultiStatus('연결 끊김'); multiMode=false; };
  multiWs.onmessage=(e)=>{
    const msg=JSON.parse(e.data);

    if(msg.type==='full'){ setMultiStatus('❌ 방이 가득 찼습니다 (최대 3인)'); multiWs.close(); return; }
    if(msg.type==='error'){ setMultiStatus('❌ '+msg.msg); return; }

    // ── 방 입장 완료 → 대기실 표시 ──
    if(msg.type==='init'){
      myMultiId=msg.pid;
      myColorIdx=msg.colorIdx;
      multiMode=true;
      window._lastRoomId=msg.roomId;
      window._isHost=msg.isHost;
      // charId 맵 초기화 + 내 캐릭터 등록
      window._charIdMap = window._charIdMap || {};
      window._multiCamInit = false;
      window._multiLastAttack=0; window._multiLastBomb=0;
      window._multiLastShield=0; window._multiLastThunder=0;
      window._multiLastDash=0;
      window._charIdMap[msg.pid] = msg.charId || selectedChar || 'photo0';

      // 맵 데이터 미리 저장
      tiles=new Uint8Array(msg.tiles);
      MAP_W=msg.mapW; MAP_H=msg.mapH;
      COLS=msg.cols||Math.round(MAP_W/TILE);
      ROWS=msg.rows||Math.round(MAP_H/TILE);
      explored=new Uint8Array(COLS*ROWS);
      bossArena=msg.bossArena;

      // 로비 숨기고 대기실 표시
      document.getElementById('lobby').style.display='none';
      document.getElementById('waiting-screen').style.display='flex';
      document.getElementById('waiting-room-name').textContent=`🏠 ${msg.roomName}`;
      renderWaitingHostArea(msg.isHost);
      return;
    }

    // ── 대기실 참가자 목록 업데이트 ──
    if(msg.type==='waiting'){
      // 모든 플레이어 charId 맵 업데이트
      window._charIdMap = window._charIdMap || {};
      window._multiCamInit = false;
      window._multiLastAttack=0; window._multiLastBomb=0;
      window._multiLastShield=0; window._multiLastThunder=0;
      window._multiLastDash=0;
      if(msg.players) msg.players.forEach(p=>{ if(p.charId) window._charIdMap[p.id]=p.charId; });
      renderWaitingPlayers(msg.players, msg.hostId);
      renderWaitingHostArea(msg.hostId===myMultiId);
      return;
    }

    // ── 게임 시작 ──
    if(msg.type==='game_start'){
      document.getElementById('waiting-screen').style.display='none';
      document.getElementById('game').style.display='block';
      document.getElementById('ending').style.display='none';
      // 맵 데이터 (서버에서 받은 값으로 정확히 설정)
      if(msg.tiles){ tiles=new Uint8Array(msg.tiles); }
      MAP_W=msg.mapW||MAP_W; MAP_H=msg.mapH||MAP_H;
      COLS=msg.cols||Math.round(MAP_W/TILE);
      ROWS=msg.rows||Math.round(MAP_H/TILE);
      if(msg.bossArena) bossArena=msg.bossArena;
      // 필수 변수 전부 초기화
      explored      = new Uint8Array(COLS*ROWS);
      multiState    = null;
      particles     = [];
      attackFx      = [];
      dangerZonesFx = [];
      logEntries    = [];
      screenShake   = 0;
      bullets       = [];
      bombs         = [];
      items         = [];
      _pickedItemIds.clear();
      skillCd.bomb=0; skillCd.shield=0; skillCd.thunder=0;
      shieldActive=0;
      // camX, camY는 첫 state에서 점프하므로 리셋 안 함
      tick=0;
      window._fog2=null; window._fog2C=null;
      window._charIdMap = window._charIdMap || {};
      window._multiCamInit = false;
      window._multiLastAttack=0; window._multiLastBomb=0;
      window._multiLastShield=0; window._multiLastThunder=0;
      window._multiLastDash=0;
      // BGM 시작 (싱글과 동일)
      startBGM(); setBGMStage(1);
      if(_bgmGain) _bgmGain.gain.value=0.035; // 멀티 BGM
      addMuteButton();
      // HUD 세팅
      updateMultiHUD([]);
      // 루프 시작
      if(rafId){ cancelAnimationFrame(rafId); rafId=null; }
      loop();
      return;
    }

    // ── 게임 상태 수신 ──
    if(msg.type==='state'){
      multiState=msg;

      // charId 맵 갱신
      window._charIdMap = window._charIdMap || {};
      if(msg.players) msg.players.forEach(p=>{ if(p.charId) window._charIdMap[p.id]=p.charId; });

      // ── 싱글 전역변수에 서버 상태 직접 주입 ──
      const me=msg.players&&msg.players.find(p=>p.id===myMultiId);

      // 내 플레이어 상태 → player 전역변수에 주입
      if(me){
        if(!player) player={x:me.x,y:me.y,hp:me.hp,maxHp:me.maxHp,alive:me.alive,
          iframes:me.iframes,shieldActive:me.shieldActive||0,facing:me.facing||0,
          attackCd:0,dashCd:0,dashVx:0,dashVy:0,dashFrames:0,
          speedBoost:0,weapon:'sword',weaponAmmo:{}};
        // 위치: 서버와 너무 멀리 차이나면(>80px) 보정, 아니면 예측값 유지
        const posDiff=Math.hypot(player.x-me.x, player.y-me.y);
        if(posDiff>80 || !player.alive){
          player.x=me.x; player.y=me.y; // 서버 위치로 snap
        } else if(posDiff>20){
          player.x+=(me.x-player.x)*0.3; // 부드럽게 보정
          player.y+=(me.y-player.y)*0.3;
        }
        // HP/상태는 서버 값 그대로
        player.hp=me.hp; player.maxHp=me.maxHp;
        player.alive=me.alive;
        player.iframes=me.iframes;
        player.shieldActive=me.shieldActive||0;
        if(!player.charId) player.charId=me.charId||(window._charIdMap&&window._charIdMap[me.id])||selectedChar||'photo0';
      }

      // 몬스터 전역변수 주입 (싱글 draw가 그대로 렌더)
      if(msg.monsters){
        monsters=(msg.monsters||[]).map(m=>({
          ...m, phase:0, warnPhase:false, attackCd:m.cdMax||0,
          warn:120, attackStyle:m.attackStyle||'fill_circle', aimAngle:0,
        }));
      }

      // 아이템 전역변수 주입
      // 픽업한 아이템 제외하고 주입
      if(msg.items) items=(msg.items||[])
        .filter(it=>!_pickedItemIds.has(it.id))
        .map(it=>({...it,pulse:it.pulse||0,life:600}));

      // 총알 렌더용 주입 (판정은 서버)
      if(msg.bullets) bullets=(msg.bullets||[]).map(b=>({
        x:b.x,y:b.y,vx:Math.cos(b.angle||0)*2,vy:Math.sin(b.angle||0)*2,
        angle:b.angle||0,dist:0,alive:true,isMob:b.isMob,
        col:b.col||'#f44',len:24,w:4,dmgOverride:0,pierce:false,range:9999,
      }));

      // 스테이지/킬 동기화
      if(msg.stage) stage=msg.stage;
      kills=msg.kills||0;
      totalKills=msg.totalKills||0;
      gameRunning=true;
      bossSpawned=msg.bossSpawned||false;

      // 카메라 (첫 state 시 즉시 점프)
      if(me && !window._multiCamInit){
        camX=me.x-canvas.width/2;
        camY=me.y-canvas.height/2;
        camX=Math.max(0,Math.min(MAP_W-canvas.width,camX));
        camY=Math.max(0,Math.min(MAP_H-canvas.height,camY));
        window._multiCamInit=true;
      }

      // fog 탐색 업데이트
      msg.players.forEach(p=>{
        if(!explored) return;
        const r=Math.ceil(SIGHT_R/TILE)+1;
        const cx=p.x/TILE|0, cy=p.y/TILE|0;
        for(let dy2=-r;dy2<=r;dy2++) for(let dx2=-r;dx2<=r;dx2++){
          const cc=cx+dx2, rr=cy+dy2;
          if(cc>=0&&cc<COLS&&rr>=0&&rr<ROWS) explored[rr*COLS+cc]=1;
        }
      });

      // 피격 사운드
      if(window._prevMyHp!==undefined && me && me.hp<window._prevMyHp){
        try{_getACtx();SFX.hitPlayer();}catch(e){}
      }
      window._prevMyHp=me?me.hp:window._prevMyHp;

      // HUD 업데이트
      updateMultiHUD(msg.players);
      return;
    }

    if(msg.type==='boss_spawn'){showAlert('👑 보스 등장!');try{_getACtx();SFX.bossSpawn();}catch(e){}}
    if(msg.type==='game_won'){showEnding(true);}
    if(msg.type==='game_over'){gameRunning=false;if(player)player.alive=false;showEnding(false);}
    if(msg.type==='stage_clear'){
      stage=msg.stage||stage;
      showStageCleared();
      startBGM(); setBGMStage(stage);
    }
    if(msg.type==='player_leave') addLog(`🚪 ${msg.name} 퇴장 (${msg.count}/3명)`);
    if(msg.type==='attack_fx') attackFx.push({x:msg.x,y:msg.y,r:68,life:14,pid:msg.pid});
    if(msg.type==='thunder_fx') dangerZonesFx.push({x:msg.x,y:msg.y,r:msg.r,life:25,col:'#aaf',type:'thunder'});
  };
}

// ── 대기실 UI 함수들 ──────────────────────────────────
function renderWaitingPlayers(players, hostId){
  const el=document.getElementById('waiting-players');
  if(!el) return;
  const PCOLORS_W=['#44aaff','#ff6688','#44dd88','#ffaa44','#cc88ff'];
  el.innerHTML=players.map(p=>`
    <div style="display:flex;align-items:center;gap:10px;padding:6px 10px;
      background:#0d0f20;border-radius:8px;border:1px solid ${p.id===myMultiId?'#d4a832':'#2a2d50'}">
      <span style="width:10px;height:10px;border-radius:50%;background:${PCOLORS_W[p.colorIdx]||'#4af'};display:inline-block;flex-shrink:0;"></span>
      <span style="color:${p.id===myMultiId?'#d4a832':'#ccd'};font-size:.85rem;">${p.name}</span>
      ${p.id===hostId?'<span style="font-size:.65rem;color:#f84;margin-left:auto;">👑 방장</span>':''}
      ${p.id===myMultiId&&p.id!==hostId?'<span style="font-size:.65rem;color:#5a8;margin-left:auto;">나</span>':''}
    </div>
  `).join('');
}

function renderWaitingHostArea(isHost){
  const el=document.getElementById('waiting-host-area');
  if(!el) return;
  if(isHost){
    el.innerHTML=`
      <button id="start-game-btn" style="background:linear-gradient(135deg,#d4a832,#f0c84a);
        color:#111;border:none;border-radius:10px;padding:12px 40px;
        font-family:'Black Han Sans',sans-serif;font-size:1.1rem;letter-spacing:3px;
        cursor:pointer;box-shadow:0 4px 20px #d4a83244;">
        ▶ 게임 시작
      </button>
      <div style="font-size:.65rem;color:#556;margin-top:4px;text-align:center;">방장만 시작할 수 있어요</div>
    `;
    document.getElementById('start-game-btn').addEventListener('click',()=>{
      if(multiWs&&multiWs.readyState===1) multiWs.send(JSON.stringify({type:'start_game'}));
    });
  } else {
    el.innerHTML=`<div style="font-size:.82rem;color:#5a8;letter-spacing:1px;">⏳ 방장이 게임을 시작할 때까지 대기 중...</div>`;
  }
}

// 방 나가기
document.getElementById('waiting-leave-btn').addEventListener('click',()=>{
  if(multiWs){ try{multiWs.close();}catch(e){} }
  multiMode=false; multiState=null;
  document.getElementById('waiting-screen').style.display='none';
  document.getElementById('lobby').style.display='flex';
});

// ── 멀티 입력 전송 (매 프레임 전송 — 변경 여부 무관) ──
setInterval(()=>{
  if(!multiMode||!multiWs||multiWs.readyState!==1) return;
  const inp=buildInput();
  multiWs.send(JSON.stringify({type:'input',input:inp}));
},1000/30); // 30fps 전송 (서버는 60fps 처리)

// buildInput 함수
function buildInput(){
  let up   = !!(keys['ArrowUp']   ||keys['w']||keys['W']);
  let down = !!(keys['ArrowDown'] ||keys['s']||keys['S']);
  let left = !!(keys['ArrowLeft'] ||keys['a']||keys['A']);
  let right= !!(keys['ArrowRight']||keys['d']||keys['D']);
  // 모바일 조이스틱 입력 포함
  if(typeof joyState!=='undefined' && joyState.active){
    const dz=0.25;
    if(joyState.dy < -dz) up   =true;
    if(joyState.dy >  dz) down =true;
    if(joyState.dx < -dz) left =true;
    if(joyState.dx >  dz) right=true;
  }
  return{ up, down, left, right,
    mouseAngle: window._multiMouseAngle||player?.facing||0,
  };
}

// ── 멀티 전용 HUD ────────────────────────────────────
function updateMultiHUD(players){
  if(!players||!players.length) return;
  const cards=document.getElementById('p-cards')||document.querySelector('#hud');
  // 모든 플레이어 카드
  const pcardsEl=document.getElementById('p-cards');
  if(!pcardsEl) return;
  pcardsEl.innerHTML='';
  players.forEach((p,i)=>{
    const col=PCOLORS[p.colorIdx]||PCOLORS[0];
    const pct=Math.max(0,p.hp/p.maxHp*100);
    const isMe=p.id===myMultiId;
    pcardsEl.innerHTML+=`
      <div class="p-card${p.alive?'':' dead'}">
        <div class="p-name">
          <span class="p-dot" style="background:${col}"></span>
          ${p.name}${isMe?' ★':''}${p.alive?'':'💀'}
        </div>
        <div class="hp-track"><div class="hp-fill" style="width:${pct}%;background:${col}"></div></div>
        <div class="hp-num">${p.alive?p.hp+'/'+p.maxHp:'전투불능'}</div>
      </div>`;
  });
  // 본인 스킬 쿨다운
  const me=players.find(p=>p.id===myMultiId);
  if(me){
    const skillDefs=[
      {id:'sk0',cd:me.attackCd,max:P_CD},
      {id:'sk1',cd:me.skillCd?.bomb||0,max:CD_BOMB},
      {id:'sk2',cd:me.skillCd?.shield||0,max:CD_SHIELD},
      {id:'sk3',cd:me.skillCd?.thunder||0,max:CD_THUNDER},
    ];
    skillDefs.forEach(s=>{
      const el=document.getElementById(s.id);
      const cdEl=document.getElementById(s.id+'cd');
      if(!el||!cdEl) return;
      el.className=s.cd<=0?'skill-slot ready':'skill-slot';
      cdEl.textContent=s.cd<=0?'준비':`${(s.cd/60).toFixed(1)}s`;
    });
    // 보스 HP
    const boss=multiState?.monsters?.find(m=>m.type==='boss'&&m.alive);
    if(boss){
      document.getElementById('boss-bar').style.display='block';
      document.getElementById('boss-hp-fill').style.width=(boss.hp/boss.maxHp*100)+'%';
      document.getElementById('boss-title').textContent=
        (boss.enraged?'🔥 ':'👑 ')+'던전의 군주'+(boss.enraged?' [격노]':'');
    } else {
      document.getElementById('boss-bar').style.display='none';
    }
    document.getElementById('s-kills').textContent=multiState?.kills||0;
  }
}

// 멀티 키 입력은 doAttack/doSkill 함수에서 처리

// ── 멀티 렌더링 — update/draw 함수 분기 ──────────────
const _origUpdate=update;
const _origDraw=draw;

// update/draw 를 멀티 모드일 때 서버 상태로 대체
const PCOLORS=['#44aaff','#ff8844','#aa44ff'];
// ── 멀티: 다른 플레이어 오버레이 ─────────────────────
function multiDrawPlayers(){
  if(!multiState||!Array.isArray(multiState.players)) return;
  const PCOLORS=['#44aaff','#ff6688','#44dd88','#ffaa44','#cc88ff'];
  multiState.players.forEach(p=>{
    if(p.id===myMultiId) return; // 나는 싱글 draw()에서 이미 그림
    const sxp=p.x-camX, syp=p.y-camY;
    // 화면 밖이면 스킵
    if(sxp<-50||sxp>canvas.width+50||syp<-100||syp>canvas.height+100) return;
    ctx.save();
    const blinking=p.iframes>0&&Math.floor(tick/4)%2===0;
    // 방패 링
    if(p.shieldActive>0){
      const sp2=0.8+0.2*Math.sin(tick*0.2);
      ctx.globalAlpha=0.55*sp2;
      ctx.strokeStyle='#88eeff';ctx.lineWidth=4;
      ctx.shadowColor='#88eeff';ctx.shadowBlur=14;
      ctx.beginPath();ctx.arc(sxp,syp,26,0,Math.PI*2);ctx.stroke();
      ctx.shadowBlur=0;
    }
    ctx.globalAlpha=!p.alive?0.3:blinking?0.45:1;
    ctx.shadowColor=PCOLORS[p.colorIdx]||'#4af';
    ctx.shadowBlur=10;
    // 캐릭터 그리기 (charId 기반)
    const cid=p.charId||(window._charIdMap&&window._charIdMap[p.id])||'photo0';
    const photoMap={player:'ferris_front',photo0:'photo0',photo1:'photo1',photo2:'photo2',photo3:'photo3',photo4:'photo4'};
    const key=photoMap[cid]||cid||'photo0';
    window._drawingPid=p.id;
    drawPhotoChar(ctx,key,sxp,syp,26,'#1a1a2a',blinking&&!p.alive);
    window._drawingPid=null;
    ctx.shadowBlur=0;ctx.globalAlpha=1;
    // 이름 + HP바
    const pname=p.name||'플레이어';
    ctx.fillStyle=PCOLORS[p.colorIdx]||'#aaddff';
    ctx.font='bold 10px Noto Sans KR';
    ctx.textAlign='center';ctx.textBaseline='bottom';
    ctx.fillText(pname,sxp,syp-22);
    const bw=36;
    ctx.fillStyle='#000a';ctx.fillRect(sxp-bw/2-1,syp-21,bw+2,6);
    ctx.fillStyle=PCOLORS[p.colorIdx]||'#44aaff';
    ctx.fillRect(sxp-bw/2,syp-20,bw*(Math.max(0,p.hp)/p.maxHp),4);
    ctx.restore();
  });
  // 미니맵에 다른 플레이어 표시
  if(typeof drawMinimap2==='function') drawMinimap2(multiState.players);
}

function drawMinimap2(players){
  const mW=mmCv.width,mH=mmCv.height;
  const scX=mW/MAP_W,scY=mH/MAP_H;
  mmCtx.fillStyle='#05080f';mmCtx.fillRect(0,0,mW,mH);
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    if(!explored[r*COLS+c]) continue;
    mmCtx.fillStyle=tiles[r*COLS+c]===1?'#2a2d50':'#191c36';
    mmCtx.fillRect(c*TILE*scX|0,r*TILE*scY|0,Math.ceil(TILE*scX+.5),Math.ceil(TILE*scY+.5));
  }
  if(bossArena&&explored[Math.floor(bossArena.y/TILE)*COLS+Math.floor(bossArena.x/TILE)]){
    const pulse=.5+.5*Math.sin(tick*.04);mmCtx.strokeStyle=`rgba(255,68,0,${pulse})`;mmCtx.lineWidth=1.5;
    mmCtx.strokeRect(bossArena.x*scX,bossArena.y*scY,bossArena.w*scX,bossArena.h*scY);
  }
  players.forEach(p=>{
    mmCtx.fillStyle=p.id===myMultiId?'#fff':PCOLORS[p.colorIdx]||'#fff';
    mmCtx.beginPath();mmCtx.arc(p.x*scX,p.y*scY,3,0,Math.PI*2);mmCtx.fill();
  });
}

// 메인 루프 (통합됨)
// rafId 재시작 방지
if(rafId) cancelAnimationFrame(rafId);
rafId=null;

// 포커스
canvas.setAttribute('tabindex','0');
document.getElementById('game').addEventListener('click',()=>canvas.focus());

// ═══════════════════════════════════════════════════════
//  상점 시스템
// ═══════════════════════════════════════════════════════
// 스테이지별 상점 아이템 풀
function getShopItems(stg){
  const base=[
    { id:'hp30',    name:'소형 포션',  emoji:'🧪', desc:'HP +30',           cost:15,  type:'consumable' },
    { id:'hp60',    name:'대형 포션',  emoji:'❤️', desc:'HP +60',           cost:28,  type:'consumable' },
    { id:'maxhp',   name:'체력 강화',  emoji:'💪', desc:'최대 HP +20',       cost:50,  type:'upgrade'    },
    { id:'bomb',    name:'폭탄 충전',  emoji:'💣', desc:'폭탄 쿨 초기화',    cost:20,  type:'consumable' },
    { id:'shield',  name:'방패 충전',  emoji:'🛡', desc:'방패 쿨 초기화',    cost:20,  type:'consumable' },
    { id:'thunder', name:'번개 충전',  emoji:'⚡', desc:'번개 쿨 초기화',    cost:20,  type:'consumable' },
    { id:'speed2',  name:'부스트',     emoji:'👟', desc:'속도 +30초',        cost:25,  type:'consumable' },
  ];
  const stage2plus=[
    { id:'weapon_pistol',  name:'권총',      emoji:'🔫', desc:'빠른 단발',  cost:40, type:'weapon' },
    { id:'weapon_shotgun', name:'산탄총',    emoji:'💥', desc:'5발 산탄',   cost:55, type:'weapon' },
    { id:'weapon_smg',     name:'기관단총',  emoji:'⚡', desc:'고속 연사',  cost:60, type:'weapon' },
  ];
  const stage3plus=[
    { id:'weapon_rifle',   name:'저격총',    emoji:'🎯', desc:'관통·고뎀',  cost:80,  type:'weapon' },
    { id:'weapon_laser',   name:'레이저',    emoji:'🔴', desc:'관통 레이저', cost:85, type:'weapon' },
    { id:'cd_reduce',      name:'쿨다운 감소',emoji:'⏱',desc:'스킬CD -20%',cost:70, type:'upgrade' },
  ];
  const stage4plus=[
    { id:'weapon_cannon',  name:'캐논',      emoji:'💣', desc:'초고데미지',  cost:100, type:'weapon' },
    { id:'weapon_twin',    name:'쌍권총',    emoji:'🔫', desc:'2발 동시',    cost:90,  type:'weapon' },
    { id:'atk_up',         name:'공격력 강화',emoji:'⚔', desc:'ATK +10',    cost:80,  type:'upgrade' },
  ];
  let pool=[...base];
  if(stg>=2) pool=[...pool,...stage2plus];
  if(stg>=3) pool=[...pool,...stage3plus];
  if(stg>=4) pool=[...pool,...stage4plus];
  // 랜덤 6~8개 선택
  const shuffled=pool.sort(()=>Math.random()-.5);
  return shuffled.slice(0,Math.min(8,shuffled.length));
}
const SHOP_ITEMS = [
  { id:'hp30',    name:'소형 포션',    emoji:'🧪', desc:'HP +30 회복',      cost:15,  type:'consumable' },
  { id:'hp60',    name:'대형 포션',    emoji:'❤️', desc:'HP +60 회복',      cost:28,  type:'consumable' },
  { id:'maxhp',   name:'체력 강화',    emoji:'💪', desc:'최대 HP +20',       cost:50,  type:'upgrade'    },
  { id:'bomb',    name:'폭탄 충전',    emoji:'💣', desc:'폭탄 쿨 초기화',   cost:20,  type:'consumable' },
  { id:'shield',  name:'방패 충전',    emoji:'🛡', desc:'방패 쿨 초기화',   cost:20,  type:'consumable' },
  { id:'thunder', name:'번개 충전',    emoji:'⚡', desc:'번개 쿨 초기화',   cost:20,  type:'consumable' },
  { id:'pistol',  name:'권총',         emoji:'🔫', desc:'빠른 단발 권총',    cost:30,  type:'weapon', wid:'pistol'  },
  { id:'shotgun', name:'산탄총',       emoji:'💥', desc:'5발 산탄',          cost:45,  type:'weapon', wid:'shotgun' },
  { id:'rifle',   name:'저격 소총',    emoji:'🎯', desc:'관통 고데미지',     cost:60,  type:'weapon', wid:'rifle'   },
  { id:'smg',     name:'기관단총',     emoji:'⚡', desc:'초고속 연사',        cost:50,  type:'weapon', wid:'smg'     },
  { id:'laser',   name:'레이저',       emoji:'🔴', desc:'고속 관통',          cost:70,  type:'weapon', wid:'laser'   },
  { id:'cannon',  name:'캐논',         emoji:'💣', desc:'초고데미지 단발',    cost:80,  type:'weapon', wid:'cannon'  },
  { id:'twin',    name:'쌍권총',       emoji:'🔫', desc:'2발 동시 발사',      cost:55,  type:'weapon', wid:'twin'    },
  { id:'speed2',  name:'스피드 업',    emoji:'👟', desc:'속도 부스트 +3초',  cost:25,  type:'consumable' },
];

let _shopNextStage=1;

function showShop(nextStage){
  _shopNextStage=nextStage;
  const scr=document.getElementById('shop-screen');
  if(!scr) return;
  const gd=document.getElementById('shop-gold-display');
  const si=document.getElementById('shop-items');
  const stageLabel=document.getElementById('shop-stage-label');
  if(stageLabel) stageLabel.textContent=`스테이지 ${nextStage} 준비 — 골드로 강화하세요`;
  if(gd) gd.textContent=`💰 ${gold} 골드`;

  // 스테이지별 아이템 풀
  const shopPool=getShopItems(nextStage);
  // 현재 무기 제외, 살 수 있는 아이템 표시
  if(si) si.innerHTML=shopPool.map(item=>{
    const canAfford=gold>=item.cost;
    const isCurrentWeapon=item.type==='weapon'&&player&&player.weapon===item.wid;
    return `<div style="background:#0b0d1e;border:1px solid ${canAfford&&!isCurrentWeapon?'#2a4050':'#1a1d30'};
      border-radius:10px;padding:12px 14px;text-align:center;width:130px;
      opacity:${canAfford&&!isCurrentWeapon?1:0.5};">
      <div style="font-size:1.6rem;">${item.emoji}</div>
      <div style="font-size:.75rem;color:#d4a832;margin:4px 0;">${item.name}</div>
      <div style="font-size:.6rem;color:#667;margin-bottom:8px;">${item.desc}</div>
      <div style="font-size:.7rem;color:#f0c84a;margin-bottom:6px;">💰 ${item.cost}</div>
      ${isCurrentWeapon
        ? '<div style="font-size:.65rem;color:#4af;">장착 중</div>'
        : `<button onclick="buyShopItem('${item.id}')"
            style="background:${canAfford?'linear-gradient(135deg,#2a6,#4b8)':'#333'};
            color:${canAfford?'#fff':'#666'};border:none;border-radius:6px;
            padding:4px 12px;font-size:.72rem;cursor:${canAfford?'pointer':'not-allowed'};">
            구매
          </button>`
      }
    </div>`;
  }).join('')||'<div style="color:#667">구매 가능한 아이템 없음</div>';

  scr.style.display='flex';
  SFX.door&&SFX.door();
}

function buyShopItem(itemId){
  const item=SHOP_ITEMS.find(i=>i.id===itemId);
  if(!item||gold<item.cost) return;
  gold-=item.cost;
  SFX.item();

  if(item.type==='consumable'){
    if(item.id==='hp30'){ player.hp=Math.min(player.maxHp,player.hp+30); }
    if(item.id==='hp60'){ player.hp=Math.min(player.maxHp,player.hp+60); }
    if(item.id==='bomb')  skillCd.bomb=0;
    if(item.id==='shield') skillCd.shield=0;
    if(item.id==='thunder') skillCd.thunder=0;
    if(item.id==='speed2') player.speedBoost=(player.speedBoost||0)+180;
    addLog(`🛒 ${item.name} 구매!`,'win');
  } else if(item.type==='upgrade'){
    if(item.id==='maxhp'){ player.maxHp+=20; player.hp=Math.min(player.maxHp,player.hp+20); }
    addLog(`⬆️ ${item.name} 업그레이드!`,'win');
  } else if(item.type==='weapon'){
    player.weapon=item.wid;
    addLog(`🔫 ${item.name} 장착!`,'win');
  }

  // 골드/HUD 즉시 갱신
  document.getElementById('shop-gold-display').textContent=`💰 ${gold} 골드`;
  const sg=document.getElementById('s-gold'); if(sg) sg.textContent=gold;
  const hn=document.getElementById('hn0');
  const hf=document.getElementById('hf0');
  if(hn) hn.textContent=Math.max(0,player.hp)+' / '+player.maxHp;
  if(hf) hf.style.width=Math.max(0,player.hp/player.maxHp*100)+'%';
  // 상점 새로고침
  showShop(_shopNextStage);
}

const _shopCloseBtn=document.getElementById('shop-close-btn');
if(_shopCloseBtn) _shopCloseBtn.addEventListener('click',()=>{
  const shopScreen=document.getElementById('shop-screen');
  if(shopScreen) shopScreen.style.display='none';
  stage=_shopNextStage;
  if(player) player.hp=Math.min(player.maxHp, player.hp+40);
  initGame(true);
});

