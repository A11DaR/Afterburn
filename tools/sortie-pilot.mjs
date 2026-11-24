// Normal flight controls for the two end-to-end sorties: preserve turning speed,
// unload a stalled wing and clear the terrain before resuming pursuit.
export function manageEnergy(plane,keys){
  const assisted=plane.profile==='arcade';
  if(plane.speed<(assisted?430:410))keys.add('ShiftLeft');
  if(!plane.flares&&!plane.roll&&plane.threats.some(t=>!t.free&&t.ttl<1.75))plane.startRoll();
  if(plane.stalled||plane.aoa>(assisted?19:17)||plane.gLoad>8.8){
    keys.delete('KeyW');plane.pointerAim=null;
    if(plane.speed<320){keys.delete('KeyA');keys.delete('KeyD');}
  }
  if(plane.clearance<35&&plane.pathPitch<-.05){
    keys.delete('KeyS');keys.delete('KeyA');keys.delete('KeyD');plane.pointerAim=null;
    if(plane.aoa<18&&plane.gLoad<8.8)keys.add('KeyW');
  }
}
