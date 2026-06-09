// updateMultiClient는 update()로 통합됨 - 호환성 유지용 빈 함수
function updateMultiClient(){ /* 통합됨 - update() 사용 */ }


function loop(t=0){
  rafId=requestAnimationFrame(loop);
  const dt=Math.min(t-lastT, 100);
  lastT=t;

  // 싱글/멀티 공통: update() → draw()
  accumT+=dt;
  let steps=0;
  while(accumT>=FIXED_DT && steps<3){
    try{ update(); }catch(e){ console.warn('[update]',e); }
    accumT-=FIXED_DT;
    steps++;
  }
  try{ draw(); }catch(e){ console.warn('[draw]',e); }
  if(multiMode){ try{ multiDrawPlayers(); }catch(e){} }
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
  if(multiMode && currentServerUrl) connectMultiWs(currentServerUrl, {type:'join_room', roomId:window._lastRoomId||'', name:window.playerNickname||'용사'});
  else initGame(false);
});
document.getElementById('game').addEventListener('click',()=>canvas.focus());

// ══════════════════════════════════════════════════════
//  멀티플레이어
// ══════════════════════════════════════════════════════

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
    wsSend(joinMsg);
    // heartbeat - 30초마다 ping 전송으로 연결 유지
    if(window._heartbeatId) clearInterval(window._heartbeatId);
    window._heartbeatId=setInterval(()=>{
      if(multiWs&&multiWs.readyState===1){
        try{ multiWs.send(JSON.stringify({type:'ping'})); }catch(e){}
      } else {
        clearInterval(window._heartbeatId);
      }
    }, 25000);
  };
  multiWs.onerror=(e)=>{
    setMultiStatus('⚠️ 서버 연결 오류 (게임은 계속 진행됩니다)');
    console.warn('[WS] error:', e);
    // 에러가 나도 게임 루프는 유지 - multiMode는 onclose에서만 해제
  };
  multiWs.onclose=()=>{
    if(multiMode){
      setMultiStatus('⚠️ 연결 끊김');
      // 게임 중이면 로컬 싱글플레이로 자동 전환 (멈추지 않게)
      if(gameRunning && player && player.alive){
        multiMode=false;
        setMultiStatus('');
        addLog('🔌 서버 연결 끊김 - 싱글 모드로 전환','dmg');
        // 싱글 update 루프로 전환 (loop는 이미 돌고 있음)
      } else {
        // 게임 중 아니면 3초 후 재연결 시도
        setTimeout(()=>{
          if(currentServerUrl && !multiMode){
            connectMultiWs(currentServerUrl, {type:'join_room', roomId:window._lastRoomId||'', name:window.playerNickname||'용사'});
          }
        }, 3000);
      }
    }
  };
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
        // 위치: 서버 state 그대로 따름 (서버가 대시 물리 처리)
        player.x=me.x; player.y=me.y;
        // dashFrames도 서버값 반영
        player.dashFrames=me.dashFrames||0;
        player.hp=me.hp; player.maxHp=me.maxHp;
        player.alive=me.alive;
        // iframes/dashCd는 로컬 값 유지 (서버 덮어쓰기 방지)
        if(!player.dashFrames) player.iframes=me.iframes;
        player.shieldActive=me.shieldActive||0;
        if(!player.charId) player.charId=me.charId||(window._charIdMap&&window._charIdMap[me.id])||selectedChar||'photo0';
        // 무기 동기화 (서버에서 무기 정보 오면 반영)
        if(me.weapon && WEAPONS[me.weapon]) player.weapon=me.weapon;
        window._lastMe=me; // 마지막 상태 저장
      } else if(window._lastMe && player){
        // me를 못찾아도 마지막 알려진 상태 유지 (순간 사라짐 방지)
        player.alive=player.alive; // 상태 유지
      }

      // 몬스터 전역변수 주입 (싱글 draw가 그대로 렌더)
      if(msg.monsters){
        monsters=(msg.monsters||[]).map(m=>({
          ...m, phase:0, warnPhase:false, attackCd:m.cdMax||0,
          warn:120, attackStyle:m.attackStyle||'fill_circle', aimAngle:0,
        }));
      }

      // 아이템 전역변수 주입
      // 멀티 폭탄 렌더용
      if(msg.bombs!==undefined) window._multiBombs=msg.bombs||[];
      if(msg.items){
        items=(msg.items||[]).map(it=>({...it,pulse:it.pulse||0,life:600}));
        // 서버에서 사라진 아이템은 pickedItems에서도 제거
        if(window._pickedItems){
          const serverIds=new Set(msg.items.map(i=>i.id));
          window._pickedItems.forEach(id=>{ if(!serverIds.has(id)) window._pickedItems.delete(id); });
        }
      }

      // 총알 렌더용 주입 (판정은 서버)
      if(msg.bullets) bullets=(msg.bullets||[]).map(b=>({
        x:b.x,y:b.y,vx:Math.cos(b.angle||0)*2,vy:Math.sin(b.angle||0)*2,
        angle:b.angle||0,dist:0,alive:true,isMob:b.isMob,
        col:b.col||'#f44',len:24,w:4,dmgOverride:0,pierce:false,range:9999,
      }));

      // 스테이지/킬/골드 동기화
      if(msg.stage) stage=msg.stage;
      kills=msg.kills||0;
      totalKills=msg.totalKills||0;
      if(msg.gold!=null){ gold=msg.gold; const sg=document.getElementById('s-gold'); if(sg) sg.textContent=gold; }
      gameRunning=true;
      if(msg.bossSpawned && !bossSpawned){
        bossSpawned=true;
        document.getElementById('boss-bar').style.display='block';
      }

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
    if(msg.type==='thunder_fx'){
      dangerZonesFx.push({x:msg.x,y:msg.y,r:msg.r,life:25,col:'#aaf',type:'thunder'});
      spawnParticles(msg.x,msg.y,'#ccf',12);
    }
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
      wsSend({type:'start_game'});
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

// ── 멀티 입력 전송 ────────────────────────────────────
let lastMultiInput={up:false,down:false,left:false,right:false};
setInterval(()=>{
  if(!multiMode||!multiWs||multiWs.readyState!==1) return;
  const inp=buildInput();
  if(JSON.stringify(inp)!==JSON.stringify(lastMultiInput)){
    lastMultiInput=inp;
    wsSend({type:'input',input:inp});
  }
},1000/60);

// buildInput 함수
function buildInput(){
  return{
    up:   !!(keys['ArrowUp']   ||keys['w']||keys['W']),
    down: !!(keys['ArrowDown'] ||keys['s']||keys['S']),
    left: !!(keys['ArrowLeft'] ||keys['a']||keys['A']),
    right:!!(keys['ArrowRight']||keys['d']||keys['D']),
    mouseAngle: window._multiMouseAngle||0,
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
