import {clamp} from './geometry.js';
import {pointFromScreen} from './pilot-assist.js';

export function bindPointControls(world,p,getDisplay,stick){
  let touchId=null,originX=0,originY=0,lastDevice='';
  const available=()=>p.mode==='live'&&p.profile==='arcade'&&!p.rear&&!p.wingLoss&&getDisplay()?.camera;
  function aimAt(e){
    const display=getDisplay(),v=display.v,rect=world.getBoundingClientRect();
    const x=(e.clientX-rect.left)*v.w/rect.width,y=(e.clientY-rect.top)*v.h/rect.height;
    if(Math.hypot(x-v.cx,y-v.cy)<Math.max(6,v.r*.42)){
      p.pointerAim=null;return;
    }
    p.pointerAim=pointFromScreen(p,display.camera,v,x,y);
  }
  function slide(e){
    const dx=e.clientX-originX,dy=e.clientY-originY,rad=44;
    const length=Math.hypot(dx,dy),gain=clamp((length-4)/(rad-4),0,1);
    const x=length?dx/length*gain:0,y=length?dy/length*gain:0;
    p.touchStick={x,y:-y};
    stick.style.setProperty('--knob-x',(x*25)+'px');stick.style.setProperty('--knob-y',(y*25)+'px');
  }
  world.addEventListener('pointerdown',e=>{
    lastDevice=e.pointerType;
    if(!available())return;
    world.focus({preventScroll:true});
    if(e.pointerType==='touch'){
      const rect=world.getBoundingClientRect();
      if(touchId!==null||e.clientX>rect.left+rect.width*.58)return;
      e.preventDefault();world.setPointerCapture(e.pointerId);
      touchId=e.pointerId;originX=e.clientX;originY=e.clientY;p.pointerAim=null;
      stick.style.left=(originX-rect.left)+'px';stick.style.top=(originY-rect.top)+'px';
      stick.hidden=false;slide(e);
    }
  });
  // Separate mouse-button transitions still fire when the other button is held.
  world.addEventListener('mousedown',e=>{
    if(!available()||lastDevice==='touch'||e.sourceCapabilities?.firesTouchEvents||(e.button!==0&&e.button!==2))return;
    e.preventDefault();
    if(!p.pointerAim)aimAt(e);
    if(e.button===0){p.mouseGun=true;p.gun(getDisplay().v);}
    if(e.button===2)p.missile(getDisplay().v);
  });
  world.addEventListener('contextmenu',e=>{if(available())e.preventDefault();});
  world.addEventListener('pointermove',e=>{
    lastDevice=e.pointerType;
    if(!available())return;
    if(e.pointerType==='touch'){if(e.pointerId===touchId){e.preventDefault();slide(e);}return;}
    if(touchId===null)aimAt(e);
  });
  world.addEventListener('pointerleave',e=>{
    if(e.pointerType!=='touch'){p.pointerAim=null;p.mouseGun=false;}
  });
  function release(e){
    if(e.pointerId===touchId){touchId=null;p.touchStick=null;stick.hidden=true;}
    if(e.pointerType!=='touch'&&!(e.buttons&1))p.mouseGun=false;
  }
  window.addEventListener('mouseup',e=>{if(e.button===0)p.mouseGun=false;});
  window.addEventListener('pointerup',release);
  window.addEventListener('pointercancel',release);
  world.addEventListener('lostpointercapture',release);
  return ()=>{
    if(touchId!==null&&world.hasPointerCapture(touchId))world.releasePointerCapture(touchId);
    touchId=null;stick.hidden=true;p.releasePilot();
  };
}

