import {Flight,LOCK_SECONDS} from './flight.js?v=lock-1s-20261125';
import {loadArt} from './scenery.js';
import {Display} from './display.js?v=lock-1s-20261125';
import {Radio} from './audio.js';
import {WARNINGS,WARNING_UI,warningMask} from './warnings.js';
import {METRES_PER_UNIT} from './ground-awareness.js';
import {paintIcon} from './icons.js';
import {paintModeTile} from './flight-art.js';
import {WING_LIMIT} from './aerodynamics.js';
import {LESSONS} from './flight-school.js';
import {bindPointControls} from './pilot-input.js';

const el=id=>document.getElementById(id);
const ui=Object.fromEntries(['shell','viewport','world','menu','kicker','mission-title','brief','launch','launch-text','restart','notice','threat','threat-time','threat-action','threat-bearing','rear-label','ground-alert','speed','powerbar','lock-status','status','lamp','wave','kills','hull','healthbar','missiles','ammo','flares','sound','pause','full'].map(id=>[id,el(id)]));
const radio=new Radio();
const keys=new Set(), keyButtons=new Map([...document.querySelectorAll('[data-code]')].map(b=>[b.dataset.code,b]));
for(const canvas of document.querySelectorAll('canvas[data-icon]'))paintIcon(canvas);
const pad=n=>String(n).padStart(2,'0');
function clock(s){return Math.floor(s/60)+':'+pad(Math.floor(s%60));}
function setText(node,s){if(node.textContent!==String(s))node.textContent=String(s);}
let display,loadError=false,noticeLife=0,lastFrame=performance.now(),readoutTimer=0;
const game=new Flight(onEvent);
// Optional fictional arcade easter egg; no real payments or external services.
const SUPPORT_PRICE=100,SUPPORT_COOLDOWN=120,SUPPORT_ATTACK=5.4,SUPPORT_DURATION=7;
let supportCash=100,supportReady=0,supportRun=null;
const supportBinding=document.createElement('div');
supportBinding.className='binding';
supportBinding.innerHTML='<button type="button" data-code="KeyB" aria-label="Вызвать поддержку за 100 виртуальных тенге" title="B — шуточная воздушная поддержка">B</button><span>F-35 · 100 ₸</span>';
keyButtons.get('KeyF').parentElement.after(supportBinding);
const supportButton=supportBinding.querySelector('button'),supportLabel=supportBinding.querySelector('span');
keyButtons.set('KeyB',supportButton);
function resetSupport(){
  supportCash=100;supportReady=0;supportRun=null;game.supportJet=null;
}
function paintSupport(){
  const live=game.mode==='live'&&!game.lesson;
  supportBinding.hidden=!live;supportBinding.style.display=live?'':'none';
  const remaining=Math.max(0,Math.ceil(supportReady-game.time));
  supportButton.disabled=!live||!!supportRun||!!game.wingLoss||!game.bots.length||remaining>0||supportCash<SUPPORT_PRICE;
  setText(supportLabel,supportRun?(supportRun.hit?'F-35 · отход':'F-35 · в пути'):remaining?'F-35 · '+remaining+' с':'F-35 · 100 ₸');
  supportButton.title='B — F-35, баланс: '+supportCash+' виртуальных ₸'+(remaining?' · ожидание '+remaining+' с':'');
  supportButton.setAttribute('aria-label',supportButton.title);
}
function callSupport(){
  if(game.mode!=='live'||game.lesson||game.wingLoss||supportRun||game.time<supportReady||supportCash<SUPPORT_PRICE)return;
  const candidates=game.bots.filter(b=>!b.claimed);
  if(!candidates.length){info('F-35: нет свободной цели',1.5);return;}
  const target=candidates.find(b=>b.id===game.lockId)??candidates.reduce((a,b)=>a.range<=b.range?a:b);
  supportCash-=SUPPORT_PRICE;supportReady=game.time+SUPPORT_COOLDOWN;
  const yaw=game.yaw,cp=Math.cos(game.pitch),sp=Math.sin(game.pitch);
  const forward={x:Math.sin(yaw)*cp,z:Math.cos(yaw)*cp,alt:sp};
  const right={x:Math.cos(yaw),z:-Math.sin(yaw)};
  const jet={x:game.x-forward.x*43+right.x*13,z:game.z-forward.z*43+right.z*13,
    alt:game.alt-forward.alt*43+6,heading:yaw,pitch:game.pitch,bank:0,fire:null};
  jet.alt=Math.max(jet.alt,game.heightAt(jet.x,jet.z)+8);
  game.supportJet=jet;
  supportRun={target,at:game.time,last:game.time,forward,hit:false};
  info('−100 ₸ · DIPLOMATIC SOLUTION INCOMING',3);
  radio.activate();
  [392,523.25,659.25,783.99,1046.5].forEach((hz,i)=>radio.tone(hz,.14,.035,i*.12,'square'));
  paintSupport();
}
function stepSupport(){
  if(!supportRun||game.mode!=='live'||game.lesson)return;
  const run=supportRun,jet=game.supportJet,target=run.target;
  if(game.wingLoss||(!run.hit&&!game.bots.includes(target))){
    if(!run.hit){supportCash+=SUPPORT_PRICE;supportReady=0;info('F-35: вылет отменён · 100 ₸ возвращены',2);}
    supportRun=null;game.supportJet=null;paintSupport();return;
  }
  const age=game.time-run.at,dt=Math.max(0,game.time-run.last);run.last=game.time;
  const prev={x:jet.x,z:jet.z,alt:jet.alt};
  if(age<1.65){
    // Fly through a world-space position just beside the player's original flight path.
    const velocity=game.speed/9+37;
    jet.x+=run.forward.x*velocity*dt;jet.z+=run.forward.z*velocity*dt;jet.alt+=run.forward.alt*velocity*dt;
  }else if(!run.hit){
    // Cinematic arcade chase: move toward a point behind the moving target, not a screen overlay.
    const dx=target.x-jet.x,dz=target.z-jet.z,dy=target.alt-jet.alt;
    const distance=Math.hypot(dx,dz,dy)||1,remaining=Math.max(.12,SUPPORT_ATTACK-age);
    const advance=Math.min(Math.max(0,distance-24),Math.max(35,(distance-24)/remaining)*dt);
    jet.x+=dx/distance*advance;jet.z+=dz/distance*advance;jet.alt+=dy/distance*advance;
    if(age>=SUPPORT_ATTACK-.32)jet.fire={x:target.x,z:target.z,alt:target.alt,progress:Math.min(1,(age-SUPPORT_ATTACK+.32)/.32)};
  }else{
    const velocity=110;
    jet.x+=Math.sin(jet.heading)*Math.cos(jet.pitch)*velocity*dt;
    jet.z+=Math.cos(jet.heading)*Math.cos(jet.pitch)*velocity*dt;
    jet.alt+=Math.max(.12,Math.sin(jet.pitch))*velocity*dt;
  }
  jet.alt=Math.max(jet.alt,game.heightAt(jet.x,jet.z)+8);
  const dx=jet.x-prev.x,dz=jet.z-prev.z,dy=jet.alt-prev.alt;
  if(Math.hypot(dx,dz,dy)>.01){
    const heading=Math.atan2(dx,dz),turn=Math.atan2(Math.sin(heading-jet.heading),Math.cos(heading-jet.heading));
    jet.bank+=(Math.max(-.65,Math.min(.65,turn*4))-jet.bank)*Math.min(1,dt*5);
    jet.heading=heading;jet.pitch=Math.atan2(dy,Math.hypot(dx,dz));
  }
  if(!run.hit&&age>=SUPPORT_ATTACK){
    run.hit=true;jet.fire=null;
    for(const m of game.missiles)if(m.target===target){m.target=null;m.free=true;m.life=Math.min(m.life,m.age+.8);}
    game.destroy(target,'support');
    info('БИБИ: ЦЕЛЬ СБИТА · 100 ₸ ОТРАБОТАНЫ',3);paintSupport();
  }
  if(age>=SUPPORT_DURATION){supportRun=null;game.supportJet=null;paintSupport();}
}
const coarse=window.matchMedia('(pointer:coarse)');
const profileOptions=el('profiles'),profiles=[...profileOptions.querySelectorAll('input')];
try{game.setProfile(localStorage.getItem('afterburn-controls')??'arcade');}catch{}
const clearPointControls=bindPointControls(ui.world,game,()=>display,el('touch-stick'));
function profileState(){
  const arcade=game.profile==='arcade';
  for(const input of profiles)input.checked=input.value===game.profile;
  ui.shell.classList.toggle('arcade',arcade);
  const hint=arcade?(coarse.matches?'Веди пальцем по левой части экрана. Отпусти, чтобы выровняться.':'Мышь или WASD — курс. W / S — петля, ← / → — свободный крен. ЛКМ / ПКМ — огонь.'):'W / S — петля, A / D — вираж, ← / → — свободный крен. Q — бочка.';
  setText(el('profile-help'),hint);
  setText(el('home-hint'),arcade?(coarse.matches?'Веди самолёт пальцем':'Мышь или WASD · пилотирование'):'WASD · пилотирование');
  keyButtons.get('KeyQ').title=arcade?'Бочка по Q':'Q или двойное нажатие A / D';
}
for(const input of profiles)input.addEventListener('change',()=>{
  if(!input.checked||!game.setProfile(input.value))return;
  radio.activate();radio.event('menuSelect');
  try{localStorage.setItem('afterburn-controls',game.profile);}catch{}
  clearKeys();profileState();refreshReadouts();
});
coarse.addEventListener('change',profileState);
profileState();
const cameraButton=el('camera');
let external=false;
try{external=localStorage.getItem('afterburn-view')==='chase';}catch{}
function cameraState(){
  display?.setExternal(external);
  const name=external?'Вид от третьего лица':'Вид из кабины';
  cameraButton.setAttribute('aria-pressed',String(external));
  cameraButton.title=external?'Вернуться в кабину (V)':'Вид от третьего лица (V)';
  paintIcon(cameraButton.querySelector('canvas'),external);
  ui.world.setAttribute('aria-label',name+' F/A-18E');
  ui.viewport.classList.toggle('external',external);
}
function switchCamera(){
  clearPointControls();
  external=!external;
  try{localStorage.setItem('afterburn-view',external?'chase':'cockpit');}catch{}
  cameraState();
}
cameraState();
cameraButton.addEventListener('click',()=>{
  switchCamera();
  if(game.mode==='live')ui.world.focus({preventScroll:true});
});
const sortieOptions=el('sortie-options'),sortieInputs=[...sortieOptions.querySelectorAll('input')];
for(const tile of sortieOptions.querySelectorAll('canvas'))paintModeTile(tile,tile.dataset.tile);
for(const input of sortieInputs)input.addEventListener('change',()=>{
  if(input.checked&&game.selectMission(input.value)){radio.activate();radio.event('menuSelect');screen();}
});
const homeOptions=el('home-options'),shareButton=el('share-game');
homeOptions.addEventListener('click',()=>{
  const open=ui.shell.classList.toggle('setup-open');
  homeOptions.setAttribute('aria-expanded',String(open));radio.activate();radio.event('menuSelect');
});
shareButton.hidden=location.protocol!=='https:';
shareButton.addEventListener('click',async()=>{
  const url=new URL('./',location.href).href;
  radio.activate();radio.event('menuSelect');
  if(navigator.share){
    try{await navigator.share({title:'AFTERBURN',url});return;}catch(error){if(error.name==='AbortError')return;}
  }
  try{
    await navigator.clipboard.writeText(url);setText(shareButton,'Ссылка скопирована');
    setText(el('share-result'),'Ссылка скопирована');setTimeout(()=>setText(shareButton,'Поделиться игрой'),1800);
  }catch{window.prompt('Скопируй ссылку на игру',url);}
});
const lampGroup=el('warning-lamps'),lampHint=el('lamp-hint'),warningReadout=el('warning-readout');
const enginePanel=el('engine-procedure'),engineAction=el('engine-action');
const langButtons=[...el('warning-language').querySelectorAll('button')];
const rollWarnings=new Map(WARNINGS.filter(w=>w.id.startsWith('roll-')).map(w=>[w.id==='roll-left'?-1:1,w]));
let testLamp=null,testTimer=0,paintedMask=-1,paintedMode='',paintedEngine='';
const lamps=WARNINGS.map(w=>{
  const button=document.createElement('button'),label=document.createElement('span');
  button.type='button';button.append(label);
  button.addEventListener('click',()=>{
    if(game.mode==='live')return;
    clearTimeout(testTimer);testLamp=w;radio.activate();paintWarnings();
    const end=()=>{if(testLamp===w){clearTimeout(testTimer);testLamp=null;paintWarnings();}};
    radio.announce(w,end);testTimer=setTimeout(end,radio.enabled?5200:1200);
  });
  lampGroup.append(button);return button;
});
function clearLampTest(){clearTimeout(testTimer);testLamp=null;}
function paintWarnings(){
  const live=game.mode==='live';
  const lang=radio.language,words=WARNING_UI[lang];
  const mask=live?warningMask(game):(testLamp?.bit??0);
  if(live)radio.monitor(mask,game.time);
  if(mask===paintedMask && game.mode===paintedMode && paintedEngine===game.engineState)return;
  paintedMask=mask;paintedMode=game.mode;paintedEngine=game.engineState;
  if(display){display.warningLights=mask;display.warningLanguage=lang;}
  warningReadout.lang=lampHint.lang=lang;
  for(const button of langButtons)button.setAttribute('aria-pressed',String(button.dataset.lang===lang));
  const names=[];
  for(const [i,w] of WARNINGS.entries()){
    const lamp=lamps[i],active=Boolean(mask&w.bit);
    lamp.disabled=live;lamp.classList.toggle('lit',active);
    const copy=w[lang];lamp.lang=lang;setText(lamp.firstElementChild,copy.label);
    const name=live?copy.label+' · '+(active?words.on:words.off):words.testLabel+' · '+copy.label;
    lamp.setAttribute('aria-label',name);lamp.title=name+' · '+copy.action;
    if(active)names.push(copy.label);
  }
  const priority=live?WARNINGS.find(w=>mask&w.bit):null;
  let hint=priority?.[lang].action;
  if(priority?.id==='missile'&&!game.flares)hint=words.roll;
  if(priority?.id==='engine'){
    const step=words.engine[game.engineState];
    hint=step.key+' · '+step.action;
  }
  setText(lampHint,live?(hint??words.normal):(testLamp?.[lang].action??words.test));
  setText(warningReadout,names.join('. '));
}
for(const button of langButtons)button.addEventListener('click',()=>{
  if(radio.language===button.dataset.lang)return;
  clearLampTest();radio.setLanguage(button.dataset.lang);paintedMask=-1;screen();
  if(game.mode==='live')ui.world.focus({preventScroll:true});
});
let tapCode='', tapAt=-Infinity;
const keycap=code=>keyButtons.get(code==='ShiftRight'?'ShiftLeft':code);
function info(text,seconds=1.65){
  setText(ui.notice,text);noticeLife=seconds;ui.notice.classList.add('visible');
}
function clearNotice(){noticeLife=0;ui.notice.classList.remove('visible');setText(ui.notice,'');}
function clearKeys(){tapCode='';tapAt=-Infinity;keys.clear();clearPointControls();game.setRear(false);for(const b of keyButtons.values())b.classList.remove('held');}
function updateEnginePanel(live,lang){
  const step=WARNING_UI[lang].engine[game.engineState];
  enginePanel.hidden=!live||!step||Boolean(game.wingLoss);
  if(enginePanel.hidden)return;
  enginePanel.lang=lang;enginePanel.dataset.state=game.engineState;
  setText(el('engine-status'),step.title);engineAction.hidden=!step.key;
  if(step.key){
    setText(engineAction.firstElementChild,step.key);
    setText(engineAction.lastElementChild,step.action);
  }
}
function refreshReadouts(){
  paintWarnings();
  paintSupport();
  const lang=radio.language,words=WARNING_UI[lang],live=game.mode==='live';
  updateEnginePanel(live,lang);
  const lesson=game.lesson;
  setText(ui.wave,pad((lesson?.stage??game.wave)+1));setText(ui.kills,pad(game.kills));
  setText(el('stages'),pad(game.mission.stages.length));setText(el('goal'),pad(game.goal));
  el('kill-count').hidden=el('kill-divider').hidden=Boolean(lesson);
  setText(el('stage-name'),lesson?'ЭТАП':game.mission.stageName.toUpperCase());setText(el('mission-name'),lesson?'ЛЁТНАЯ ШКОЛА':game.mission.name.toUpperCase());
  const pilot=game.bots[0]?.pilot;
  const exit=el('exit-readout');exit.hidden=Boolean(lesson)||game.mode!=='live'||(!pilot&&!game.exit&&(game.missionId!=='intercept'||!game.bots.length));
  if(!exit.hidden){
    const remaining=game.exit?Math.ceil(100*game.exit.remaining/game.exit.leg):0;
    setText(exit,pilot?pilot.name.toUpperCase():game.exit?'ДО РУБЕЖА '+Math.min(100,remaining)+'%':'ЭСКОРТ · '+game.bots.length);
    exit.classList.toggle('near',Boolean(game.exit)&&remaining<25);
  }
  const guide=el('lesson-guide');guide.hidden=!lesson||game.mode!=='live';
  if(!guide.hidden){
    setText(el('lesson-name'),LESSONS[lesson.stage]);
    const steer=game.profile==='classic'?'Веди самолёт клавишами WASD':coarse.matches?'Веди пальцем слева':'Веди самолёт мышью или WASD';
    const actions=[steer+' · ворота '+Math.min(2,lesson.passed+1)+'/2',
      game.missiles.some(m=>m.target)?'Ракета в пути':game.lock>=LOCK_SECONDS?'Кольцо замкнулось · нажми R':game.lockId!==null?'Удерживай мишень в кольце '+LOCK_SECONDS+' с':'Наведи ракетное кольцо на мишень',
      game.threats.some(t=>!t.free)?'F — ловушки · Q — бочка по сигналу':'Приготовься к сигналу тревоги'];
    setText(el('lesson-action'),actions[lesson.stage]);
  }
  setText(el('g-load'),game.gLoad.toFixed(1).replace('.',','));setText(el('aoa'),'α '+Math.round(game.aoa)+'°');
  const telemetry=el('flight-load');telemetry.classList.toggle('caution',game.highG);telemetry.classList.toggle('over',Math.abs(game.gLoad)>WING_LIMIT||Boolean(game.wingLoss));
  telemetry.style.setProperty('--strain',Math.round(game.wingStress*100)+'%');
  setText(ui.hull,game.hull);setText(ui.missiles,pad(game.rockets));setText(ui.flares,pad(game.flares));
  setText(ui.ammo,game.reload>0?'···':pad(game.rounds));
  ui.healthbar.style.setProperty('--hp',game.hull+'%');
  ui.hull.style.color=game.hull<35?'#ffac87':'';
  const tracking=game.lockId!==null;
  const lockMessage=!game.rockets?'Ракеты закончились. E — пулемёт.':game.lock>=LOCK_SECONDS?'Цель захвачена. Нажми R для пуска.':tracking?'Идёт захват цели.':'Поиск цели.';
  setText(ui['lock-status'],game.mode==='live'?lockMessage:'');
  setText(ui.speed,Math.round(game.speed));
  ui.powerbar.style.setProperty('--power',(Math.max(0,Math.min(1,(game.speed-116)/704))*100).toFixed(1)+'%');
  ui.powerbar.classList.toggle('boost',game.boost && game.mode==='live');
  ui['rear-label'].hidden=!game.rear || game.mode!=='live';
  ui.viewport.classList.toggle('rear-view',game.rear);
  const altitude=el('radar-alt');altitude.hidden=!live;
  if(live){
    const metres=Math.round(Math.max(0,game.clearance)*METRES_PER_UNIT);
    altitude.lang=lang;altitude.setAttribute('aria-label',words.altTitle);altitude.title=words.altTitle;
    setText(el('alt-caption'),words.altLabel);setText(el('alt-value'),metres);setText(el('alt-unit'),words.metres);
    const climb=Math.round(game.speed/9*Math.sin(game.pathPitch)*METRES_PER_UNIT),rate=el('climb-rate');
    setText(rate,(climb>0?'↑':climb<0?'↓':'→')+' '+Math.abs(climb)+' '+words.rateUnit);
    rate.title=words.rateTitle;
    altitude.style.setProperty('--tape-shift',(metres*.6%12).toFixed(1)+'px');
    altitude.style.setProperty('--floor-offset',Math.min(60,metres*.6).toFixed(1)+'px');
    altitude.classList.toggle('caution',game.lowAltitude);altitude.classList.toggle('danger',game.groundWarning);
  }
  ui.viewport.classList.toggle('terrain-danger',live&&game.groundWarning);
  const turn=game.rollCue,turnLabel=rollWarnings.get(turn);
  const terrainTurn=Boolean(game.terrainTurn&&turnLabel);
  const groundAlert=ui['ground-alert'];groundAlert.hidden=!live||(!game.groundWarning&&!terrainTurn);
  if(!groundAlert.hidden){
    groundAlert.lang=lang;groundAlert.classList.toggle('directional',!game.groundWarning);
    setText(el('ground-message'),game.groundWarning?words.terrain:(turn<0?'A · ':'D · ')+turnLabel[lang].label);
  }
  const threat=game.threats.find(t=>!t.free);
  if(threat){
    const bearing=Math.atan2(threat.x-game.x,threat.z-game.z);
    ui.threat.lang=lang;
    setText(ui['threat-bearing'],Math.cos(bearing-game.yaw)<0?words.back:words.front);
    const canRoll=!game.roll;
    const maneuver=turnLabel?turnLabel[lang].action:threat.ttl>2.25?words.ready:canRoll?words.roll:words.turn;
    ui.threat.classList.toggle('close',threat.ttl<=2.25);
    setText(ui['threat-action'],game.flares?words.flares+' · '+maneuver:maneuver);
  }
  ui.threat.hidden=!threat || game.mode!=='live';
  if(threat)setText(ui['threat-time'],Math.max(0,threat.ttl).toFixed(1).replace('.',lang==='ru'?',':'.')+' '+words.seconds);
}
const menus={
  ready:{tag:'ОПЕРАЦИЯ',action:'Начать вылет',status:'К ВЫЛЕТУ ГОТОВ'},
  paused:{tag:'ВЫЛЕТ ПРИОСТАНОВЛЕН',title:'ПАУЗА',action:'Продолжить',status:'ПАУЗА'},
  won:{tag:'ОПЕРАЦИЯ ЗАВЕРШЕНА',title:'НЕБО<br>ЧИСТО',action:'Новый вылет',status:'ПОБЕДА'},
  lost:{tag:'ВЫЛЕТ ЗАВЕРШЁН',title:'САМОЛЁТ<br>ПОТЕРЯН',action:'Попробовать ещё',status:'ВЫЛЕТ ЗАВЕРШЁН'}
};
function screen(){
  const live=game.mode==='live';
  ui.shell.classList.toggle('at-home',game.mode==='ready');
  ui.viewport.classList.toggle('playing',live);
  ui.viewport.classList.toggle('preflight',game.mode==='ready');
  ui.viewport.classList.toggle('missile-loss',game.mode==='lost'&&game.deathCause==='missile');
  const choosing=game.mode==='ready'||game.mode==='paused';
  profileOptions.hidden=el('profile-help').hidden=!choosing;
  el('school').hidden=game.mode!=='ready';el('school').disabled=!display;
  setText(ui.restart,game.lesson?'Повторить этап':'Начать заново');
  sortieOptions.hidden=game.mode!=='ready';el('briefing').hidden=live||game.mode==='ready';
  for(const input of sortieInputs)input.checked=input.value===game.missionId;
  ui.menu.hidden=live;ui.pause.hidden=!live;ui.restart.hidden=game.mode!=='paused';
  ui.lamp.classList.toggle('live',live || game.mode==='won');
  setText(ui.status,live?(game.lesson?'УЧЕБНЫЙ ВЫЛЕТ':'В БОЮ'):game.lesson&&game.mode==='won'?'ШКОЛА ПРОЙДЕНА':menus[game.mode].status);
  if(!live){
    const m=menus[game.mode];setText(ui.kicker,game.mode==='ready'?'ЯНТАРНЫЙ ПРОЛИВ':m.tag);
    ui['mission-title'].innerHTML=game.mode==='ready'?'AFTER<span>BURN</span>':(game.deathCause==='escape'?'ПЕРЕХВАТ<br>СОРВАН':m.title);
    const stats='Сбито '+game.kills+' из '+game.goal+' · Время '+clock(game.time)+'.';
    const wing=game.wingLoss;
    const causes={terrain:'Столкновение со склоном.',water:'Столкновение с водой.',missile:'Попадание ракеты.',fire:'Пожар двигателя вывел самолёт из строя.',escape:'Ведущий пересёк рубеж выхода.',
      wing:wing?'При '+wing.load.toFixed(1).replace('.',',')+' g оторвалось '+(wing.side<0?'левое':'правое')+' крыло.':''};
    const summary=game.mode==='lost'?(causes[game.deathCause]??'')+' '+stats:stats;
    const tip={terrain:'При сближении со склоном подними нос клавишей W.',water:'Подними нос клавишей W.',missile:'Следи за отсчётом. F выпускает ловушки.',fire:'Сначала отключи тягу клавишей O, затем нажми P для тушения.',escape:'Сначала ищи золотую метку ведущего.',wing:'При опасной перегрузке отпусти W, чтобы разгрузить крыло.'};
    const stats2='Пик '+game.peakG.toFixed(1).replace('.',',')+' g'+(game.launches?' · Ракет в цель '+game.missileHits+'/'+game.launches:'')+(game.roundsFired?' · Стрельба '+Math.round(100*game.gunHits/game.roundsFired)+'%':'')+'.';
    setText(ui.brief,game.mode==='ready'?game.mission.briefing:game.mode==='paused'?game.mission.stageName+' '+(game.wave+1)+' из '+game.mission.stages.length+'. '+stats:summary+' '+stats2+(game.mode==='lost'?' '+(tip[game.deathCause]??''):''));
    setText(ui['launch-text'],m.action);
    if(game.lesson){
      if(game.mode==='won'){
        setText(ui.kicker,'ЛЁТНАЯ ШКОЛА');ui['mission-title'].innerHTML='ДОПУСК<br>К ВЫЛЕТУ';
        setText(ui.brief,'Ворота пройдены, мишень сбита, учебная ракета ушла мимо. Время '+clock(game.time)+'.');
        setText(ui['launch-text'],'В бой · '+game.mission.name);
      }else if(game.mode==='paused')setText(ui.brief,'Лётная школа · этап '+(game.lesson.stage+1)+'/3. '+LESSONS[game.lesson.stage]+'.');
    }
  }
  refreshReadouts();
}
function onEvent(type,data) {
  if(['start','briefing','lessonRetry'].includes(type))resetSupport();
  if(type==='won'||type==='lost'){supportRun=null;game.supportJet=null;}
  if(type==='kill'&&!game.lesson&&data?.weapon!=='support')supportCash+=25;
  display?.event(type,data);radio.event(type,data);
  if(['briefing','start','pause','resume','won','lost','lessonRetry'].includes(type)){
    clearLampTest();clearKeys();clearNotice();screen();lastFrame=performance.now();
    if(type==='start'&&!game.lesson){
      const pilot=game.bots[0]?.pilot;
      info(pilot?pilot.name+' · '+pilot.brief:game.missionId==='intercept'?'Золотая метка — ведущий. Сбей его до рубежа.':'Подведи кольцо к цели · '+LOCK_SECONDS+' с до пуска',3.2);
    }
    if(type==='lessonRetry')info('Этап начат заново',1.5);
    if(type==='pause'||type==='won'||type==='lost')ui.launch.focus({preventScroll:true});
  }
  if(type==='info')info(data);
  if(type==='gate')info('Первые ворота пройдены',1.4);
  if(type==='lessonStep')clearNotice();
  if(type==='wave'){
    const pilot=game.bots[0]?.pilot;
    info(pilot?pilot.name+' · '+pilot.brief:game.mission.stageName+' '+(game.wave+1)+' из '+game.mission.stages.length+' · Боезапас пополнен',2.6);
  }
  if(type==='wingBreak')info(WARNING_UI[radio.language][data.side<0?'leftWing':'rightWing']+' · '+data.load.toLocaleString(radio.language,{maximumFractionDigits:1})+' g',2.0);
  if(type==='kill')info('Цель сбита',1.05);
  if(type==='flares')info(data?'Ракета ушла за ловушкой':'Ловушки выпущены',1.5);
  if(type==='damage')info(WARNING_UI[radio.language].damage+' −'+data.amount+'% · '+game.hull+'%',1.7);
  if(type==='engineReady'||type==='fireOut')info(WARNING_UI[radio.language][type],1.6);
  if(type==='missile')info('Пуск',.58);
  if(type==='roll')info(data<0?'Левая бочка':'Правая бочка',.82);
  if(type==='dodged')info('Ракета прошла мимо',1.4);
  if(type==='terrainMiss')info('Ракета разбилась о рельеф',1.35);
  if(type==='miss')info('Промах · цель ушла',1.15);
  if(type==='botFlare')info('Противник сбросил ловушки',1.25);
  if(type==='warning')clearNotice();
  if(!['gun','hit','boost','brake','trackBeat','denied'].includes(type))refreshReadouts();
}
function startOrResume(){
  if(loadError){init();return;}
  if(!display)return;
  radio.activate();
  if(game.mode==='paused')game.resume();
  else if(game.mode!=='live')game.start();
  ui.world.focus({preventScroll:true});
}
function pauseToggle(){
  if(game.mode==='live')game.pause();
  else if(game.mode==='paused')startOrResume();
}
function press(code){
  if(!display)return;
  if(code==='Escape'){pauseToggle();return;}
  if(game.mode!=='live' || keys.has(code))return;
  keys.add(code);keycap(code)?.classList.add('held');
  if(code==='KeyC'){clearPointControls();game.setRear(true);}
  if(['KeyW','KeyA','KeyS','KeyD'].includes(code))game.pointerAim=null;
  if(code==='KeyO')game.cutThrust();
  if(code==='KeyP'&&!game.extinguishEngine()&&game.engineState==='fire')info(WARNING_UI[radio.language].cutFirst);
  if(code==='KeyW')game.tapRestart(performance.now()/1000);
  if(game.profile==='classic'&&(code==='KeyA'||code==='KeyD')){
    const now=performance.now(),side=code==='KeyA'?-1:1;
    game.lastSide=side;
    if(tapCode===code&&now-tapAt<=360){
      game.startRoll(side);tapAt=-Infinity;tapCode='';
    }else{tapAt=now;tapCode=code;}
  }
  if(code==='KeyQ')game.startRoll();
  if(code==='KeyR')game.missile(display.v);
  else if(code==='KeyE')game.gun(display.v);
  else if(code==='KeyF')game.deployFlares();
  else if(code==='KeyB')callSupport();
}
function release(code){
  keys.delete(code);if(code==='KeyC')game.setRear(false);
  if(!((code==='ShiftRight'||code==='ShiftLeft')&&(keys.has('ShiftLeft')||keys.has('ShiftRight'))))keycap(code)?.classList.remove('held');
}
window.addEventListener('keydown',event=>{
  if(event.ctrlKey||event.altKey||event.metaKey)return;
  if(game.mode!=='live'&&event.code.startsWith('Arrow'))return;
  if(event.code==='KeyV'){
    event.preventDefault();if(!event.repeat)switchCamera();return;
  }
  if(event.code==='Enter' && game.mode!=='live' && !event.target.closest?.('nav,#home-dock,#school,#restart,#briefing,[data-code],#warning-lamps,#warning-language')){
    event.preventDefault();if(!event.repeat)startOrResume();return;
  }
  if(!keycap(event.code))return;
  event.preventDefault();if(!event.repeat)press(event.code);
});
window.addEventListener('keyup',e=>{if(keycap(e.code)){if(game.mode==='live')e.preventDefault();release(e.code);}});
for(const [code,b] of keyButtons){
  b.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;e.preventDefault();b.setPointerCapture(e.pointerId);press(code);
  });
  for(const name of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(name,()=>release(code));
  b.addEventListener('click',e=>{if(e.detail===0){press(code);setTimeout(()=>release(code),160);}});
}
engineAction.addEventListener('click',()=>{
  if(game.mode!=='live')return;
  if(game.engineState==='fire')game.cutThrust();
  else if(game.engineState==='isolated')game.extinguishEngine();
  else if(game.engineState==='off')game.tapRestart(performance.now()/1000);
});
ui.launch.addEventListener('click',startOrResume);
el('school').addEventListener('click',()=>{if(!display)return;radio.activate();game.startTraining();ui.world.focus({preventScroll:true});});
el('briefing').addEventListener('click',()=>{game.briefing();sortieOptions.querySelector('input:checked').focus({preventScroll:true});});
ui.restart.addEventListener('click',()=>{radio.activate();if(game.lesson)game.repeatLesson();else game.start();ui.world.focus({preventScroll:true});});
ui.pause.addEventListener('click',pauseToggle);
function soundState(){
  ui.sound.setAttribute('aria-pressed',String(radio.enabled));const msg=radio.enabled?'Выключить звук':'Включить звук';
  ui.sound.setAttribute('aria-label',msg);ui.sound.title=msg;paintIcon(ui.sound.querySelector('canvas'),!radio.enabled);
  const music=el('music'),label=radio.musicEnabled?'Выключить музыку':'Включить музыку';
  music.setAttribute('aria-pressed',String(radio.musicEnabled));music.setAttribute('aria-label',label);music.title=label;
  paintIcon(music.querySelector('canvas'),!radio.musicEnabled);
}
ui.sound.addEventListener('click',()=>{clearLampTest();radio.toggle();soundState();paintWarnings();if(game.mode==='live')ui.world.focus({preventScroll:true});});
el('music').addEventListener('click',()=>{radio.toggleMusic();soundState();if(game.mode==='live')ui.world.focus({preventScroll:true});});
soundState();
const fullNode=()=>document.fullscreenElement||document.webkitFullscreenElement;
function fullState(){
  const active=Boolean(fullNode());ui.full.setAttribute('aria-pressed',String(active));
  const name=active?'Выйти из полного экрана':'Полный экран';ui.full.title=name;ui.full.setAttribute('aria-label',name);display?.resize();
}
ui.full.addEventListener('click',async()=>{
  try{
    if(fullNode())await (document.exitFullscreen?.()??document.webkitExitFullscreen?.());
    else if(ui.shell.requestFullscreen)await ui.shell.requestFullscreen();
    else if(ui.shell.webkitRequestFullscreen)ui.shell.webkitRequestFullscreen();
    else info('Полный экран недоступен в этом браузере',2);
  }catch{info('Полный экран недоступен в этом окне',2);}
});
document.addEventListener('fullscreenchange',fullState);document.addEventListener('webkitfullscreenchange',fullState);
const softPause=()=>{clearKeys();if(game.mode==='live')game.pause();else{clearLampTest();radio.stopWarning();paintWarnings();}};
window.addEventListener('blur',softPause);
document.addEventListener('visibilitychange',()=>{if(document.hidden)softPause();lastFrame=performance.now();});
new ResizeObserver(()=>display?.resize()).observe(ui.viewport);
function frame(now){
  const dt=Math.max(0,Math.min(.5,(now-lastFrame)/1000));lastFrame=now;
  if(!document.hidden && display){
    if(game.mode==='live'){
      const n=Math.max(1,Math.ceil(dt*60));
      for(let k=0;k<n;k++){game.step(dt/n,keys,display.v);stepSupport();}
    }
    if(noticeLife>0){noticeLife-=dt;if(noticeLife<=0)clearNotice();}
    readoutTimer-=dt;if(readoutTimer<=0){refreshReadouts();readoutTimer=.09;if(game.mode==='live')radio.engineSpeed(game);}
    if(game.mode!=='ready')display.draw(game,dt);
  }
  requestAnimationFrame(frame);
}
async function init(){
  loadError=false;ui.launch.disabled=true;setText(ui['launch-text'],'Загрузка…');
  try{
    const [art]=await Promise.all([loadArt(),document.fonts.ready]);display=new Display(ui.world,art);
    game.heightAt=(x,z)=>display.scenery.heightAt(x,z);
    cameraState();paintedMask=-1;
    screen();ui.launch.disabled=false;display.draw(game,0);
    lastFrame=performance.now();requestAnimationFrame(frame);
  }catch(error){
    console.error('Afterburn failed to load',error);loadError=true;setText(ui['launch-text'],'Повторить загрузку');
    setText(ui.brief,'Не удалось загрузить сцену. Попробуй ещё раз.');ui.launch.disabled=false;
  }
}
paintSupport();
init();
