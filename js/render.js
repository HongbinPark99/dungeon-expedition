function draw(){
  // 멀티: player가 없으면 대기
  if(multiMode && !multiState && !player) return;
  if(!multiMode && !gameRunning) return;
  if(!player) return;

  const W=canvas.width, H=canvas.height;
  const shX=screenShake>0?(Math.random()-.5)*screenShake*.3:0;
  const shY=screenShake>0?(Math.random()-.5)*screenShake*.3:0;

  ctx.save();
  ctx.translate(shX,shY);
  ctx.clearRect(-10,-10,W+20,H+20);
  // 스테이지별 배경색
  ctx.fillStyle=getTheme().bg; ctx.fillRect(-10,-10,W+20,H+20);

  // ── 타일 렌더링 (탐험 여부 + 시야 여부 2단계) ──────
  const px=player.x, py=player.y, sr2=SIGHT_R*SIGHT_R;
  {
    const ts=TILE;
    const c0=Math.max(0,(camX/ts)|0)-1;
    const c1=Math.min(COLS,((camX+W)/ts|0)+2);
    const r0=Math.max(0,(camY/ts)|0)-1;
    const r1=Math.min(ROWS,((camY+H)/ts|0)+2);

    for(let r=r0;r<r1;r++){
      for(let c=c0;c<c1;c++){
        const idx=r*COLS+c;
        const exp=explored[idx];
        const wx=c*ts, wy=r*ts;
        const sx2=wx-camX|0, sy2=wy-camY|0;
        const t=tiles[idx];

        if(!exp){
          // 미탐험: 완전히 검정
          ctx.fillStyle='#000';
          ctx.fillRect(sx2,sy2,ts,ts);
          continue;
        }

        // 탐험됨: 시야 안팎 구분
        const ddx=wx+ts/2-px, ddy=wy+ts/2-py;
        const inSight=ddx*ddx+ddy*ddy<sr2*1.05;
        const inBoss=bossArena&&wx>=bossArena.x-ts&&wx<bossArena.x+bossArena.w+ts
                  &&wy>=bossArena.y-ts&&wy<bossArena.y+bossArena.h+ts;

        if(inSight){
          // 시야 안 — 밝게
          if(t===1){
            ctx.fillStyle='#1e2040'; ctx.fillRect(sx2,sy2,ts,ts);
            ctx.fillStyle='#252848'; ctx.fillRect(sx2+2,sy2+2,ts-4,ts-4);
            ctx.fillStyle='#2a305a'; ctx.fillRect(sx2+2,sy2+2,ts-4,3);
            ctx.fillStyle='#2a305a'; ctx.fillRect(sx2+2,sy2+2,3,ts-4);
          } else {
            ctx.fillStyle=inBoss?'#1e0808':'#111228';
            ctx.fillRect(sx2,sy2,ts,ts);
            ctx.strokeStyle=inBoss?'#2a1010':'#151530';
            ctx.lineWidth=.5; ctx.strokeRect(sx2,sy2,ts,ts);
          }
        } else {
          // 탐험됐지만 시야 밖 — 어둡게 (기억된 지도)
          if(t===1){
            ctx.fillStyle='#0d0e20'; ctx.fillRect(sx2,sy2,ts,ts);
          } else {
            ctx.fillStyle=inBoss?'#120404':'#090a16';
            ctx.fillRect(sx2,sy2,ts,ts);
          }
        }
      }
    }
  }

  // ── 보스 방 테두리 ────────────────────────────────
  {
    const ba=bossArena;
    const ddx=ba.x+ba.w/2-px, ddy=ba.y+ba.h/2-py;
    const visible=ddx*ddx+ddy*ddy<(SIGHT_R+300)*(SIGHT_R+300);
    const bExplored=explored[(Math.floor(ba.y/TILE))*COLS+Math.floor(ba.x/TILE)];
    if(visible&&bExplored){
      ctx.save();
      const pulse=.55+.45*Math.sin(tick*.04);
      ctx.globalAlpha=pulse*.8;
      ctx.strokeStyle='#f40'; ctx.lineWidth=3;
      ctx.setLineDash([9,7]);
      ctx.strokeRect(ba.x-camX,ba.y-camY,ba.w,ba.h);
      ctx.globalAlpha=.04*pulse;
      ctx.fillStyle='#ff4400';
      ctx.fillRect(ba.x-camX,ba.y-camY,ba.w,ba.h);
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // ── 위험 범위 — 패턴별 시각화 (채워지면 그 모양으로 공격) ──
  monsters.forEach(m=>{
    if(!m.alive||!m.warnPhase) return;
    const sx=m.x-camX, sy=m.y-camY;
    const ddx=m.x-px, ddy=m.y-py;
    if(ddx*ddx+ddy*ddy>(SIGHT_R+m.range+60)*(SIGHT_R+m.range+60)) return;

    const ratio = 1 - m.attackCd/m.warn;  // 0→1
    const r2=ratio*ratio;
    const red = Math.min(255, 60+195*r2|0);
    const grn = Math.min(255, 230-200*r2|0);
    const fillC = `rgb(${red},${grn},20)`;  // 초록→노랑→빨강 (fc와 다른 이름 — fog ctx 충돌 방지)
    const style = m.attackStyle||'fill_circle';
    const ang = m.aimAngle||0;
    ctx.save();

    // ── fill_circle: 원이 안에서 밖으로 채워짐 ──────
    if(style==='fill_circle'){
      // 외곽 테두리 (고정)
      ctx.globalAlpha=0.45; ctx.strokeStyle='#663';
      ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(sx,sy,m.range,0,Math.PI*2); ctx.stroke();
      // 채워지는 원 (작은→큰)
      const fillR = m.range * ratio;
      ctx.globalAlpha=0.18+ratio*0.22;
      ctx.fillStyle=fillC;
      ctx.beginPath(); ctx.arc(sx,sy,fillR,0,Math.PI*2); ctx.fill();
      // 테두리 원
      ctx.globalAlpha=0.5+ratio*0.45;
      ctx.strokeStyle=fillC; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(sx,sy,fillR,0,Math.PI*2); ctx.stroke();
    }

    // ── fill_cross: 십자 4방향 바가 뻗어나옴 ────────
    else if(style==='fill_cross'){
      const arm = m.range * ratio;
      const thick = 18+ratio*10;
      ctx.globalAlpha=0.12+ratio*0.22;
      ctx.fillStyle=fillC;
      // 십자 4방향 막대 (ang 기준 회전)
      ctx.save(); ctx.translate(sx,sy); ctx.rotate(ang);
      ctx.fillRect(-arm,-thick/2,arm*2,thick);
      ctx.fillRect(-thick/2,-arm,thick,arm*2);
      ctx.restore();
      // 외곽 십자 테두리 (최대 범위)
      ctx.globalAlpha=0.35+ratio*0.5;
      ctx.strokeStyle=fillC; ctx.lineWidth=2;
      ctx.save(); ctx.translate(sx,sy); ctx.rotate(ang);
      ctx.strokeRect(-m.range,-thick/2*1.2,m.range*2,thick*1.2);
      ctx.strokeRect(-thick/2*1.2,-m.range,thick*1.2,m.range*2);
      ctx.restore();
    }

    // ── fill_cone: 원뿔(쐐기)이 ratio만큼 채워짐 ────
    else if(style==='fill_cone'){
      const coneAngle = Math.PI/4; // 45도 반각 → 90도 원뿔
      // 최대 범위 윤곽
      ctx.globalAlpha=0.35;
      ctx.strokeStyle='#663'; ctx.lineWidth=1.5;
      ctx.beginPath();
      ctx.moveTo(sx,sy);
      ctx.arc(sx,sy,m.range*1.1,ang-coneAngle,ang+coneAngle);
      ctx.closePath(); ctx.stroke();
      // 채워지는 원뿔
      const coneR = m.range * ratio;
      ctx.globalAlpha=0.18+ratio*0.28;
      ctx.fillStyle=fillC;
      ctx.beginPath();
      ctx.moveTo(sx,sy);
      ctx.arc(sx,sy,coneR,ang-coneAngle,ang+coneAngle);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha=0.45+ratio*0.5;
      ctx.strokeStyle=fillC; ctx.lineWidth=2;
      ctx.beginPath();
      ctx.moveTo(sx,sy);
      ctx.arc(sx,sy,coneR,ang-coneAngle,ang+coneAngle);
      ctx.closePath(); ctx.stroke();
    }

    // ── fill_line: 직선 바가 ratio만큼 뻗어나옴 ─────
    else if(style==='fill_line'){
      const maxLen = m.range*1.8;
      const lineLen = maxLen * ratio;
      const thick = 22;
      // 최대 범위 외곽
      ctx.globalAlpha=0.3; ctx.strokeStyle='#446';
      ctx.lineWidth=1.5;
      ctx.save(); ctx.translate(sx,sy); ctx.rotate(ang);
      ctx.strokeRect(0,-thick/2,maxLen,thick);
      ctx.restore();
      // 채워지는 막대
      ctx.globalAlpha=0.15+ratio*0.25;
      ctx.fillStyle=fillC;
      ctx.save(); ctx.translate(sx,sy); ctx.rotate(ang);
      ctx.fillRect(0,-thick/2,lineLen,thick);
      ctx.restore();
      // 테두리 막대
      ctx.globalAlpha=0.5+ratio*0.45;
      ctx.strokeStyle=fillC; ctx.lineWidth=2.5;
      ctx.save(); ctx.translate(sx,sy); ctx.rotate(ang);
      ctx.strokeRect(0,-thick/2,lineLen,thick);
      ctx.restore();
    }

    // ── fill_ring: 바깥 링이 안으로 수축 ─────────────
    else if(style==='fill_ring'){
      const outerR = m.range * 1.2;
      const innerR = outerR * (1 - ratio * 0.6); // 수축
      // 외곽 고정
      ctx.globalAlpha=0.35; ctx.strokeStyle='#663';
      ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(sx,sy,outerR,0,Math.PI*2); ctx.stroke();
      // 수축하는 링 도넛
      ctx.globalAlpha=0.15+ratio*0.28;
      ctx.fillStyle=fillC;
      ctx.beginPath();
      ctx.arc(sx,sy,outerR,0,Math.PI*2,false);
      ctx.arc(sx,sy,innerR,0,Math.PI*2,true);
      ctx.fill();
      ctx.globalAlpha=0.5+ratio*0.45;
      ctx.strokeStyle=fillC; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(sx,sy,innerR,0,Math.PI*2); ctx.stroke();
    }

    // ── fill_scatter: 원 안에서 방사형 화살표들이 퍼짐 ─
    else if(style==='fill_scatter'){
      // 배경 원
      ctx.globalAlpha=0.3; ctx.strokeStyle='#663';
      ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(sx,sy,m.range,0,Math.PI*2); ctx.stroke();
      // 8방향 화살표 선 (ratio만큼 길어짐)
      ctx.globalAlpha=0.55+ratio*0.4;
      ctx.strokeStyle=fillC; ctx.lineWidth=2; ctx.lineCap='round';
      for(let i=0;i<8;i++){
        const a = ang + (Math.PI*2/8)*i;
        const alen = m.range*0.85*ratio;
        const ex = sx+Math.cos(a)*alen, ey=sy+Math.sin(a)*alen;
        ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ex,ey); ctx.stroke();
        // 화살 머리
        if(ratio>0.5){
          const ha=0.4;
          ctx.beginPath();
          ctx.moveTo(ex,ey);
          ctx.lineTo(ex-Math.cos(a-ha)*10,ey-Math.sin(a-ha)*10);
          ctx.moveTo(ex,ey);
          ctx.lineTo(ex-Math.cos(a+ha)*10,ey-Math.sin(a+ha)*10);
          ctx.stroke();
        }
      }
    }

    // 경고 아이콘 (마지막 20%)
    if(ratio>0.8){
      const alertRatio=(ratio-0.8)/0.2;
      ctx.globalAlpha=alertRatio;
      ctx.fillStyle='#fff';
      ctx.font=`bold ${(12+ratio*5)|0}px serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('⚠', sx, sy - m.range - 12);
    }
    ctx.restore();
  });

  // ── 총알 렌더링 ──────────────────────────────────
  bullets.forEach(b=>{
    const sx=b.x-camX, sy=b.y-camY;
    const blen = b.len||BULLET_LEN;
    const tailX=sx-Math.cos(b.angle)*blen;
    const tailY=sy-Math.sin(b.angle)*blen;
    ctx.save();
    if(b.isMob){
      // 몬스터 투사체: 붉은/주황 색
      const mc = b.col||'#f44';
      ctx.shadowColor=mc; ctx.shadowBlur=12;
      const grad=ctx.createLinearGradient(tailX,tailY,sx,sy);
      grad.addColorStop(0,'rgba(0,0,0,0)');
      grad.addColorStop(0.3,mc);   // hex+aa 는 잘못된 색상 → 그냥 mc 사용
      grad.addColorStop(1,mc);
      ctx.strokeStyle=grad;
      ctx.lineWidth=b.w||4; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(tailX,tailY); ctx.lineTo(sx,sy); ctx.stroke();
      ctx.fillStyle='#fff'; ctx.shadowBlur=18;
      ctx.beginPath(); ctx.arc(sx,sy,3,0,Math.PI*2); ctx.fill();
    } else {
      const pc=b.col||'#88ddff';
      ctx.shadowColor=pc; ctx.shadowBlur=12;
      const gp=ctx.createLinearGradient(tailX,tailY,sx,sy);
      gp.addColorStop(0,'rgba(0,0,0,0)'); gp.addColorStop(0.4,pc); gp.addColorStop(1,pc);
      ctx.strokeStyle=gp; ctx.lineWidth=b.w||3.5; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(tailX,tailY); ctx.lineTo(sx,sy); ctx.stroke();
      ctx.shadowBlur=16; ctx.fillStyle='#fff';
      ctx.beginPath(); ctx.arc(sx,sy,2.5,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  });

    // ── 몬스터 ───────────────────────────────────────
  monsters.forEach(m=>{
    if(!m.alive) return;
    const ddx=m.x-px, ddy=m.y-py;
    const isBossM=m.type&&m.type.startsWith('boss');
    // 보스는 거리/fog 무관 항상 렌더, 일반 몬스터는 시야 범위만
    if(!isBossM && ddx*ddx+ddy*ddy>sr2*2.5) return;
    // 보스: fog 위에 렌더하기 위해 ctx.save/restore 후 globalCompositeOperation 초기화
    if(isBossM){ ctx.save(); ctx.globalCompositeOperation='source-over'; }
    const sx=m.x-camX, sy=m.y-camY;
    const isBoss=isBossM;
    const dispSz=isBoss?m.size*1.8:m.size*1.5;
    const hpBarY=sy-dispSz-4;

    ctx.save();
    drawMonsterSprite(ctx, m, sx, sy);
    ctx.shadowBlur=0;

    // HP 바
    const bw=Math.max(dispSz*2.2, 40)|0;
    ctx.fillStyle='#000a'; ctx.fillRect(sx-bw/2-1, hpBarY-6, bw+2, 7);
    ctx.fillStyle=isBoss?(m.enraged?'#f60':'#f84'):(m.elite?'#ffd700':'#e44');
    ctx.fillRect(sx-bw/2, hpBarY-5, bw*(m.hp/m.maxHp), 5);

    // 이름
    if(isBoss){
      const _ml=m.label||m.type; const _me=MEMOJI[m.type]||'👑';
      ctx.fillStyle=m.enraged?'#f96':'#fda'; ctx.font='bold 12px Noto Sans KR';
      ctx.textAlign='center'; ctx.textBaseline='bottom';
      ctx.fillText(m.enraged?`🔥 격노 ${_ml}`:`${_me} ${_ml}`, sx, hpBarY-10);
    } else if(m.elite){
      ctx.fillStyle='#ffd700'; ctx.font='bold 9px Noto Sans KR';
      ctx.textAlign='center'; ctx.textBaseline='bottom';
      ctx.fillText(`★ ${m.label||m.type}`, sx, hpBarY-8);
    }
    if(isBoss){ ctx.restore(); } // fog 위 렌더 종료
    ctx.restore();
  });

    // ── 폭탄 렌더 ────────────────────────────────────
  // 싱글 + 멀티 폭탄 통합 렌더
  const _renderBombs = multiMode ? (window._multiBombs||[]) : bombs;
  _renderBombs.forEach(b=>{
    const sx=b.x-camX, sy=b.y-camY;
    ctx.save();
    if(b.exploded){
      const t=b.explodeTimer/20;
      ctx.globalAlpha=(1-t)*0.7;
      ctx.fillStyle='#f84';
      ctx.beginPath(); ctx.arc(sx,sy,b.radius,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#ff0'; ctx.lineWidth=3; ctx.globalAlpha=(1-t)*0.9;
      ctx.beginPath(); ctx.arc(sx,sy,b.radius,0,Math.PI*2); ctx.stroke();
    } else {
      ctx.shadowColor='#f84'; ctx.shadowBlur=12;
      ctx.fillStyle='#f84';
      const pulse=0.8+0.2*Math.sin(tick*0.3);
      ctx.beginPath(); ctx.arc(sx,sy,8*pulse,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#ff0';
      ctx.beginPath(); ctx.arc(sx,sy,4,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  });

  // ── 스킬 이펙트 FX ───────────────────────────────
  dangerZonesFx.forEach(d=>{
    const sx=d.x-camX, sy=d.y-camY;
    const t=d.life/(d.type==='thunder'?25:18);
    ctx.save();
    ctx.globalAlpha=t*0.35;
    ctx.fillStyle=d.col;
    ctx.beginPath(); ctx.arc(sx,sy,d.r,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=t*0.8;
    ctx.strokeStyle=d.col; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(sx,sy,d.r,0,Math.PI*2); ctx.stroke();
    ctx.restore();
  });

  // ── 아이템 렌더 ─────────────────────────────────
  items.forEach(it=>{
    const ddx=it.x-player.x, ddy=it.y-player.y;
    if(ddx*ddx+ddy*ddy>SIGHT_R*SIGHT_R*1.2) return;
    const sx=it.x-camX, sy=it.y-camY;
    const pulse=0.85+0.15*Math.sin(it.pulse*0.1);
    ctx.save();
    ctx.globalAlpha=0.9;
    ctx.shadowColor=ITEM_COL[it.type]; ctx.shadowBlur=14;
    ctx.fillStyle=ITEM_COL[it.type];
    ctx.beginPath(); ctx.arc(sx,sy,10*pulse,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
    ctx.font='12px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(ITEM_EMOJI[it.type],sx,sy);
    ctx.restore();
  });

  // ── Fog — 시야 경계 소프트 마스크 ──────────────────
  {
    const psx=player.x-camX|0, psy=player.y-camY|0;
    if(!window._fog||window._fog.width!==W||window._fog.height!==H){
      window._fog=document.createElement('canvas');
      window._fog.width=W; window._fog.height=H;
      window._fogC=window._fog.getContext('2d');
    }
    const fc2=window._fogC;
    fc2.clearRect(0,0,W,H);
    // 시야 밖은 약간 어둡게 (탐험된 어두운 타일을 더 강조)
    fc2.fillStyle='rgba(2,3,8,0.72)';
    fc2.fillRect(0,0,W,H);
    // 시야 원 구멍 뚫기
    fc2.globalCompositeOperation='destination-out';
    const fg=fc2.createRadialGradient(psx,psy,SIGHT_R*0.5,psx,psy,SIGHT_R);
    fg.addColorStop(0,   'rgba(0,0,0,1)');
    fg.addColorStop(0.72,'rgba(0,0,0,0.97)');
    fg.addColorStop(1,   'rgba(0,0,0,0)');
    fc2.fillStyle=fg;
    fc2.beginPath(); fc2.arc(psx,psy,SIGHT_R,0,Math.PI*2); fc2.fill();
    fc2.globalCompositeOperation='source-over';
    ctx.drawImage(window._fog,0,0);
  }
  // ── 파티클 (fog 위) ───────────────────────────────
  particles.forEach(p=>{
    const ddx=p.x-player.x, ddy=p.y-player.y;
    if(ddx*ddx+ddy*ddy>SIGHT_R*SIGHT_R*1.1) return;
    ctx.save();
    ctx.globalAlpha=p.life/40;
    ctx.fillStyle=p.col;
    ctx.beginPath(); ctx.arc(p.x-camX,p.y-camY,p.r,0,Math.PI*2); ctx.fill();
    ctx.restore();
  });

  // ── 조준선 ───────────────────────────────────────
  if(player.alive&&gameRunning){
    const psx=player.x-camX, psy=player.y-camY;
    const ang=player.facing||0;
    const atkReady=player.attackCd<=0;

    ctx.save();
    // 방향 점선
    ctx.setLineDash([6,5]);
    ctx.strokeStyle=atkReady?'rgba(100,200,255,0.55)':'rgba(100,200,255,0.2)';
    ctx.lineWidth=1.5;
    ctx.beginPath();
    ctx.moveTo(psx+Math.cos(ang)*18, psy+Math.sin(ang)*18);
    ctx.lineTo(psx+Math.cos(ang)*P_RANGE, psy+Math.sin(ang)*P_RANGE);
    ctx.stroke();
    ctx.setLineDash([]);

    // 크로스헤어 (마우스 위치)
    const msx=mouse.x, msy=mouse.y;
    const cr=10; // 크로스헤어 반지름
    ctx.strokeStyle=atkReady?'rgba(100,220,255,0.85)':'rgba(100,180,255,0.4)';
    ctx.lineWidth=1.5;
    // 원
    ctx.beginPath(); ctx.arc(msx,msy,cr,0,Math.PI*2); ctx.stroke();
    // 십자선
    ctx.beginPath();
    ctx.moveTo(msx-cr-4,msy); ctx.lineTo(msx-cr+3,msy);
    ctx.moveTo(msx+cr-3,msy); ctx.lineTo(msx+cr+4,msy);
    ctx.moveTo(msx,msy-cr-4); ctx.lineTo(msx,msy-cr+3);
    ctx.moveTo(msx,msy+cr-3); ctx.lineTo(msx,msy+cr+4);
    ctx.stroke();
    // 쿨다운 호 (공격 준비 중)
    if(!atkReady){
      const cdRatio=1-player.attackCd/P_CD;
      ctx.strokeStyle='rgba(100,220,255,0.7)';
      ctx.lineWidth=2;
      ctx.beginPath();
      ctx.arc(msx,msy,cr,-Math.PI/2,-Math.PI/2+Math.PI*2*cdRatio);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── 플레이어 (fog 위 → 항상 보임) ────────────────
  {
    const sx=player.x-camX, sy=player.y-camY;
    ctx.save();
    const blinking=player.iframes>0&&Math.floor(tick/4)%2===0;

    // 그림자
    ctx.fillStyle='rgba(0,100,255,0.18)';
    ctx.beginPath(); ctx.ellipse(sx, sy+20, 14, 5, 0, 0, Math.PI*2); ctx.fill();

    // 방패 링
    if(shieldActive>0){
      const sp=0.8+0.2*Math.sin(tick*0.2);
      ctx.globalAlpha=0.55*sp;
      ctx.strokeStyle='#88eeff'; ctx.lineWidth=4;
      ctx.shadowColor='#88eeff'; ctx.shadowBlur=14;
      ctx.beginPath(); ctx.arc(sx,sy,26,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=0.13*sp;
      ctx.fillStyle='#88eeff';
      ctx.beginPath(); ctx.arc(sx,sy,26,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=0;
    }

    // 대시/속도부스트 잔상
    if(player.dashFrames>0||player.speedBoost>0){
      ctx.globalAlpha=0.3;
      const trailDx=player.dashFrames>0?-player.dashVx*0.5:0;
      const trailDy=player.dashFrames>0?-player.dashVy*0.5:0;
      drawPlayerSprite(ctx, sx+trailDx, sy+trailDy, player.facing, false, player.alive);
      ctx.globalAlpha=0.15;
      drawPlayerSprite(ctx, sx+trailDx*2, sy+trailDy*2, player.facing, false, player.alive);
      ctx.globalAlpha=1;
    }

    // 플레이어 스프라이트
    ctx.globalAlpha=!player.alive?0.3:blinking?0.45:1;
    if(!blinking){
      ctx.shadowColor='#4af'; ctx.shadowBlur=10;
    }
    drawPlayerSprite(ctx, sx, sy, player.facing, blinking, player.alive);
    ctx.shadowBlur=0;
    ctx.globalAlpha=1;

    // 이름
    ctx.fillStyle='#aaddff'; ctx.font='bold 10px Noto Sans KR';
    ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillText((window.playerNickname||'용사')+' ★', sx, sy - 22);

    // HP 바
    const bw=36;
    ctx.fillStyle='#000a'; ctx.fillRect(sx-bw/2-1, sy-21, bw+2, 6);
    ctx.fillStyle='#44aaff'; ctx.fillRect(sx-bw/2, sy-20, bw*(Math.max(0,player.hp)/player.maxHp), 4);
    ctx.restore();
  }

  ctx.restore(); // shake

  // ── 미니맵 ───────────────────────────────────────
  drawMinimap();
}


// ═══════════════════════════════════════════════════════
//  벡터 캐릭터 그리기 — Canvas 2D API 직접 드로잉
//  각 함수: drawXxx(c, x, y, size, facing, t) → 애니메이션
//  t = tick (애니메이션용)
// ═══════════════════════════════════════════════════════

// ── 공통 유틸 ─────────────────────────────────────────
function shadow(c, col, blur){ c.shadowColor=col; c.shadowBlur=blur; }
function noShadow(c){ c.shadowBlur=0; }
function grad(c,x,y,r,col1,col2){
  const g=c.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,col1); g.addColorStop(1,col2); return g;
}
function linGrad(c,x0,y0,x1,y1,stops){
  const g=c.createLinearGradient(x0,y0,x1,y1);
  stops.forEach(([p,col])=>g.addColorStop(p,col)); return g;
}


// ══════════════════════════════════════════════════════
//  사진 기반 커스텀 캐릭터 4인방
// ══════════════════════════════════════════════════════

// 캐릭터2: 모자 궁수 (캡모자+안경+흰티)
function drawCharArcherFriend(c,x,y,sz,facing,t,elite){
  const fl=Math.cos(facing||0)<0?-1:1;
  const bob=Math.sin(t*0.2)*2;
  c.save(); c.translate(x,y+bob);
  // 다리
  [-1,1].forEach(s=>{
    const ls=Math.sin(t*0.2)*sz*0.06*(s===1?1:-1);
    c.beginPath(); c.roundRect(s*sz*0.08,sz*0.42+ls,sz*0.13,sz*0.34,3);
    c.fillStyle='#334'; c.fill();
    c.beginPath(); c.ellipse(s*sz*0.1,sz*0.77+ls,sz*0.1,sz*0.06,0,0,Math.PI*2);
    c.fillStyle='#222'; c.fill();
  });
  // 몸통(흰티)
  c.beginPath(); c.ellipse(0,sz*0.12,sz*0.28,sz*0.34,0,0,Math.PI*2);
  c.fillStyle='#eeeef0'; c.fill(); c.strokeStyle='#ccc'; c.lineWidth=1; c.stroke();
  // 팔
  [-1,1].forEach(s=>{
    const armS=Math.sin(t*0.2)*0.22;
    c.save(); c.translate(s*sz*0.28,0); c.rotate(s*(-0.2+armS*(s===fl?1:-1)));
    c.beginPath(); c.roundRect(-sz*0.06,-sz*0.02,sz*0.12,sz*0.3,3);
    c.fillStyle='#eeeef0'; c.fill();
    c.beginPath(); c.ellipse(0,sz*0.3,sz*0.075,sz*0.065,0,0,Math.PI*2);
    c.fillStyle='#e0c0a0'; c.fill(); c.restore();
  });
  // 목
  c.beginPath(); c.rect(-sz*0.07,-sz*0.09,sz*0.14,sz*0.12); c.fillStyle='#e0c0a0'; c.fill();
  // 얼굴
  c.beginPath(); c.ellipse(0,-sz*0.26,sz*0.22,sz*0.22,0,0,Math.PI*2);
  c.fillStyle=grad(c,0,-sz*0.4,sz*0.22,'#f0d0b0','#d0a880'); c.fill();
  // 눈썹
  [-1,1].forEach(s=>{
    c.beginPath(); c.moveTo(s*sz*0.05,-sz*0.31); c.lineTo(s*sz*0.15,-sz*0.33);
    c.strokeStyle='#2a1a0a'; c.lineWidth=sz*0.03; c.lineCap='round'; c.stroke();
  });
  // 눈
  [-1,1].forEach(s=>{
    c.beginPath(); c.ellipse(s*sz*0.1,-sz*0.25,sz*0.04,sz*0.04,0,0,Math.PI*2);
    c.fillStyle='#1a1a1a'; c.fill();
  });
  // 안경
  [-1,1].forEach(s=>{
    c.beginPath(); c.roundRect(s*sz*0.02-sz*0.1,-sz*0.29,sz*0.12,sz*0.09,sz*0.025);
    c.strokeStyle='#111'; c.lineWidth=sz*0.028; c.stroke();
    c.fillStyle='rgba(180,220,255,0.1)'; c.fill();
  });
  c.beginPath(); c.moveTo(-sz*0.08,-sz*0.25); c.lineTo(sz*0.02,-sz*0.25);
  c.strokeStyle='#111'; c.lineWidth=sz*0.022; c.stroke();
  // 코+입
  c.beginPath(); c.arc(0,-sz*0.18,sz*0.025,0,Math.PI*2); c.fillStyle='#c09070'; c.fill();
  c.beginPath(); c.arc(0,-sz*0.12,sz*0.055,0.1,Math.PI-0.1); c.strokeStyle='#a07050'; c.lineWidth=sz*0.022; c.stroke();
  // 머리
  c.beginPath(); c.ellipse(0,-sz*0.28,sz*0.22,sz*0.2,0,0,Math.PI*2); c.fillStyle='#1a1208'; c.fill();
  // 캡모자 (회색, 특징!)
  c.beginPath(); c.ellipse(0,-sz*0.38,sz*0.24,sz*0.12,-0.05,Math.PI,0); c.fillStyle='#7a7a82'; c.fill();
  c.beginPath(); c.ellipse(0,-sz*0.38,sz*0.24,sz*0.1,-0.05,0,Math.PI); c.fillStyle='#6a6a72'; c.fill();
  c.beginPath(); c.ellipse(fl*sz*0.1,-sz*0.38,sz*0.18,sz*0.055,fl*0.1,0,Math.PI*2); c.fillStyle='#6a6a72'; c.fill();
  c.fillStyle='#ddd'; c.font=`bold ${sz*0.06}px sans-serif`; c.textAlign='center'; c.textBaseline='middle';
  c.fillText('A',-fl*sz*0.03,-sz*0.38);
  c.restore();
}

// 캐릭터3: 엄지척 마법사 (검정 폴로, 긴 머리)
function drawCharMageFriend(c,x,y,sz,facing,t,elite){
  const fl=Math.cos(facing||0)<0?-1:1;
  const bob=Math.sin(t*0.15)*2;
  c.save(); c.translate(x,y+bob);
  // 다리
  [-1,1].forEach(s=>{
    const ls=Math.sin(t*0.15)*sz*0.05*(s===1?1:-1);
    c.beginPath(); c.roundRect(s*sz*0.08,sz*0.43+ls,sz*0.13,sz*0.33,3); c.fillStyle='#111'; c.fill();
    c.beginPath(); c.ellipse(s*sz*0.1,sz*0.77+ls,sz*0.1,sz*0.06,0,0,Math.PI*2); c.fillStyle='#222'; c.fill();
  });
  // 몸통(검정 폴로)
  c.beginPath(); c.ellipse(0,sz*0.12,sz*0.27,sz*0.33,0,0,Math.PI*2);
  c.fillStyle='#0d0d0d'; c.fill(); c.strokeStyle='#333'; c.lineWidth=1.5; c.stroke();
  c.beginPath(); c.moveTo(-sz*0.07,-sz*0.07); c.lineTo(0,sz*0.01); c.lineTo(sz*0.07,-sz*0.07);
  c.strokeStyle='#444'; c.lineWidth=2; c.stroke();
  // 팔
  c.save(); c.translate(-fl*sz*0.27,0); c.rotate(-fl*(-0.15));
  c.beginPath(); c.roundRect(-sz*0.06,-sz*0.02,sz*0.12,sz*0.3,3); c.fillStyle='#0d0d0d'; c.fill();
  c.beginPath(); c.ellipse(0,sz*0.3,sz*0.07,sz*0.065,0,0,Math.PI*2); c.fillStyle='#e0c0a0'; c.fill(); c.restore();
  // 엄지척 팔
  c.save(); c.translate(fl*sz*0.27,-sz*0.05); c.rotate(fl*0.25);
  c.beginPath(); c.roundRect(-sz*0.06,-sz*0.02,sz*0.12,sz*0.27,3); c.fillStyle='#0d0d0d'; c.fill();
  c.beginPath(); c.ellipse(0,sz*0.27,sz*0.08,sz*0.09,0,0,Math.PI*2); c.fillStyle='#e0c0a0'; c.fill();
  c.beginPath(); c.roundRect(-sz*0.03,sz*0.1,sz*0.065,sz*0.16,sz*0.03);
  c.fillStyle='#e0c0a0'; c.fill(); c.strokeStyle='#c09070'; c.lineWidth=1; c.stroke(); c.restore();
  // 목+얼굴
  c.beginPath(); c.rect(-sz*0.07,-sz*0.09,sz*0.14,sz*0.12); c.fillStyle='#e0c0a0'; c.fill();
  c.beginPath(); c.ellipse(0,-sz*0.26,sz*0.21,sz*0.22,0,0,Math.PI*2);
  c.fillStyle=grad(c,0,-sz*0.4,sz*0.22,'#f0d0b0','#d0a880'); c.fill();
  [-1,1].forEach(s=>{
    c.beginPath(); c.moveTo(s*sz*0.04,-sz*0.32); c.lineTo(s*sz*0.14,-sz*0.34);
    c.strokeStyle='#1a1208'; c.lineWidth=sz*0.032; c.lineCap='round'; c.stroke();
    c.beginPath(); c.ellipse(s*sz*0.09,-sz*0.26,sz*0.042,sz*0.042,0,0,Math.PI*2);
    c.fillStyle='#1a1a1a'; c.fill();
  });
  c.beginPath(); c.arc(0,-sz*0.18,sz*0.024,0,Math.PI*2); c.fillStyle='#c09070'; c.fill();
  c.beginPath(); c.arc(0,-sz*0.12,sz*0.06,0.15,Math.PI-0.15); c.strokeStyle='#a07050'; c.lineWidth=sz*0.025; c.stroke();
  // 머리(긴 앞머리)
  c.beginPath(); c.ellipse(0,-sz*0.28,sz*0.21,sz*0.18,0,0,Math.PI*2); c.fillStyle='#1a1208'; c.fill();
  [-sz*0.12,0,sz*0.12].forEach(hx=>{
    c.beginPath(); c.moveTo(hx,-sz*0.35); c.quadraticCurveTo(hx+sz*0.03,-sz*0.44,hx-sz*0.02,-sz*0.47);
    c.strokeStyle='#1a1208'; c.lineWidth=sz*0.05; c.lineCap='round'; c.stroke();
  });
  c.restore();
}

// 캐릭터4: 키큰 보스헌터 (안경+검정폴로+반바지+엄지척)
function drawCharTallHero(c,x,y,sz,facing,t,elite){
  const fl=Math.cos(facing||0)<0?-1:1;
  const bob=Math.sin(t*0.16)*1.8;
  c.save(); c.translate(x,y+bob);
  // 다리(긴 편, 반바지)
  [-1,1].forEach(s=>{
    const ls=Math.sin(t*0.16)*sz*0.06*(s===1?1:-1);
    c.beginPath(); c.roundRect(s*sz*0.09,sz*0.42+ls,sz*0.14,sz*0.18,3); c.fillStyle='#111'; c.fill();
    c.beginPath(); c.roundRect(s*sz*0.09,sz*0.6+ls,sz*0.13,sz*0.2,3); c.fillStyle='#e0c0a0'; c.fill();
    c.beginPath(); c.ellipse(s*sz*0.11,sz*0.81+ls,sz*0.11,sz*0.06,0,0,Math.PI*2); c.fillStyle='#5a3a20'; c.fill();
  });
  c.beginPath(); c.rect(-sz*0.24,sz*0.42,sz*0.48,sz*0.18); c.fillStyle='#111'; c.fill();
  // 몸통
  c.beginPath(); c.ellipse(0,sz*0.1,sz*0.3,sz*0.35,0,0,Math.PI*2); c.fillStyle='#0d0d0d'; c.fill();
  c.strokeStyle='#2a2a2a'; c.lineWidth=1.5; c.stroke();
  // 카하트 로고
  c.fillStyle='#b8860b'; c.font=`bold ${sz*0.08}px sans-serif`; c.textAlign='center'; c.textBaseline='middle';
  c.fillText('C',fl*sz*0.14,sz*0.02);
  c.beginPath(); c.moveTo(-sz*0.08,-sz*0.07); c.lineTo(0,sz*0.01); c.lineTo(sz*0.08,-sz*0.07);
  c.strokeStyle='#333'; c.lineWidth=2; c.stroke();
  // 팔
  c.save(); c.translate(-fl*sz*0.3,sz*0.01);
  c.beginPath(); c.roundRect(-sz*0.07,-sz*0.02,sz*0.14,sz*0.32,3); c.fillStyle='#0d0d0d'; c.fill();
  c.beginPath(); c.ellipse(0,sz*0.32,sz*0.075,sz*0.07,0,0,Math.PI*2); c.fillStyle='#e0c0a0'; c.fill(); c.restore();
  // 엄지척 팔
  c.save(); c.translate(fl*sz*0.3,-sz*0.04); c.rotate(fl*(-0.45));
  c.beginPath(); c.roundRect(-sz*0.07,-sz*0.02,sz*0.14,sz*0.3,3); c.fillStyle='#0d0d0d'; c.fill();
  c.beginPath(); c.ellipse(0,sz*0.3,sz*0.08,sz*0.09,0,0,Math.PI*2); c.fillStyle='#e0c0a0'; c.fill();
  c.beginPath(); c.roundRect(-sz*0.03,sz*0.12,sz*0.065,sz*0.17,sz*0.03);
  c.fillStyle='#e0c0a0'; c.fill(); c.strokeStyle='#c09070'; c.lineWidth=1; c.stroke(); c.restore();
  // 목+얼굴
  c.beginPath(); c.rect(-sz*0.08,-sz*0.1,sz*0.16,sz*0.14); c.fillStyle='#e0c0a0'; c.fill();
  c.beginPath(); c.ellipse(0,-sz*0.27,sz*0.24,sz*0.24,0,0,Math.PI*2);
  c.fillStyle=grad(c,0,-sz*0.44,sz*0.24,'#f0d0b0','#d0a880'); c.fill();
  [-1,1].forEach(s=>{
    c.beginPath(); c.moveTo(s*sz*0.04,-sz*0.33); c.quadraticCurveTo(s*sz*0.1,-sz*0.37,s*sz*0.17,-sz*0.32);
    c.strokeStyle='#1a1208'; c.lineWidth=sz*0.038; c.lineCap='round'; c.stroke();
    c.beginPath(); c.ellipse(s*sz*0.1,-sz*0.265,sz*0.044,sz*0.04,0,0,Math.PI*2);
    c.fillStyle='#1a1a1a'; c.fill();
    c.beginPath(); c.arc(s*sz*0.1+sz*0.01,-sz*0.27,sz*0.016,0,Math.PI*2); c.fillStyle='#fff'; c.fill();
  });
  // 안경
  [-1,1].forEach(s=>{
    c.beginPath(); c.roundRect(s*sz*0.03-sz*0.13,-sz*0.31,sz*0.15,sz*0.1,sz*0.03);
    c.strokeStyle='#111'; c.lineWidth=sz*0.03; c.stroke(); c.fillStyle='rgba(180,220,255,0.1)'; c.fill();
  });
  c.beginPath(); c.moveTo(-sz*0.1,-sz*0.265); c.lineTo(sz*0.03,-sz*0.265);
  c.strokeStyle='#111'; c.lineWidth=sz*0.025; c.stroke();
  c.beginPath(); c.arc(0,-sz*0.18,sz*0.03,0,Math.PI*2); c.fillStyle='#c09070'; c.fill();
  c.beginPath(); c.arc(0,-sz*0.11,sz*0.07,0.2,Math.PI-0.2); c.strokeStyle='#a07050'; c.lineWidth=sz*0.025; c.stroke();
  // 머리
  c.beginPath(); c.ellipse(0,-sz*0.3,sz*0.24,sz*0.18,0,0,Math.PI*2); c.fillStyle='#0d0d10'; c.fill();
  c.beginPath(); c.ellipse(0,-sz*0.42,sz*0.22,sz*0.12,0,0,Math.PI*2); c.fillStyle='#0d0d10'; c.fill();
  c.restore();
}


// ═══════════════════════════════════════════════════════
//  관람차 4인 — 실사형 고품질 얼굴 캐릭터
//  얼굴이 캐릭터의 중심, 실제 인물 특징 최대 반영
// ═══════════════════════════════════════════════════════

// ── 실사 피부 그라디언트 ─────────────────────────────
function skinGrad(c, cx, cy, r, light, dark){
  const g=c.createRadialGradient(cx-r*0.25,cy-r*0.3,r*0.05, cx,cy,r*1.1);
  g.addColorStop(0,light); g.addColorStop(0.6,dark); g.addColorStop(1,hex2rgba(dark,0.6));
  return g;
}

// ── 실사 눈 그리기 (핵심) ────────────────────────────
function realisticEye(c, cx, cy, w, h, iris, pupil, facing, brow){
  c.save();
  // 눈 흰자 — 모양 클립
  c.beginPath();
  c.moveTo(cx-w,cy);
  c.bezierCurveTo(cx-w*0.5,cy-h*1.4, cx+w*0.5,cy-h*1.4, cx+w,cy);
  c.bezierCurveTo(cx+w*0.5,cy+h*0.8, cx-w*0.5,cy+h*0.8, cx-w,cy);
  c.clip();
  // 흰자
  const wg=c.createRadialGradient(cx,cy-h*0.3,0,cx,cy,w);
  wg.addColorStop(0,'#fdfcfa'); wg.addColorStop(1,'#f0eee8');
  c.fillStyle=wg; c.fill();
  // 홍채
  const ig=c.createRadialGradient(cx+w*0.08,cy-h*0.1,0,cx,cy,h*1.1);
  ig.addColorStop(0,hex2rgba(iris,0.93)); ig.addColorStop(0.5,iris); ig.addColorStop(1,'#0a0808');
  c.beginPath(); c.arc(cx,cy,h*0.95,0,Math.PI*2); c.fillStyle=ig; c.fill();
  // 동공
  c.beginPath(); c.arc(cx,cy,h*0.48,0,Math.PI*2); c.fillStyle='#050303'; c.fill();
  // 하이라이트
  c.beginPath(); c.arc(cx+w*0.18,cy-h*0.28,h*0.22,0,Math.PI*2); c.fillStyle='rgba(255,255,255,0.85)'; c.fill();
  c.beginPath(); c.arc(cx-w*0.08,cy+h*0.18,h*0.1,0,Math.PI*2); c.fillStyle='rgba(255,255,255,0.35)'; c.fill();
  c.restore();

  // 눈꺼풀 윤곽선
  c.beginPath();
  c.moveTo(cx-w,cy);
  c.bezierCurveTo(cx-w*0.5,cy-h*1.4, cx+w*0.5,cy-h*1.4, cx+w,cy);
  c.strokeStyle='#1a1208'; c.lineWidth=h*0.18; c.stroke();
  // 아랫눈꺼풀
  c.beginPath();
  c.moveTo(cx-w,cy);
  c.bezierCurveTo(cx-w*0.5,cy+h*0.8, cx+w*0.5,cy+h*0.8, cx+w,cy);
  c.strokeStyle='#2a1a10aa'; c.lineWidth=h*0.09; c.stroke();
  // 속눈썹
  const lashCount=5;
  for(let i=0;i<lashCount;i++){
    const t=i/(lashCount-1);
    const lx=cx-w+t*w*2;
    const ly=cy-h*(0.8+0.4*Math.sin(t*Math.PI));
    const la=Math.PI*(-0.2+t*0.4)-Math.PI/2;
    c.beginPath(); c.moveTo(lx,ly);
    c.lineTo(lx+Math.cos(la)*h*0.5, ly+Math.sin(la)*h*0.5);
    c.strokeStyle='#080604'; c.lineWidth=h*0.12; c.lineCap='round'; c.stroke();
  }
  // 눈썹
  const [bx1,by1,bx2,by2,bx3,by3]=brow;
  c.beginPath(); c.moveTo(bx1,by1); c.quadraticCurveTo(bx2,by2,bx3,by3);
  c.strokeStyle='#1a1008'; c.lineWidth=h*0.38; c.lineCap='round'; c.stroke();
  // 눈썹 하이라이트
  c.beginPath(); c.moveTo(bx1,by1); c.quadraticCurveTo(bx2,by2-h*0.08,bx3,by3);
  c.strokeStyle='rgba(80,50,20,0.3)'; c.lineWidth=h*0.12; c.stroke();
}

// ── 실사 코 ──────────────────────────────────────────
function realisticNose(c, cx, cy, w, h, skin){
  // 콧대 음영
  c.beginPath(); c.moveTo(cx,cy-h*0.5); c.bezierCurveTo(cx-w*0.15,cy,cx-w*0.2,cy+h*0.4,cx-w*0.35,cy+h*0.5);
  c.strokeStyle='rgba(0,0,0,0.12)'; c.lineWidth=w*0.25; c.lineCap='round'; c.stroke();
  c.beginPath(); c.moveTo(cx,cy-h*0.5); c.bezierCurveTo(cx+w*0.15,cy,cx+w*0.2,cy+h*0.4,cx+w*0.35,cy+h*0.5);
  c.strokeStyle='rgba(0,0,0,0.12)'; c.lineWidth=w*0.25; c.lineCap='round'; c.stroke();
  // 코끝
  const ng=c.createRadialGradient(cx,cy+h*0.3,0,cx,cy+h*0.3,w*0.6);
  ng.addColorStop(0,skin); ng.addColorStop(1,hex2rgba(skin,0.53));
  c.beginPath(); c.ellipse(cx,cy+h*0.35,w*0.55,h*0.38,0,0,Math.PI*2); c.fillStyle=ng; c.fill();
  // 콧구멍
  [-1,1].forEach(s=>{
    c.beginPath(); c.ellipse(cx+s*w*0.3,cy+h*0.55,w*0.22,h*0.2,-s*0.3,0,Math.PI*2);
    c.fillStyle='rgba(0,0,0,0.35)'; c.fill();
  });
}

// ── 실사 입 ──────────────────────────────────────────
function realisticMouth(c, cx, cy, w, style, skin){
  if(style==='smile'){
    // 윗입술
    c.beginPath(); c.moveTo(cx-w,cy);
    c.bezierCurveTo(cx-w*0.5,cy-w*0.3, cx-w*0.15,cy-w*0.35, cx,cy-w*0.15);
    c.bezierCurveTo(cx+w*0.15,cy-w*0.35, cx+w*0.5,cy-w*0.3, cx+w,cy);
    c.strokeStyle='#8a4030'; c.lineWidth=w*0.12; c.stroke();
    // 입꼬리 올라감
    c.beginPath(); c.moveTo(cx-w,cy); c.quadraticCurveTo(cx-w*1.05,cy-w*0.25,cx-w*0.92,cy-w*0.35);
    c.strokeStyle='rgba(0,0,0,0.25)'; c.lineWidth=w*0.1; c.stroke();
    c.beginPath(); c.moveTo(cx+w,cy); c.quadraticCurveTo(cx+w*1.05,cy-w*0.25,cx+w*0.92,cy-w*0.35);
    c.strokeStyle='rgba(0,0,0,0.25)'; c.lineWidth=w*0.1; c.stroke();
    // 이
    c.beginPath(); c.moveTo(cx-w*0.75,cy+w*0.05); c.bezierCurveTo(cx-w*0.4,cy-w*0.12, cx+w*0.4,cy-w*0.12, cx+w*0.75,cy+w*0.05);
    c.lineTo(cx+w*0.75,cy+w*0.3); c.bezierCurveTo(cx+w*0.4,cy+w*0.28, cx-w*0.4,cy+w*0.28, cx-w*0.75,cy+w*0.3);
    c.closePath();
    const tg=c.createLinearGradient(cx,cy-w*0.1,cx,cy+w*0.3);
    tg.addColorStop(0,'#fff'); tg.addColorStop(1,'#eee');
    c.fillStyle=tg; c.fill();
    c.strokeStyle='rgba(200,180,170,0.5)'; c.lineWidth=w*0.04;
    // 치아 선
    for(let i=-2;i<=2;i++){
      c.beginPath(); c.moveTo(cx+i*w*0.18,cy+w*0.05); c.lineTo(cx+i*w*0.18,cy+w*0.28);
      c.strokeStyle='rgba(200,190,185,0.4)'; c.lineWidth=w*0.05; c.stroke();
    }
    // 아랫입술
    c.beginPath(); c.moveTo(cx-w*0.75,cy+w*0.3);
    c.bezierCurveTo(cx-w*0.4,cy+w*0.52, cx+w*0.4,cy+w*0.52, cx+w*0.75,cy+w*0.3);
    c.fillStyle='#c07060'; c.fill();
    const llg=c.createLinearGradient(cx,cy+w*0.3,cx,cy+w*0.52);
    llg.addColorStop(0,'rgba(255,200,180,0.4)'); llg.addColorStop(1,'rgba(0,0,0,0)');
    c.fillStyle=llg; c.fill();
  } else {
    // 입술 (다문)
    const llc='#b06858';
    // 윗입술
    c.beginPath(); c.moveTo(cx-w,cy);
    c.bezierCurveTo(cx-w*0.5,cy-w*0.28, cx-w*0.15,cy-w*0.32, cx,cy-w*0.12);
    c.bezierCurveTo(cx+w*0.15,cy-w*0.32, cx+w*0.5,cy-w*0.28, cx+w,cy);
    c.fillStyle=llc+'cc'; c.fill();
    c.strokeStyle='#7a3828'; c.lineWidth=w*0.06; c.stroke();
    // 입술 경계선
    c.beginPath(); c.moveTo(cx-w,cy); c.lineTo(cx+w,cy);
    c.strokeStyle='rgba(0,0,0,0.3)'; c.lineWidth=w*0.08; c.stroke();
    // 아랫입술
    c.beginPath(); c.moveTo(cx-w,cy);
    c.bezierCurveTo(cx-w*0.5,cy+w*0.35, cx+w*0.5,cy+w*0.35, cx+w,cy);
    c.fillStyle=llc; c.fill();
    // 하이라이트
    c.beginPath(); c.ellipse(cx,cy+w*0.18,w*0.3,w*0.08,0,0,Math.PI*2);
    c.fillStyle='rgba(255,220,200,0.3)'; c.fill();
  }
}

// ── 실사 안경 (둥근 뿔테) ────────────────────────────
function realisticGlasses(c, cx, cy, sz){
  const r=sz*0.19;
  const lx=cx-sz*0.21, rx=cx+sz*0.21;
  // 렌즈 (블루라이트 반사)
  [lx,rx].forEach(gx=>{
    const lg=c.createRadialGradient(gx-r*0.3,cy-r*0.3,0,gx,cy,r);
    lg.addColorStop(0,'rgba(120,180,255,0.08)');
    lg.addColorStop(0.7,'rgba(100,160,240,0.04)');
    lg.addColorStop(1,'rgba(80,120,200,0.02)');
    c.beginPath(); c.arc(gx,cy,r,0,Math.PI*2); c.fillStyle=lg; c.fill();
    // 반사 하이라이트
    c.beginPath(); c.moveTo(gx-r*0.55,cy-r*0.7);
    c.lineTo(gx-r*0.15,cy-r*0.85); c.lineTo(gx-r*0.1,cy-r*0.55);
    c.closePath(); c.fillStyle='rgba(255,255,255,0.15)'; c.fill();
  });
  // 프레임
  [lx,rx].forEach(gx=>{
    c.beginPath(); c.arc(gx,cy,r,0,Math.PI*2);
    c.strokeStyle='#111'; c.lineWidth=sz*0.032; c.stroke();
  });
  // 코받침
  c.beginPath(); c.moveTo(lx+r*0.7,cy+r*0.15); c.bezierCurveTo(cx-r*0.15,cy+r*0.5, cx+r*0.15,cy+r*0.5, rx-r*0.7,cy+r*0.15);
  c.strokeStyle='#333'; c.lineWidth=sz*0.022; c.stroke();
  // 안경다리
  [-1,1].forEach(s=>{
    const gx=s>0?rx:lx;
    c.beginPath(); c.moveTo(gx+s*r*0.95,cy); c.lineTo(gx+s*r*1.8,cy-r*0.12);
    c.strokeStyle='#111'; c.lineWidth=sz*0.025; c.stroke();
  });
}

// ══════════════════════════════════════════════════════
//  실사 캐릭터 4인 본체
// ══════════════════════════════════════════════════════

// ── [왼쪽] 검정 터틀넥 / 쌍꺼풀 / 날카로운 인상 ────────
function drawCharFerrisLeft(c,x,y,sz,facing,t,elite){
  const fl=Math.cos(facing||0)<0?-1:1;
  const bob=Math.sin(t*0.16)*2;
  c.save(); c.translate(x,y+bob);

  // 몸 (간단하게)
  [-1,1].forEach(s=>{
    const ls=Math.sin(t*0.16)*sz*0.05*(s===1?1:-1);
    c.beginPath(); c.roundRect(s*sz*0.08,sz*0.48+ls,sz*0.13,sz*0.38,3);
    c.fillStyle='#0a0a0a'; c.fill();
  });
  c.beginPath(); c.ellipse(0,sz*0.2,sz*0.32,sz*0.36,0,0,Math.PI*2);
  c.fillStyle='#0a0a0a'; c.fill();
  [-1,1].forEach(s=>{
    c.save(); c.translate(s*sz*0.33,sz*0.1);
    c.beginPath(); c.roundRect(-sz*0.08,0,sz*0.15,sz*0.38,4);
    c.fillStyle='#0a0a0a'; c.fill(); c.restore();
  });
  // 터틀넥
  c.beginPath(); c.rect(-sz*0.09,-sz*0.12,sz*0.18,sz*0.18);
  c.fillStyle='#0a0a0a'; c.fill();
  c.beginPath(); c.ellipse(0,-sz*0.04,sz*0.1,sz*0.06,0,0,Math.PI*2);
  c.fillStyle='#111'; c.fill();

  // 얼굴 기반
  const FH=sz*1.05, FW=sz*0.82;
  const fy=-sz*0.38;

  // 목
  c.beginPath(); c.rect(-sz*0.09,fy+FH*0.72,sz*0.18,sz*0.18);
  const nsk=skinGrad(c,0,fy+FH*0.75,sz*0.12,'#f5d8b5','#e2c09a');
  c.fillStyle=nsk; c.fill();

  // 볼 음영
  [-1,1].forEach(s=>{
    const sg=c.createRadialGradient(s*FW*0.48,fy+FH*0.12,0,s*FW*0.48,fy+FH*0.12,FW*0.28);
    sg.addColorStop(0,'rgba(220,140,100,0.12)'); sg.addColorStop(1,'rgba(0,0,0,0)');
    c.beginPath(); c.ellipse(s*FW*0.48,fy+FH*0.12,FW*0.28,FH*0.22,0,0,Math.PI*2);
    c.fillStyle=sg; c.fill();
  });

  // 얼굴 본체
  c.beginPath(); c.ellipse(0,fy,FW*0.5,FH*0.5,0,0,Math.PI*2);
  c.fillStyle=skinGrad(c,-FW*0.12,fy-FH*0.18,FW*0.5,'#f8dcba','#e5c09a'); c.fill();
  c.strokeStyle='rgba(0,0,0,0.08)'; c.lineWidth=1; c.stroke();

  // 눈 (왼쪽: 쌍꺼풀 강함, 날카로운)
  const eyY=fy-FH*0.07, eyW=FW*0.22, eyH=FH*0.094;
  [-1,1].forEach(s=>{
    const ex=s*FW*0.265;
    realisticEye(c, ex, eyY, eyW, eyH, '#2a1808', '#0a0504', fl,
      [ex-eyW*1.1, eyY-eyH*2.1, ex, eyY-eyH*2.5, ex+eyW*1.1, eyY-eyH*1.9]
    );
    // 쌍꺼풀 강조선
    c.beginPath();
    c.moveTo(ex-eyW*0.8,eyY-eyH*0.2);
    c.quadraticCurveTo(ex,eyY-eyH*1.6,ex+eyW*0.8,eyY-eyH*0.2);
    c.strokeStyle='rgba(30,15,5,0.3)'; c.lineWidth=eyH*0.18; c.stroke();
  });

  // 코
  realisticNose(c, 0, fy+FH*0.14, FW*0.14, FH*0.18, '#e8c898');

  // 입 (다문, 약간 긴장)
  realisticMouth(c, 0, fy+FH*0.31, FW*0.28, 'closed', '#f5d8b5');

  // 머리카락 (검정, 사이드 스타일, 세련됨)
  // 배경 볼륨
  c.beginPath(); c.ellipse(0,fy-FH*0.48,FW*0.55,FH*0.48,0,0,Math.PI*2);
  c.fillStyle='#0c0c10'; c.fill();
  // 옆머리
  [-1,1].forEach(s=>{
    c.beginPath(); c.ellipse(s*FW*0.5,fy-FH*0.15,FW*0.15,FH*0.4,s*0.12,0,Math.PI*2);
    c.fillStyle='#0c0c10'; c.fill();
  });
  // 앞머리 (오른쪽으로 흘러내림)
  c.beginPath();
  c.moveTo(-FW*0.55,fy-FH*0.38);
  c.bezierCurveTo(-FW*0.2,fy-FH*0.88, FW*0.3,fy-FH*0.82, FW*0.5,fy-FH*0.42);
  c.lineTo(FW*0.52,fy-FH*0.18);
  c.bezierCurveTo(FW*0.1,fy-FH*0.52, -FW*0.25,fy-FH*0.6, -FW*0.5,fy-FH*0.28);
  c.closePath(); c.fillStyle='#0d0d12'; c.fill();
  // 머리카락 윤기
  c.beginPath();
  c.moveTo(-FW*0.15,fy-FH*0.7);
  c.quadraticCurveTo(FW*0.05,fy-FH*0.82,FW*0.25,fy-FH*0.65);
  c.strokeStyle='rgba(80,70,60,0.25)'; c.lineWidth=FW*0.06; c.stroke();

  // 귀
  [-1,1].forEach(s=>{
    c.beginPath(); c.ellipse(s*FW*0.52,fy+FH*0.04,FW*0.09,FH*0.14,0,0,Math.PI*2);
    c.fillStyle='#f0cca0'; c.fill(); c.strokeStyle='rgba(0,0,0,0.1)'; c.lineWidth=0.8; c.stroke();
  });

  c.restore();
}

// ── [가운데뒤] 베이지 코트+흰 니트 / 긴 얼굴 / 무표정 ──
function drawCharFerrisMid(c,x,y,sz,facing,t,elite){
  const fl=Math.cos(facing||0)<0?-1:1;
  const bob=Math.sin(t*0.14)*2;
  c.save(); c.translate(x,y+bob);

  // 베이지 코트 몸통
  [-1,1].forEach(s=>{
    const ls=Math.sin(t*0.14)*sz*0.05*(s===1?1:-1);
    c.beginPath(); c.roundRect(s*sz*0.09,sz*0.48+ls,sz*0.14,sz*0.38,3);
    c.fillStyle='#c8a870'; c.fill();
  });
  c.beginPath(); c.ellipse(0,sz*0.2,sz*0.34,sz*0.36,0,0,Math.PI*2);
  const coatG=c.createLinearGradient(-sz*0.34,0,sz*0.34,0);
  coatG.addColorStop(0,'#c0a068'); coatG.addColorStop(0.5,'#d4b47a'); coatG.addColorStop(1,'#c0a068');
  c.fillStyle=coatG; c.fill();
  // 흰 니트 (안쪽)
  c.beginPath(); c.ellipse(0,sz*0.15,sz*0.18,sz*0.2,0,0,Math.PI*2);
  c.fillStyle='#f8f5f0'; c.fill();
  // 코트 라펠
  [-1,1].forEach(s=>{
    c.beginPath(); c.moveTo(s*sz*0.06,-sz*0.09);
    c.lineTo(s*sz*0.22,sz*0.08); c.lineTo(s*sz*0.18,sz*0.28);
    c.lineTo(s*sz*0.06,sz*0.08); c.closePath();
    c.fillStyle='#b89860'; c.fill();
  });
  [-1,1].forEach(s=>{
    c.save(); c.translate(s*sz*0.35,sz*0.08);
    c.beginPath(); c.roundRect(-sz*0.08,0,sz*0.16,sz*0.4,4);
    c.fillStyle='#c8a870'; c.fill(); c.restore();
  });

  // 얼굴 (약간 긴 타원형)
  const FH=sz*1.1, FW=sz*0.78;
  const fy=-sz*0.42;

  c.beginPath(); c.rect(-sz*0.08,fy+FH*0.68,sz*0.16,sz*0.2);
  c.fillStyle=skinGrad(c,0,fy+FH*0.72,sz*0.1,'#f5d5b0','#e0b888'); c.fill();

  c.beginPath(); c.ellipse(0,fy,FW*0.5,FH*0.5,0,0,Math.PI*2);
  c.fillStyle=skinGrad(c,-FW*0.1,fy-FH*0.2,FW*0.5,'#f8d8b2','#e4bc90'); c.fill();

  // 눈 (가늘고 무표정)
  const eyY2=fy-FH*0.06, eyW2=FW*0.22, eyH2=FH*0.075;
  [-1,1].forEach(s=>{
    const ex=s*FW*0.27;
    realisticEye(c, ex, eyY2, eyW2, eyH2*0.85, '#1e1006', '#050302', fl,
      [ex-eyW2, eyY2-eyH2*2.2, ex+eyW2*0.1, eyY2-eyH2*2.6, ex+eyW2, eyY2-eyH2*2.1]
    );
  });

  realisticNose(c, 0, fy+FH*0.13, FW*0.13, FH*0.17, '#e4bc90');
  realisticMouth(c, 0, fy+FH*0.3, FW*0.25, 'closed', '#f5d5b0');

  // 머리카락 (자연스러운 검정, 앞머리 내려옴)
  c.beginPath(); c.ellipse(0,fy-FH*0.46,FW*0.54,FH*0.46,0,0,Math.PI*2);
  c.fillStyle='#0c0c0f'; c.fill();
  [-1,1].forEach(s=>{
    c.beginPath(); c.ellipse(s*FW*0.5,fy-FH*0.12,FW*0.12,FH*0.42,s*0.08,0,Math.PI*2);
    c.fillStyle='#0c0c0f'; c.fill();
  });
  c.beginPath();
  c.moveTo(-FW*0.54,fy-FH*0.32);
  c.bezierCurveTo(-FW*0.4,fy-FH*0.85, FW*0.4,fy-FH*0.85, FW*0.54,fy-FH*0.32);
  c.lineTo(FW*0.5,fy-FH*0.05);
  c.bezierCurveTo(FW*0.25,fy-FH*0.6, -FW*0.25,fy-FH*0.6, -FW*0.5,fy-FH*0.05);
  c.closePath(); c.fillStyle='#0d0d11'; c.fill();
  // 윤기
  c.beginPath(); c.moveTo(-FW*0.2,fy-FH*0.62); c.quadraticCurveTo(0,fy-FH*0.75,FW*0.2,fy-FH*0.62);
  c.strokeStyle='rgba(70,60,50,0.22)'; c.lineWidth=FW*0.08; c.stroke();

  [-1,1].forEach(s=>{
    c.beginPath(); c.ellipse(s*FW*0.52,fy+FH*0.05,FW*0.09,FH*0.14,0,0,Math.PI*2);
    c.fillStyle='#f0cca0'; c.fill();
  });

  c.restore();
}

// ── [오른쪽뒤] 검정 패딩 / 통통 볼살 / 귀여운 인상 ────
function drawCharFerrisRight(c,x,y,sz,facing,t,elite){
  const fl=Math.cos(facing||0)<0?-1:1;
  const bob=Math.sin(t*0.18)*2;
  c.save(); c.translate(x,y+bob);

  // 검정 패딩 (두툼하게)
  [-1,1].forEach(s=>{
    const ls=Math.sin(t*0.18)*sz*0.05*(s===1?1:-1);
    c.beginPath(); c.roundRect(s*sz*0.1,sz*0.46+ls,sz*0.15,sz*0.4,4);
    c.fillStyle='#141414'; c.fill();
  });
  c.beginPath(); c.ellipse(0,sz*0.22,sz*0.38,sz*0.38,0,0,Math.PI*2);
  const padG=c.createLinearGradient(-sz*0.38,0,sz*0.38,0);
  padG.addColorStop(0,'#111'); padG.addColorStop(0.5,'#222'); padG.addColorStop(1,'#111');
  c.fillStyle=padG; c.fill();
  // 패딩 누빔선
  for(let i=-1;i<=1;i++){
    c.beginPath(); c.moveTo(i*sz*0.15,sz*0.0); c.lineTo(i*sz*0.15,sz*0.45);
    c.strokeStyle='rgba(255,255,255,0.06)'; c.lineWidth=1.5; c.stroke();
  }
  [-1,1].forEach(s=>{
    c.save(); c.translate(s*sz*0.38,sz*0.12);
    c.beginPath(); c.roundRect(-sz*0.09,0,sz*0.18,sz*0.42,5);
    c.fillStyle='#141414'; c.fill(); c.restore();
  });

  // 얼굴 (통통하고 둥글게)
  const FH=sz*1.0, FW=sz*0.88;
  const fy=-sz*0.36;

  // 볼살 (핑크빛)
  [-1,1].forEach(s=>{
    const cg=c.createRadialGradient(s*FW*0.44,fy+FH*0.14,0,s*FW*0.44,fy+FH*0.14,FW*0.3);
    cg.addColorStop(0,'rgba(230,150,120,0.22)'); cg.addColorStop(1,'rgba(0,0,0,0)');
    c.beginPath(); c.ellipse(s*FW*0.44,fy+FH*0.14,FW*0.32,FH*0.25,0,0,Math.PI*2);
    c.fillStyle=cg; c.fill();
  });

  c.beginPath(); c.ellipse(0,fy,FW*0.5,FH*0.5,0,0,Math.PI*2);
  c.fillStyle=skinGrad(c,-FW*0.1,fy-FH*0.18,FW*0.52,'#fcdab8','#ecc09a'); c.fill();

  const eyY3=fy-FH*0.08, eyW3=FW*0.2, eyH3=FH*0.082;
  [-1,1].forEach(s=>{
    realisticEye(c, s*FW*0.26, eyY3, eyW3, eyH3, '#1e1208', '#050302', fl,
      [s*FW*0.06, eyY3-eyH3*2.1, s*FW*0.26, eyY3-eyH3*2.55, s*FW*0.46, eyY3-eyH3*2.1]
    );
  });

  realisticNose(c, 0, fy+FH*0.15, FW*0.16, FH*0.19, '#ecc09a');
  realisticMouth(c, 0, fy+FH*0.33, FW*0.27, 'closed', '#fcdab8');

  // 머리카락 (일자 앞머리, 통통한 얼굴에 맞게 옆으로 퍼짐)
  c.beginPath(); c.ellipse(0,fy-FH*0.44,FW*0.56,FH*0.44,0,0,Math.PI*2);
  c.fillStyle='#0c0c0f'; c.fill();
  [-1,1].forEach(s=>{
    c.beginPath(); c.ellipse(s*FW*0.52,fy-FH*0.1,FW*0.14,FH*0.42,s*0.06,0,Math.PI*2);
    c.fillStyle='#0c0c0f'; c.fill();
  });
  c.beginPath();
  c.moveTo(-FW*0.56,fy-FH*0.28);
  c.bezierCurveTo(-FW*0.56,fy-FH*0.82, FW*0.56,fy-FH*0.82, FW*0.56,fy-FH*0.28);
  c.lineTo(FW*0.54,fy-FH*0.05);
  c.quadraticCurveTo(0,fy-FH*0.65,-FW*0.54,fy-FH*0.05);
  c.closePath(); c.fillStyle='#0e0e12'; c.fill();

  // 귀 (볼살로 인해 약간만 보임)
  [-1,1].forEach(s=>{
    c.beginPath(); c.ellipse(s*FW*0.54,fy+FH*0.06,FW*0.085,FH*0.13,0,0,Math.PI*2);
    c.fillStyle='#f2c8a0'; c.fill();
  });

  c.restore();
}

// ── [앞 셀카] 둥근 뿔테 안경 / 웃는 표정 / 볼살 ─────────
function drawCharFerrisFront(c,x,y,sz,facing,t,elite){
  const fl=Math.cos(facing||0)<0?-1:1;
  const bob=Math.sin(t*0.15)*2;
  c.save(); c.translate(x,y+bob);

  // 검정 패딩+후드
  [-1,1].forEach(s=>{
    const ls=Math.sin(t*0.15)*sz*0.05*(s===1?1:-1);
    c.beginPath(); c.roundRect(s*sz*0.1,sz*0.46+ls,sz*0.15,sz*0.4,4);
    c.fillStyle='#111'; c.fill();
  });
  c.beginPath(); c.ellipse(0,sz*0.2,sz*0.37,sz*0.37,0,0,Math.PI*2);
  c.fillStyle='#111'; c.fill();
  // 후드 끈
  [-1,1].forEach(s=>{
    c.beginPath(); c.moveTo(s*sz*0.06,sz*0.0); c.lineTo(s*sz*0.04,sz*0.32);
    c.strokeStyle='#888'; c.lineWidth=sz*0.025; c.stroke();
  });
  [-1,1].forEach(s=>{
    c.save(); c.translate(s*sz*0.37,sz*0.1);
    c.beginPath(); c.roundRect(-sz*0.09,0,sz*0.18,sz*0.4,5);
    c.fillStyle='#111'; c.fill(); c.restore();
  });

  // 얼굴 (둥글고 볼살, 웃어서 눈 살짝 올라감)
  const FH=sz*1.0, FW=sz*0.9;
  const fy=-sz*0.35;

  // 볼살 핑크
  [-1,1].forEach(s=>{
    const cg=c.createRadialGradient(s*FW*0.46,fy+FH*0.18,0,s*FW*0.46,fy+FH*0.18,FW*0.32);
    cg.addColorStop(0,'rgba(235,145,115,0.28)'); cg.addColorStop(1,'rgba(0,0,0,0)');
    c.beginPath(); c.ellipse(s*FW*0.46,fy+FH*0.18,FW*0.34,FH*0.26,0,0,Math.PI*2);
    c.fillStyle=cg; c.fill();
  });

  c.beginPath(); c.ellipse(0,fy,FW*0.5,FH*0.5,0,0,Math.PI*2);
  c.fillStyle=skinGrad(c,-FW*0.1,fy-FH*0.2,FW*0.52,'#fcddb8','#ecbe98'); c.fill();

  // 눈 (웃어서 약간 올라감, 눈꼬리 올라감)
  const eyY4=fy-FH*0.1, eyW4=FW*0.2, eyH4=FH*0.076;
  [-1,1].forEach(s=>{
    c.save(); c.translate(s*FW*0.25, eyY4); c.rotate(s*0.06); // 웃는 각도
    realisticEye(c, 0, 0, eyW4, eyH4*0.88, '#201408', '#050302', fl,
      [-eyW4*1.05, -eyH4*2.0, 0, -eyH4*2.45, eyW4*1.05, -eyH4*1.9]
    );
    // 웃을 때 눈 아래 주름
    c.beginPath(); c.moveTo(-eyW4*0.8,eyH4*1.0); c.quadraticCurveTo(0,eyH4*1.6,eyW4*0.8,eyH4*1.0);
    c.strokeStyle='rgba(0,0,0,0.18)'; c.lineWidth=eyH4*0.25; c.stroke();
    c.restore();
  });

  realisticNose(c, 0, fy+FH*0.15, FW*0.15, FH*0.18, '#ecbe98');
  // 웃는 입
  realisticMouth(c, 0, fy+FH*0.33, FW*0.3, 'smile', '#fcddb8');

  // 안경 (특징! 둥근 뿔테)
  realisticGlasses(c, 0, fy-FH*0.06, sz);

  // 머리카락 (앞머리 일자, 귀여운 스타일)
  c.beginPath(); c.ellipse(0,fy-FH*0.44,FW*0.56,FH*0.44,0,0,Math.PI*2);
  c.fillStyle='#0d0d12'; c.fill();
  [-1,1].forEach(s=>{
    c.beginPath(); c.ellipse(s*FW*0.54,fy-FH*0.08,FW*0.14,FH*0.43,s*0.05,0,Math.PI*2);
    c.fillStyle='#0d0d12'; c.fill();
  });
  c.beginPath();
  c.moveTo(-FW*0.56,fy-FH*0.28);
  c.bezierCurveTo(-FW*0.58,fy-FH*0.84, FW*0.58,fy-FH*0.84, FW*0.56,fy-FH*0.28);
  c.lineTo(FW*0.52,fy-FH*0.04);
  c.quadraticCurveTo(0,fy-FH*0.62,-FW*0.52,fy-FH*0.04);
  c.closePath(); c.fillStyle='#0f0f14'; c.fill();
  // 윤기
  c.beginPath(); c.moveTo(-FW*0.18,fy-FH*0.65); c.quadraticCurveTo(0,fy-FH*0.76,FW*0.18,fy-FH*0.65);
  c.strokeStyle='rgba(75,65,55,0.2)'; c.lineWidth=FW*0.07; c.stroke();

  [-1,1].forEach(s=>{
    c.beginPath(); c.ellipse(s*FW*0.55,fy+FH*0.07,FW*0.085,FH*0.13,0,0,Math.PI*2);
    c.fillStyle='#f4caa0'; c.fill();
  });

  c.restore();
}


// ── 보스 픽셀아트 (스테이지별 완전 다른 생김새) ─────
function drawBossReplace(c,x,y,sz,f,t,enraged,type,m){
  const s=Math.max(2,sz*0.22)|0;
  const pulse=0.92+0.08*Math.sin(t*0.08);
  const ox=x-7*s, oy=y-9*s;
  c.save();
  c.imageSmoothingEnabled=false;

  if(type==='boss'){
    // ─ 스테이지1: 던전의 군주 (갈색 해골왕, 왕관) ─
    const crown=enraged?'#ff8800':'#ffd700';
    const bone=enraged?'#ffe0a0':'#d4b896';
    const dark='#8b6040'; const eye='#ff0000';
    // 왕관
    px(c,ox+s,oy,s,2*s,crown); px(c,ox+3*s,oy-s,2*s,3*s,crown); px(c,ox+6*s,oy,s,2*s,crown);
    px(c,ox,oy+s,8*s,s,crown);
    // 머리
    px(c,ox,oy+2*s,8*s,6*s,bone);
    px(c,ox+s,oy+3*s,2*s,2*s,eye); px(c,ox+5*s,oy+3*s,2*s,2*s,eye); // 눈
    px(c,ox+s,oy+7*s,6*s,s,dark); // 입
    px(c,ox+2*s,oy+7*s,s,s,'#fff'); px(c,ox+4*s,oy+7*s,s,s,'#fff'); px(c,ox+6*s,oy+7*s,s,s,'#fff');
    // 몸통
    px(c,ox+s,oy+8*s,6*s,5*s,dark);
    px(c,ox,oy+9*s,s,3*s,bone); px(c,ox+7*s,oy+9*s,s,3*s,bone); // 팔
    // 다리
    px(c,ox+s,oy+13*s,3*s,3*s,dark); px(c,ox+4*s,oy+13*s,3*s,3*s,dark);

  } else if(type==='boss2'){
    // ─ 스테이지2: 암흑 군주 (보라빛 망령, 눈만 보임) ─
    const col=enraged?'#dd00ff':'#9900cc'; const glow=enraged?'#ff88ff':'#cc66ff';
    const dark2='#220033'; const eyeC='#ffffff';
    // 망토 (물결 형태)
    px(c,ox+2*s,oy,4*s,s,col);
    px(c,ox+s,oy+s,6*s,s,col);
    px(c,ox,oy+2*s,8*s,8*s,col);
    px(c,ox+s,oy+10*s,6*s,s,col);
    // 내부 어둠
    px(c,ox+s,oy+3*s,6*s,4*s,dark2);
    // 눈 (빛남)
    px(c,ox+2*s,oy+4*s,s,2*s,eyeC); px(c,ox+5*s,oy+4*s,s,2*s,eyeC);
    px(c,ox+2*s,oy+4*s,s,s,glow); px(c,ox+5*s,oy+4*s,s,s,glow);
    // 물결 밑단
    for(let i=0;i<4;i++) px(c,ox+i*2*s,oy+11*s,s,s+Math.floor(Math.sin(t*0.15+i)*s),col);
    // 촉수
    px(c,ox-s,oy+5*s,s,4*s,col); px(c,ox+8*s,oy+5*s,s,4*s,col);

  } else if(type==='boss3'){
    // ─ 스테이지3: 빙하 군주 (얼음 골렘, 파란색) ─
    const ice=enraged?'#88eeff':'#aaddff'; const crystal='#ffffff'; const dark3='#004466';
    // 얼음 결정 머리 (각진 형태)
    px(c,ox+2*s,oy,4*s,s,crystal);
    px(c,ox+s,oy+s,6*s,2*s,ice);
    px(c,ox,oy+3*s,8*s,4*s,ice);
    // 눈 (검은 구멍)
    px(c,ox+s,oy+4*s,2*s,2*s,dark3); px(c,ox+5*s,oy+4*s,2*s,2*s,dark3);
    // 얼음 결정 돌기
    px(c,ox-s,oy+s,s,3*s,crystal); px(c,ox+8*s,oy+s,s,3*s,crystal);
    px(c,ox,oy,s,s,ice); px(c,ox+7*s,oy,s,s,ice);
    // 두꺼운 몸통
    px(c,ox,oy+7*s,8*s,6*s,ice);
    px(c,ox+s,oy+8*s,6*s,4*s,crystal);
    // 팔 (얼음 블록)
    px(c,ox-2*s,oy+7*s,2*s,4*s,ice); px(c,ox+8*s,oy+7*s,2*s,4*s,ice);
    // 다리
    px(c,ox,oy+13*s,3*s,3*s,dark3); px(c,ox+5*s,oy+13*s,3*s,3*s,dark3);

  } else if(type==='boss4'){
    // ─ 스테이지4: 번개 군주 (전기 마왕, 노란색) ─
    const bolt=enraged?'#ffffff':'#ffee00'; const body='#ff8800'; const spark='#ffff00';
    // 번개 뿔
    px(c,ox+s,oy-2*s,s,3*s,bolt); px(c,ox+6*s,oy-2*s,s,3*s,bolt);
    px(c,ox+2*s,oy-s,s,s,bolt); px(c,ox+5*s,oy-s,s,s,bolt);
    // 머리
    px(c,ox,oy,8*s,6*s,body);
    px(c,ox+s,oy+s,2*s,2*s,spark); px(c,ox+5*s,oy+s,2*s,2*s,spark); // 눈
    // 번개 패턴 (몸통)
    px(c,ox,oy+6*s,8*s,7*s,body);
    px(c,ox+3*s,oy+7*s,2*s,5*s,bolt); // 번개 무늬
    px(c,ox+2*s,oy+9*s,s,s,bolt); px(c,ox+5*s,oy+9*s,s,s,bolt);
    // 날개
    px(c,ox-2*s,oy+6*s,2*s,3*s,bolt); px(c,ox+8*s,oy+6*s,2*s,3*s,bolt);
    // 다리
    px(c,ox+s,oy+13*s,2*s,3*s,body); px(c,ox+5*s,oy+13*s,2*s,3*s,body);

  } else if(type==='boss5'){
    // ─ 스테이지5: 마왕 (암흑 드래곤, 빨간+검정) ─
    const scale=enraged?'#ff2200':'#cc0000'; const wing='#880000'; const claw='#ffaa00';
    // 날개 (넓게)
    px(c,ox-3*s,oy+2*s,3*s,6*s,wing); px(c,ox+8*s,oy+2*s,3*s,6*s,wing);
    px(c,ox-4*s,oy+3*s,s,4*s,wing); px(c,ox+11*s,oy+3*s,s,4*s,wing);
    // 뿔
    px(c,ox+s,oy-3*s,s,4*s,'#333'); px(c,ox+6*s,oy-3*s,s,4*s,'#333');
    px(c,ox+2*s,oy-s,s,s,claw); px(c,ox+5*s,oy-s,s,s,claw);
    // 머리 (용 형태)
    px(c,ox,oy,8*s,5*s,scale);
    px(c,ox+s,oy+s,2*s,2*s,claw); px(c,ox+5*s,oy+s,2*s,2*s,claw); // 눈
    px(c,ox,oy+4*s,8*s,s,'#ff4400'); // 불꽃 입
    // 몸통 (비늘 패턴)
    px(c,ox,oy+5*s,8*s,8*s,scale);
    for(let i=0;i<4;i++) px(c,ox+i*2*s,oy+6*s,s,s,wing); // 비늘
    for(let i=0;i<4;i++) px(c,ox+i*2*s+s,oy+8*s,s,s,wing);
    // 꼬리
    px(c,ox+5*s,oy+13*s,4*s,s,scale); px(c,ox+7*s,oy+14*s,3*s,s,scale);
    // 발
    px(c,ox,oy+13*s,3*s,3*s,scale); px(c,ox+4*s,oy+13*s,3*s,3*s,scale);
    px(c,ox-s,oy+15*s,2*s,s,claw); px(c,ox+4*s,oy+15*s,2*s,s,claw); // 발톱
  }

  // 공통: 격노 오라 효과
  if(enraged){
    c.globalAlpha=0.25+0.1*Math.sin(t*0.12);
    c.strokeStyle=type==='boss5'?'#ff0000':type==='boss4'?'#ffff00':type==='boss3'?'#00ffff':type==='boss2'?'#ff00ff':'#ff4400';
    c.lineWidth=4;
    c.beginPath(); c.arc(x,y,sz*0.7*pulse,0,Math.PI*2); c.stroke();
    c.globalAlpha=0.1;
    c.fillStyle=c.strokeStyle;
    c.beginPath(); c.arc(x,y,sz*0.7*pulse,0,Math.PI*2); c.fill();
  }
  c.restore();
}
// ── 캐릭터 타입 → 드로우 함수 매핑 ──────────────────
const CHAR_DRAW = {
  // ── 플레이어 스킨 ──────────────────────────────────
  player:    (c,x,y,sz,f,t,e)=>drawCharFerrisLeft(c,x,y,sz,f,t,e),
  char_headphone:   (c,x,y,sz,f,t,e)=>drawCharFerrisLeft(c,x,y,sz,f,t,e),
  char_cap:         (c,x,y,sz,f,t,e)=>drawCharArcherFriend(c,x,y,sz,f,t,e),
  char_thumbsup:    (c,x,y,sz,f,t,e)=>drawCharMageFriend(c,x,y,sz,f,t,e),
  char_tall:        (c,x,y,sz,f,t,e)=>drawCharTallHero(c,x,y,sz,f,t,e),
  char_longcoat:    (c,x,y,sz,f,t,e)=>drawCharFerrisMid(c,x,y,sz,f,t,e||false),
  char_ferris_left: (c,x,y,sz,f,t,e)=>drawCharFerrisLeft(c,x,y,sz,f,t,e||false),
  char_ferris_mid:  (c,x,y,sz,f,t,e)=>drawCharFerrisMid(c,x,y,sz,f,t,e||false),
  char_ferris_right:(c,x,y,sz,f,t,e)=>drawCharFerrisRight(c,x,y,sz,f,t,e||false),
  char_ferris_front:(c,x,y,sz,f,t,e)=>drawCharFerrisFront(c,x,y,sz,f,t,e||false),

  // ── 몬스터 — 존재하는 함수로만 매핑 ────────────────
  goblin:    (c,x,y,sz,f,t,e)=>drawCharFerrisRight(c,x,y,sz,f,t,e),   // 통통 얼굴
  skeleton:  (c,x,y,sz,f,t,e)=>drawCharArcherFriend(c,x,y,sz,f,t,e),
  slime:     (c,x,y,sz,f,t,e)=>drawCharFerrisFront(c,x,y,sz,f,t,e),   // 웃는 얼굴
  orc:       (c,x,y,sz,f,t,e)=>drawCharFerrisLeft(c,x,y,sz,f,t,e),    // 날카로운 인상
  archer:    (c,x,y,sz,f,t,e)=>drawCharArcher(c,x,y,sz,f,t,e),
  shade:     (c,x,y,sz,f,t,e)=>drawCharArcherFriend(c,x,y,sz,f,t,e),
  berserker: (c,x,y,sz,f,t,e)=>drawCharFerrisMid(c,x,y,sz,f,t,e),     // 무표정
  mage:      (c,x,y,sz,f,t,e)=>drawCharMage(c,x,y,sz,f,t,e),
  hunter:    (c,x,y,sz,f,t,e)=>drawCharMageFriend(c,x,y,sz,f,t,e),
  bomber:    (c,x,y,sz,f,t,e)=>drawCharTallHero(c,x,y,sz,f,t,e),
  vampire:   (c,x,y,sz,f,t,e)=>drawCharMageFriend(c,x,y,sz,f,t,e),
  golem:     (c,x,y,sz,f,t,e)=>drawCharFerrisLeft(c,x,y,sz,f,t,e),
  wraith:    (c,x,y,sz,f,t,e)=>drawCharFerrisMid(c,x,y,sz,f,t,e||false),
  hydra:     (c,x,y,sz,f,t,e)=>drawCharFerrisMid(c,x,y,sz,f,t,e),
  lich:      (c,x,y,sz,f,t,e)=>drawCharFerrisLeft(c,x,y,sz,f,t,e),
  dragon:    (c,x,y,sz,f,t,e)=>drawCharFerrisMid(c,x,y,sz,f,t,e),
  demon:     (c,x,y,sz,f,t,e)=>drawCharFerrisRight(c,x,y,sz,f,t,e),
  boss:      (c,x,y,sz,f,t,e)=>drawBossReplace(c,x,y,sz,f,t,e,'boss'),
  boss2:     (c,x,y,sz,f,t,e,m)=>drawBossReplace(c,x,y,sz,f,t,e,'boss2',m),
  boss3:     (c,x,y,sz,f,t,e,m)=>drawBossReplace(c,x,y,sz,f,t,e,'boss3',m),
  boss4:     (c,x,y,sz,f,t,e,m)=>drawBossReplace(c,x,y,sz,f,t,e,'boss4',m),
  boss5:     (c,x,y,sz,f,t,e,m)=>drawBossReplace(c,x,y,sz,f,t,e,'boss5',m),
};

// ── 몬스터 그리기 래퍼 ───────────────────────────────
// 몬스터 타입별 사진 매핑
const MONSTER_PHOTO = {
  goblin:'photo0', skeleton:'photo1', slime:'photo2',
  orc:'photo3', archer:'photo4', shade:'photo0',
  berserker:'photo1', mage:'photo2', hunter:'photo3',
  bomber:'photo4', vampire:'photo0',
  golem:'photo1', wraith:'photo2', hydra:'photo3',
  lich:'photo4', dragon:'photo0', demon:'photo1',
  boss:'photo2', boss2:'photo3', boss3:'photo4',
  boss4:'photo0', boss5:'photo1',
};
const MONSTER_COLOR = {
  goblin:'#2a4a1a', skeleton:'#2a2a3a', slime:'#1a3a1a',
  orc:'#3a1a0a', archer:'#1a3a1a', shade:'#1a0a3a',
  berserker:'#4a0a0a', mage:'#1a0a4a', hunter:'#3a2a0a',
  bomber:'#4a2a0a', vampire:'#3a0a3a',
  golem:'#2a2a2a', wraith:'#0a1a3a', hydra:'#0a3a2a',
  lich:'#2a0a4a', dragon:'#4a1a0a', demon:'#3a0a0a',
  boss:'#4a0000', boss2:'#2a004a', boss3:'#004a4a',
  boss4:'#3a3a00', boss5:'#4a0a0a',
};

// ── 픽셀아트 몬스터 드로우 ───────────────────────────
function drawMonsterSprite(c, m, sx, sy){
  const isBoss=m.type&&m.type.startsWith('boss');
  const enraged=m.enraged;
  const warn=m.warnPhase;
  const sc=isBoss?3.2:m.size<14?1.6:2.2;
  c.save();
  c.imageSmoothingEnabled=false;
  if(enraged){c.shadowColor='#f60';c.shadowBlur=18;}
  else if(warn){c.shadowColor='#f44';c.shadowBlur=10;}
  const type=m.type||'goblin';
  drawPixelMonster(c, type, sx, sy, sc, enraged);
  c.restore();
}

// 픽셀 블록 단위 그리기 헬퍼
function px(c,x,y,w,h,col){c.fillStyle=col;c.fillRect(x,y,w,h);}

function drawPixelMonster(c,type,cx,cy,sc,enraged){
  // 각 몬스터별 픽셀아트 (8x8 기준, sc 배율)
  const s=sc|0||1;
  const ox=cx-4*s, oy=cy-6*s; // 중심 기준
  if(type==='goblin'){
    // 고블린: 초록 피부, 뾰족 귀, 빨간 눈
    const skin=enraged?'#2d7':'#3c9';
    const dark='#1a5c33'; const eye='#f22';
    px(c,ox+2*s,oy,4*s,s,'#555'); // 모자
    px(c,ox+s,oy+s,6*s,4*s,skin); // 머리
    px(c,ox,oy+2*s,s,2*s,skin);   // 왼쪽 귀
    px(c,ox+7*s,oy+2*s,s,2*s,skin); // 오른쪽 귀
    px(c,ox+2*s,oy+2*s,s,s,eye);  // 왼눈
    px(c,ox+5*s,oy+2*s,s,s,eye);  // 오른눈
    px(c,ox+3*s,oy+4*s,2*s,s,dark); // 입
    px(c,ox+2*s,oy+5*s,4*s,3*s,skin); // 몸통
    px(c,ox+s,oy+8*s,2*s,3*s,dark);  // 왼다리
    px(c,ox+5*s,oy+8*s,2*s,3*s,dark); // 오른다리
    px(c,ox,oy+5*s,2*s,2*s,dark);  // 왼팔
    px(c,ox+6*s,oy+5*s,2*s,2*s,dark); // 오른팔
  } else if(type==='skeleton'){
    // 해골: 흰뼈, 검은 눈구멍
    const bone=enraged?'#eee':'#ccd';
    const shadow='#8899aa'; const hole='#111';
    px(c,ox+s,oy,6*s,s,bone);     // 머리 위
    px(c,ox,oy+s,8*s,4*s,bone);   // 머리
    px(c,ox+s,oy+2*s,2*s,2*s,hole); // 왼눈
    px(c,ox+5*s,oy+2*s,2*s,2*s,hole); // 오른눈
    px(c,ox+2*s,oy+4*s,s,s,hole); // 코
    px(c,ox+2*s,oy+5*s,4*s,s,bone); // 턱
    px(c,ox+s,oy+5*s,s,s,shadow); px(c,ox+3*s,oy+5*s,s,s,shadow); px(c,ox+5*s,oy+5*s,s,s,shadow);
    px(c,ox+3*s,oy+6*s,2*s,4*s,shadow); // 척추
    px(c,ox+s,oy+6*s,2*s,2*s,bone); px(c,ox+5*s,oy+6*s,2*s,2*s,bone); // 어깨
    px(c,ox,oy+8*s,s,3*s,bone); px(c,ox+7*s,oy+8*s,s,3*s,bone); // 팔뼈
    px(c,ox+2*s,oy+10*s,2*s,s,bone); px(c,ox+4*s,oy+10*s,2*s,s,bone); // 다리뼈
  } else if(type==='slime'){
    // 슬라임: 파란 물방울 형태
    const col=enraged?'#0ff':'#0de'; const dark='#09a';
    px(c,ox+2*s,oy+2*s,4*s,s,col); // 상단
    px(c,ox+s,oy+3*s,6*s,4*s,col); // 몸
    px(c,ox,oy+4*s,8*s,2*s,col);
    px(c,ox+s,oy+6*s,2*s,s,dark); px(c,ox+5*s,oy+6*s,2*s,s,dark); // 눈
    px(c,ox+2*s,oy+7*s,4*s,s,col); // 하단
    // 반짝임
    px(c,ox+5*s,oy+3*s,s,s,'#fff');
  } else if(type==='orc'){
    // 오크: 갈색, 큰 덩치, 어깨패드
    const skin=enraged?'#b44':'#c63'; const armor='#664';
    const eye='#ff0'; const dark='#7a2';
    px(c,ox+s,oy,6*s,s,armor);    // 투구
    px(c,ox,oy+s,8*s,5*s,skin);   // 머리
    px(c,ox+s,oy+2*s,2*s,2*s,eye); px(c,ox+5*s,oy+2*s,2*s,2*s,eye); // 눈
    px(c,ox+2*s,oy+5*s,4*s,s,'#822'); // 이빨
    px(c,ox,oy+6*s,8*s,4*s,armor); // 갑옷 몸통
    px(c,ox,oy+4*s,s,4*s,skin);px(c,ox+7*s,oy+4*s,s,4*s,skin); // 팔
    px(c,ox+s,oy+10*s,3*s,2*s,armor); px(c,ox+4*s,oy+10*s,3*s,2*s,armor); // 다리
  } else if(type==='archer'){
    // 아처: 초록망토, 활
    const cape='#2a5'; const skin='#e8a'; const bow='#852';
    px(c,ox+2*s,oy,4*s,s,'#2a5');    // 모자
    px(c,ox+s,oy+s,6*s,4*s,skin);    // 얼굴
    px(c,ox+2*s,oy+2*s,s,s,'#422'); px(c,ox+5*s,oy+2*s,s,s,'#422'); // 눈
    px(c,ox+s,oy+5*s,6*s,4*s,cape);  // 몸
    px(c,ox,oy+4*s,s,6*s,bow);       // 활
    px(c,ox+7*s,oy+3*s,s,5*s,'#cc8'); // 화살
    px(c,ox+2*s,oy+9*s,2*s,3*s,cape); px(c,ox+4*s,oy+9*s,2*s,3*s,cape);
  } else if(type==='shade'){
    // 쉐이드: 보라 그림자 유령
    const col=enraged?'#c4f':'#84c'; const dark='#416';
    px(c,ox+2*s,oy+s,4*s,s,col);
    px(c,ox+s,oy+2*s,6*s,5*s,col);
    px(c,ox,oy+3*s,8*s,3*s,col);
    px(c,ox+2*s,oy+3*s,s,s,'#fff'); px(c,ox+5*s,oy+3*s,s,s,'#fff'); // 눈
    // 아랫부분 물결
    for(let i=0;i<4;i++) px(c,ox+i*2*s,oy+7*s,s,s,col);
    px(c,ox+2*s,oy+8*s,s,s,dark); px(c,ox+5*s,oy+8*s,s,s,dark);
  } else if(type==='berserker'){
    // 버서커: 붉은 갑옷, 도끼
    const arm=enraged?'#f00':'#a22'; const body='#622';
    px(c,ox,oy,8*s,s,'#333');       // 뿔 투구
    px(c,ox,oy+s,8*s,5*s,arm);      // 머리
    px(c,ox+s,oy+2*s,2*s,2*s,'#ff8'); px(c,ox+5*s,oy+2*s,2*s,2*s,'#ff8');
    px(c,ox,oy+6*s,8*s,4*s,body);   // 몸
    // 도끼
    px(c,ox-2*s,oy+3*s,2*s,4*s,'#888');
    px(c,ox-3*s,oy+2*s,3*s,s,'#aaa');
    px(c,ox-3*s,oy+6*s,3*s,s,'#aaa');
    px(c,ox+2*s,oy+10*s,2*s,3*s,body); px(c,ox+4*s,oy+10*s,2*s,3*s,body);
  } else if(type==='lich'){
    // 리치: 검은 로브, 빛나는 눈
    const robe='#1a0a2a'; const glow=enraged?'#f0f':'#a0f';
    px(c,ox+2*s,oy,4*s,s,glow);     // 왕관
    px(c,ox+s,oy+s,6*s,4*s,robe);   // 머리
    px(c,ox+2*s,oy+2*s,s,2*s,glow); px(c,ox+5*s,oy+2*s,s,2*s,glow); // 눈
    px(c,ox,oy+5*s,8*s,6*s,robe);   // 로브
    px(c,ox-s,oy+5*s,s,5*s,robe);   // 왼소매
    px(c,ox+8*s,oy+5*s,s,5*s,robe); // 오른소매
    // 마법구
    px(c,ox+3*s,oy+11*s,2*s,2*s,'#80f');
    px(c,ox+3*s,oy+12*s,2*s,s,glow);
  } else if(type==='dragon'){
    // 드래곤: 빨간 거대 용
    const sc2=sc>2?sc:sc*1.5;
    const col=enraged?'#f80':'#e64'; const wing='#c30'; const eye='#ff0';
    px(c,ox-2*s,oy+s,4*s,3*s,wing); px(c,ox+6*s,oy+s,4*s,3*s,wing); // 날개
    px(c,ox+s,oy,6*s,6*s,col);      // 머리
    px(c,ox+2*s,oy+s,s,2*s,eye); px(c,ox+5*s,oy+s,s,2*s,eye);
    px(c,ox+s,oy+5*s,6*s,s,'#f88'); // 이빨
    px(c,ox+2*s,oy+6*s,4*s,4*s,col); // 목
    px(c,ox,oy+10*s,8*s,3*s,col);   // 몸
    px(c,ox+s,oy+13*s,2*s,2*s,wing); px(c,ox+5*s,oy+13*s,2*s,2*s,wing); // 다리
  } else if(type==='demon'){
    // 데몬: 검붉은, 날개
    const col=enraged?'#f44':'#c22'; const wing='#611'; const horn='#333';
    px(c,ox+s,oy,s,2*s,horn); px(c,ox+6*s,oy,s,2*s,horn); // 뿔
    px(c,ox+s,oy+2*s,6*s,4*s,col);   // 머리
    px(c,ox+2*s,oy+3*s,2*s,s,'#ff8'); px(c,ox+4*s,oy+3*s,2*s,s,'#ff8');
    px(c,ox,oy+6*s,8*s,5*s,col);     // 몸
    px(c,ox-2*s,oy+4*s,3*s,5*s,wing); px(c,ox+7*s,oy+4*s,3*s,5*s,wing); // 날개
    px(c,ox+s,oy+11*s,3*s,3*s,col); px(c,ox+4*s,oy+11*s,3*s,3*s,col);
  } else {
    // 기본: 빨간 박스
    px(c,ox+s,oy,6*s,8*s,'#e22');
    px(c,ox+2*s,oy+2*s,s,s,'#ff0'); px(c,ox+5*s,oy+2*s,s,s,'#ff0');
  }
}

// ── 플레이어 그리기 래퍼 ─────────────────────────────
function drawPlayerSprite(c, sx, sy, facing, blinking, alive, colorIdx, charId){
  c.globalAlpha = !alive?0.3:blinking?0.5:1;
  const bob=Math.sin(tick*0.18)*2;
  const photoMap = {
    player:'photo0', char_headphone:'photo0',
    char_cap:'photo1', char_thumbsup:'photo2',
    char_tall:'photo3', char_longcoat:'photo4',
    char_ferris_left:'photo0', char_ferris_mid:'photo1',
    char_ferris_right:'photo2', char_ferris_front:'photo3',
    photo0:'photo0', photo1:'photo1', photo2:'photo2', photo3:'photo3', photo4:'photo4',
  };
  // charId 결정: 전달된 charId → charIdMap → selectedChar → 기본값
  const cid = charId || (window._charIdMap&&window._charIdMap[window._drawingPid]) || selectedChar || 'photo0';
  const key = photoMap[cid] || cid || 'photo0';
  // PHOTO_IMGS에 없으면 photo0 폴백
  const img = PHOTO_IMGS[key] || PHOTO_IMGS['photo0'];
  if(img && img.complete && img.naturalWidth){
    drawPhotoChar(c, key, sx, sy+bob, 26, '#1a1a2a', blinking&&alive);
  } else if(PHOTO_IMGS['photo0'] && PHOTO_IMGS['photo0'].complete){
    drawPhotoChar(c, 'photo0', sx, sy+bob, 26, '#1a1a2a', blinking&&alive);
  } else {
    drawPixelPlayer(c, sx, sy+bob, colorIdx||0, blinking&&alive);
  }
  c.globalAlpha=1;
}

// 멀티 전용 픽셀아트 플레이어 (colorIdx로 구분)
function drawPixelPlayer(c, cx, cy, colorIdx, blinking){
  if(blinking) c.globalAlpha*=0.5;
  const s=2;
  const ox=cx-4*s, oy=cy-7*s;
  // 색상 팔레트 (5가지)
  const palettes=[
    {skin:'#f5c5a0',hair:'#3a1a00',body:'#2266cc',leg:'#1a1a3a'}, // 파란 기사
    {skin:'#f5c5a0',hair:'#cc2200',body:'#cc2244',leg:'#3a0a0a'}, // 빨간 전사
    {skin:'#c8e8b0',hair:'#004400',body:'#228833',leg:'#0a2a0a'}, // 초록 궁수
    {skin:'#f5e0a0',hair:'#886600',body:'#cc8800',leg:'#3a2a00'}, // 노란 마법사
    {skin:'#e0b8f0',hair:'#440066',body:'#8833cc',leg:'#220044'}, // 보라 닌자
  ];
  const pal=palettes[colorIdx%palettes.length];

  // 머리
  px(c,ox+s,oy,   6*s,s,  pal.hair);    // 머리카락 위
  px(c,ox,  oy+s, 8*s,4*s,pal.skin);    // 얼굴
  px(c,ox,  oy+s, s,  2*s,pal.hair);    // 왼쪽 머리카락
  px(c,ox+7*s,oy+s,s, 2*s,pal.hair);   // 오른쪽 머리카락
  px(c,ox+2*s,oy+2*s,s,s,'#222');      // 왼눈
  px(c,ox+5*s,oy+2*s,s,s,'#222');      // 오른눈
  px(c,ox+3*s,oy+4*s,2*s,s,'#c87');    // 입
  // 몸통
  px(c,ox+s,oy+5*s,6*s,4*s,pal.body);  // 상체
  px(c,ox,  oy+6*s,s,  3*s,pal.body);  // 왼팔
  px(c,ox+7*s,oy+6*s,s,3*s,pal.body);  // 오른팔
  // 다리
  px(c,ox+s,  oy+9*s,3*s,3*s,pal.leg); // 왼다리
  px(c,ox+4*s,oy+9*s,3*s,3*s,pal.leg); // 오른다리
  // 발
  px(c,ox,    oy+11*s,3*s,s,'#333');   // 왼발
  px(c,ox+5*s,oy+11*s,3*s,s,'#333');   // 오른발
}

function drawMinimap(){
  const mW=mmCv.width, mH=mmCv.height;
  const scX=mW/MAP_W, scY=mH/MAP_H;

  // 탐험 변경 시에만 오프스크린 재렌더
  if(_tilesDirty||!_mmCanvas){
    if(!_mmCanvas){
      _mmCanvas=document.createElement('canvas');
      _mmCanvas.width=mW; _mmCanvas.height=mH;
      _mmCtx2=_mmCanvas.getContext('2d');
    }
    _mmCtx2.fillStyle='#05080f'; _mmCtx2.fillRect(0,0,mW,mH);
    for(let r=0;r<ROWS;r++){
      for(let c=0;c<COLS;c++){
        if(!explored[r*COLS+c]) continue;
        const _th=getTheme(); _mmCtx2.fillStyle=tiles[r*COLS+c]===1?_th.wall:_th.floor;
        _mmCtx2.fillRect(c*TILE*scX|0,r*TILE*scY|0,Math.ceil(TILE*scX+.5),Math.ceil(TILE*scY+.5));
      }
    }
  }
  mmCtx.clearRect(0,0,mW,mH);
  if(_mmCanvas) mmCtx.drawImage(_mmCanvas,0,0);

  // 보스 방 펄스
  const bExp=explored[Math.floor(bossArena.y/TILE)*COLS+Math.floor(bossArena.x/TILE)];
  if(bExp){
    const pulse=.5+.5*Math.sin(tick*.04);
    mmCtx.strokeStyle=`rgba(255,68,0,${pulse})`; mmCtx.lineWidth=1.5;
    mmCtx.strokeRect(bossArena.x*scX,bossArena.y*scY,bossArena.w*scX,bossArena.h*scY);
  }
  // 플레이어 점
  mmCtx.fillStyle='#fff';
  mmCtx.beginPath(); mmCtx.arc(player.x*scX,player.y*scY,3.5,0,Math.PI*2); mmCtx.fill();
  // 뷰포트
  mmCtx.strokeStyle='#ffffff22'; mmCtx.lineWidth=1;
  mmCtx.strokeRect(camX*scX,camY*scY,canvas.width*scX,canvas.height*scY);
}

