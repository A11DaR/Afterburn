import {manageEnergy} from './sortie-pilot.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Flight,LOCK_SECONDS,TOTAL,angleDiff,project,viewFor,cameraFor} from '../dist/flight.js';
import {WING_LIMIT} from '../dist/aerodynamics.js';
import {attackScore} from '../dist/opponents.js';
import {WARNINGS,WarningQueue,warningMask,warningClip} from '../dist/warnings.js';
import {scanTerrain} from '../dist/ground-awareness.js';

const v=viewFor(896,430), idle=new Set(), events=[];
const game=new Flight((name,data)=>events.push({name,data}),()=>.29);
game.setProfile('classic');
const dt=1/120;
function stepFor(seconds,keys=idle){
  for(let i=0;i<Math.round(seconds/dt);i++)game.step(dt,keys,v);
}
function track(b,seconds){
  for(let i=0;i<Math.round(seconds/dt);i++){
    game.trackYaw=game.yaw=b.bearing;game.pathPitch=game.pitch=b.elev;game.step(dt,idle,v);
  }
}
function reset(height=()=>0,mission='intercept'){
  game.heightAt=height;game.start(mission);events.length=0;
}
function was(name){return events.some(e=>e.name===name);}
function attack(){
  game.flares=0;game.fireWait=100;
  return game.launchThreat(game.bots[2]);
}
reset();
assert.equal(game.bots.length,3);
const first=game.bots[0],behind=game.bots[2];
assert.equal(project(behind,game,v).visible,false);
const heading=game.yaw;
game.setRear(true);
assert.equal(project(behind,cameraFor(game),v).visible,true);
assert.equal(game.yaw,heading);
assert.equal(game.missile(v),false);
game.gun(v);assert.equal(game.rounds,240);
game.setRear(false);
track(first,1.49);
assert.ok(game.lock>1.45 && game.lock<LOCK_SECONDS);
assert.equal(game.missile(v),false);assert.equal(game.rockets,4);
game.trackYaw+=.43;game.step(dt,idle,v);assert.equal(game.lock,0);
track(first,.8);track(game.bots[1],dt);assert.equal(game.lock,0);
track(first,1.55);assert.equal(game.lock,LOCK_SECONDS);
game.setRear(true);assert.equal(game.lock,0);game.setRear(false);
reset();stepFor(1.6);assert.equal(game.missile(v),true);
assert.equal(game.missile(v),false);stepFor(1.65);
assert.equal(game.kills,1);assert.equal(game.rockets,3);
const rocketKill=events.find(e=>e.name==='kill').data;
assert.equal(rocketKill.weapon,'missile');
assert.ok([rocketKill.x,rocketKill.z,rocketKill.alt].every(Number.isFinite));
game.pause();const frozen=game.time;
stepFor(2);assert.equal(game.time,frozen);
assert.equal(game.startRoll(),false);assert.equal(game.missile(v),false);game.resume();
for(const profile of ['arcade','classic']){
  game.setProfile(profile);reset();
  assert.equal(game.flapAngle,0);
  stepFor(.5,new Set(['KeyX']));
  assert.ok(game.flapAngle>=8 && game.flapAngle<=12.01);
  assert.equal(events.filter(e=>e.name==='flapDown').length,1);
  game.pause();const angle=game.flapAngle;stepFor(1);assert.equal(game.flapAngle,angle);game.resume();
  stepFor(5,new Set(['ShiftLeft']));
  assert.ok(game.flapAngle<3);
  assert.equal(events.filter(e=>e.name==='flapUp').length,1);
}
reset();const cruise=game.speed;
stepFor(1.5,new Set(['ShiftLeft']));assert.ok(game.speed>cruise+90);
const fast=game.speed;stepFor(1.7,new Set(['KeyX']));assert.ok(game.speed<fast-80);
stepFor(2,new Set(['KeyX']));assert.ok(game.speed<300);assert.equal(game.startRoll(1),true);
reset();stepFor(.3,new Set(['KeyD','KeyW']));assert.ok(game.yaw>0 && game.pitch>.025 && game.bank>0);
const priorHeading=game.yaw;stepFor(.7,new Set(['KeyA','KeyS']));
assert.ok(game.yaw<priorHeading && game.pitch<.025 && game.bank<0);
reset();const lateral=game.x;assert.equal(game.startRoll(-1),true);stepFor(.52);
assert.ok(Math.abs(game.bank)>2.9);assert.equal(game.startRoll(-1),false);
stepFor(.65);assert.ok(game.x<lateral-.5);assert.equal(game.roll,null);assert.ok(Math.abs(game.bank)<.01);
reset();attack();stepFor(3.7);assert.equal(game.hull,77);
const impact=events.find(e=>e.name==='damage').data;
assert.equal(Math.abs(impact.side),1);assert.equal(impact.amount,23);assert.equal(impact.fatal,false);
reset();game.hull=20;attack();stepFor(3.7);
assert.equal(game.mode,'lost');assert.equal(game.deathCause,'missile');
assert.equal(events.find(e=>e.name==='damage').data.fatal,true);
reset();const t=attack();stepFor(t.duration-1.5);
assert.equal(game.startRoll(1),true);stepFor(2.4);assert.equal(game.hull,100);assert.equal(game.flares,0);assert.ok(was('dodged'));
reset();game.speed=610;game.throttle=610;const fastThreat=attack();stepFor(fastThreat.duration-1.85);
stepFor(2.5,new Set(['KeyD']));assert.equal(game.hull,100);assert.ok(was('dodged'));assert.equal(game.flares,0);
reset();const diverted=game.launchThreat(game.bots[2]);
assert.equal(game.deployFlares(),true);assert.ok(diverted.free);assert.equal(game.deployFlares(),false);
stepFor(3.5);assert.equal(game.hull,100);assert.equal(game.flares,5);
reset();stepFor(.38,new Set(['KeyE']));assert.equal(game.kills,1);assert.ok(game.rounds<240);
game.rounds=1;stepFor(.12,new Set(['KeyE']));assert.ok(game.reload>0);stepFor(2.8);assert.equal(game.rounds,240);

reset();const second=game.bots[1];
track(second,1.6);assert.equal(game.missile(v),true);const initialHeading=second.heading;
stepFor(1.12);assert.ok(was('botFlare'));assert.ok(game.bots.includes(second));assert.equal(second.claimed,false);
assert.equal(second.decoys,0);assert.equal(second.state,'evade');assert.ok(Math.abs(angleDiff(second.heading,initialHeading))>.2);
reset();const crossing=game.bots[1];
Object.assign(crossing,{x:game.x,z:game.z+54,alt:game.alt,heading:1.64,pitch:0,speed:71,lastTurn:1.46,state:'evade',timer:1.3,goalHeading:2.55,claimed:true,decoys:0});
game.missiles.push({target:crossing,x:game.x-18,z:game.z+9,alt:game.alt,heading:0,pitch:0,speed:182,age:.48,life:4.6,history:[],sampleIn:0});
stepFor(.18);assert.equal(crossing.claimed,false);assert.ok(was('miss'));assert.equal(game.kills,0);
reset();const b=game.bots[2];
b.attackWait=0;b.heading=angleDiff(b.bearing+Math.PI,0);assert.ok(Number.isFinite(attackScore(game,b)));
b.heading+=Math.PI;assert.equal(attackScore(game,b),-Infinity);
b.heading-=Math.PI;b.occluded=true;assert.equal(attackScore(game,b),-Infinity);

const ridge=(x,z)=>z>=169&&z<=179?78:0;
reset(ridge);stepFor(.9);assert.ok(was('ground'));assert.equal(game.bots[0].occluded,true);
assert.equal(game.lock,0);stepFor(1.2);assert.equal(game.mode,'lost');assert.equal(game.deathCause,'terrain');assert.equal(game.hull,0);
reset(ridge);stepFor(2.2,new Set(['KeyW']));assert.equal(game.mode,'live');assert.ok(game.alt>80);
reset();stepFor(4.7,new Set(['KeyS']));assert.equal(game.mode,'lost');assert.equal(game.deathCause,'water');

// Acquire far from the fixed gun sight and retain a moving contact past the search gate.
reset();game.pitch=0;game.bank=0;
const edge=game.bots[0],other=game.bots[1];game.bots=[edge];
function place(b,radii){
  Object.assign(b,{x:game.x+200*v.r*radii/v.f,z:game.z+200,alt:game.alt,range:200,occluded:false,claimed:false});
}
function updateSight(n){for(let i=0;i<n;i++)game.updateLock(dt,v);}
place(edge,2.47);assert.equal(game.inSight(v),null);updateSight(90);
assert.equal(game.lockId,edge.id);assert.ok(game.seekX>1.90 && game.seekX<=2);
assert.equal(game.inSight(v,true),null);assert.equal(game.missile(v),false);
updateSight(125);assert.equal(game.lock,LOCK_SECONDS);
assert.ok(was('acquire'));assert.deepEqual(events.filter(e=>e.name==='trackBeat').map(e=>e.data),[1,2]);
place(edge,2.81);place(other,.2);game.bots.push(other);updateSight(30);
assert.equal(game.inSight(v),edge);assert.equal(game.lock,LOCK_SECONDS);assert.equal(game.inSight(v,true),other);
game.bots=[edge];const lowRidge=(x,z)=>z>game.z+40&&z<game.z+80?120:0;
game.heightAt=lowRidge;assert.equal(game.missile(v),false);game.heightAt=()=>0;
edge.occluded=true;assert.equal(game.missile(v),false);updateSight(1);assert.equal(game.lock,0);
place(edge,2.64);updateSight(250);assert.equal(game.lockId,null);
place(edge,1.72);updateSight(140);assert.ok(game.lock>0 && game.lock<LOCK_SECONDS);
edge.occluded=true;place(other,-.2);game.bots.push(other);updateSight(1);
assert.equal(game.lock,0);updateSight(24);assert.equal(game.lockId,other.id);assert.ok(game.lock<.2);
game.setRear(true);updateSight(20);assert.equal(game.seekX,0);assert.equal(game.lock,0);
game.setRear(false);game.bots=[edge];place(edge,-1.42);edge.alt=game.alt+200*v.r*1.4/v.f;
updateSight(240);assert.ok(game.seekX<-.95&&game.seekY<-.95);assert.equal(game.yaw,0);
assert.equal(game.missile(v),true);assert.equal(game.rockets,3);

const warning=id=>WARNINGS.find(w=>w.id===id);
const active=id=>Boolean(warningMask(game)&warning(id).bit);
reset();assert.equal(warningMask(game),0);stepFor(.8,new Set(['KeyW']));assert.ok(active('aoa'));
stepFor(.6);assert.equal(active('aoa'),false);game.pitch=0;
stepFor(2.8,new Set(['KeyX']));assert.ok(active('speed'));stepFor(2.6,new Set(['ShiftLeft']));assert.equal(active('speed'),false);
reset(ridge);stepFor(.88);assert.ok(active('pull-up'));game.pause();assert.equal(warningMask(game),0);
reset();const inc=game.launchThreat(game.bots[2]);assert.ok(active('missile'));game.flares=1;
game.deployFlares();assert.ok(inc.free);assert.ok(active('flares'));assert.equal(active('missile'),false);
reset();game.hull=77;attack();stepFor(3.7);assert.equal(game.hull,54);assert.ok(active('engine'));
game.pause();const burnTime=game.engineClock;stepFor(1);assert.equal(game.engineClock,burnTime);
assert.equal(game.cutThrust(),false);game.resume();
game.alt=400;game.fireWait=120;stepFor(9.1);
assert.ok(active('engine'));assert.ok(game.hull<54);
game.spawnWave();game.fireWait=120;assert.ok(active('engine'));
assert.equal(game.extinguishEngine(),false);assert.equal(game.engineState,'fire');
assert.equal(game.tapRestart(),false);
assert.ok(game.cutThrust());assert.equal(game.engineState,'isolated');assert.equal(game.thrust,0);
assert.equal(game.cutThrust(),false);assert.equal(game.tapRestart(),false);assert.ok(active('engine'));
assert.ok(game.extinguishEngine());assert.equal(game.engineState,'off');assert.equal(active('engine'),false);
const undamaged=game.hull;
stepFor(2.6,new Set(['ShiftLeft']));assert.equal(game.hull,undamaged);assert.equal(game.thrust,0);assert.equal(game.boost,false);
assert.equal(game.extinguishEngine(),false);assert.equal(game.tapRestart(0),false);
assert.equal(game.tapRestart(.65),false);assert.equal(game.engineState,'off');
game.pause();game.resume();assert.equal(game.tapRestart(.8),false);
assert.ok(game.tapRestart(1.1));assert.equal(game.engineState,'starting');
assert.equal(game.tapRestart(1.2),false);stepFor(.35);assert.equal(game.thrust,0);
game.pause();const spool=game.engineClock;stepFor(2);assert.equal(game.engineClock,spool);
game.resume();stepFor(1);assert.equal(game.engineState,'running');assert.ok(game.thrust>0);
assert.ok(was('engineReady'));
for(const profile of ['classic','arcade']){
  reset();game.profile=profile;game.alt=250;assert.ok(game.cutThrust());
  const pitch=game.pitch;stepFor(.22,new Set(['KeyW','ShiftLeft']));
  assert.ok(game.pitch>pitch);assert.equal(game.engineState,'off');assert.equal(game.throttle,0);
  assert.equal(game.boost,false);assert.ok(game.speed<398);
  assert.equal(game.tapRestart(),false);stepFor(.2);assert.ok(game.tapRestart());
  game.igniteEngine();assert.equal(game.engineState,'isolated');
  assert.ok(game.extinguishEngine());stepFor(1.1);assert.equal(game.engineState,'off');
}
reset();game.profile='classic';game.alt=400;game.fireWait=120;game.igniteEngine();game.hull=2;
stepFor(2.6);assert.equal(game.mode,'lost');assert.equal(game.deathCause,'fire');
reset();assert.equal(game.engineState,'running');assert.equal(game.engineClock,0);
assert.equal(warning('pull-up').ru.speech,'Тяни вверх! Тяни вверх!');
assert.equal(warning('aoa').ru.speech,'Критический угол атаки!');
assert.equal(warning('low-altitude').ru.speech,'Высота опасная!');

reset();stepFor(3.6,new Set(['ShiftLeft']));assert.ok(active('overspeed'));assert.ok(was('boost'));
stepFor(1.8,new Set(['KeyX']));assert.equal(active('overspeed'),false);assert.ok(was('brake'));
reset();stepFor(1.24,new Set(['KeyS']));assert.ok(active('sink'));assert.equal(active('pull-up'),false);
stepFor(1.4,new Set(['KeyW']));assert.equal(game.mode,'live');assert.equal(active('sink'),false);
reset();game.waveTime=4;const tail=game.bots[2];game.bots=[tail];
Object.assign(tail,{bearing:Math.PI,heading:0,range:145,state:'pursue',occluded:false});
game.checkTail(.3);assert.equal(active('six'),false);game.checkTail(.45);assert.ok(active('six'));
tail.occluded=true;game.checkTail(.5);assert.equal(active('six'),false);
tail.occluded=false;tail.heading=Math.PI;game.checkTail(1);assert.equal(active('six'),false);
reset();game.hull=55;attack();stepFor(3.7);assert.equal(game.hull,32);assert.ok(active('hull'));
game.between=.001;stepFor(.04);assert.ok(game.hull>32);assert.equal(active('hull'),false);
reset();game.rockets=1;stepFor(1.6);assert.equal(game.missile(v),true);assert.ok(active('rockets'));
stepFor(.15);assert.equal(game.lockId,null);
game.rounds=49;game.gun(v);assert.ok(active('ammo'));game.rounds=1;stepFor(.12,new Set(['KeyE']));
assert.equal(active('ammo'),false);assert.ok(was('reload'));stepFor(2.9);assert.ok(was('rearmed'));

const queue=new WarningQueue(),fire=warning('engine'),terrain=warning('pull-up'),empty=warning('flares');
assert.equal(queue.next(empty.bit,0,null),empty);
assert.equal(queue.next(empty.bit,1,null),null);
assert.equal(queue.next(fire.bit|empty.bit,2,empty),fire);
assert.equal(queue.next(fire.bit|terrain.bit,2.1,fire),terrain);
assert.equal(queue.next(fire.bit|terrain.bit,2.2,terrain),null);
assert.equal(queue.next(0,3,null),null);assert.equal(queue.next(empty.bit,3.1,null),empty);
assert.equal(queue.next(empty.bit,500,null),null);
queue.reset();assert.equal(queue.next(terrain.bit|empty.bit,0,null),terrain);
assert.equal(queue.next(terrain.bit|empty.bit,1.7,null),empty);
assert.equal(queue.next(terrain.bit,3.7,null),terrain);
queue.reset();assert.equal(queue.next(empty.bit,0,null),empty);
assert.equal(queue.next(terrain.bit|empty.bit,.1,empty),terrain);queue.interrupted(empty,.1);
assert.equal(queue.next(empty.bit,.3,null),null);assert.equal(queue.next(empty.bit,1.7,null),empty);
queue.reset();const six=warning('six'),ammo=warning('ammo');
assert.equal(queue.next(ammo.bit,0,null),ammo);
assert.equal(queue.next(ammo.bit|six.bit,.1,ammo),null);
assert.equal(queue.next(six.bit,.9,null),six);
assert.equal(queue.next(six.bit|terrain.bit,1,six),terrain);

// Mirrored slopes must produce opposite, mutually exclusive steering calls.
for(const openSide of [-1,1]){
  reset();Object.assign(game,{x:0,z:0,alt:60,clearance:60,trackYaw:0});
  game.heightAt=(x,z)=>z>=80 && x*openSide<=12?68:0;
  scanTerrain(game,42,0);
  assert.equal(game.rollCue,openSide);assert.equal(game.groundWarning,false);
  assert.equal(active('roll-left'),openSide===-1);assert.equal(active('roll-right'),openSide===1);
  game.z=55;scanTerrain(game,42,0);assert.equal(active('pull-up'),true);assert.equal(game.rollCue,0);
}
reset();
for(const [h,low] of [[29,true],[35,true],[39,false]]){
  game.alt=game.clearance=h;scanTerrain(game,42,0);assert.equal(active('low-altitude'),low);
}
game.baseBank=1.22;scanTerrain(game,42,0);assert.equal(active('bank-angle'),true);
game.roll={t:.3,side:-1};scanTerrain(game,42,0);assert.equal(active('bank-angle'),false);
reset();
const fromRight=game.launchThreat({...game.bots[0],x:game.x+80});
fromRight.ttl=2.5;assert.equal(game.rollCue,-1);
game.deployFlares();assert.equal(game.rollCue,0);

for(const w of WARNINGS)for(const lang of ['ru','en']){
  assert.ok(w[lang].label && w[lang].action && w[lang].speech);
  const bytes=readFileSync(new URL('../dist/'+warningClip(w,lang),import.meta.url));
  assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');
  assert.equal(bytes.readUInt32LE(24),22050);assert.ok(bytes.length>22050);
}

// The cockpit and HUD both read the airframe's signed load and actual velocity.
function airframe(){
  reset(undefined,'dogfight');
  game.alt=245;game.fireWait=300;
}
airframe();
stepFor(1);
const levelSpeed=game.speed,levelAltitude=game.alt;
assert.ok(Math.abs(game.gLoad-1)<.05);
airframe();
stepFor(1,new Set(['KeyW']));
assert.ok(game.aoa>22 && game.pitch-game.pathPitch>.27);
assert.ok(game.speed<levelSpeed-40 && game.alt>levelAltitude+6);
assert.ok(active('stall') && active('aoa'));
airframe();
stepFor(1.5,new Set(['KeyS']));
assert.ok(game.gLoad<0 && game.pathPitch<-.45 && game.alt<levelAltitude-12);
stepFor(1.5);
assert.ok(game.speed>levelSpeed+25);
airframe();
stepFor(2.8,new Set(['KeyX','KeyW']));
assert.ok(game.pitch>0 && game.pathPitch<0 && game.gLoad<.5 && active('stall'));
stepFor(.6,new Set(['KeyX','KeyW']));assert.ok(game.pathPitch<-.35 && game.speed<116);
assert.equal(game.wingStress,0);
stepFor(3.5,new Set(['ShiftLeft']));
assert.ok(game.speed>400 && !active('stall'));
stepFor(.9,new Set(['KeyW']));assert.ok(game.gLoad>2 && game.pathPitch>-.8);

const samplePull=rate=>{
  airframe();
  const keys=new Set(['KeyW']);
  for(let i=0;i<rate;i++)game.step(1/rate,keys,v);
  return {speed:game.speed,alt:game.alt,alpha:game.aoa};
};
const slowFrames=samplePull(30),fastFrames=samplePull(120);
assert.ok(Math.abs(slowFrames.speed-fastFrames.speed)<3);
assert.ok(Math.abs(slowFrames.alt-fastFrames.alt)<1 && Math.abs(slowFrames.alpha-fastFrames.alpha)<.15);

airframe();
stepFor(3.7,new Set(['ShiftLeft']));
const pull=new Set(['KeyW','KeyD']);
for(let i=0;i<120 && game.gLoad<10.3;i++){
  stepFor(dt,pull);
  if(game.gLoad<=WING_LIMIT)assert.equal(game.wingStress,0);
}
assert.ok(game.gLoad>WING_LIMIT && game.wingStress>0 && active('over-g'));
stepFor(.9);
assert.equal(game.wingLoss,null);assert.equal(game.wingStress,0);assert.equal(active('over-g'),false);
for(const [key,side] of [['KeyA',-1],['KeyD',1]]){
  airframe();
  stepFor(3.7,new Set(['ShiftLeft']));
  const keys=new Set(['KeyW',key]);
  for(let i=0;i<240&&!game.wingLoss;i++)stepFor(dt,keys);
  assert.equal(game.wingLoss.side,side);assert.ok(game.wingLoss.load>WING_LIMIT && was('wingBreak'));
  assert.equal(game.deployFlares(),false);assert.equal(game.missile(v),false);assert.equal(game.startRoll(side),false);
  game.gun(v);assert.equal(game.rounds,240);
  game.setRear(true);assert.equal(game.rear,false);
  game.pause();const age=game.wingLoss.age;stepFor(.5);assert.equal(game.wingLoss.age,age);
  game.resume();stepFor(1.6);assert.equal(game.mode,'lost');assert.equal(game.deathCause,'wing');
}
game.briefing();
assert.ok(game.selectMission('dogfight'));assert.equal(game.goal,3);
game.start();assert.equal(game.rockets,2);assert.equal(game.flares,3);
assert.equal(game.wingLoss,null);assert.equal(game.wingStress,0);
assert.equal(game.bots.length,1);assert.equal(game.exit,null);
assert.equal(game.selectMission('intercept'),false);
game.pause();game.briefing();assert.ok(game.selectMission('intercept'));game.start();
assert.equal(game.goal,TOTAL);assert.equal(game.exit.leader,game.bots[0]);
game.fireWait=300;stepFor(58);
assert.equal(game.mode,'lost');assert.equal(game.deathCause,'escape');

// Follow targets using just the flight controls on a full run. With an optional extracted
// red channel from terrain.png, also test against the actual map's heights.
const bytes=process.argv[2]?readFileSync(process.argv[2]):null;
function map(x,z){
  if(!bytes)return 0;
  const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz;
  const at=(x,z)=>bytes[((z&1023)<<10)+(x&1023)];
  const a=at(ix,iz)*(1-fx)+at(ix+1,iz)*fx;
  const b=at(ix,iz+1)*(1-fx)+at(ix+1,iz+1)*fx;
  return a*(1-fz)+b*fz;
}
function completeSortie(mission){
  reset(map,mission);
  let usedGun=false,shots=0,highestWave=0;
  for(let i=0;i<120*210 && game.mode==='live';i++){
    const keys=new Set();
    const b=game.bots.filter(b=>!b.claimed).sort((a,b)=>
      Math.abs(angleDiff(a.bearing,game.yaw))-Math.abs(angleDiff(b.bearing,game.yaw)))[0];
    if(b){
      const yaw=angleDiff(b.bearing,game.yaw),desiredPitch=b.elev;
      let pitch=desiredPitch;
      let ahead=0;
      for(const d of [25,45,68,92])ahead=Math.max(ahead,map(game.x+Math.sin(game.yaw)*d,game.z+Math.cos(game.yaw)*d));
      if(game.alt-ahead<18)pitch=Math.max(pitch,.47);
      if(Math.abs(yaw)>.018)keys.add(yaw>0?'KeyD':'KeyA');
      if(Math.abs(pitch-game.pitch)>.014)keys.add(pitch>game.pitch?'KeyW':'KeyS');
      const pos=project(b,game,v);
      if(game.lock===LOCK_SECONDS&&game.rockets && game.missile(v))shots++;
      else if((shots>0 || !game.rockets)&&Math.hypot(pos.x-v.cx,pos.y-v.cy)<v.r*.95){keys.add('KeyE');usedGun=true;}
    }
    if(game.threats.some(t=>!t.free) && game.flares)game.deployFlares();
    manageEnergy(game,keys);
    game.step(dt,keys,v);highestWave=Math.max(highestWave,game.wave);
  }
  assert.equal(game.mode,'won',mission+' '+game.kills+'/'+game.goal+' reason '+game.deathCause);
  assert.equal(game.kills,game.goal);assert.equal(highestWave,2);assert.ok(shots>0&&usedGun);
}
completeSortie('intercept');
completeSortie('dogfight');
reset();stepFor(150);assert.equal(game.mode,'lost');assert.equal(game.deathCause,'missile');
reset();assert.equal(game.kills,0);assert.equal(game.rockets,4);assert.equal(game.flares,6);
console.log(`Both sorties, flight physics, collisions, evasion, targeting, mirrored terrain calls and all ${WARNINGS.length} warnings in both languages passed.`);
