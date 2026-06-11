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