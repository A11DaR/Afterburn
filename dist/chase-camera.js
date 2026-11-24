import {angleDiff,clamp,project} from './geometry.js';

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

export function chaseView(plane,v,heightAt,reduced=false){
  const rear=Boolean(plane.rear),dir=rear?-1:1;
  const turnLag=reduced?0:clamp((plane.yawRate??0)*.075+angleDiff(plane.yaw,plane.trackYaw??plane.yaw)*.15,-.095,.095);
  const yaw=angleDiff(plane.yaw-turnLag+(rear?Math.PI:0),0);
  const slope=Math.tan(plane.pitch),pathSlope=Math.tan(plane.pathPitch??plane.pitch);
  const incline=dir*(slope-(reduced?0:clamp(slope-pathSlope,-.5,.5)*.16))-.035;
  const pitch=Math.atan(incline),bank=reduced?0:dir*.18*Math.sin(plane.bank);
  const speed=plane.speed??398,extension=reduced?0:clamp((speed-398)/330,0,1);
  const boom=27+extension*3,forward=boom*Math.cos(pitch);
  const anchorY=v.h*.758,drop=(anchorY-v.cy)/v.f;
  const lateral=-Math.sin(bank)*drop,vertical=Math.cos(bank)*drop;
  const sn=Math.sin(yaw),cs=Math.cos(yaw);
  const dx=-forward*(sn+lateral*cs),dz=-forward*(cs-lateral*sn),dy=forward*(vertical-incline);
  const fraction=clearBoom(plane,dx,dy,dz,boom,heightAt);
  const camera={x:plane.x+dx*fraction,z:plane.z+dz*fraction,alt:plane.alt+dy*fraction,yaw,pitch,bank};
  const span=clamp(Math.min(v.w*.27,v.h*.49),Math.min(100,v.w*.33,v.h*.45),202)*(27/boom);
  return {camera,jet:{x:v.cx,y:anchorY,span,bank:angleDiff(plane.bank,dir*bank),
    attitude:plane.pitch-dir*pitch,slip:turnLag,rear}};
}

// The hit tests use the pilot's sight. Reproject that same sight at the current
// contact's depth so nearby targets and the gun pipper agree in the offset view.
export function chaseSight(plane,cam,v){
  const sn=Math.sin(plane.yaw),cs=Math.cos(plane.yaw);
  const cb=Math.cos(plane.bank),sb=Math.sin(plane.bank),slope=Math.tan(plane.pitch);
  const depthOf=target=>target?Math.max(.5,(target.x-plane.x)*sn+(target.z-plane.z)*cs):210;
  const at=(u,w,depth)=>{
    const right=(u*cb-w*sb)*depth/v.f,up=(u*sb+w*cb)/v.f;
    return project({x:plane.x+sn*depth+cs*right,z:plane.z+cs*depth-sn*right,
      alt:plane.alt+(slope-up)*depth},cam,v);
  };
  const followed=plane.bots.find(b=>b.id===plane.lockId);
  const gunTarget=plane.inSight(v,true);
  const depth=depthOf(followed??gunTarget);
  const bore=at(0,0,depth),gun=at(0,0,depthOf(gunTarget??followed));
  const ring=at(plane.seekX*v.r,plane.seekY*v.r,depth),edge=at(v.r,0,depth);
  return {bore,gun,ring,r:clamp(Math.hypot(edge.x-bore.x,edge.y-bore.y),2,v.r*1.25)};
}
