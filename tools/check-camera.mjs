import assert from 'node:assert/strict';
import {Flight,LOCK_SECONDS,angleDiff,project,viewFor} from '../dist/flight.js';
import {chaseView,chaseSight} from '../dist/chase-camera.js';

const close=(a,b,tolerance=.00001)=>assert.ok(Math.abs(a-b)<tolerance,`${a} differs from ${b}`);
const flat=()=>0;
const plane={x:35,z:60,alt:95,yaw:3.1,trackYaw:3.04,speed:620,yawRate:.37};
for(const [w,h] of [[900,420],[320,485],[740,170]]){
  const v=viewFor(w,h);
  for(const pitch of [-1.23,0,1.24]){
    for(const bank of [-2.7,0,.95,2.7]){
      for(const rear of [true,false]){
        const p={...plane,pitch,bank,rear,pathPitch:pitch-.12};
        const {camera,jet}=chaseView(p,v,flat);
        const marker=project(p,camera,v);
        assert.ok(marker.visible && camera.alt>0 && jet.span<v.w*.34);
        close(marker.x,jet.x);close(marker.y,jet.y);
        assert.ok(jet.y>v.cy+v.r*1.45);
        assert.ok(Math.cos(angleDiff(camera.yaw,p.yaw))*(rear?-1:1)>.98);
        close(Math.sin(jet.bank+(rear?-1:1)*camera.bank),Math.sin(bank));
        assert.equal(chaseView(p,v,flat,true).camera.bank,0);
      }
    }
  }
}

const v=viewFor(896,430),g=new Flight(()=>{},()=>.29);
g.setProfile('classic');
g.start('intercept');
for(let i=0;i<196;i++)g.step(1/120,new Set(),v);
assert.equal(g.lock,LOCK_SECONDS);
const lockId=g.lockId,rocketCount=g.rockets;
const camera=chaseView(g,v,flat).camera;
chaseSight(g,camera,v);
assert.equal(g.lockId,lockId);assert.ok(g.missile(v));assert.equal(g.rockets,rocketCount-1);
g.start('dogfight');
Object.assign(g,{yaw:2.85,trackYaw:2.7,yawRate:.42,pitch:.32,pathPitch:.2,bank:.85,alt:70});
for(const depth of [22,90,390]){
  const u=.55*v.r,w=-.35*v.r,cb=Math.cos(g.bank),sb=Math.sin(g.bank);
  const right=(u*cb-w*sb)*depth/v.f,sn=Math.sin(g.yaw),cs=Math.cos(g.yaw);
  const b=g.bots[0];
  Object.assign(b,{x:g.x+sn*depth+cs*right,z:g.z+cs*depth-sn*right,
    alt:g.alt+depth*(Math.tan(g.pitch)-(u*sb+w*cb)/v.f),range:depth});
  g.seekX=u/v.r;g.seekY=w/v.r;g.lockId=b.id;
  const cam=chaseView(g,v,flat).camera,sight=chaseSight(g,cam,v);
  const expected=project(b,cam,v);
  close(sight.ring.x,expected.x);close(sight.ring.y,expected.y);
  const straight={x:g.x+sn*depth,z:g.z+cs*depth,alt:g.alt+Math.tan(g.pitch)*depth};
  const gun=project(straight,cam,v);
  close(sight.gun.x,gun.x);close(sight.gun.y,gun.y);
}

const low={...plane,x:0,z:0,alt:8,yaw:0,pitch:0,bank:0,trackYaw:0,pathPitch:0,yawRate:0};
for(const rear of [false,true]){
  const p={...low,rear};
  const ridge=(_x,z)=>Math.abs(z)>9&&Math.abs(z)<13?32:0;
  const open=chaseView(p,v,flat),blocked=chaseView(p,v,ridge);
  assert.ok(Math.abs(open.camera.z)>20 && Math.abs(blocked.camera.z)<=9);
  assert.ok(blocked.camera.alt>ridge(blocked.camera.x,blocked.camera.z));
  close(project(p,blocked.camera,v).y,blocked.jet.y);
}
console.log('Chase and look-back framing, terrain obstruction, bank and banked sight parallax passed.');
