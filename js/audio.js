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

    // ── 리버브(컨볼버) 생성 ──
    function makeReverb(ac,sec,decay){
      const len=ac.sampleRate*sec, buf=ac.createBuffer(2,len,ac.sampleRate);
      for(let ch=0;ch<2;ch++){const d=buf.getChannelData(ch);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,decay);}
      const cv=ac.createConvolver();cv.buffer=buf;return cv;
    }
    const reverb=makeReverb(ac,2.2,3.0);
    const reverbGain=ac.createGain();reverbGain.gain.value=0.38;
    reverb.connect(reverbGain);reverbGain.connect(_bgmGain);

    // ── 패드 코드 (현악기 느낌) ──
    const chords=[[130.8,164.8,196],[116.5,146.8,174.6],[98,123.5,146.8],[110,138.6,164.8]];
    let chordIdx=0;
    const padRid=setInterval(function(){
      if(_sfxMuted||!_bgmGain){clearInterval(padRid);return;}
      const freqs=chords[chordIdx%chords.length];
      freqs.forEach(function(freq,i){
        const o=ac.createOscillator(),g=ac.createGain();
        o.type='sine';
        o.frequency.value=freq;
        o.detune.value=(i-1)*4; // 약간 디튠으로 두께감
        const t=ac.currentTime;
        g.gain.setValueAtTime(0,t);
        g.gain.linearRampToValueAtTime(0.18,t+0.6);
        g.gain.setValueAtTime(0.18,t+3.0);
        g.gain.linearRampToValueAtTime(0,t+4.0);
        o.connect(g);g.connect(reverb);g.connect(_bgmGain);
        o.start(t);o.stop(t+4.1);
      });
      chordIdx++;
    },3800);
    _bgmOscs.push({stop:function(){clearInterval(padRid);}});

    // ── 멜로디 (벨 느낌 triangle+reverb) ──
    const scale=[261.6,293.7,329.6,349.2,392,440,493.9,523.3,392,349.2,329.6,293.7,261.6,293.7,349.2,392];
    const scaleTime=[0,0.5,1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5];
    let loopStart=ac.currentTime+0.2;
    function scheduleMelody(){
      if(_sfxMuted||!_bgmGain) return;
      scale.forEach(function(freq,i){
        const o=ac.createOscillator(),g=ac.createGain();
        o.type='triangle';
        o.frequency.value=freq;
        const t=loopStart+scaleTime[i];
        g.gain.setValueAtTime(0,t);
        g.gain.linearRampToValueAtTime(0.22,t+0.05);
        g.gain.exponentialRampToValueAtTime(0.001,t+0.42);
        o.connect(g);g.connect(reverb);g.connect(_bgmGain);
        o.start(t);o.stop(t+0.5);
        _bgmOscs.push(o);
      });
      loopStart+=8.0;
    }
    scheduleMelody();
    const melRid=setInterval(function(){
      if(_sfxMuted||!_bgmGain){clearInterval(melRid);return;}
      scheduleMelody();
    },8000);
    _bgmOscs.push({stop:function(){clearInterval(melRid);}});

    // ── 베이스 펄스 (sine, 느리고 묵직하게) ──
    const bassNotes=[65.4,61.7,55,58.3];
    let bassIdx=0;
    const bassRid=setInterval(function(){
      if(_sfxMuted||!_bgmGain){clearInterval(bassRid);return;}
      const o=ac.createOscillator(),g=ac.createGain();
      o.type='sine';o.frequency.value=bassNotes[bassIdx%bassNotes.length];
      const t=ac.currentTime;
      g.gain.setValueAtTime(0,t);
      g.gain.linearRampToValueAtTime(0.32,t+0.08);
      g.gain.exponentialRampToValueAtTime(0.001,t+1.8);
      o.connect(g);g.connect(_bgmGain);o.start(t);o.stop(t+2.0);
      bassIdx++;
    },1900);
    _bgmOscs.push({stop:function(){clearInterval(bassRid);}});

    // ── 리듬 타악기 (소프트 킥+하이햇) ──
    const BPM=90,SPB=60000/BPM;
    let beat=0;
    const drumRid=setInterval(function(){
      if(_sfxMuted||!_bgmGain){clearInterval(drumRid);return;}
      if(beat%4===0) _noise(0.06,0.018,55);     // 소프트 킥
      if(beat%2===1) _noise(0.015,0.006,4000);  // 하이햇
      if(beat%8===6) _noise(0.04,0.025,200);    // 스네어
      beat++;
    },SPB/2);
    _bgmOscs.push({stop:function(){clearInterval(drumRid);}});

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
var joyState = { dx:0, dy:0, active:false, id:-1 };
var aimState  = { x:0, y:0, active:false, id:-1 };
