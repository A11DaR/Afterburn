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
export function project(point, cam, v) {
  const local = point.x === undefined ? point : relativeTo(point, cam);
  const delta = angleDiff(local.bearing, cam.yaw), cosine = Math.cos(delta);
  const depth = Math.max(.08, cosine);
  const x = Math.sin(delta) * v.f / depth;
  const y = (Math.tan(cam.pitch) - Math.tan(local.elev) / depth) * v.f;
  const c = Math.cos(cam.bank), s = Math.sin(cam.bank);
  return { x:v.cx+x*c+y*s, y:v.cy-x*s+y*c, visible:cosine>.14, delta, range:local.range };
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
