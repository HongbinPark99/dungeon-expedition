function getShopItems(stg){
  // tier 제한: 스테이지에 따라 등급 아이템 해금
  const maxTier = stg>=4?4 : stg>=3?3 : stg>=2?2 : 1;
  const pool = SHOP_ITEMS.filter(i=>(i.tier||1)<=maxTier);
  // 카테고리별 균형 있게 선택 (무기 2~3, 강화 2~3, 소비 3~4)
  const weapons   = pool.filter(i=>i.type==='weapon').sort(()=>Math.random()-.5).slice(0,3);
  const upgrades  = pool.filter(i=>i.type==='upgrade').sort(()=>Math.random()-.5).slice(0,3);
  const consumables=pool.filter(i=>i.type==='consumable').sort(()=>Math.random()-.5).slice(0,4);
  return [...consumables,...upgrades,...weapons];
}
const SHOP_ITEMS = [
  // 소비 아이템
  { id:'hp30',      name:'소형 포션',    emoji:'🧪', desc:'HP +30 회복',       cost:15,  type:'consumable', tier:1 },
  { id:'hp60',      name:'대형 포션',    emoji:'❤️', desc:'HP +60 회복',       cost:28,  type:'consumable', tier:1 },
  { id:'hp_full',   name:'회복 포션',    emoji:'💊', desc:'HP 완전 회복',       cost:80,  type:'consumable', tier:3 },
  { id:'bomb',      name:'폭탄 충전',    emoji:'💣', desc:'폭탄 쿨 초기화',    cost:20,  type:'consumable', tier:1 },
  { id:'shield',    name:'방패 충전',    emoji:'🛡', desc:'방패 쿨 초기화',    cost:20,  type:'consumable', tier:1 },
  { id:'thunder',   name:'번개 충전',    emoji:'⚡', desc:'번개 쿨 초기화',    cost:20,  type:'consumable', tier:1 },
  { id:'speed2',    name:'스피드 업',    emoji:'👟', desc:'속도 부스트 +3초',  cost:25,  type:'consumable', tier:1 },
  { id:'allskill',  name:'전 스킬 충전', emoji:'✨', desc:'모든 스킬 쿨 초기화',cost:55, type:'consumable', tier:2 },
  // 영구 강화
  { id:'maxhp',     name:'체력 강화',    emoji:'💪', desc:'최대 HP +20',        cost:50,  type:'upgrade', tier:1 },
  { id:'maxhp2',    name:'체력 강화 II', emoji:'❤️‍🔥',desc:'최대 HP +40',      cost:90,  type:'upgrade', tier:3 },
  { id:'atk_up',    name:'공격력 강화',  emoji:'⚔️', desc:'공격력 +10',         cost:70,  type:'upgrade', tier:2 },
  { id:'atk_up2',   name:'공격력 강화II',emoji:'🗡️', desc:'공격력 +20',         cost:120, type:'upgrade', tier:4 },
  { id:'cd_reduce', name:'쿨다운 감소',  emoji:'⏱️', desc:'스킬 CD -25%',       cost:80,  type:'upgrade', tier:3 },
  { id:'pierce_up', name:'관통 강화',    emoji:'🏹', desc:'모든 총알 관통+1',   cost:100, type:'upgrade', tier:3 },
  { id:'regen',     name:'재생 반지',    emoji:'💍', desc:'매 스테이지 HP+10 자동회복', cost:90, type:'upgrade', tier:2 },
  // 무기
  { id:'pistol',    name:'권총',         emoji:'🔫', desc:'빠른 단발',          cost:35,  type:'weapon', wid:'pistol',  tier:1 },
  { id:'shotgun',   name:'산탄총',       emoji:'💥', desc:'5발 산탄',           cost:50,  type:'weapon', wid:'shotgun', tier:2 },
  { id:'smg',       name:'기관단총',     emoji:'⚡', desc:'초고속 연사',         cost:60,  type:'weapon', wid:'smg',     tier:2 },
  { id:'rifle',     name:'저격 소총',    emoji:'🎯', desc:'관통 고데미지',       cost:75,  type:'weapon', wid:'rifle',   tier:3 },
  { id:'laser',     name:'레이저',       emoji:'🔴', desc:'고속 관통',           cost:85,  type:'weapon', wid:'laser',   tier:3 },
  { id:'twin',      name:'쌍권총',       emoji:'🔫', desc:'2발 동시 발사',       cost:70,  type:'weapon', wid:'twin',    tier:3 },
  { id:'cannon',    name:'캐논',         emoji:'💣', desc:'초고데미지 단발',     cost:100, type:'weapon', wid:'cannon',  tier:4 },
];

function showShop(nextStage){
  _shopNextStage=nextStage;
  const scr=document.getElementById('shop-screen');
  if(!scr) return;
  const gd=document.getElementById('shop-gold-display');
  const si=document.getElementById('shop-items');
  const stageLabel=document.getElementById('shop-stage-label');
  if(stageLabel) stageLabel.textContent=`스테이지 ${nextStage} 준비 — 골드로 강화하세요`;
  if(gd) gd.textContent=`💰 ${gold} 골드`;
  // HUD gold도 동기화
  const sgEl=document.getElementById('s-gold'); if(sgEl) sgEl.textContent=gold;

  // 스테이지별 아이템 풀
  const shopPool=getShopItems(nextStage);
  const tierNames=['','⭐','⭐⭐','⭐⭐⭐','👑'];
  const tierColors=['','#888','#4af','#fa0','#f44'];
  if(si) si.innerHTML=shopPool.map(item=>{
    const canAfford=gold>=item.cost;
    const isCurrentWeapon=item.type==='weapon'&&player&&player.weapon===item.wid;
    const tier=item.tier||1;
    const typeIcon=item.type==='weapon'?'🗡️':item.type==='upgrade'?'⬆️':'🧪';
    return `<div class="shop-item-new ${canAfford&&!isCurrentWeapon?'':'cant-afford'}">
      <span class="tier-badge" style="background:${tierColors[tier]}22;color:${tierColors[tier]};border:1px solid ${tierColors[tier]}44">${tierNames[tier]}</span>
      <div style="font-size:1.8rem;margin-bottom:4px;">${item.emoji}</div>
      <div style="font-size:.7rem;color:#88aacc;margin-bottom:2px;">${typeIcon} ${item.type==='weapon'?'무기':item.type==='upgrade'?'강화':'소비'}</div>
      <div style="font-size:.78rem;color:#d4a832;margin:3px 0;font-weight:bold;">${item.name}</div>
      <div style="font-size:.6rem;color:#667;margin-bottom:8px;">${item.desc}</div>
      <div style="font-size:.75rem;color:#f0c84a;margin-bottom:6px;">💰 ${item.cost}</div>
      ${isCurrentWeapon
        ? '<div style="font-size:.65rem;color:#4af;padding:4px 0;">✓ 장착 중</div>'
        : `<button onclick="buyShopItem('${item.id}')"
            style="background:${canAfford?'linear-gradient(135deg,#1a5a3a,#2a8a5a)':'#222'};
            color:${canAfford?'#fff':'#555'};border:none;border-radius:8px;
            padding:5px 14px;font-size:.72rem;cursor:${canAfford?'pointer':'not-allowed'};
            width:100%;font-weight:bold;">
            ${canAfford?'구매':'골드 부족'}
          </button>`
      }
    </div>`;
  }).join('')||'<div style="color:#667;padding:20px">구매 가능한 아이템 없음</div>';

  document.getElementById('ending').style.display='none';
  scr.style.display='flex';
  SFX.door&&SFX.door();
}

function buyShopItem(itemId){
  const item=SHOP_ITEMS.find(i=>i.id===itemId);
  if(!item||gold<item.cost) return;
  gold-=item.cost;
  SFX.item();

  if(item.type==='consumable'){
    if(item.id==='hp30')    { player.hp=Math.min(player.maxHp,player.hp+30); }
    if(item.id==='hp60')    { player.hp=Math.min(player.maxHp,player.hp+60); }
    if(item.id==='hp_full') { player.hp=player.maxHp; }
    if(item.id==='bomb')    { skillCd.bomb=0; }
    if(item.id==='shield')  { skillCd.shield=0; }
    if(item.id==='thunder') { skillCd.thunder=0; }
    if(item.id==='allskill'){ skillCd.bomb=0; skillCd.shield=0; skillCd.thunder=0; }
    if(item.id==='speed2')  { player.speedBoost=(player.speedBoost||0)+180; }
    addLog(`🛒 ${item.name} 구매!`,'win');
  } else if(item.type==='upgrade'){
    if(item.id==='maxhp')    { player.maxHp+=20; player.hp=Math.min(player.maxHp,player.hp+20); }
    if(item.id==='maxhp2')   { player.maxHp+=40; player.hp=Math.min(player.maxHp,player.hp+40); }
    if(item.id==='atk_up')   { window._atkBonus=(window._atkBonus||0)+10; }
    if(item.id==='atk_up2')  { window._atkBonus=(window._atkBonus||0)+20; }
    if(item.id==='cd_reduce'){ window._cdMul=(window._cdMul||1)*0.75; }
    if(item.id==='pierce_up'){ window._pierceBonus=(window._pierceBonus||0)+1; }
    if(item.id==='regen')    { window._regenActive=true; }
    addLog(`⬆️ ${item.name} 업그레이드!`,'win');
  } else if(item.type==='weapon'){
    player.weapon=item.wid;
    addLog(`🔫 ${item.name} 장착!`,'win');
  }

  // 골드/HUD 즉시 갱신
  const _gd=document.getElementById('shop-gold-display'); if(_gd) _gd.textContent=`💰 ${gold} 골드`;
  const _sg=document.getElementById('s-gold'); if(_sg) _sg.textContent=gold;
  const _hn=document.getElementById('hn0');
  const _hf=document.getElementById('hf0');
  if(_hn) _hn.textContent=Math.max(0,player.hp)+' / '+player.maxHp;
  if(_hf) _hf.style.width=Math.max(0,player.hp/player.maxHp*100)+'%';
  updateWeaponHUD();
  // 상점 새로고침
  showShop(_shopNextStage);
}

const _shopCloseBtn=document.getElementById('shop-close-btn');
if(_shopCloseBtn) _shopCloseBtn.addEventListener('click',()=>{
  document.getElementById('shop-screen').style.display='none';
  stage=_shopNextStage;
  if(player) player.hp=Math.min(player.maxHp, player.hp+40);
  initGame(true);
});
// 건너뛰기 버튼 (상점 생략하고 바로 다음 스테이지)
const _shopSkipBtn=document.getElementById('shop-skip-btn');
if(_shopSkipBtn) _shopSkipBtn.addEventListener('click',()=>{
  document.getElementById('shop-screen').style.display='none';
  stage=_shopNextStage;
  initGame(true);
});

