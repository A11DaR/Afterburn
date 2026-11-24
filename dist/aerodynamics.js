import {TAU,clamp,approach,angleDiff} from './geometry.js';

// Point-mass arcade model. Speed is indicated in game knots; position uses map units.
const GRAVITY=55, RAD=Math.PI/180, LIFT_SLOPE=.30, INCIDENCE=3.4;
export const WING_LIMIT=10;

function liftCurve(alpha){
  const magnitude=Math.abs(alpha);
  if(magnitude<=18)return alpha;
  const peak=18+Math.min(4,magnitude-18)*.28;
  return Math.sign(alpha)*Math.max(4.2,peak-Math.max(0,magnitude-22)*.82);
}

export function advanceAirframe(p,dt,side,elevator){
  const density=clamp(1-p.alt*.00019,.82,1);
  const q=density*(p.speed/400)**2;
  const control=clamp((p.speed-120)/165,.30,1)*(p.stalled ? .64 : 1);
  p.baseBank=approach(p.baseBank,side*1.33*control,side?3.4:5.5,dt);
  let rollAngle=0,rollPull=0;
  if(p.roll){
    p.roll.t=Math.min(1,p.roll.t+dt/1.06);
    const t=p.roll.t;
    rollAngle=p.roll.side*TAU*t*t*(3-2*t);rollPull=3.8*Math.sin(Math.PI*t);
    if(t>=1)p.roll=null;
  }
  p.bank=angleDiff(p.baseBank+rollAngle,0);
  const trimLoad=Math.cos(p.pathPitch)/Math.max(.23,Math.cos(p.baseBank));
  const trim=clamp(trimLoad/(LIFT_SLOPE*q),.5,17);
  const stick=elevator*(elevator>=0?18.4:12.6)/Math.pow(Math.max(.22,q),.34);
  let targetAlpha=clamp(trim+stick+rollPull,-20,35);
  if(p.profile==='arcade'){
    const requested=targetAlpha*q*LIFT_SLOPE;
    if(requested>7.5){
      const limited=7.5+1.6*(1-Math.exp(-(requested-7.5)/1.6));
      targetAlpha=limited/(q*LIFT_SLOPE);
    }
  }
  p.aoa=approach(p.aoa,targetAlpha,elevator?3.7:5.4,dt);
  const lowSpeedFlap=clamp((345-p.speed)/115,0,1);
  const turnFlap=clamp((p.aoa-8)/15,0,1)*.64;
  const flapTarget=34*Math.max(lowSpeedFlap,turnFlap,p.braking ? .90 : 0)*clamp((560-p.speed)/125,0,1);
  p.flapAngle+=clamp(flapTarget-p.flapAngle,-34*dt,24*dt);
  const angle=Math.abs(p.aoa);
  p.stalled=angle>(p.stalled?17.2:22.4);
  p.highAoa=angle>(p.highAoa?11.8:14.8);
  p.gLoad=q*LIFT_SLOPE*liftCurve(p.aoa);
  p.peakG=Math.max(p.peakG,p.gLoad);
  p.highG=p.gLoad>(p.highG?7.7:8.5);
  p.wingStress=clamp(p.wingStress+dt*(p.gLoad>WING_LIMIT ? .32+.84*(p.gLoad-WING_LIMIT) : -.53),0,1);

  // Rotate the velocity vector using the banked lift and gravity. The nose can point
  // away from that vector, especially with high incidence or during a stall.
  const response=GRAVITY/Math.max(115,p.speed),cosPath=Math.cos(p.pathPitch);
  const pitchAccel=response*(p.gLoad*Math.cos(p.bank)-cosPath);
  // A/D commands a coordinated turn. A small rudder input keeps the requested
  // direction responsive even when the player pushes the nose over in a bank.
  const rudder=p.roll?0:side*control;
  const sideForce=rudder*(.85+Math.max(0,2-p.gLoad)*Math.abs(Math.sin(p.baseBank)));
  p.slip=approach(p.slip,rudder*clamp((2.9-p.gLoad)*.057,0,.23),6,dt);
  p.yawRate=response*(p.gLoad*Math.sin(p.bank)+sideForce)/Math.max(.48,cosPath);
  p.trackYaw=angleDiff(p.trackYaw+p.yawRate*dt,0);
  p.pathPitch=clamp(p.pathPitch+pitchAccel*dt,-1.18,1.14);
  const offset=(p.aoa-INCIDENCE)*RAD;
  const nosePitch=Math.asin(clamp(Math.cos(offset)*Math.sin(p.pathPitch)+Math.sin(offset)*Math.cos(p.bank)*Math.cos(p.pathPitch),-.995,.995));
  const noseOffset=Math.atan2(Math.sin(offset)*Math.sin(p.bank),Math.cos(offset)*Math.cos(p.pathPitch)-Math.sin(offset)*Math.sin(p.pathPitch)*Math.cos(p.bank));
  p.pitch=nosePitch;p.yaw=angleDiff(p.trackYaw+noseOffset+p.slip,0);

  if(p.enginePowered){
    p.throttle=clamp(p.throttle+((p.boost?125:0)-(p.braking?195:0))*dt,210,756);
    if(p.profile==='arcade'&&!p.boost&&!p.braking){
      const cruise=clamp(410+(410-p.speed)*2.8,268,680);
      p.throttle=approach(p.throttle,cruise,.86,dt);
    }
    const spoolTarget=17.65*(p.throttle/400)**2+(p.boost?90*clamp((801-p.speed)/125,0,1):0);
    p.thrust=approach(p.thrust,p.engineFire?spoolTarget*.48:spoolTarget,p.boost?4.8:3.1,dt);
  }else{
    p.throttle=0;p.thrust=0;
  }
  const drag=q*(16+.145*p.aoa**2+Math.max(0,angle-18)*1.5+7*Math.abs(p.slip))+(p.braking?54+58*q:0);
  const acceleration=p.thrust-drag-GRAVITY*Math.sin(p.pathPitch);
  p.speed=clamp(p.speed+acceleration*dt,116,820);
  p.lowSpeed=p.speed<(p.lowSpeed?292:265);p.overspeed=p.speed>(p.overspeed?653:688);
}
