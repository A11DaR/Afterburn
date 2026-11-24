import {clamp,relativeTo,recordTrail} from './geometry.js';
import {newOpponent} from './opponents.js';

export const LESSONS=['Пролети через ворота','Захвати учебную цель','Уйди от учебной ракеты'];

function ahead(p,yaw,distance){
  return {x:p.x+Math.sin(yaw)*distance,z:p.z+Math.cos(yaw)*distance};
}
function makeGate(p){
  const lesson=p.lesson,second=lesson.passed>0,yaw=p.yaw+(second?.16:.015),distance=second?215:190;
  const pos=ahead(p,yaw,distance);
  lesson.gate={...pos,yaw,alt:Math.max(p.heightAt(pos.x,pos.z)+45,p.alt+(second?8:0)),radius:(second?30:35)+Math.min(lesson.misses,3)*3,
    number:lesson.passed+1,total:2};
  lesson.depth=distance;lesson.legTime=0;
}
function makeDrone(p){
  const b=newOpponent(p,0),yaw=p.yaw+.066,pos=ahead(p,yaw,236);
  Object.assign(b,pos,{alt:Math.max(p.alt+6,p.heightAt(pos.x,pos.z)+45),heading:yaw,pitch:0,
    speed:36,runner:false,duelist:false,pilot:null,training:true,state:'training',attackWait:Infinity,decoys:0,reactAt:null});
  Object.assign(b,relativeTo(b,p));
  p.bots=[b];p.rockets=Math.max(p.rockets,2);p.resetLock();p.lesson.legTime=0;
}
export function beginLesson(p,stage=0,passed=0){
  p.lesson={stage,passed,misses:0,gate:null,cooldown:1.6,avoided:false,legTime:0};
  p.bots=[];p.exit=null;p.missiles=[];p.threats=[];p.between=0;p.fireWait=Infinity;
  p.alt=Math.max(145,p.alt,p.heightAt(p.x,p.z)+80);p.clearance=p.alt-p.heightAt(p.x,p.z);
  if(stage===0)makeGate(p);
  if(stage===1)makeDrone(p);
}
export function moveDrone(p,dt){
  const b=p.bots[0];if(!b)return;
  b.x+=Math.sin(b.heading)*b.speed*dt;b.z+=Math.cos(b.heading)*b.speed*dt;
  const aheadHeight=p.heightAt(b.x+Math.sin(b.heading)*45,b.z+Math.cos(b.heading)*45);
  b.alt+=clamp(Math.max(p.heightAt(b.x,b.z)+42,aheadHeight+40)-b.alt,0,16)*dt;
  Object.assign(b,relativeTo(b,p));b.occluded=p.terrainBetween(p,b);recordTrail(b,dt,.07,22);
}
export function advanceLesson(p,dt){
  const l=p.lesson;l.legTime+=dt;
  if(l.stage===0){
    const g=l.gate,dx=g.x-p.x,dz=g.z-p.z,s=Math.sin(g.yaw),c=Math.cos(g.yaw);
    const depth=dx*s+dz*c;
    if(depth<=0 && l.depth>0){
      if(Math.hypot(dx*c-dz*s,g.alt-p.alt)<=g.radius){
        l.passed++;l.misses=0;
        if(l.passed===2){l.stage=1;l.gate=null;makeDrone(p);p.emit('lessonStep');return;}
        makeGate(p);p.emit('gate');return;
      }
      l.misses++;makeGate(p);p.emit('info','Мимо ворот. Ещё попытка — поверни к метке.');return;
    }
    l.depth=depth;
    if(l.legTime>20 && (Math.hypot(dx,dz)>320||depth<0)){makeGate(p);p.emit('info','Ворота снова впереди.');}
  }else if(l.stage===1){
    if(!p.bots.length){
      l.stage=2;l.legTime=0;l.cooldown=2.2;p.between=0;p.flares=3;p.emit('lessonStep');return;
    }
    if(!p.missiles.length){
      if(!p.rockets)p.rockets=2;
      const b=p.bots[0];
      if(b.range<64||b.range>480||(l.legTime>11 && (b.occluded||Math.cos(b.bearing-p.yaw)<.2))){
        makeDrone(p);p.emit('info','Учебная цель снова впереди.');}
    }
  }else{
    if(l.avoided){p.finish(true);return;}
    if(!p.threats.some(t=>!t.free)){
      l.cooldown-=dt;
      if(l.cooldown<=0){
        l.cooldown=2;p.hull=100;p.flares=Math.max(2,p.flares);
        // Tag before launch so an already-active flare also counts.
        const source={...ahead(p,p.yaw+Math.PI-.17,240),alt:p.alt+13,id:-1,training:true};
        p.launchThreat(source);
      }
    }
    p.incoming(dt);
  }
}

