import {angleDiff,approach,clamp,project,relativeTo,pointOnRay,cameraAxes,dot,direction} from './geometry.js';

// Invert the current view, including bank and external-camera parallax. A contact
// supplies depth only. Neither its position nor its motion steers the aircraft.
export function pointFromScreen(p,cam,v,x,y){
  const u=x-v.cx,w=y-v.cy;
  let depth=240,closest=v.r*1.8;
  const points=p.lesson?.gate?[p.lesson.gate,...p.bots]:p.bots;
  for(const point of points){
    if(point.occluded)continue;
    const pos=project(point,cam,v),offset=Math.hypot(pos.x-x,pos.y-y);
    if(pos.visible && offset<closest){
      depth=Math.max(15,pos.depth);closest=offset;
    }
  }
  const aim=relativeTo(pointOnRay(cam,u/v.f,w/v.f,depth),p);
  return {yaw:aim.bearing,pitch:aim.elev,range:aim.range,
    edge:Math.sign(u)*clamp((Math.abs(u)/(v.w*.5)-.76)/.18,0,1)};
}

export function arcadeAxes(p,dt,side,pull){
  const stick=p.touchStick;
  const rawSide=side || stick?.x || 0,rawPull=pull || stick?.y || 0;
  const point=p.pointerAim;
  let turn=rawSide,elevator=rawPull*.80;
  if(point){
    point.yaw=angleDiff(point.yaw+point.edge*.9*dt,0);
    // The nose moves before the velocity vector in a bank. Feed both back so
    // fine adjustments settle without oscillating about the pilot's direction.
    turn=clamp(2.35*angleDiff(point.yaw,p.trackYaw)+1.15*angleDiff(point.yaw,p.yaw)-.42*p.yawRate,-1,1);
    elevator=clamp((point.pitch-p.pathPitch)*1.8+(point.pitch-p.pitch)*1.35,-.95,.95);
    if(Math.cos(p.baseBank)<0||Math.cos(p.pitch)<.6){
      const ray=direction(point.yaw,point.pitch),axes=cameraAxes(p);
      turn=clamp(dot(ray,axes.right)*3,-1,1);
      elevator=clamp(dot(ray,axes.up)*3,-1,1);
    }
  }else if(!rawPull){
    elevator=p.stalled||p.speed<245?0:clamp(-p.pathPitch*2.6*Math.cos(p.baseBank),-.84,.84);
  }
  p.assistSide=approach(p.assistSide,turn,turn?4.8:12,dt);
  p.assistPull=approach(p.assistPull,elevator,elevator?5.6:12,dt);
  return {side:Math.abs(p.assistSide)<.002?0:p.assistSide,vertical:p.assistPull};
}

