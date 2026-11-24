export const TAU = Math.PI * 2;
export const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
export const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const approach = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));

export function viewFor(w, h) {
  return { w, h, cx:w*.5, cy:h*.442, f:Math.min(w*.73, h*1.5), r:clamp(Math.min(w,h)*.077,13,32) };
}
export function relativeTo(point, origin) {
  const dx = point.x - origin.x, dz = point.z - origin.z, dy = point.alt - origin.alt;
  const horizontal = Math.hypot(dx, dz);
  return { bearing:Math.atan2(dx,dz), elev:Math.atan2(dy,horizontal), range:Math.hypot(horizontal,dy) };
}
export const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
export const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
export function unit(v){
  const n=Math.hypot(v.x,v.y,v.z)||1;
  return {x:v.x/n,y:v.y/n,z:v.z/n};
}
export function direction(yaw,pitch){
  const c=Math.cos(pitch);
  return {x:Math.sin(yaw)*c,y:Math.sin(pitch),z:Math.cos(yaw)*c};
}
// A right bank lowers the right wing. All three axes stay finite through vertical.
export function axesFor(yaw,pitch,bank=0){
  const sn=Math.sin(yaw),cs=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch);
  const sb=Math.sin(bank),cb=Math.cos(bank);
  const forward={x:sn*cp,y:sp,z:cs*cp};
  const right={x:cs*cb+sn*sp*sb,y:-cp*sb,z:-sn*cb+cs*sp*sb};
  return {forward,right,up:cross(forward,right)};
}
export function anglesFor(forward,right,previousYaw){
  const horizontal=Math.hypot(forward.x,forward.z);
  const yaw=horizontal>1e-8?Math.atan2(forward.x,forward.z):previousYaw;
  const pitch=Math.atan2(forward.y,horizontal),level=axesFor(yaw,pitch);
  return {yaw,pitch,bank:Math.atan2(-dot(right,level.up),dot(right,level.right))};
}
const frames=new WeakMap();
export function cameraAxes(cam){
  let f=frames.get(cam);
  if(!f||f.yaw!==cam.yaw||f.pitch!==cam.pitch||f.bank!==cam.bank){
    f={yaw:cam.yaw,pitch:cam.pitch,bank:cam.bank,...axesFor(cam.yaw,cam.pitch,cam.bank)};
    frames.set(cam,f);
  }
  return f;
}
export function screenRay(cam,x,y){
  const {forward,right,up}=cameraAxes(cam);
  return {x:forward.x+x*right.x-y*up.x,y:forward.y+x*right.y-y*up.y,z:forward.z+x*right.z-y*up.z};
}
export function pointOnRay(cam,x,y,depth){
  const ray=screenRay(cam,x,y);
  return {x:cam.x+depth*ray.x,alt:cam.alt+depth*ray.y,z:cam.z+depth*ray.z};
}
export function project(point,cam,v){
  const spatial=point.x!==undefined;
  const vector=spatial?{x:point.x-cam.x,y:point.alt-cam.alt,z:point.z-cam.z}:direction(point.bearing,point.elev);
  const range=spatial?Math.hypot(vector.x,vector.y,vector.z):point.range;
  const {forward,right,up}=cameraAxes(cam),depth=dot(vector,forward);
  const scale=v.f/Math.max(spatial ? .05 : .0005,Math.abs(depth));
  const bearing=spatial?Math.atan2(vector.x,vector.z):point.bearing;
  return {x:v.cx+dot(vector,right)*scale,y:v.cy-dot(vector,up)*scale,visible:depth>(spatial ? .01 : .0001),
    depth:spatial?depth:depth*range,delta:angleDiff(bearing,cam.yaw),range};
}
export function cameraFor(flight) {
  if (!flight.rear) return flight;
  return { x:flight.x, z:flight.z, alt:flight.alt, yaw:angleDiff(flight.yaw+Math.PI,0),
    pitch:-flight.pitch, bank:-flight.bank };
}
export function recordTrail(object, dt, interval, count) {
  object.sampleIn -= dt;
  if (object.sampleIn > 0) return;
  object.history.unshift({x:object.x,z:object.z,alt:object.alt});
  if (object.history.length > count) object.history.pop();
  object.sampleIn = interval;
}
