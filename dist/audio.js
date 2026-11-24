import {WARNINGS,WarningQueue,warningClip} from './warnings.js';
import {createChipBank} from './chip.js';
import {FlightMusic} from './music.js';

const CHIP_NAMES={dodged:'dodge',botFlare:'decoy'};
const CHIP_INTERVAL={gun:.06,enemyArmorHit:.11,denied:.30,acquire:.34,lockBreak:.27,boost:.4,brake:.36,skim:12,menuSelect:.10,flapDown:.5,flapUp:.5};

function localVoice(synth,language,failed,preferredOnly){
  if(!synth||!window.SpeechSynthesisUtterance)return null;
  const locale=language==='ru'?'ru-ru':'en-us';
  let best=null,bestScore=-1;
  for(const voice of synth.getVoices()){
    const tag=voice.lang.toLowerCase().replaceAll('_','-');
    if(!voice.localService||tag.split('-')[0]!==language||failed.has(voice.voiceURI||voice.name))continue;
    if(/espeak|festival|compact|novelty/i.test(voice.name))continue;
    const enhanced=/natural|neural|premium|enhanced|siri/i.test(voice.name);
    const standard=/microsoft|apple|samsung|rhvoice|milena|yuri|samantha|daniel|alex\b/i.test(voice.name);
    if(preferredOnly&&!enhanced&&!standard)continue;
    const score=(enhanced?8:0)+(standard?4:0)+(tag===locale?2:0)+Number(voice.default);
    if(score>bestScore){bestScore=score;best=voice;}
  }
  return best;
}

export class Radio {
  constructor() {
    this.enabled=true;this.musicEnabled=true;this.language='ru';
    try{
      this.enabled=localStorage.getItem('afterburn-audio')!=='off';
      this.musicEnabled=localStorage.getItem('afterburn-music')!=='off';
      if(localStorage.getItem('afterburn-warning-language')==='en')this.language='en';
    }catch{}
    this.live=false;this.engineAudible=true;this.warning=null;this.queue=new WarningQueue();
    this.playingChips=new Set();this.lastChip=new Map();
    this.voices=new Map();this.failedVoices=new Set();
    globalThis.speechSynthesis?.getVoices();
  }
  voiceBuffer(w) {
    const path=warningClip(w,this.language);
    if(!this.voices.has(path)){
      const buffer=fetch(new URL(path,import.meta.url)).then(r=>r.ok?r.arrayBuffer():null)
        .then(bytes=>bytes?this.ctx.decodeAudioData(bytes):null).catch(()=>null);
      this.voices.set(path,buffer);
    }
    return this.voices.get(path);
  }
  warmVoices() {
    for(const w of WARNINGS)if(w.urgent)this.voiceBuffer(w);
  }
  setLanguage(language) {
    if(!['ru','en'].includes(language)||this.language===language)return;
    this.stopWarning();this.queue.reset();this.language=language;
    try{localStorage.setItem('afterburn-warning-language',language);}catch{}
    if(this.enabled&&this.ctx)this.warmVoices();
  }
  activate() {
    if(!this.enabled)return;
    try{
      if(!this.ctx){
        const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;
        this.ctx=new Context();const a=this.ctx;
        this.output=a.createGain();this.output.gain.value=.52;this.output.connect(a.destination);
        this.effects=a.createGain();this.effects.connect(this.output);
        this.music=new FlightMusic(a,this.output);
        this.chips=createChipBank(a);
        this.chipEngineGain=a.createGain();this.chipEngineGain.gain.value=0;this.chipEngineGain.connect(this.effects);
        this.chipEngine=a.createBufferSource();this.chipEngine.buffer=this.chips.get('engineLoop');
        this.chipEngine.loop=true;this.chipEngine.connect(this.chipEngineGain);this.chipEngine.start();
        this.warmVoices();
        this.noise=a.createBuffer(1,a.sampleRate*2,a.sampleRate);
        const data=this.noise.getChannelData(0);
        for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
        this.engine=a.createGain();this.engine.gain.value=0;this.engine.connect(this.effects);
        const source=a.createBufferSource();source.buffer=this.noise;source.loop=true;
        const filter=a.createBiquadFilter();filter.type='lowpass';filter.frequency.value=270;filter.Q.value=.58;
        this.engineFilter=filter;source.connect(filter);filter.connect(this.engine);source.start();
        const wind=a.createBiquadFilter();wind.type='bandpass';wind.frequency.value=1050;wind.Q.value=.65;
        this.groundRush=a.createGain();this.groundRush.gain.value=0;
        source.connect(wind);wind.connect(this.groundRush);this.groundRush.connect(this.effects);
        this.turbine=a.createOscillator();this.turbine.type='sine';this.turbine.frequency.value=57;
        const base=a.createGain();base.gain.value=.28;this.turbine.connect(base);base.connect(this.engine);this.turbine.start();
      }
      if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});
      this.flight(this.live);
    }catch{/* A silent flight remains playable when Web Audio is unavailable. */}
  }
  toggle() {
    this.enabled=!this.enabled;
    try{localStorage.setItem('afterburn-audio',this.enabled?'on':'off');}catch{}
    if(this.enabled)this.activate();else{this.stopWarning();this.stopChips();}
    this.queue.reset();
    if(this.output)this.output.gain.setTargetAtTime(this.enabled ? .52:0,this.ctx.currentTime,.022);
    this.flight(this.live);
  }
  toggleMusic() {
    this.musicEnabled=!this.musicEnabled;
    try{localStorage.setItem('afterburn-music',this.musicEnabled?'on':'off');}catch{}
    if(this.musicEnabled&&this.enabled)this.activate();
    this.music?.setPlaying(this.live&&this.enabled&&this.musicEnabled);
  }
  flight(live) {
    this.live=live;
    this.music?.setPlaying(live&&this.enabled&&this.musicEnabled);
    if(!live||!this.enabled)this.groundRush?.gain.setTargetAtTime(0,this.ctx.currentTime,.05);
    const audible=live&&this.enabled&&this.engineAudible;
    if(this.engine)this.engine.gain.setTargetAtTime(audible ? .085:0,this.ctx.currentTime,.09);
    if(this.chipEngineGain)this.chipEngineGain.gain.setTargetAtTime(audible ? .30:0,this.ctx.currentTime,.04);
  }
  engineSpeed(game) {
    this.engineAudible=game.enginePowered;
    if(!this.ctx||!this.live||!this.enabled)return;
    const {speed,boost,clearance}=game;
    const power=Math.max(0,Math.min(1,(speed-210)/540)),t=this.ctx.currentTime;
    const proximity=Math.max(0,Math.min(1,1-clearance/48));
    this.groundRush.gain.setTargetAtTime(.15*proximity**2*(.28+.72*power),t,.22);
    if(!this.engineAudible){
      this.chipEngineGain.gain.setTargetAtTime(0,t,.10);
      this.engine.gain.setTargetAtTime(0,t,.14);
      return;
    }
    const sputter=game.engineFire?Math.max(0,Math.sin(t*20)+.35*Math.sin(t*33)):0;
    this.chipEngine.playbackRate.setTargetAtTime(.82+power*1.26+(boost ? .16 : 0)-sputter*.12,t,.12);
    this.chipEngineGain.gain.setTargetAtTime(.28+power*.14+(boost ? .09 : 0),t,.12);
    this.turbine.frequency.setTargetAtTime(42+power*78+(boost?9:0)-sputter*15,t,.14);
    this.engineFilter.frequency.setTargetAtTime(185+power*530+(boost?155:0)+sputter*720,t,.12);
    this.engine.gain.setTargetAtTime(.065+power*.052+(game.roll ? .024:0)+sputter*.045,t,.10);
  }
  tone(frequency,duration,level=.1,delay=0,type='sine',end=frequency,bus=this.effects) {
    if(!this.enabled || !this.ctx)return;
    const a=this.ctx,t=a.currentTime+delay,o=a.createOscillator(),g=a.createGain();
    o.type=type;o.frequency.setValueAtTime(frequency,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+duration);
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(level,t+.009);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
    o.connect(g);g.connect(bus);o.start(t);o.stop(t+duration+.02);
    o.onended=()=>{o.disconnect();g.disconnect();};
  }
  playChip(name) {
    if(!this.enabled||!this.ctx)return;
    const buffer=this.chips.get(name);if(!buffer)return;
    const t=this.ctx.currentTime;
    if(t-(this.lastChip.get(name)??-Infinity)<(CHIP_INTERVAL[name]??0))return;
    this.lastChip.set(name,t);
    const source=this.ctx.createBufferSource();source.buffer=buffer;source.connect(this.effects);
    this.playingChips.add(source);
    source.onended=()=>{this.playingChips.delete(source);source.disconnect();};
    source.start();
  }
  stopChips() {
    for(const source of this.playingChips){source.onended=null;source.stop();source.disconnect();}
    this.playingChips.clear();this.lastChip.clear();
  }
  stopWarning() {
    const active=this.warning;if(!active)return;
    this.warning=null;
    clearTimeout(active.timer);
    if(active.utterance)window.speechSynthesis?.cancel();
    if(active.source){active.source.onended=null;active.source.stop();active.source.disconnect();}
    active.bus.disconnect();
    this.music?.setDucked(false);
    this.effects.gain.setTargetAtTime(1,this.ctx.currentTime,.07);
  }
  speakLocal(w,active,speechAt,finish,fallback,preferredOnly=true){
    const synth=window.speechSynthesis,voice=localVoice(synth,this.language,this.failedVoices,preferredOnly);
    if(!voice)return false;
    const line=new window.SpeechSynthesisUtterance(w[this.language].speech);
    active.utterance=line;line.voice=voice;line.lang=voice.lang;line.rate=this.language==='ru' ? .98 : .96;line.volume=.76;
    const current=()=>this.warning===active&&active.utterance===line;
    const failed=()=>{
      if(!current())return;
      clearTimeout(active.timer);active.utterance=null;this.failedVoices.add(voice.voiceURI||voice.name);
      synth.cancel();fallback();
    };
    line.onerror=failed;
    line.onstart=()=>{
      if(!current())return;
      active.pending=false;clearTimeout(active.timer);active.timer=setTimeout(failed,5000);
    };
    line.onend=()=>{if(current())finish();};
    active.timer=setTimeout(()=>{
      if(!current())return;
      active.timer=setTimeout(failed,650);
      try{synth.speak(line);}catch{failed();}
    },Math.max(0,(speechAt-this.ctx.currentTime)*1000));
    return true;
  }
  announce(w,onDone) {
    if(!this.enabled||!this.ctx)return;
    this.stopWarning();
    const a=this.ctx,bus=a.createGain(),active={w,bus,pending:true};
    this.warning=active;bus.connect(this.output);
    this.music?.setDucked(true);
    this.effects.gain.setTargetAtTime(.46,a.currentTime,.025);
    w.notes.forEach((hz,i)=>this.tone(hz,.065,.092,i*.075,i%2?'triangle':'square',hz,bus));
    const speechAt=a.currentTime+w.notes.length*.075+.015;
    const finish=()=>{
      if(this.warning!==active)return;
      this.warning=null;clearTimeout(active.timer);active.source?.disconnect();bus.disconnect();
      this.music?.setDucked(false);
      this.effects.gain.setTargetAtTime(1,a.currentTime,.10);onDone?.();
    };
    const playRecording=()=>this.voiceBuffer(w).then(buffer=>{
      if(this.warning!==active)return;
      if(buffer){
        active.pending=false;
        const s=a.createBufferSource();active.source=s;s.buffer=buffer;s.connect(bus);s.onended=finish;
        s.start(Math.max(a.currentTime,speechAt));return;
      }
      if(!this.speakLocal(w,active,speechAt,finish,finish,false))finish();
    });
    if(!this.speakLocal(w,active,speechAt,finish,playRecording))playRecording();
  }
  monitor(mask,time) {
    if(!this.live||!this.enabled||!this.ctx)return;
    if(this.warning && !(mask&this.warning.w.bit) && (this.warning.pending||this.warning.w.id==='engine'||this.warning.w.id.startsWith('roll-')))this.stopWarning();
    const next=this.queue.next(mask,time,this.warning?.w);
    if(next){
      if(this.warning)this.queue.interrupted(this.warning.w,time);
      this.announce(next);
    }
  }
  event(type,data) {
    if(['start','resume','pause','won','lost','briefing','lessonRetry'].includes(type)){
      this.stopWarning();if(type!=='lost'||data!=='missile')this.stopChips();this.queue.reset();
    }
    if(type==='start'||type==='briefing'){this.music?.reset();this.engineAudible=true;}
    if(type==='start'||type==='resume'||type==='lessonRetry')this.flight(true);
    if(['pause','won','lost','briefing'].includes(type))this.flight(false);
    if(type==='engineCut')this.tone(220,.25,.10,0,'triangle',65);
    if(type==='fireOut'){this.tone(690,.12,.075,0,'triangle',410);this.tone(520,.11,.075,.13,'triangle',330);}
    if(type==='engineStart')this.tone(70,.76,.13,0,'triangle',245);
    let name=CHIP_NAMES[type]??type;
    if(type==='kill'&&data?.weapon==='missile')name='enemyMissileImpact';
    if(type==='damage')name='playerMissileImpact';
    if(type==='hit')name='enemyArmorHit';
    if(type==='start'||type==='resume')name='menuConfirm';
    if(type==='lost'&&data==='missile')return;
    if(type==='trackBeat')name=data===1?'track1':'track2';
    if(type==='roll')name=data<0?'rollLeft':'rollRight';
    if(type==='flares'&&data>0)name='flareSave';
    this.playChip(name);
  }
}
