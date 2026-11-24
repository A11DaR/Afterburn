import {angleDiff,clamp,project,axesFor,anglesFor,pointOnRay,TAU} from './geometry.js';

// Retract the camera along its boom when a ridge crosses the line to the jet.
function clearBoom(plane,dx,dy,dz,length,heightAt){
  const clearance=Math.min(1.35,Math.max(0,plane.alt-heightAt(plane.x,plane.z)-.01));
  const clear=t=>plane.alt+dy*t>=heightAt(plane.x+dx*t,plane.z+dz*t)+clearance;
  const steps=Math.max(1,Math.ceil(length/1.25));
  for(let i=1;i<=steps;i++){
    if(clear(i/steps))continue;
    let near=(i-1)/steps,far=i/steps;
    for(let n=0;n<5;n++){
      const mid=(near+far)/2;
      if(clear(mid))near=mid;else far=mid;
    }
    return near;
  }
  return 1;
}

const chaseHistory=new WeakMap();
function followBank(plane,heading,pitch,full,stable,blend,rear,reduced){
  const arc=angleDiff(full,stable),target=stable+arc*blend;
  if(!Number.isFinite(plane.time))return target;
  let views=chaseHistory.get(plane);
  if(!views){views=[];chaseHistory.set(plane,views);}
  const index=Number(rear)+2*Number(reduced),last=views[index],dt=last?plane.time-last.time:Infinity;
  let bank=target;
  if(last&&dt>=0&&dt<.5){
    const forward=axesFor(heading,pitch).forward;
    const previous=anglesFor(forward,last.right,heading).bank;
    let change=angleDiff(target,previous);
    // Both ways around the roll circle describe the same aircraft attitude.
    // Follow the nearby camera solution when a roll crosses +180 / -180.
    for(const winding of [-1,1]){
      const alternative=angleDiff(target+winding*TAU*blend,previous);
      if(Math.abs(alternative)<Math.abs(change))change=alternative;
    }
    bank=previous+clamp(change,-dt*4,dt*4);
  }
  views[index]={time:plane.time,right:axesFor(heading,pitch,bank).right};
  return bank;
}

export function chaseView(plane,v,heightAt,reduced=false){
  const rear=Boolean(plane.rear),dir=rear?-1:1;
  const horizontal=Math.cos(plane.pitch);
  const turnLag=reduced?0:clamp((plane.yawRate??0)*.075+angleDiff(plane.yaw,plane.trackYaw??plane.yaw)*.15,-.095,.095)*horizontal;
  const heading=angleDiff(plane.yaw-turnLag+(rear?Math.PI:0),0),fullBank=dir*plane.bank;
  // The horizon is an unreliable roll reference straight up or down. Hand the
  // camera over to the wings before crossing either pole, including in rear view.
  let blend=clamp((.83-horizontal)/.41,0,1);blend=blend*blend*(3-2*blend);
  const stableBank=reduced?0:dir*.18*Math.sin(plane.bank);
  const cameraBank=followBank(plane,heading,dir*plane.pitch,fullBank,stableBank,blend,rear,reduced);
  const base=axesFor(heading,dir*plane.pitch,cameraBank);
  const lag=reduced?0:clamp(plane.pitch-(plane.pathPitch??plane.pitch),-.5,.5)*.13*horizontal;
  const tilt=.035+lag*dir*Math.cos(cameraBank),ct=Math.cos(tilt),st=Math.sin(tilt);
  const forward={x:base.forward.x*ct-base.up.x*st,y:base.forward.y*ct-base.up.y*st,z:base.forward.z*ct-base.up.z*st};
  const up={x:base.up.x*ct+base.forward.x*st,y:base.up.y*ct+base.forward.y*st,z:base.up.z*ct+base.forward.z*st};
  const attitude=anglesFor(forward,base.right,heading);
  const speed=plane.speed??398,extension=reduced?0:clamp((speed-398)/330,0,1);
  const boom=27+extension*3,anchorY=v.h*.758,drop=(anchorY-v.cy)/v.f;
  const dx=boom*(-forward.x+drop*up.x),dy=boom*(-forward.y+drop*up.y),dz=boom*(-forward.z+drop*up.z);
  const fraction=clearBoom(plane,dx,dy,dz,boom,heightAt);
  const camera={x:plane.x+dx*fraction,z:plane.z+dz*fraction,alt:plane.alt+dy*fraction,...attitude};
  const span=clamp(Math.min(v.w*.27,v.h*.49),Math.min(100,v.w*.33,v.h*.45),202)*(27/boom);
  return {camera,jet:{x:v.cx,y:anchorY,span,bank:angleDiff(plane.bank,dir*cameraBank),
    attitude:dir*tilt,slip:turnLag,rear}};
}

// The hit tests use the pilot's sight. Reproject that same sight at the current
// contact's depth so nearby targets and the gun pipper agree in the offset view.
export function chaseSight(plane,cam,v){
  const depthOf=target=>target?Math.max(.5,project(target,plane,v).depth):210;
  const at=(u,w,depth)=>project(pointOnRay(plane,u/v.f,w/v.f,depth),cam,v);
  const followed=plane.bots.find(b=>b.id===plane.lockId);
  const gunTarget=plane.inSight(v,true);
  const depth=depthOf(followed??gunTarget);
  const bore=at(0,0,depth),gun=at(0,0,depthOf(gunTarget??followed));
  const ring=at(plane.seekX*v.r,plane.seekY*v.r,depth),edge=at(v.r,0,depth);
  return {bore,gun,ring,r:clamp(Math.hypot(edge.x-bore.x,edge.y-bore.y),2,v.r*1.25)};
}
