import {TAU,clamp,approach,angleDiff,axesFor,anglesFor,cross,unit} from './geometry.js';

// Forces use game knots per second. Flight integrates map position at nine knots per unit/s.
const GRAVITY=55, RAD=Math.PI/180, LIFT_SLOPE=.30, INCIDENCE=3.4;
export const WING_LIMIT=10;

export function nextVisionShade(previous,gLoad,dt){
  const target=clamp((gLoad-6)/4,0,1);
  const shade=approach(previous,target,target>previous?4.8:2.2,dt);
  return target===0&&shade<.001?0:shade;
}

function rollControls(p,dt,side,aileron,control){
  let rollPull=0,delta=0;
  if(aileron){p.freeBank=true;p.roll=null;}
  p.aileronRate=approach(p.aileronRate,aileron*3.15*control,aileron?5.4:11,dt);
  delta+=p.aileronRate*dt;
  if(p.roll){
    const start=p.roll.t,end=Math.min(1,start+dt*control/1.06);
    const curve=t=>t*t*(3-2*t);
    delta+=p.roll.side*TAU*(curve(end)-curve(start));
    rollPull=3.8*Math.sin(Math.PI*end);p.roll.t=end;
    if(end>=1)p.roll=null;
  }else{
    if(Math.abs(side)>.1&&!aileron)p.freeBank=false;
    if(p.freeBank&&!aileron&&Math.abs(p.aileronRate)<.03&&Math.abs(p.baseBank)<.04)p.freeBank=false;
    if(!p.freeBank){
      // Near the poles there is no horizon reference. Carry the wing around the loop.
      const levelWeight=clamp((Math.cos(p.pathPitch)-.12)/.55,0,1);
      const inverted=Math.cos(p.baseBank)<0;
      const bankLimit=p.profile==='arcade'?clamp((p.speed-110)/230,.65,1.33):1.33;
      const target=(inverted?Math.PI:0)+(inverted?-1:1)*side*bankLimit*control;
      delta+=angleDiff(target,p.baseBank)*(1-Math.exp(-(side?3.4:5.5)*dt))*levelWeight;
    }
  }
  return {bank:p.baseBank+delta,rollPull};
}

function engineThrust(p,dt){
  if(!p.enginePowered){p.throttle=0;p.thrust=0;return 0;}
  p.throttle=clamp(p.throttle+((p.boost?125:0)-(p.braking?195:0))*dt,210,756);
  if(p.profile==='arcade'&&!p.boost&&!p.braking&&!p.stalled&&Math.abs(p.pathPitch)<.34){
    const cruise=clamp(410+(410-p.speed)*2.8,268,680);
    p.throttle=approach(p.throttle,cruise,.86,dt);
  }
  const powered=17.65*(p.throttle/400)**2+(p.boost?90*clamp((801-p.speed)/125,0,1):0);
  p.thrust=approach(p.thrust,p.engineFire?powered*.48:powered,p.boost?4.8:3.1,dt);
  return p.thrust*(1-.74*p.separation)*Math.cos((p.aoa-INCIDENCE)*RAD);
}

export function advanceAirframe(p,dt,side,elevator,aileron=0){
  const density=clamp(1-p.alt*.00019,.82,1),q=density*(p.speed/400)**2;
  const control=clamp((p.speed-42)/225,.11,1)*(1-.42*p.separation);
  const {bank,rollPull}=rollControls(p,dt,side,aileron,control);
  const {forward,right,up}=axesFor(p.trackYaw,p.pathPitch,bank);
  const cb=p.roll?Math.cos(p.roll.entryBank):Math.cos(bank);
  const trimG=Math.cos(p.pathPitch)*(p.freeBank?cb:Math.sign(cb)/Math.max(.24,Math.abs(cb)));
  const trimLimit=Math.abs(elevator)<.15&&p.speed<275?8:17;
  const trim=clamp(trimG/(LIFT_SLOPE*Math.max(.05,q)),-trimLimit,trimLimit);
  // Elevator effectiveness rises with airspeed, while gearing softens a full-stick input.
  const gearing=q>1&&p.profile==='classic' ? .62 : .34;
  const input=elevator*(elevator>=0?18.4:15.4)/Math.pow(Math.max(.22,q),gearing);
  let targetAlpha=clamp(trim+input+rollPull,-34,38);
  if(p.profile==='arcade'){
    if(p.pointerAim)targetAlpha=clamp(targetAlpha,-19,20);
    const requested=targetAlpha*q*LIFT_SLOPE;
    if(requested>7.5){
      targetAlpha=(7.5+1.6*(1-Math.exp(-(requested-7.5)/1.6)))/(q*LIFT_SLOPE);
    }
  }
  p.aoa=approach(p.aoa,targetAlpha,elevator?3.7:5.4,dt);
  const angle=Math.abs(p.aoa);
  const split=clamp((angle-18)/10,0,1);
  p.separation=approach(p.separation,split*split*(3-2*split),split>p.separation?2.6:3.7,dt);
  p.stalled=angle>(p.stalled?17.2:22.4)||p.separation>(p.stalled ? .28 : .65);
  p.highAoa=angle>(p.highAoa?15.8:18.2);
  const attached=Math.min(angle,18)+Math.min(4,Math.max(0,angle-18))*.18;
  const lift=Math.sign(p.aoa)*(attached*(1-p.separation)+2.1*p.separation);
  p.gLoad=q*LIFT_SLOPE*lift;
  p.visionShade=nextVisionShade(p.visionShade,p.gLoad,dt);
  const load=Math.abs(p.gLoad);
  p.peakG=Math.max(p.peakG,load);p.highG=load>(p.highG?7.7:8.5);
  p.wingStress=clamp(p.wingStress+dt*(load>WING_LIMIT ? .32+.84*(load-WING_LIMIT) : -.53),0,1);
  const lowFlap=clamp((345-p.speed)/115,0,1),turnFlap=clamp((p.aoa-8)/15,0,1)*.64;
  const flapTarget=34*Math.max(lowFlap,turnFlap,p.braking ? .90 : 0)*clamp((560-p.speed)/125,0,1);
  p.flapAngle+=clamp(flapTarget-p.flapAngle,-34*dt,24*dt);

  const rudder=p.roll?0:side*control;
  const sideForce=rudder*(.85+Math.max(0,2-p.gLoad)*Math.abs(Math.sin(bank)));
  p.slip=approach(p.slip,rudder*clamp((2.9-p.gLoad)*.057,0,.23),6,dt);
  // A/D is the coordinated-turn control. Its yaw assistance fades approaching vertical.
  const horizontal=Math.cos(p.pathPitch),sideX=Math.cos(p.trackYaw)*horizontal,sideZ=-Math.sin(p.trackYaw)*horizontal;
  const speedDrag=.0045*Math.max(0,p.speed-720)**2;
  const drag=speedDrag+q*(16+.139*p.aoa**2+92*p.separation+7*Math.abs(p.slip))+(p.braking?54*Math.min(1,p.speed/240)+58*q:0);
  const thrust=engineThrust(p,dt),axial=Math.max(0,p.speed+(thrust-drag)*dt);
  // Resolve lift in the wing plane, and gravity straight down in world space.
  // Integrating momentum lets a vertical climb run out of speed and fall back.
  const liftStep=GRAVITY*p.gLoad*dt,sideStep=GRAVITY*sideForce*dt;
  const velocity={x:forward.x*axial+up.x*liftStep+sideX*sideStep,
    y:forward.y*axial+up.y*liftStep-GRAVITY*dt,
    z:forward.z*axial+up.z*liftStep+sideZ*sideStep};
  const speed=Math.hypot(velocity.x,velocity.y,velocity.z);
  const course=speed>1e-8?unit(velocity):forward;
  const nextUp=unit(cross(course,right)),nextRight=cross(nextUp,course);
  const path=anglesFor(course,nextRight,p.trackYaw);
  // Suppress the coordinate heading flip at vertical in turn-rate consumers.
  p.yawRate=GRAVITY*(p.gLoad*Math.sin(bank)+sideForce*horizontal)/
    (Math.max(60,p.speed)*Math.max(.38,Math.cos(p.pathPitch)));
  p.trackYaw=path.yaw;p.pathPitch=path.pitch;p.baseBank=path.bank;
  p.speed=speed;
  const alpha=(p.aoa-INCIDENCE)*RAD,ca=Math.cos(alpha),sa=Math.sin(alpha),slip=Math.tan(p.slip);
  const nose=unit({x:course.x*ca+nextUp.x*sa+nextRight.x*slip,
    y:course.y*ca+nextUp.y*sa+nextRight.y*slip,z:course.z*ca+nextUp.z*sa+nextRight.z*slip});
  const bodyRight=unit(cross(cross(nose,nextRight),nose));
  const attitude=anglesFor(nose,bodyRight,p.yaw);
  p.pitch=attitude.pitch;p.yaw=attitude.yaw;p.bank=attitude.bank;
  p.lowSpeed=p.speed<(p.lowSpeed?292:265);p.overspeed=p.speed>(p.overspeed?653:688);
}
