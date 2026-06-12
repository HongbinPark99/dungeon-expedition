function addLog(msg,type=''){
  logEntries.unshift({msg,type});
  if(logEntries.length>20) logEntries.pop();
  const el=document.getElementById('log-list');
  el.innerHTML=logEntries.slice(0,7).map(e=>`<div class="le${e.type?' '+e.type:''}">${e.msg}</div>`).join('');
}

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
    <span style="font-size:.95rem;color:#ffd700;font-weight:bold;">💰 보유 골드: ${gold}G</span><br>
    <span style="font-size:.8rem;color:#aac">다음 스테이지 등장: ${nextPreview}</span><br>
    <span style="font-size:.8rem;color:#f84">보스: ${MEMOJI[nextBossT]||'👑'} ${nextBossL}</span>
  `;
  // 버튼을 "다음 스테이지"로 변경
  const btn=document.getElementById('retry-btn');
  btn.textContent='🛒 상점에서 강화하기';
  btn.onclick=()=>{
    ov.style.display='none';
    document.getElementById('ending').style.display='none';
    showShop(stage+1);
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
var lastT=0, accumT=0;
var FIXED_DT=1000/60; // 고정 60fps 업데이트

// ── 멀티 클라이언트 업데이트 (카메라·dash·fog) ────────