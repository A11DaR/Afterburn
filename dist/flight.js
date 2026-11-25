import {clamp,angleDiff,approach,project,relativeTo,recordTrail} from './geometry.js';
import {newOpponent,flyOpponent,markIncoming,attackScore} from './opponents.js';
import {advanceAirframe,nextVisionShade,WING_LIMIT} from './aerodynamics.js';
import {MISSIONS} from './missions.js';
import {arcadeAxes} from './pilot-assist.js';
import {beginLesson,moveDrone,advanceLesson} from './flight-school.js';
import {scanTerrain,advisedRoll} from './ground-awareness.js';
export {clamp,angleDiff,project,viewFor,cameraFor,relativeTo} from './geometry.js';

export const LOCK_SECONDS=1;
const PLAYER_MISSILE_SPEED=.8;
export const WAVES=MISSIONS.intercept.stages;
export const TOTAL=WAVES.reduce((sum,n)=>sum+n,0);
export const ASSIST_RADIUS=2.53; // All three distances are measured in HUD ring radii.
const FOLLOW_RADIUS=2.88;
const SEEK_TRAVEL=2.00;
const leftRight=keys=>Number(keys.has('KeyD'))-Number(keys.has('KeyA'));

function moveMarker(body,dt) {
  const distance=body.speed*dt, horizontal=Math.cos(body.pitch)*distance;
  body.x+=Math.sin(body.heading)*horizontal;
  body.z+=Math.cos(body.heading)*horizontal;
  body.alt+=Math.sin(body.pitch)*distance;
  recordTrail(body,dt,.055,24);
}

export class Flight {
  constructor(emit=()=>{},random=Math.random) {
    this.emit=emit;this.random=random;
    this.heightAt=()=>0;
    this.missionId='intercept';this.profile='arcade';this.mode='ready';this.clear();
  }
  get mission(){return MISSIONS[this.missionId];}
  get goal(){return this.mission.stages.reduce((sum,n)=>sum+n,0);}
  get searchRadius(){return this.profile==='arcade'?2.95:ASSIST_RADIUS;}
  get rollCue(){return advisedRoll(this);}
  get engineFire(){return this.engineState==='fire'||this.engineState==='isolated';}
  get enginePowered(){return this.engineState==='running'||this.engineState==='fire';}
  setProfile(id){
    if(!['ready','paused'].includes(this.mode)||!['arcade','classic'].includes(id))return false;
    this.profile=id;this.releasePilot();return true;
  }
  releasePilot(){
    this.pointerAim=null;this.touchStick=null;this.mouseGun=false;this.assistSide=0;this.assistPull=0;
  }
  clear() {
    this.releasePilot();
    Object.assign(this,{
      lesson:null,roundsFired:0,gunHits:0,launches:0,missileHits:0,
      wave:0,kills:0,hull:100,rockets:this.mission.rockets,rounds:240,flares:this.mission.flares,time:0,waveTime:0,
      x:550,z:95,alt:this.missionId==='dogfight'?112:55,yaw:0,pitch:.025,bank:0,baseBank:0,yawRate:0,
      pathPitch:.025,trackYaw:0,slip:0,separation:0,aileronRate:0,freeBank:false,thrust:17.65,gLoad:1,peakG:1,visionShade:0,stalled:false,highG:false,wingStress:0,wingLoss:null,exit:null,
      speed:398,throttle:398,boost:false,braking:false,flapAngle:0,flapsExtended:false,
      lastHitSide:0,clearance:55,groundWarning:false,warningIn:0,
      lowAltitude:false,bankWarning:false,terrainTurn:0,leftMargin:Infinity,rightMargin:Infinity,
      rear:false,lastSide:1,roll:null,deathCause:'',lock:0,lockId:null,seekX:0,seekY:0,
      aoa:3.4,highAoa:false,lowSpeed:false,overspeed:false,sinkWarning:false,
      engineState:'running',engineClock:0,restartTapAt:-Infinity,
      sixWarning:false,rearPressure:0,
      nextId:1,bots:[],missiles:[],threats:[],gunWait:0,reload:0,flareWait:0,flareCover:0,
      fireWait:6.8,between:0,damageFlash:0
    });
  }
  selectMission(id){
    if(this.mode!=='ready'||!Object.hasOwn(MISSIONS,id))return false;
    this.missionId=id;this.clear();return true;
  }
  briefing(){
    if(this.mode==='live')return;
    this.mode='ready';this.clear();this.emit('briefing');
  }
  start(id=this.missionId) {
    if(!Object.hasOwn(MISSIONS,id))return false;
    this.missionId=id;
    this.clear();this.alt=Math.max(this.alt,this.heightAt(this.x,this.z)+40);
    this.clearance=this.alt-this.heightAt(this.x,this.z);
    this.mode='live';this.spawnWave();this.emit('start');
  }
  startTraining(){
    this.clear();this.mode='live';beginLesson(this);this.emit('start');
  }
  repeatLesson(){
    if(!this.lesson)return;
    const {stage,passed}=this.lesson,elapsed=this.time;
    this.clear();this.time=elapsed;this.mode='live';beginLesson(this,stage,passed);
    this.emit('lessonRetry');
  }
  resetLock(){this.lock=0;this.lockId=null;this.seekX=0;this.seekY=0;}
  setRear(value){
    this.rear=this.mode==='live' && !this.wingLoss && Boolean(value);
    if(this.rear){this.resetLock();this.releasePilot();}
  }
  pause(){
    if(this.mode!=='live')return;
    this.restartTapAt=-Infinity;
    this.mode='paused';this.rear=false;this.releasePilot();this.resetLock();this.emit('pause');
  }
  resume(){if(this.mode==='paused'){this.mode='live';this.emit('resume');}}
  spawnWave(){
    const duel=this.missionId==='dogfight';
    this.waveTime=0;this.between=0;this.fireWait=duel?3.9-this.wave*.55:6.8-this.wave*.65;
    this.rearPressure=0;this.sixWarning=false;this.resetLock();
    this.bots=Array.from({length:this.mission.stages[this.wave]},(_,i)=>newOpponent(this,i));
    const leader=this.bots.find(b=>b.runner);
    if(leader){
      const leg=1820-this.wave*150,course=leader.heading;
      this.exit={leader,x:leader.x+Math.sin(course)*leg,z:leader.z+Math.cos(course)*leg,leg,remaining:leg};
    }else this.exit=null;
  }
  terrainBetween(a,b){
    const dx=b.x-a.x,dz=b.z-a.z,dy=b.alt-a.alt;
    const steps=Math.ceil(Math.hypot(dx,dz)/11);
    for(let i=1;i<steps;i++){
      const k=i/steps;
      if(this.heightAt(a.x+dx*k,a.z+dz*k)>a.alt+dy*k+1)return true;
    }
    return false;
  }
  startRoll(side=this.lastSide) {
    if(this.mode!=='live' || this.wingLoss || this.roll)return false;
    this.lastSide=side<0?-1:1;this.roll={side:this.lastSide,t:0,entryBank:this.baseBank};
    this.emit('roll',this.lastSide);return true;
  }
  igniteEngine(){
    if(this.engineFire||this.mode!=='live'||this.wingLoss)return;
    this.engineState=this.enginePowered?'fire':'isolated';
    this.engineClock=0;this.restartTapAt=-Infinity;this.boost=false;
  }
  cutThrust(){
    if(this.mode!=='live'||this.wingLoss||(!this.enginePowered&&this.engineState!=='starting'))return false;
    this.engineState=this.engineFire?'isolated':'off';
    this.throttle=0;this.thrust=0;this.boost=false;this.restartTapAt=-Infinity;
    this.emit('engineCut');return true;
  }
  extinguishEngine(){
    if(this.mode!=='live'||this.wingLoss||this.engineState!=='isolated')return false;
    this.engineState='off';this.engineClock=0;this.restartTapAt=-Infinity;
    this.emit('fireOut');return true;
  }
  tapRestart(now=this.time){
    if(this.mode!=='live'||this.wingLoss||this.engineState!=='off')return false;
    const interval=now-this.restartTapAt;
    if(interval<0||interval>.5){this.restartTapAt=now;return false;}
    this.restartTapAt=-Infinity;this.engineState='starting';this.engineClock=0;
    this.emit('engineStart');return true;
  }
  advanceEngine(dt){
    if(this.engineState==='starting'){
      this.engineClock+=dt;
      if(this.engineClock>=1){
        this.engineState='running';this.engineClock=0;this.throttle=398;
        this.emit('engineReady');
      }
    }else if(this.engineFire){
      this.engineClock+=dt;
      if(this.engineClock>=2.5){
        this.engineClock-=2.5;
        this.hull=Math.max(0,this.hull-(this.enginePowered?3:1));
        if(!this.hull)this.finish(false,'fire');
      }
    }
  }
  movePlayer(dt,keys){
    let side=leftRight(keys),vertical=Number(keys.has('KeyW'))-Number(keys.has('KeyS'));
    const aileron=Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft'));
    if(side||vertical||aileron)this.pointerAim=null;
    if(this.profile==='arcade')({side,vertical}=arcadeAxes(this,dt,side,vertical));
    if(Math.abs(side)>.04)this.lastSide=Math.sign(side);
    this.rear=keys.has('KeyC');
    const wasBoosting=this.boost,wasBraking=this.braking;
    this.boost=this.engineState==='running'&&(keys.has('ShiftLeft')||keys.has('ShiftRight'));
    this.braking=keys.has('KeyX');
    if(this.boost&&!wasBoosting)this.emit('boost');
    if(this.braking&&!wasBraking)this.emit('brake');
    if(keys.has('KeyQ')&&!aileron&&!this.roll)this.startRoll();
    advanceAirframe(this,dt,side,vertical,aileron);
    if(!this.flapsExtended&&this.flapAngle>=8){this.flapsExtended=true;this.emit('flapDown');}
    if(this.flapsExtended&&this.flapAngle<=3){this.flapsExtended=false;this.emit('flapUp');}
    if(Math.abs(this.gLoad)>WING_LIMIT && this.wingStress>=1){
      this.wingLoss={side:this.lastSide,age:0,load:this.gLoad};this.roll=null;this.rear=false;
      this.boost=false;this.braking=false;this.threats=[];this.resetLock();this.damageFlash=.52;
      this.emit('wingBreak',this.wingLoss);return;
    }
    const airSpeed=this.speed/9,travel=airSpeed*Math.cos(this.pathPitch);
    const sn=Math.sin(this.trackYaw),cs=Math.cos(this.trackYaw);
    const ox=this.x,oz=this.z,oh=this.alt;
    this.x+=travel*sn*dt;this.z+=travel*cs*dt;
    this.alt=Math.max(-3,this.alt+airSpeed*Math.sin(this.pathPitch)*dt);
    this.clearance=this.alt-this.heightAt(this.x,this.z);
    const descent=dt>0?(oh-this.alt)/dt:0;
    this.sinkWarning=descent>(this.sinkWarning?9:15) && this.clearance<(this.sinkWarning?105:86);
    const pieces=Math.max(1,Math.ceil(Math.hypot(this.x-ox,this.z-oz)/2));
    for(let i=1;i<=pieces;i++) {
      const k=i/pieces,x=ox+(this.x-ox)*k,z=oz+(this.z-oz)*k;
      const ground=this.heightAt(x,z);
      if(oh+(this.alt-oh)*k<=ground+2){
        this.x=x;this.z=z;this.alt=ground+2;this.clearance=2;this.hull=0;this.damageFlash=.95;
        this.finish(false,ground<1?'water':'terrain');return;
      }
    }
    this.warningIn-=dt;
    if(this.warningIn<=0){
      this.warningIn=.12;
      scanTerrain(this,travel,airSpeed*Math.sin(this.pathPitch));
    }
  }
  fallWithoutWing(dt){
    const loss=this.wingLoss;loss.age+=dt;this.damageFlash=Math.max(0,this.damageFlash-dt*1.15);
    this.visionShade=nextVisionShade(this.visionShade,0,dt);
    this.bank=angleDiff(this.bank+loss.side*(1.5+loss.age)*dt,0);
    this.pathPitch=Math.max(-1.14,this.pathPitch-(.51+loss.age*.16)*dt);
    this.pitch=approach(this.pitch,this.pathPitch-.12,2.4,dt);
    this.trackYaw=angleDiff(this.trackYaw+loss.side*.32*dt,0);this.yaw=this.trackYaw;
    const travel=this.speed/9*dt;
    this.x+=Math.sin(this.trackYaw)*Math.cos(this.pathPitch)*travel;
    this.z+=Math.cos(this.trackYaw)*Math.cos(this.pathPitch)*travel;
    const ground=this.heightAt(this.x,this.z);this.alt=Math.max(ground+2,this.alt+Math.sin(this.pathPitch)*travel);
    this.clearance=this.alt-ground;
    if(loss.age>=1.45 || this.clearance<=2.01){this.hull=0;this.finish(false,'wing');}
  }
  sightTarget(v,forGun=false){
    if(this.rear)return null;
    let best=Infinity,result=null;
    for(const b of this.bots){
      if(b.occluded || (!forGun&&b.claimed) || b.range>700)continue;
      const p=project(b,this,v),dx=(p.x-v.cx)/v.r,dy=(p.y-v.cy)/v.r;
      const distance=Math.hypot(dx,dy),following=!forGun&&b.id===this.lockId;
      const radius=forGun?1:(following?(this.profile==='arcade'?3.27:FOLLOW_RADIUS):this.searchRadius);
      if(!p.visible || p.range>700 || distance>radius)continue;
      const sight={bot:b,dx,dy,distance};
      if(following)return sight;
      if(distance<best){best=distance;result=sight;}
    }
    return result;
  }
  insideRing(sight){return sight && Math.hypot(sight.dx-this.seekX,sight.dy-this.seekY)<=1;}
  inSight(v,forGun=false){
    const sight=this.sightTarget(v,forGun);
    return sight && (forGun||this.insideRing(sight))?sight.bot:null;
  }
  updateLock(dt,v){
    if(this.rear || !this.rockets){this.resetLock();return;}
    const near=this.sightTarget(v);
    let wantedX=0,wantedY=0;
    if(near && near.distance>.14){
      const travel=this.profile==='arcade'?2.48:SEEK_TRAVEL;
      const weight=Math.min(travel,(near.distance-.14)*.94)/near.distance;
      wantedX=near.dx*weight;wantedY=near.dy*weight;
    }
    this.seekX=approach(this.seekX,wantedX,18,dt);this.seekY=approach(this.seekY,wantedY,18,dt);
    const candidate=this.insideRing(near)?near.bot:null;
    if(!candidate || candidate.id!==this.lockId){
      const lostTrack=this.lock>.55;
      this.lockId=candidate?.id??null;this.lock=0;
      if(candidate)this.emit('acquire',candidate);else if(lostTrack)this.emit('lockBreak');
      return;
    }
    const old=this.lock;this.lock=Math.min(LOCK_SECONDS,old+dt+Number.EPSILON);
    if(old<LOCK_SECONDS && this.lock===LOCK_SECONDS)this.emit('locked',candidate);
    else if(Math.floor(this.lock*2)>Math.floor(old*2))this.emit('trackBeat',Math.floor(this.lock*2));
  }
  missile(v){
    if(this.mode!=='live' || this.wingLoss || this.rear)return false;
    if(!this.rockets){this.emit('denied');this.emit('info','Ракеты закончились · E — пулемёт');return false;}
    const b=this.inSight(v);
    if(!b || this.lockId!==b.id || this.lock<LOCK_SECONDS || this.terrainBetween(this,b)){
      this.emit('denied');this.emit('info','Подведи цель к меткам и дождись захвата · 1 с');return false;
    }
    this.rockets--;this.launches++;b.claimed=true;
    const side=this.rockets%2?1:-1, cs=Math.cos(this.yaw),sn=Math.sin(this.yaw);
    this.missiles.push({target:b,x:this.x+side*5*cs+4*sn,z:this.z-side*5*sn+4*cs,alt:this.alt-2,
      heading:this.yaw,pitch:this.pitch-.045,speed:178*PLAYER_MISSILE_SPEED,age:0,life:4.6,free:false,history:[],sampleIn:0});
    if(!b.training)markIncoming(this,b);
    this.resetLock();this.emit('missile',b);return true;
  }
  shedPursuer(b){
    for(const m of this.missiles)if(m.target===b){m.free=true;m.life=Math.min(m.life,m.age+1);m.target=null;}
    b.claimed=false;
  }
  gun(v){
    if(this.mode!=='live'||this.wingLoss||this.rear||this.gunWait>0||this.reload>0||!this.rounds)return;
    this.gunWait=.087;this.rounds--;this.roundsFired++;
    const b=this.inSight(v,true);this.emit('gun',b);
    if(b && b.range<590){
      this.gunHits++;b.hp=b.training?Math.max(25,b.hp-25):b.hp-25;if(b.hp>0)this.emit('hit',b);
      if(b.hp<=0)this.destroy(b);
      else if(b.state==='approach' && this.waveTime>3.2){b.timer=0;}
    }
    if(!this.rounds){this.reload=2.7;this.emit('reload');this.emit('info','Перезарядка пулемёта');}
  }
  deployFlares(){
    if(this.mode!=='live'||this.wingLoss||this.flareWait>0)return false;
    if(!this.flares){this.emit('denied');this.emit('info','Ловушки закончились · Q — бочка');return false;}
    this.flares--;this.flareWait=.8;this.flareCover=1.15;
    const threats=this.threats.filter(t=>!t.free);
    for(const t of threats)this.divert(t,'flare');
    this.emit('flares',threats.length);return true;
  }
  destroy(b,weapon='gun'){
    if(!this.bots.includes(b))return;
    this.bots=this.bots.filter(other=>other!==b);this.kills++;this.shedPursuer(b);
    if(b.runner)this.exit=null;
    if(this.lockId===b.id)this.resetLock();
    this.emit('kill',{x:b.x,z:b.z,alt:b.alt,range:b.range,id:b.id,weapon});
    if(!this.bots.length){this.between=1.7;this.threats=[];}
  }
  moveShots(dt){
    const live=[];
    for(const m of this.missiles){
      m.age+=dt;
      if(m.age>=m.life){if(m.target){m.target.claimed=false;this.emit('miss',m.target);}continue;}
      if(!m.free && m.target){
        const target=m.target,aim=relativeTo(target,m);
        if(aim.range<12){this.missileHits++;this.destroy(target,'missile');continue;}
        const yaw=angleDiff(aim.bearing,m.heading),up=aim.elev-m.pitch;
        const crossing=target.state==='evade' && aim.range<96 && Math.abs(target.lastTurn)>.70
          && Math.abs(angleDiff(target.heading,m.heading))>.78 && Math.abs(yaw)>.11;
        if(m.age>.35 && (Math.abs(yaw)>1.52 || crossing) && this.bots.includes(target)){
          target.claimed=false;m.free=true;m.target=null;m.life=m.age+.8;this.emit('miss',target);
        }else{
          const turn=target.state==='evade'?1.18:2.55;
          m.heading+=clamp(yaw,-turn*dt,turn*dt);m.pitch+=clamp(up,-turn*dt,turn*dt);
        }
      }
      m.speed=approach(m.speed,218*PLAYER_MISSILE_SPEED,1.7,dt);moveMarker(m,dt);
      if(m.alt<this.heightAt(m.x,m.z)+1) {
        if(m.target){m.target.claimed=false;this.emit('miss',m.target);}continue;
      }
      live.push(m);
    }
    this.missiles=live;
  }
  launchThreat(b){
    const aim=relativeTo(this,b),duration=clamp(aim.range/77,2.45,4.15)+(this.profile==='arcade'?.65:0);
    const lateral=(b.x-this.x)*Math.cos(this.trackYaw)-(b.z-this.z)*Math.sin(this.trackYaw);
    const t={x:b.x,z:b.z,alt:b.alt,heading:aim.bearing,pitch:aim.elev,speed:98,sourceId:b.id,
      duration,ttl:duration,age:0,evade:0,evadeSide:Math.abs(lateral)>5?-Math.sign(lateral):this.lastSide,
      free:false,training:Boolean(b.training),history:[],sampleIn:0};
    this.threats.push(t);b.attackWait=10+this.random()*4;this.emit('warning',b);
    if(this.flareCover>0)this.divert(t,'flare');
    return t;
  }
  divert(t,reason){
    if(t.free)return;
    t.free=true;t.freeTime=1.1;t.heading+=.18*this.lastSide;
    if(t.training && this.lesson && (reason==='flare'||(reason==='maneuver'&&t.evade>.46)))this.lesson.avoided=true;
    if(reason==='maneuver')this.emit('dodged');
  }
  incoming(dt){
    this.fireWait-=dt;
    if(this.fireWait<=0 && !this.threats.some(t=>!t.free)){
      let shooter=null,best=-Infinity;
      for(const b of this.bots){const score=attackScore(this,b);if(score>best){best=score;shooter=b;}}
      if(shooter){this.fireWait=6.6+this.random()*2-this.wave*.65;this.launchThreat(shooter);}
    }
    const active=[];
    for(const t of this.threats){
      t.age+=dt;
      if(t.free){t.freeTime-=dt;moveMarker(t,dt);if(t.freeTime>0&&t.alt>this.heightAt(t.x,t.z))active.push(t);continue;}
      const old=relativeTo(this,t);
      t.ttl-=dt;
      // The remaining warning time is an arcade countdown; the projectile exists in world space.
      t.speed=clamp(old.range/Math.max(.13,t.ttl)+this.speed/9*Math.cos(this.yaw-old.bearing),45,290);
      const dy=angleDiff(old.bearing,t.heading);
      t.heading+=clamp(dy,-2.8*dt,2.8*dt);
      t.pitch+=clamp(old.elev-t.pitch,-2.1*dt,2.1*dt);
      if(t.ttl<2.25){
        const rollEffort=this.roll?Math.sin(this.roll.t*Math.PI)*2.5:0;
        const turnEffort=Math.max(0,Math.abs(this.yawRate)*this.speed/395-.28)*1.35
          +clamp((this.speed-320)/220,0,1)*clamp((Math.abs(this.baseBank)-.72)/.46,0,1)*.40;
        t.evade+=dt*(rollEffort+turnEffort);
        if(t.evade>.46)this.divert(t,'maneuver');
      }
      moveMarker(t,dt);
      if(t.free){active.push(t);continue;}
      if(t.alt<this.heightAt(t.x,t.z)+.5){this.emit('terrainMiss');continue;}
      const separation=Math.hypot(t.x-this.x,t.z-this.z,t.alt-this.alt);
      if(t.ttl<=0 && separation>18){this.divert(t,'maneuver');active.push(t);continue;}
      if(t.ttl<=0 || separation<5.5){
        if(t.training){this.emit('info','Ещё попытка. Выпусти ловушки, пока идёт отсчёт.');continue;}
        const before=this.hull;
        this.hull=Math.max(0,this.hull-(23+this.wave*3));this.damageFlash=1;
        const lateral=(t.x-this.x)*Math.cos(this.yaw)-(t.z-this.z)*Math.sin(this.yaw);
        this.lastHitSide=Math.sign(lateral)||1;
        if(this.hull>0 && this.hull<=55)this.igniteEngine();
        this.emit('damage',{side:this.lastHitSide,amount:before-this.hull,fatal:this.hull===0});
        if(!this.hull){this.finish(false,'missile');return;}
      }else active.push(t);
    }
    this.threats=active;
  }
  finish(won,cause=''){
    if(this.lesson&&!won){this.repeatLesson();return;}
    this.mode=won?'won':'lost';this.deathCause=cause;this.threats=[];this.rear=false;
    this.roll=null;this.resetLock();this.emit(this.mode,cause);
  }
  checkTail(dt){
    const closeBehind=this.waveTime>2 && this.bots.some(b=>!b.occluded && b.range<235 && b.state!=='evade' && b.state!=='extend'
      && Math.cos(b.bearing-this.yaw)<-.65 && Math.cos(b.heading-b.bearing-Math.PI)>.55);
    this.rearPressure=clamp(this.rearPressure+dt*(closeBehind?1:-2),0,1);
    this.sixWarning=this.rearPressure>(this.sixWarning ? .22 : .65);
  }
  step(dt,keys,v){
    if(this.mode!=='live')return;
    this.time+=dt;this.waveTime+=dt;
    if(this.wingLoss){this.fallWithoutWing(dt);return;}
    this.advanceEngine(dt);
    if(this.mode!=='live')return;
    this.movePlayer(dt,keys);
    if(this.mode!=='live'||this.wingLoss)return;
    if(this.lesson)moveDrone(this,dt);
    else for(const b of this.bots)flyOpponent(this,b,dt);
    if(this.exit){
      const leader=this.exit.leader;
      this.exit.remaining=Math.hypot(this.exit.x-leader.x,this.exit.z-leader.z);
      if(this.exit.remaining<35){this.finish(false,'escape');return;}
    }
    this.checkTail(dt);
    this.gunWait=Math.max(0,this.gunWait-dt);this.flareWait=Math.max(0,this.flareWait-dt);
    this.flareCover=Math.max(0,this.flareCover-dt);this.damageFlash=Math.max(0,this.damageFlash-dt*1.5);
    if(this.reload>0){this.reload=Math.max(0,this.reload-dt);if(!this.reload){this.rounds=240;this.emit('rearmed');}}
    this.updateLock(dt,v);if(keys.has('KeyE')||this.mouseGun)this.gun(v);
    this.moveShots(dt);
    if(this.lesson){advanceLesson(this,dt);return;}
    if(this.between>0){
      this.between-=dt;
      if(this.between<=0){
        if(this.wave===this.mission.stages.length-1)this.finish(true);
        else{
          const duel=this.missionId==='dogfight';
          this.wave++;this.rockets=Math.min(duel?3:6,this.rockets+(duel?1:4));this.flares=Math.min(duel?4:6,this.flares+(duel?2:3));
          this.rounds=240;this.reload=0;this.hull=Math.min(100,this.hull+15);this.spawnWave();this.emit('wave');
        }
      }
    }else this.incoming(dt);
  }
}
