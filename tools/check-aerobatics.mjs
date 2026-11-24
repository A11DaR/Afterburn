import assert from 'node:assert/strict';
import {Flight,viewFor,cameraFor,angleDiff} from '../dist/flight.js';
import {cameraAxes,direction,dot,pointOnRay,project,TAU} from '../dist/geometry.js';
import {chaseView} from '../dist/chase-camera.js';
import {terrainBounds,traceTerrain} from '../dist/steep-terrain.js';

const view=viewFor(896,430),flat=()=>0;
function aircraft(profile){
  const p=new Flight(()=>{},()=>.3);p.setProfile(profile);p.start('dogfight');
  p.alt=600;p.fireWait=Infinity;return p;
}
function fly(p,seconds,keys,hz=120){
  for(let i=0;i<Math.round(seconds*hz);i++)p.step(1/hz,keys,view);
}
function loop(profile,key,hz){
  const p=aircraft(profile),power=new Set(['ShiftLeft']),stick=new Set(['ShiftLeft',key]);
  fly(p,1.5,power,hz);
  let previous=p.pathPitch,travel=0,maxClimb=0,maxDive=0,inverted=false;
  const lastFrames=[];
  for(let i=0;i<hz*19;i++){
    p.step(1/hz,stick,view);
    assert.equal(p.mode,'live');assert.equal(p.wingLoss,null);
    const forward=direction(p.trackYaw,p.pathPitch),phase=Math.atan2(forward.y,forward.z);
    travel+=angleDiff(phase,previous);previous=phase;
    maxClimb=Math.max(maxClimb,forward.y);maxDive=Math.min(maxDive,forward.y);
    if(forward.z<-.92&&cameraAxes(p).up.y<-.8)inverted=true;
    for(const rear of [false,true]){
      p.rear=rear;
      const cameras=[cameraFor(p),chaseView(p,view,flat).camera,chaseView(p,view,flat,true).camera];
      for(const [j,cam] of cameras.entries()){
        const index=j+3*Number(rear),frame=cameraAxes(cam),prev=lastFrames[index];
        if(prev){
          assert.ok(dot(frame.forward,prev.forward)>.97,'forward jumped at vertical');
          assert.ok(dot(frame.up,prev.up)>.95,'camera inverted in one frame');
        }
        lastFrames[index]=frame;
      }
    }
    p.rear=false;
    if(Math.abs(travel)>=TAU){
      assert.ok(inverted&&maxClimb>.995&&maxDive<-.995);
      assert.equal(Math.sign(travel),key==='KeyW'?1:-1);return (i+1)/hz;
    }
  }
  assert.fail(profile+' '+key+' never completed the loop');
}
for(const profile of ['arcade','classic']){
  for(const key of ['KeyW','KeyS']){
    const fine=loop(profile,key,120),coarse=loop(profile,key,30);
    assert.ok(Math.abs(fine-coarse)<.35);
    console.log(profile,key,'360° in',fine.toFixed(2),'s');
  }
  const p=aircraft(profile);p.speed=p.throttle=235;
  const initial=p.alt,pull=new Set(['KeyW','ShiftLeft']);let peak=initial,stalled=false;
  for(let i=0;i<840;i++){p.step(1/120,pull,view);peak=Math.max(peak,p.alt);stalled||=p.stalled;}
  assert.ok(stalled&&peak>initial&&p.alt<initial-10&&p.pathPitch<-.30);
  const slow=p.speed;fly(p,2.6,new Set(['ShiftLeft']));
  assert.ok(!p.stalled&&p.speed>slow+70);
  for(const [key,sign] of [['ArrowLeft',-1],['ArrowRight',1]]){
    const roll=aircraft(profile),keys=new Set([key]);
    let angle=0,last=roll.baseBank;
    for(let i=0;i<600;i++){roll.step(1/120,keys,view);angle+=angleDiff(roll.baseBank,last);last=roll.baseBank;}
    assert.ok(angle*sign>TAU*2);
    const half=aircraft(profile);
    while(Math.abs(half.baseBank)<2.89 && half.time<2)half.step(1/120,keys,view);
    fly(half,.8,new Set());assert.ok(Math.cos(half.bank)<-.91);
    const bank=half.bank;fly(half,.7,new Set());assert.ok(Math.abs(angleDiff(half.bank,bank))<.1);
  }
}
const repeat=aircraft('arcade');let rolls=0;repeat.emit=type=>{if(type==='roll')rolls++;};
fly(repeat,2.5,new Set(['KeyQ']));assert.ok(rolls>=3);

// Exact zenith and nadir are ordinary view directions, including behind the pilot.
for(const pitch of [Math.PI/2,-Math.PI/2])for(const bank of [-2.2,0,2.6]){
  const cam={x:10,alt:70,z:15,yaw:.7,pitch,bank};
  const pixel=project(pointOnRay(cam,.18,-.24,95),cam,view);
  assert.ok(pixel.visible&&Math.abs(pixel.x-view.cx-.18*view.f)<1e-7&&Math.abs(pixel.y-view.cy+.24*view.f)<1e-7);
  assert.equal(project(pointOnRay(cam,0,0,-50),cam,view).visible,false);
}
// Combine a sustained manual roll with a steep chase-camera pitch. No wrap discontinuity.
const camPlane={...aircraft('arcade'),pitch:.82,pathPitch:.82,trackYaw:.1,yaw:.1,bank:0};
let lastUp;
for(let i=0;i<600;i++){
  camPlane.time=i/60;camPlane.bank=angleDiff(i*.045,0);
  const up=cameraAxes(chaseView(camPlane,view,flat).camera).up;
  if(lastUp)assert.ok(dot(up,lastUp)>.99);lastUp=up;
}
const heights=new Uint8Array(1024**2),surface={heightAt:flat,bounds:terrainBounds(heights)};
assert.equal(traceTerrain(surface,{x:0,z:0,alt:120},0,-1,0),120);
assert.equal(traceTerrain(surface,{x:0,z:0,alt:120},0,1,0),Infinity);
for(let z=0;z<1024;z++)for(let x=16;x<=47;x++)heights[z*1024+x]=80;
surface.bounds=terrainBounds(heights);surface.heightAt=(x,z)=>heights[((Math.floor(z)&1023)<<10)+(Math.floor(x)&1023)];
assert.ok(Math.abs(traceTerrain(surface,{x:20,z:10,alt:190},0,-1,0)-110)<.5);
assert.ok(traceTerrain(surface,{x:0,z:10,alt:60},1,0,0)<17);
console.log('Energy loss, stall recovery, manual and assisted rolls, both poles, chase cameras and terrain rays passed.');
