import {manageEnergy} from './sortie-pilot.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Flight,LOCK_SECONDS,angleDiff,project,relativeTo,viewFor} from '../dist/flight.js';
import {pointFromScreen} from '../dist/pilot-assist.js';
import {bindPointControls} from '../dist/pilot-input.js';
import {beginLesson} from '../dist/flight-school.js';
import {chaseView} from '../dist/chase-camera.js';

const v=viewFor(896,430),dt=1/120,idle=new Set();
const heights=process.argv[2]?readFileSync(process.argv[2]):null;
function terrain(x,z){
  if(!heights)return 0;
  const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz;
  const at=(i,j)=>heights[((iz+j&1023)<<10)+(ix+i&1023)];
  return (at(0,0)*(1-fx)+at(1,0)*fx)*(1-fz)+(at(0,1)*(1-fx)+at(1,1)*fx)*fz;
}
function fly(g,seconds,keys=idle){
  for(let i=0;i<Math.round(seconds/dt);i++)g.step(dt,keys,v);
}
const g=new Flight(()=>{},()=>.29);
assert.equal(g.profile,'arcade');assert.ok(!g.setProfile('other'));
g.start('intercept');const leader=g.exit.leader;
assert.ok(!g.inSight(v,true));fly(g,.4,new Set(['KeyE']));assert.equal(leader.hp,100);
assert.equal(g.setProfile('classic'),false);
g.pause();assert.ok(g.setProfile('classic'));g.briefing();assert.ok(g.setProfile('arcade'));
g.startTraining();const startBank=g.bank;
fly(g,.10,new Set(['KeyD','KeyW']));
assert.ok(g.bank>startBank && g.bank<.15);
fly(g,1.5,new Set(['KeyD','KeyW']));assert.ok(g.highAoa&&g.speed<370);
fly(g,7);assert.ok(Math.abs(g.pathPitch)<.035&&Math.abs(g.bank)<.025&&g.speed>395);

g.startTraining();g.speed=g.throttle=740;
fly(g,2,new Set(['ShiftLeft','KeyW']));assert.ok(g.peakG>8&&g.peakG<9.4&&!g.wingLoss);
g.startTraining();g.pointerAim={yaw:.32,pitch:.13,edge:0};
fly(g,3);assert.ok(Math.abs(g.yaw-.32)<.018&&Math.abs(g.pitch-.13)<.022);
g.pointerAim.edge=1;fly(g,1.5);assert.ok(angleDiff(g.yaw,.32)>.4);
g.pause();assert.equal(g.pointerAim,null);g.resume();assert.equal(g.mouseGun,false);
g.pointerAim={yaw:-1.2,pitch:0,edge:0};fly(g,.1,new Set(['KeyW']));assert.equal(g.pointerAim,null);
g.startTraining();g.touchStick={x:-.6,y:.36};fly(g,.8);assert.ok(g.bank<-.42&&g.pathPitch>.065);
g.releasePilot();fly(g,3);assert.ok(Math.abs(g.bank)<.015&&Math.abs(g.pathPitch)<.03);

// DOM input contract: independent mouse buttons, a single captured steering
// finger, a second finger free for other controls, and no synthetic touch shot.
{
  const world=new EventTarget(),captured=new Set();
  globalThis.window=new EventTarget();
  Object.assign(world,{focus(){},setPointerCapture:id=>captured.add(id),hasPointerCapture:id=>captured.has(id),
    releasePointerCapture:id=>captured.delete(id),getBoundingClientRect:()=>({left:0,top:0,width:v.w,height:v.h})});
  const stick={hidden:true,style:{setProperty(){}}},p=new Flight();p.startTraining();beginLesson(p,1);
  const clear=bindPointControls(world,p,()=>({v,camera:p}),stick);
  function input(node,type,patch={}){
    const e=Object.assign(new Event(type,{cancelable:true}),{pointerType:'mouse',pointerId:1,button:0,buttons:0,clientX:v.cx,clientY:v.cy},patch);
    node.dispatchEvent(e);
  }
  fly(p,2);assert.equal(p.lock,LOCK_SECONDS);
  input(world,'pointerdown');input(world,'mousedown',{buttons:1});
  assert.ok(p.mouseGun);const rounds=p.rounds;
  input(world,'mousedown',{button:2,buttons:3});assert.equal(p.launches,1);
  input(window,'mouseup',{button:2,buttons:1});fly(p,.2);
  assert.ok(p.mouseGun&&p.rounds<rounds);
  input(window,'mouseup',{button:0,buttons:2});assert.ok(!p.mouseGun);
  const a={pointerId:11,pointerType:'touch',clientX:90,clientY:200,buttons:1};
  input(world,'pointerdown',a);input(world,'pointermove',{...a,clientX:132,clientY:180});
  assert.ok(!stick.hidden&&p.touchStick.x>.75&&p.touchStick.y>.3&&captured.has(11));
  input(world,'pointerdown',{...a,pointerId:12,clientX:v.w-12});
  input(window,'pointerup',{...a,pointerId:12});assert.ok(p.touchStick.x>.75);
  input(window,'pointerup',a);const count=p.rounds;
  input(world,'mousedown');assert.ok(stick.hidden&&p.touchStick===null&&p.rounds===count);
  input(world,'pointermove',{clientX:v.w*.7});assert.ok(p.pointerAim?.yaw>0);
  clear();assert.equal(p.pointerAim,null);delete globalThis.window;
}

function point(g,target,chase=false){
  const cam=chase?chaseView(g,v,terrain).camera:g;
  const pos=project(target,cam,v);
  return pointFromScreen(g,cam,v,pos.x,pos.y);
}
// Both view transforms return the identical requested bearing at the target's depth.
g.startTraining();
for(const bank of [-.8,.7]){
  Object.assign(g,{bank,pitch:.15,pathPitch:.1,yaw:.24,trackYaw:.20});
  const target=g.lesson.gate;
  for(const chase of [false,true]){
    const cmd=point(g,target,chase),rel=relativeTo(target,g);
    assert.ok(Math.abs(angleDiff(cmd.yaw,rel.bearing))<.00001&&Math.abs(cmd.pitch-rel.elev)<.00001);
  }
}
// Exercises only advance on an actual crossing, a locked missile hit and a real evade.
for(const defense of ['flare','roll']){
  const events=[];
  const p=new Flight((t,d)=>events.push([t,d]),()=>.29);p.heightAt=terrain;p.selectMission('dogfight');p.startTraining();
  fly(p,5);assert.equal(p.lesson.passed,1);
  fly(p,5.25);assert.equal(p.lesson.passed,1);assert.ok(events.some(e=>String(e[1]).includes('Мимо')));
  p.pause();p.repeatLesson();assert.equal(p.lesson.passed,1);assert.equal(p.mode,'live');
  for(let i=0;i<2400&&p.lesson.stage===0;i++){
    p.pointerAim=point(p,p.lesson.gate,true);p.step(dt,idle,v);
  }
  assert.equal(p.lesson.stage,1);
  p.alt=terrain(p.x,p.z)+1;fly(p,dt);assert.equal(p.lesson.stage,1);assert.ok(p.hull===100&&p.clearance>40);
  assert.ok(!p.missile(v));let acquiredAt=null,launchAt=null;
  for(let i=0;i<2000&&p.lesson.stage===1;i++){
    const b=p.bots[0];
    p.pointerAim=point(p,b);
    if(p.lockId!==null && acquiredAt===null)acquiredAt=p.time;
    if(p.lock>=LOCK_SECONDS && !launchAt){launchAt=p.time;assert.ok(p.missile(v));}
    p.step(dt,new Set(['KeyE']),v);
  }
  assert.ok(launchAt-acquiredAt>=LOCK_SECONDS-2*dt);
  assert.equal(p.lesson.stage,2);assert.equal(p.missileHits,1);
  // Let the first threat through. It must give another try without damaging the hull.
  fly(p,7);assert.equal(p.lesson.stage,2);assert.equal(p.mode,'live');assert.equal(p.hull,100);
  let usedDefense=false;
  for(let i=0;i<2200&&p.mode==='live';i++){
    const t=p.threats.find(t=>!t.free);
    if(t && t.ttl<1.6 && !usedDefense)usedDefense=defense==='flare'?p.deployFlares():p.startRoll();
    p.step(dt,idle,v);
  }
  assert.ok(usedDefense);assert.equal(p.mode,'won');assert.equal(p.lesson.avoided,true);
  p.start();assert.equal(p.lesson,null);assert.equal(p.missionId,'dogfight');assert.equal(p.kills,0);
}

function flyMission(id,seed){
  const p=new Flight(()=>{},()=>seed);p.heightAt=terrain;p.start(id);let fired=false;
  const pilots=new Set();
  for(let i=0;i<120*260 && p.mode==='live';i++){
    const keys=new Set();
    const targets=p.bots.filter(b=>!b.claimed).sort((a,b)=>Math.abs(angleDiff(a.bearing,p.yaw))-Math.abs(angleDiff(b.bearing,p.yaw)));
    const target=(p.exit?.leader&&!p.exit.leader.claimed?p.exit.leader:null)??targets[0];
    if(p.bots[0]?.pilot)pilots.add(p.bots[0].pilot.name);
    if(target){
      const relative=relativeTo(target,p),yaw=angleDiff(relative.bearing,p.yaw),pos=project(target,p,v);
      let ground=0;
      for(const d of [22,45,65,95])ground=Math.max(ground,terrain(p.x+Math.sin(p.trackYaw)*d,p.z+Math.cos(p.trackYaw)*d));
      if(p.alt-ground<18){keys.add('KeyW');if(Math.abs(yaw)>.35)keys.add(yaw<0?'KeyA':'KeyD');}
      else if(pos.visible&&pos.x>=0&&pos.x<=v.w&&pos.y>=0&&pos.y<=v.h){
        p.pointerAim=point(p,target);p.pointerAim.edge=0;
      }else{if(Math.abs(yaw)>.03)keys.add(yaw<0?'KeyA':'KeyD');if(Math.abs(relative.elev-p.pitch)>.05)keys.add(relative.elev>p.pitch?'KeyW':'KeyS');}
      if(p.lock===LOCK_SECONDS&&p.rockets&&!target.claimed)fired=p.missile(v)||fired;
      if(p.inSight(v,true)&&(fired||!p.rockets))keys.add('KeyE');
    }else p.pointerAim=null;
    if(p.threats.some(t=>!t.free)&&p.flares)p.deployFlares();
    manageEnergy(p,keys);
    p.step(dt,keys,v);
  }
  assert.equal(p.mode,'won',id+' '+p.kills+'/'+p.goal+' '+p.deathCause+' at '+p.time.toFixed(1));
  assert.ok(fired&&p.kills===p.goal);
  if(id==='dogfight')assert.deepEqual([...pilots],['Искра','Стриж','Тень']);
  return id+' '+p.kills+'/'+p.goal+' in '+p.time.toFixed(1)+' s';
}
console.log('Arcade flight, both camera pointers, training retries, continuous lock, flare and roll graduations passed.');
console.log(flyMission('intercept',.29),flyMission('dogfight',.29));

