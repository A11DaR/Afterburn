import {viewFor,project,clamp,angleDiff,cameraFor,LOCK_SECONDS} from './flight.js';
import {Scenery} from './scenery.js';
import {Coast} from './coast.js';
import {WARNINGS,WARNING_UI} from './warnings.js';
import {drawWingBreak} from './flight-art.js';
import {WING_LIMIT} from './aerodynamics.js';
import {chaseView,chaseSight} from './chase-camera.js';
import {drawChaseJet} from './chase-jet.js';
import {drawGunPipper,drawSeeker,drawLessonGate,drawPilotCursor} from './pilot-hud.js';
import {drawMissileBurst,drawCanopyDamage} from './impact-art.js';

const TAU=Math.PI*2;
const integer=Math.round;
const mono='"Consolas","Liberation Mono",monospace';
const shadowOutline=[[0,6],[.8,2.1],[4.9,-1.1],[4.8,-1.9],[1.45,-1.3],[1.3,-3.2],
  [2.45,-4.35],[1.1,-4.15],[.6,-4.8],[-.6,-4.8],[-1.1,-4.15],[-2.45,-4.35],
  [-1.3,-3.2],[-1.45,-1.3],[-4.8,-1.9],[-4.9,-1.1],[-.8,2.1]];
const point=(c,p,i)=>i?c.lineTo(integer(p[0])+.5,integer(p[1])+.5):c.moveTo(integer(p[0])+.5,integer(p[1])+.5);
function path(c,pts,colour,width=1) {c.strokeStyle=colour;c.lineWidth=width;c.beginPath();pts.forEach((p,i)=>point(c,p,i));c.stroke();}
function poly(c,pts,colour){c.fillStyle=colour;c.beginPath();pts.forEach((p,i)=>point(c,p,i));c.closePath();c.fill();}
function rect(c,x,y,w,h,col){c.fillStyle=col;c.fillRect(integer(x),integer(y),Math.max(1,integer(w)),Math.max(1,integer(h)));}
function circle(c,x,y,r,col,width=1,start=0,end=TAU){c.lineWidth=width;c.strokeStyle=col;c.beginPath();c.arc(integer(x)+.5,integer(y)+.5,r,start,end);c.stroke();}
function dot(c,x,y,r,col){c.fillStyle=col;c.beginPath();c.arc(integer(x),integer(y),Math.max(.6,r),0,TAU);c.fill();}
function label(c,text,x,y,col,size=8,align='center'){
  c.fillStyle=col;c.font='bold '+integer(size)+'px '+mono;c.textAlign=align;c.textBaseline='middle';c.fillText(text,integer(x),integer(y));
}
function brackets(c,x,y,half,col,arm=5) {
  for(const sx of [-1,1])for(const sy of [-1,1]){
    path(c,[[x+sx*(half-arm),y+sy*half],[x+sx*half,y+sy*half],[x+sx*half,y+sy*(half-arm)]],col);
  }
}
export function drawLoadShade(c,v,strength){
  if(strength<=0)return;
  const core=.60*strength**3,edge=.98*strength;
  const clearRadius=.55-.44*strength;
  const ink=alpha=>'rgba(2,3,5,'+alpha+')';
  c.save();
  c.translate(v.cx,v.cy);c.scale(v.w*.5,v.h*.47);
  const shade=c.createRadialGradient(0,0,0,0,0,1);
  shade.addColorStop(0,ink(core));
  shade.addColorStop(clearRadius,ink(core));
  shade.addColorStop(clearRadius+(1-clearRadius)*.58,ink(core+(edge-core)*.70));
  shade.addColorStop(1,ink(edge));
  c.fillStyle=shade;c.fillRect(-1,-2,2,4);
  c.restore();
}
const demoCam={yaw:0,bank:0,pitch:.043,x:550,z:95,alt:55};
const demoBots=[
  {id:2,slot:1,bearing:.33,elev:.124,range:170,course:-.84,scale:1.18},
  {id:3,slot:2,bearing:.63,elev:.181,range:282,course:-1.32,scale:1.02},
  {id:4,slot:0,bearing:.137,elev:.093,range:345,course:.81,scale:.90}
];
function attractJet(base,cam,t,i){
  const phase=t*.24+i*.6;
  const bearing=base.bearing+Math.sin(phase)*.12,elev=base.elev+Math.sin(phase*.8)*.032;
  const heading=bearing+base.course+Math.sin(phase*.84)*.82;
  const bank=-.48*Math.cos(phase*.84+i*.45),pitch=.07*Math.sin(phase);
  const range=base.range*(1+Math.sin(phase*.41)*.14);
  const x=cam.x+Math.sin(bearing)*range,z=cam.z+Math.cos(bearing)*range,alt=cam.alt+Math.tan(elev)*range;
  const history=Array.from({length:17},(_,j)=>{
    const age=j*3.1;
    return {x:x-Math.sin(heading)*age+Math.sin(heading+Math.PI*.5)*age*age*.0015,
      z:z-Math.cos(heading)*age,alt:alt-(Math.sin(pitch)+.05)*age};
  });
  return {...base,x,z,alt,bearing,elev,range,heading,bank,pitch,history,speed:66,hp:100};
}

export class Display {
  constructor(canvas,art) {
    this.canvas=canvas;this.c=canvas.getContext('2d',{alpha:false,willReadFrequently:true});
    this.art=art;this.scenery=new Scenery(art);this.coast=new Coast(art,this.scenery);
    this.scenery.cloudLayer=(ctx,cam,view,time)=>this.coast.sky(ctx,cam,view,time);this.fx=[];this.clock=0;this.demoTime=0;this.endAge=0;this.impact=null;
    this.reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.external=false;this.warningLanguage='ru';
    this.resize();
  }
  setExternal(value){
    if(this.external===value)return;
    this.external=value;
    this.scenery.lastPaint=this.scenery.steep.clock=-Infinity;
  }
  resize() {
    const r=this.canvas.getBoundingClientRect();
    if(!r.width || !r.height)return;
    const w=clamp(Math.round(r.width*.71),Math.min(320,Math.round(r.width)),916);
    const h=Math.max(160,Math.round(w*r.height/r.width));
    if(this.v?.w===w && this.v.h===h)return;
    this.canvas.width=w;this.canvas.height=h;this.c.imageSmoothingEnabled=false;
    this.v=viewFor(w,h);this.scenery.resize(this.v);
  }
  event(type,data) {
    if(type==='start'||type==='briefing'||type==='lessonRetry'){this.fx=[];this.impact=null;this.endAge=0;this.scenery.lastPaint=this.scenery.steep.clock=-Infinity;return;}
    if(type==='lost'){
      this.endAge=0;
      if(data==='terrain'||data==='water'){
        this.impact={water:data==='water',bits:Array.from({length:33},()=>({
          angle:Math.random()*Math.PI*2,speed:.10+Math.random()*.68,size:.7+Math.random()*2.5
        }))};
      }
    }
    if(type==='gun')this.fx.push({type,age:0,ttl:.19,hit:Boolean(data),seed:Math.random()});
    if(type==='damage'){
      this.fx.push({type:'playerMissileImpact',...data,age:0,ttl:data.fatal?1.9:1.42,seed:Math.random()*999});
      return;
    }
    if(type==='kill'&&data.weapon==='missile'){
      this.fx.push({type:'enemyMissileImpact',anchor:data,age:0,ttl:1.75,seed:Math.random()*999});
      return;
    }
    if(type==='hit')this.fx.push({type:'armorHit',anchor:{x:data.x,z:data.z,alt:data.alt},age:0,ttl:.22,seed:Math.random()*999});
    if(type==='kill'||type==='botFlare'){
      const sparks=Array.from({length:27},()=>({a:Math.random()*TAU,v:.23+Math.random(),size:1+Math.random()*2,shade:Math.floor(Math.random()*4)}));
      this.fx.push({type,anchor:{x:data.x,z:data.z,alt:data.alt,range:data.range},age:0,ttl:type==='botFlare'?1.9:1.15,sparks});
    }
    if(type==='flares')this.fx.push({type,age:0,ttl:1.45});
  }
  draw(game,dt) {
    const menu=game.mode==='ready';
    if(menu)this.demoTime+=dt;
    if(game.mode==='lost')this.endAge+=dt;
    if(menu || game.mode==='live')this.clock+=dt;
    if(game.mode==='live'||game.mode==='lost'||game.mode==='won'){
      for(const x of this.fx)x.age+=dt;this.fx=this.fx.filter(x=>x.age<x.ttl);
    }
    const t=this.demoTime, v=this.v,c=this.c;
    if(!v)return;
    let plane=game,bots=game.bots;
    if(menu){
      const motion=this.reduce?0:1;
      plane={...demoCam,x:550+Math.sin(t*.10)*4*motion,z:95+Math.sin(t*.10)*22*motion,
        yaw:Math.sin(t*.13)*.004*motion,pitch:.043+Math.sin(t*.15)*.002*motion,bank:-.029+Math.sin(t*.16)*.035*motion};
      bots=demoBots.map((b,i)=>attractJet(b,plane,t*motion,i));
    }
    const chase=this.external?chaseView(plane,v,game.heightAt,this.reduce):null;
    const cam=chase?chase.camera:cameraFor(plane);
    this.camera=cam;
    if(chase && !menu && !game.rear && !game.wingLoss)chase.sight=chaseSight(game,cam,v);
    c.save();
    if(game.mode==='live' && !this.reduce && game.damageFlash>.35){
      const f=(game.damageFlash-.35)*3;
      c.translate(Math.round(Math.sin(game.time*64)*f),Math.round(Math.cos(game.time*54)*f));
    }
    if(game.mode==='live'&&!this.reduce&&game.stalled&&!game.wingLoss){
      c.translate(Math.round(Math.sin(game.time*35)*1.1),Math.round(Math.sin(game.time*43)*1.5));
    }
    this.scenery.draw(c,cam,v,this.clock);
    if(chase&&!menu&&!game.wingLoss&&game.mode!=='lost')this.jetShadow(game,cam,v);
    this.coast.surface(c,cam,v,this.clock);
    if(game.lesson?.gate&&!game.rear)drawLessonGate(c,v,cam,game.lesson.gate);
    const ordered=[...bots].sort((a,b)=>b.range-a.range);
    for(const b of ordered)this.drawBandit(b,cam,game,v,menu);
    if(!menu&&game.supportJet)this.drawSupportJet(game.supportJet,cam,game,v);
    if(!menu){
      this.drawProjectiles(game,cam,v);this.drawEffects(game,cam,v,chase);
      if(!this.reduce)this.airflow(game,v);
    }
    if(chase){
      if(!(game.mode==='lost'&&(this.impact||game.deathCause==='missile'))){
        drawChaseJet(c,{...chase.jet,boost:game.boost,speed:game.speed,throttle:game.throttle,onFire:game.engineFire,powered:game.enginePowered,
          wingLoss:game.wingLoss,time:this.clock,reduced:this.reduce,flapAngle:game.flapAngle});
      }
      if(chase.sight && game.mode==='live'){
        this.chaseHud(game,chase.sight);
        this.targetArrow(game,cam,v);
      }
    }else{
      if(game.wingLoss)drawWingBreak(c,v,game.wingLoss.side,game.wingLoss.age,this.reduce);
      this.canopy(v);
      if(game.lastHitSide&&game.hull<100)drawCanopyDamage(c,v,game.hull,game.rear?-game.lastHitSide:game.lastHitSide);
      if(game.rear && !menu){
        const ww=Math.max(v.w,Math.min(v.w*1.46,v.h*1.15)),hh=Math.min(v.h*.41,ww*.265);
        c.drawImage(this.art.aft,(v.w-ww)/2,v.h-hh,ww,hh);
      }else{
        this.glass(cam,v,menu);this.hud(game,cam,v,menu);this.panel(game,cam,v,bots);
      }
    }
    if(game.pointerAim && !game.rear && game.mode==='live'){
      const aim=game.pointerAim,d=aim.range??240,horizontal=d*Math.cos(aim.pitch);
      const marker=project({x:game.x+Math.sin(aim.yaw)*horizontal,z:game.z+Math.cos(aim.yaw)*horizontal,alt:game.alt+Math.sin(aim.pitch)*d},cam,v);
      if(marker.visible)drawPilotCursor(c,marker.x,marker.y);
    }
    const flash=game.mode==='lost'?Math.max(0,game.damageFlash-this.endAge):game.damageFlash;
    if(!menu && flash>.04){
      c.fillStyle=this.impact?.water?'rgba(189,222,227,'+flash*.30+')':'rgba(233,91,48,'+flash*.16+')';
      c.fillRect(0,0,v.w,v.h);
    }
    for(const fx of this.fx)if(fx.type==='playerMissileImpact'){
      const jet=chase?.jet,side=game.rear?-fx.side:fx.side,t=fx.age/fx.ttl;
      const x=jet?jet.x+(fx.fatal?0:side*jet.span*.29*Math.cos(jet.bank)):v.w*(side>0 ? .86 : .14);
      const y=jet?jet.y+side*jet.span*.20*Math.sin(jet.bank):v.h*.47;
      const radius=jet?jet.span*(fx.fatal ? .72 : .46):Math.min(v.w*.21,v.h*.38);
      drawMissileBurst(c,x,y,radius,t,fx.seed,this.reduce);
    }
    if(game.mode==='lost' && this.impact)this.drawImpact(v,chase?.jet);
    c.restore();
    if(game.mode==='live'||game.mode==='paused')drawLoadShade(c,v,game.visionShade);
  }
  jetShadow(game,cam,v){
    const clearance=Math.max(0,game.clearance);
    if(clearance>45)return;
    const x=game.x-clearance*.34,z=game.z-clearance*.65;
    const center={x,z,alt:game.heightAt(x,z)+.14};
    const p=project(center,cam,v);
    if(!p.visible||p.range<6||p.y>v.h*1.25||game.terrainBetween(cam,center))return;
    const sn=Math.sin(game.yaw),cs=Math.cos(game.yaw);
    const span=Math.max(.20,Math.abs(Math.cos(game.bank)));
    const points=[];
    for(const [u,h] of shadowOutline){
      const wx=x+cs*u*span+sn*h,wz=z-sn*u*span+cs*h;
      const vertex=project({x:wx,z:wz,alt:game.heightAt(wx,wz)+.14},cam,v);
      if(!vertex.visible)return;
      points.push([vertex.x,vertex.y]);
    }
    const alpha=(1-clearance/45)**1.3*(center.alt<1?.31:.50);
    poly(this.c,points,'rgba(23,32,46,'+alpha+')');
  }
  drawImpact(v,jet){
    const c=this.c,{water,bits}=this.impact,t=this.endAge;
    if(t<.98 && !this.reduce){
      const f=1-Math.pow(1-t,2),cx=jet?.x??v.w*.54,cy=jet?.y??v.h*.64;
      c.save();c.globalAlpha=.83*(1-t);
      for(const b of bits){
        const x=cx+Math.cos(b.angle)*v.w*b.speed*f;
        const y=cy+Math.sin(b.angle)*v.h*b.speed*f+v.h*t*t*.25;
        const colors=water?['#e7eee1','#a8ced0','#76a4b1']:['#e6a573','#857366','#66574e'];
        const width=b.size*(1+t*1.4);
        rect(c,x,y,width,water?width*1.65:width*.82,colors[Math.floor(b.size*2)%3]);
      }
      c.restore();
    }
    if(!water && !jet){
      c.save();c.globalAlpha=.54;
      const origin=[v.w*.82,v.h*.77];
      for(const chain of [[[.80,.725],[.81,.695],[.785,.649]],[[.85,.74],[.872,.75],[.907,.71]],
        [[.79,.786],[.764,.777],[.727,.795]],[[.836,.797],[.833,.823]]]){
        path(c,[origin,...chain.map(([x,y])=>[x*v.w,y*v.h])],'#e2d8be');
      }
      c.restore();
    }
  }
  drawSupportJet(jet,cam,game,v){
    const c=this.c,p=project(jet,cam,v);
    if(jet.fire){
      const hit=project(jet.fire,cam,v),t=jet.fire.progress;
      if(p.visible&&hit.visible){
        const from=[p.x+(hit.x-p.x)*Math.max(0,t-.24),p.y+(hit.y-p.y)*Math.max(0,t-.24)];
        const to=[p.x+(hit.x-p.x)*t,p.y+(hit.y-p.y)*t];
        path(c,[from,to],'#ffe19c',2);path(c,[from,to],'#fff9db',1);
      }
    }
    if(!p.visible||p.depth<2||game.terrainBetween(cam,jet))return;
    const span=clamp(v.f*12.62/p.depth,4,Math.min(v.w*.75,v.h*.8));
    if(p.x<-span||p.x>v.w+span||p.y<-span||p.y>v.h+span)return;
    const bearing=Math.atan2(jet.x-cam.x,jet.z-cam.z),elev=Math.atan2(jet.alt-cam.alt,Math.hypot(jet.x-cam.x,jet.z-cam.z));
    const aspect=angleDiff(jet.heading,bearing),rear=Math.cos(aspect)<0;
    // Reuse the player's depth-tested 3D pixel airframe, with the ally's own world attitude.
    drawChaseJet(c,{x:p.x,y:p.y,span,bank:jet.bank*Math.cos(aspect)-cam.bank,
      attitude:clamp(jet.pitch-elev-.49,-1.2,1.2),slip:rear?angleDiff(aspect,Math.PI):aspect,rear,
      boost:true,speed:650,throttle:650,time:this.clock,reduced:this.reduce});
    if(span>24){
      // Pixel portrait and Israeli flag, anchored at the aircraft's cockpit in world coordinates.
      const hx=jet.x+Math.sin(jet.heading)*4,hz=jet.z+Math.cos(jet.heading)*4;
      const a=project({x:hx,z:hz,alt:jet.alt+2.1},cam,v);
      if(a.visible){
        const u=clamp(Math.round(span/36),1,4),x=Math.round(a.x-3*u),y=Math.round(a.y-8*u);
        const box=(i,j,w,h,col)=>rect(c,x+i*u,y+j*u,w*u,h*u,col);
        box(1,0,5,1,'#d8dbd8');box(0,1,7,2,'#a9afad');box(1,2,5,5,'#dfb499');
        box(1,3,2,1,'#39454c');box(4,3,2,1,'#39454c');box(3,4,2,2,'#bd896f');
        box(2,6,4,1,'#875b50');box(1,7,5,2,'#263a50');box(3,7,1,2,'#e7e8db');
        box(8,0,1,9,'#c1c7c6');box(9,0,10,7,'#f5f7f0');box(9,1,10,1,'#2455b9');box(9,5,10,1,'#2455b9');
        for(const [i,j] of [[14,2],[13,3],[15,3],[12,4],[13,4],[14,4],[15,4],[16,4]])box(i,j,1,1,'#2455b9');
      }
    }
    if(span>8)label(c,'BIBI · ALLY',p.x,p.y+span*.48+7,'#b8eaff',clamp(span*.11,7,11));
  }
  drawBandit(b,cam,game,v,demo){
    const c=this.c,p=project(b,cam,v);
    if(b.occluded || !p.visible || p.x< -135 || p.x>v.w+135 || p.y< -100 || p.y>v.h+65)return;
    if(this.external && game.terrainBetween(cam,b))return;
    const sightline=this.external?cam.yaw+p.delta:b.bearing;
    const elevation=this.external?Math.asin(clamp((b.alt-cam.alt)/Math.max(.001,p.range),-1,1)):b.elev;
    const size=clamp(v.f*(demo?35:28)/Math.max(9,this.external?p.range:b.range)*(b.scale??1),8,demo?177:245);
    const aspect=angleDiff(b.heading,sightline);
    const ca=Math.cos(aspect),sa=Math.sin(aspect),cb=Math.cos(b.bank);
    const viewHeight=clamp(-Math.sin(elevation)*cb+sa*Math.sin(b.bank)*Math.cos(elevation)+ca*Math.sin(b.pitch)*.9,-1,1);
    const degrees=Math.asin(viewHeight)*180/Math.PI;
    const row=degrees< -37?0:degrees< -9?1:degrees<15?2:degrees<39?3:4;
    const frame=(Math.round(aspect/TAU*32)+32)%32;
    const tilt=b.bank*ca-b.pitch*sa-cam.bank;
    const sx=Math.sin(b.heading),cz=Math.cos(b.heading);
    const smoked=b.hp<55;
    for(const engine of [-1,1]){
      const side=engine*(smoked?1.5:2.0),ageOffset=demo?4.5:3.4;
      let last=null;
      for(let k=0;k<b.history.length;k++){
        const h=b.history[k];
        const near={x:h.x-sx*ageOffset+cz*side,z:h.z-cz*ageOffset-sx*side,
          alt:h.alt-.5+Math.min(k,10)*(smoked ? .24 : .032)};
        const pos=project(near,cam,v);
        if(last && last.visible && pos.visible && Math.abs(pos.x-last.x)<v.w*.4){
          const fade=(1-k/(b.history.length+1))*(smoked ? .73:demo ? .68 : .46);
          path(c,[[last.x,last.y],[pos.x,pos.y]],smoked?'rgba(76,72,76,'+fade+')':'rgba(255,230,198,'+fade+')',
            smoked?clamp(size*.034,1,3.5):clamp(size*.019,1,2.5));
        }
        last=pos;
      }
    }
    c.save();c.translate(integer(p.x),integer(p.y));c.rotate(tilt);
    c.drawImage(this.art.jets,frame*112,(row+(b.slot%2)*5)*112,112,112,-size/2,-size/2,size,size);
    c.restore();
    if(ca>.48 && b.speed>48){
      const exhaust=project({x:b.x-sx*4,z:b.z-cz*4,alt:b.alt-.55},cam,v);
      if(exhaust.visible)dot(c,exhaust.x,exhaust.y,clamp(size*.015,.65,2.4),'#ffd19c');
    }
    if(demo){
      if(b.id!==2)return;
      const h=size*.43;brackets(c,p.x,p.y,h,'rgba(253,205,144,.78)',Math.max(4,h*.19));
      label(c,'B–02',p.x+h,p.y-h-7,'#ffe0a9',8,'right');return;
    }
    const active=!game.rear && game.lockId===b.id && game.lock>0;
    const col=b.claimed?'#ded5bc':active?(game.lock>=LOCK_SECONDS?'#c5f3a2':'#ffd082'):'#ffbf90';
    const half=clamp(size*.36,7,45);
    brackets(c,p.x,p.y,half,col,active?5:3);
    if(b.hp<100){
      const width=clamp(size*.67,15,42),y=p.y+half+5;
      rect(c,p.x-width/2-1,y-1,width+2,4,'#32272a');
      rect(c,p.x-width/2,y,width*b.hp/100,2,b.hp<=50?'#ff8b64':'#ffd589');
    }
    if(b.runner){
      poly(c,[[p.x,p.y-half-4],[p.x-3,p.y-half-8],[p.x+3,p.y-half-8]],'#ffd088');
      label(c,'ВЕДУЩИЙ',p.x,p.y-half-14,'#ffe1a5',8);
    }else if(v.w>415 || active || b.training)label(c,b.training?'МИШЕНЬ':b.pilot?.name.toUpperCase()??'B-'+String(b.id).padStart(2,'0'),p.x+half,p.y-half-5,col,7,'right');
  }
  drawProjectiles(game,cam,v){
    const c=this.c;
    for(const m of [...game.threats,...game.missiles]){
      const enemy=m.sourceId!==undefined, p=project(m,cam,v);
      let last=p;
      for(let i=0;i<m.history.length;i++){
        const pos=project(m.history[i],cam,v),alpha=(1-i/m.history.length)*.78;
        if(last.visible && pos.visible && Math.abs(last.x-pos.x)<v.w*.5 && Math.abs(last.y-pos.y)<v.h*.7)
          path(c,[[last.x,last.y],[pos.x,pos.y]],enemy?'rgba(255,172,134,'+alpha+')':'rgba(255,226,187,'+alpha+')',clamp(v.f/Math.max(24,pos.range)*.34,1,3.5));
        last=pos;
      }
      if(!p.visible||p.range<3)continue;
      const size=clamp(v.f/p.range*.72,.7,4.8);
      dot(c,p.x,p.y,size+1,enemy?'#e98d67':'#e1a25c');dot(c,p.x,p.y,size,'#fff2bd');
      if(enemy&&!m.free&&p.range<145)brackets(c,p.x,p.y,6+size,'#ffb08a',3);
    }
  }
  airflow(game,v){
    const intensity=clamp((game.speed-478)/245+(game.roll ? .42:0),0,1);
    if(intensity<.04)return;
    const c=this.c,t=this.clock;
    for(let i=0;i<23;i++){
      const a=i*2.399+.37,phase=(t*(.56+intensity*.63)+i*.618)%1;
      const radial=.33+phase*.79,span=.014+.082*intensity*phase;
      const pos=n=>[v.cx+Math.cos(a)*v.w*.66*n,v.cy+Math.sin(a)*v.h*.73*n];
      path(c,[pos(radial-span),pos(radial)],'rgba(227,239,228,'+(intensity*phase*.42)+')',1);
    }
  }
  drawEffects(game,cam,v,chase){
    const c=this.c;
    for(const fx of this.fx){
      const t=fx.age/fx.ttl;
      if(fx.type==='enemyMissileImpact'||fx.type==='armorHit'){
        const p=project(fx.anchor,cam,v);if(!p.visible)continue;
        const radius=fx.type==='armorHit'?clamp(v.f/(p.range+1)*2.6,3.5,12):clamp(v.f/(p.range+1)*22,17,76);
        drawMissileBurst(c,p.x,p.y,radius,t,fx.seed,this.reduce);
      }
      if(fx.type==='gun' && !game.rear){
        const spread=fx.hit ? .13 : .31, j=(fx.seed-.5)*v.r*spread;
        const jet=chase?.jet,aim=chase?.sight?.gun;
        const ax=aim?.x??v.cx,ay=aim?.y??v.cy;
        for(const s of [-1,1]){
          const x0=jet?jet.x+jet.span*(s*.027+.105*Math.sin(jet.bank)):v.cx+s*v.w*.29;
          const y0=jet?jet.y-jet.span*.19:v.h*.87,x1=ax+j+s*1.4,y1=ay+j*.32;
          const point=a=>{const e=1-Math.pow(1-clamp(a,0,1),2.3);return [x0+(x1-x0)*e,y0+(y1-y0)*e];};
          path(c,[point(t-.22),point(t+.03)],'#ffb35e',2);path(c,[point(t-.08),point(t+.045)],'#fff0a1',1);
        }
        if(fx.hit && t>.50){const r=2+t*4;path(c,[[ax-r,ay-r],[ax-2,ay-2]],'#ffd390');path(c,[[ax+r,ay+r],[ax+2,ay+2]],'#ffd390');}
      }
      if(fx.type==='kill'){
        const p=project(fx.anchor,cam,v);if(!p.visible)continue;
        const scale=clamp(v.f/fx.anchor.range*26,12,43);
        c.save();
        for(const s of fx.sparks){
          const travel=scale*(.18+1.65*t)*s.v;
          const x=p.x+Math.cos(s.a)*travel,y=p.y+Math.sin(s.a)*travel+scale*.62*t*t;
          const side=s.size*(1-t*.56)*(v.w/735+.48);
          if(s.shade===0 && t>.15){c.globalAlpha=(1-t)*.72;dot(c,x,y-t*scale*.3,side*(1+t*2.1),'#686472');}
          else{c.globalAlpha=Math.min(1,(1-t)*2);rect(c,x,y,side*(1+t),side,['#ffcf81','#e9814a','#ffe5a3','#b96c53'][s.shade]);}
        }
        c.globalAlpha=1;
        if(t<.39){dot(c,p.x,p.y,(1-t/.39)*scale*.54+1,'#ffad61');dot(c,p.x,p.y,(1-t/.39)*scale*.33+.5,'#fff1ba');}
        if(t<.52)circle(c,p.x,p.y,2+scale*1.18*t,'rgba(255,216,155,'+(.75-t)+')');
        c.restore();
      }
      if(fx.type==='botFlare'){
        const p=project(fx.anchor,cam,v);
        if(!p.visible)continue;
        for(let i=0;i<10;i++){
          const q=fx.sparks[i],r=clamp(v.f/(p.range+6)*20,7,58);
          const pos=n=>[p.x+Math.cos(q.a)*r*q.v*n*2.4,p.y+Math.sin(q.a)*r*q.v*n+r*n*n*.94];
          const head=pos(t);
          path(c,[pos(Math.max(0,t-.22)),head],'rgba(255,200,137,'+(.88*(1-t))+')',1.5);
          dot(c,head[0],head[1],Math.max(.8,(1-t)*2.4),'#ffedb4');
        }
      }
      if(fx.type==='flares') {
        for(const s of [-1,1])for(let i=0;i<5;i++) {
          const a=clamp(t-i*.035,0,1);if(!a)continue;
          const jet=chase?.jet;
          const pos=n=>jet?
            [jet.x+s*(jet.span*.13*Math.cos(jet.bank)+v.w*n*(.19+i*.023)),jet.y+jet.span*(.07+s*.13*Math.sin(jet.bank))+v.h*n*(.12-i*.046)+v.h*n*n*.12]:
            [v.cx+s*v.w*(.16+n*(.40+i*.025)),v.h*((game.rear ? .86 : .75)-n*(.53-i*.057)+n*n*.24)];
          const p=pos(a);
          for(let j=1;j<=7;j++){
            const u=Math.max(0,a-j*.025);
            path(c,[pos(u),pos(Math.max(0,a-(j-1)*.025))],'rgba(255,195,129,'+((1-j/8)*(1-t)*.86)+')',j<3?2:1);
          }
          dot(c,p[0],p[1],1.1+(1-t)*1.5,'#fff0ad');if(i%2===0)rect(c,p[0]-3,p[1],7,1,'#ffcd81');
        }
      }
    }
  }
  canopy(v){
    const c=this.c,w=v.w,h=v.h;
    const inner=[[.039,-.02],[.016,.057],[-.003,.15],[-.020,.39],[-.010,.52],[.016,.62],[.047,.701],[.093,.788],[.157,.875],[.183,1.01]];
    for(const s of [1,-1]){
      const at=(xx,yy)=>[s===1?xx*w:(1-xx)*w,yy*h];
      const edge=inner.map(([x,y])=>at(x,y));
      const shell=[...edge,at(-.03,1.02),at(-.03,-.02)];
      poly(c,shell,'#263136');path(c,edge,'#a29c8c',Math.max(2,w*.005));
      path(c,inner.map(([x,y])=>at(x-.003,y)),'#535c5e',Math.max(2,w*.005));
      path(c,inner.map(([x,y])=>at(x-.011,y)),'#172328',Math.max(2,w*.008));
      const brace=[[0,.56],[.016,.656],[.057,.742],[.14,.862],[.146,.90],[.07,.819],[.016,.727],[0,.707]].map(p=>at(...p));
      poly(c,brace,'#465254');path(c,brace.slice(1,5),'#7f8076',1.5);
      for(const [x,y] of [[.009,.647],[.034,.698],[.065,.755],[.10,.805]]){
        const p=at(x,y);rect(c,p[0]-1,p[1],3,2,'#182329');rect(c,p[0],p[1],1,1,'#909088');
      }
      for(const sh of [0,.013,.026]){
        const p1=at(.046+sh,.757+sh*1.18),p2=at(.052+sh,.752+sh*1.18);
        path(c,[p1,p2],'#b39c68',2);
      }
    }
  }
  glass(cam,v,demo){
    const c=this.c,cx=v.cx,cy=v.cy;
    const half=clamp(Math.min(v.w*.15,v.h*.34),46,145);
    const top=cy-v.r*2.35,low=v.h*.816;
    const pts=[[cx-half*.73,low],[cx-half,top+v.r*.70],[cx-half*.78,top],[cx+half*.78,top],[cx+half,top+v.r*.70],[cx+half*.73,low]];
    poly(c,pts,'rgba(112,185,152,.041)');path(c,pts,'rgba(196,217,185,.38)',1.25);
    path(c,[[cx-half*.95,top+v.r*.83],[cx-half*.75,top+3],[cx-half*.42,top+3]],'rgba(240,235,202,.27)');
    path(c,[[cx+half*.95,top+v.r*.80],[cx+half*.79,top+4]],'rgba(237,238,205,.28)');
    for(const s of [-1,1]){
      const x=cx+s*half*.77;
      poly(c,[[x-3,low],[x-2,low-v.h*.061],[x+2,low-v.h*.073],[x+5,low]],'#39464a');
      path(c,[[x-1,low-v.h*.06],[x+1,low-v.h*.07]],'#9a9f8e');
    }
  }
  chaseHud(game,sight){
    const c=this.c,{gun,bore,ring,r}=sight;
    const tracking=game.lockId!==null,locked=game.lock>=LOCK_SECONDS;
    if(game.rockets){
      for(let i=0;i<4;i++){
        const a=Math.PI*(.25+i*.5);
        circle(c,bore.x,bore.y,r*game.searchRadius,'rgba(209,237,206,.64)',1,a-.075,a+.075);
      }
      drawSeeker(c,ring.x,ring.y,r,game.lock/LOCK_SECONDS,tracking,locked);
    }
    drawGunPipper(c,gun.x,gun.y,r,Boolean(game.inSight(this.v,true)));
  }
  targetArrow(game,cam,v){
    if(!game.bots.length)return;
    const points=game.bots.map(b=>({b,p:project(b,cam,v)}));
    const leader=points.find(({b})=>b.runner);
    const shown=({b,p})=>!b.occluded&&p.visible&&p.x>v.w*.055&&p.x<v.w*.945&&p.y>v.h*.07&&p.y<v.h*.72&&(!this.external||!game.terrainBetween(cam,b));
    if(leader?shown(leader):points.some(shown))return;
    const {p,b}=leader??points.reduce((a,b)=>Math.abs(a.p.delta)<Math.abs(b.p.delta)?a:b);
    const dx=p.visible?p.x-v.cx:Math.sign(p.delta)*v.w,dy=p.visible?p.y-v.cy:0;
    if(p.visible&&(b.occluded||(this.external&&game.terrainBetween(cam,b)))&&Math.abs(dx)<v.w*.34&&Math.abs(dy)<v.h*.23){
      label(this.c,leader?'ВЕДУЩИЙ ЗА РЕЛЬЕФОМ':'ЦЕЛЬ ЗА РЕЛЬЕФОМ',v.cx,v.h*.16,'#ffcf97',8);
      return;
    }
    const k=Math.min((v.w*.43)/(Math.abs(dx)||1),(dy>0?v.h*.245:v.h*.31)/(Math.abs(dy)||1));
    const x=v.cx+dx*k,y=v.cy+dy*k,a=Math.atan2(dy,dx),c=this.c;
    c.save();c.translate(x,y);c.rotate(a);poly(c,[[6,0],[-4,-4],[-2,0],[-4,4]],'#ffbd81');c.restore();
    const word=leader?'ВЕДУЩИЙ':game.lesson?'МИШЕНЬ':'ЦЕЛЬ';
    label(c,!p.visible?word+' · СЗАДИ':word,x,y+12,'#ffd097',8);
  }
  hud(game,cam,v,demo){
    const c=this.c,cx=v.cx,cy=v.cy,r=v.r,green=demo?'rgba(200,236,179,.60)':'#c6efad';
    c.save();c.shadowColor='rgba(35,65,46,.75)';c.shadowBlur=0;c.shadowOffsetY=1;
    c.lineWidth=1;
    const deg=((cam.yaw*180/Math.PI+325)%360+360)%360;
    const top=Math.max(14,v.h*.104),step=clamp(v.w*.032,14,26);
    const centerMark=Math.round(deg/5)*5;
    for(let i=-4;i<=4;i++){
      const mark=centerMark+i*5,x=cx+(mark-deg)/5*step, long=(mark%10===0);
      path(c,[[x,top+1],[x,top+(long?6:3)]],green,1);
      if(long)label(c,String((mark+360)%360).padStart(3,'0'),x,top-5,green,7);
    }
    poly(c,[[cx,top+4],[cx-2,top+8],[cx+2,top+8]],green);
    const wing=r*.72;
    c.save();c.translate(cx,cy);c.rotate(-cam.bank);
    for(const i of [-2,-1,1,2]){
      const off=i*r*.95+((cam.pitch-.043)*v.f*.31)%(r*.93);
      const wid=(Math.abs(i)===1 ? .98 : .73)*wing;
      for(const s of [-1,1]){
        const x1=s*r*.67,x2=x1+s*wid;
        path(c,[[x1,off],[x2,off],[x2,off+(i>0?-2:2)]],demo?'rgba(202,232,174,.36)':'rgba(198,239,172,.67)');
      }
    }c.restore();
    const tracking=!demo && game.lockId!==null && game.lock>0;
    const locked=tracking && game.lock>=LOCK_SECONDS;
    if(!demo && game.mode==='live'&&!game.wingLoss){
      const motion=project({bearing:game.trackYaw,elev:game.pathPitch,range:100},cam,v);
      const mx=motion.x,my=motion.y;
      if(motion.visible&&Math.hypot(mx-cx,my-cy)>9&&Math.abs(mx-cx)<v.w*.25&&my>v.h*.14&&my<v.h*.68){
        const col='#93e2dc';circle(c,mx,my,3,col);path(c,[[mx-8,my],[mx-3,my]],col);
        path(c,[[mx+3,my],[mx+8,my]],col);path(c,[[mx,my-6],[mx,my-3]],col);
      }
    }
    if(!demo && game.mode==='live' && game.rockets){
      const guideRadius=r*game.searchRadius;
      for(let i=0;i<4;i++){
        const a=Math.PI*(.25+i*.5);
        circle(c,cx,cy,guideRadius,'rgba(200,239,177,.68)',1,a-.11,a+.11);
      }
      const sx=game.seekX*r,sy=game.seekY*r,offset=Math.hypot(sx,sy);
      if(offset>r*.44){
        c.save();c.setLineDash([2,3]);
        path(c,[[cx+sx*3/offset,cy+sy*3/offset],[cx+sx*.83,cy+sy*.83]],'rgba(223,247,184,.68)');
        c.restore();
      }
    }
    if(demo || game.rockets)drawSeeker(c,cx+(demo?0:game.seekX*r),cy+(demo?0:game.seekY*r),r,game.lock/LOCK_SECONDS,tracking,locked);
    drawGunPipper(c,cx,cy,r,!demo&&Boolean(game.inSight(v,true)));
    if(v.w>390){
      const xgap=clamp(v.w*.202,72,180), y=cy+r*.3;
      const sp=Math.round(game.speed);
      const alt=Math.round(cam.alt*10);
      for(const [s,val,unit] of [[-1,sp,'KTS'],[1,alt,'FT']]){
        const x=cx+s*xgap;
        const wid=unit==='FT'?32:26;
        c.strokeStyle=green;c.lineWidth=1;c.strokeRect(integer(x-wid/2)+.5,integer(y-6)+.5,wid,11);
        label(c,''+val,x,y,green,8);label(c,unit,x,y+12,green,7);
      }
      if(!demo){
        const gc=Math.abs(game.gLoad)>WING_LIMIT?'#ff8775':game.highG?'#ffd284':green;
        label(c,game.gLoad.toFixed(1)+' G',cx-xgap,y+23,gc,8);
        label(c,'AOA '+Math.round(game.aoa)+'°',cx+xgap,y+23,game.stalled?'#ff8775':green,8);
        if(game.flapAngle>=3)label(c,'FLAP '+Math.round(game.flapAngle)+'°',cx-xgap,y+34,green,7);
      }
    }
    if(!demo && game.mode==='live')this.targetArrow(game,cam,v);
    c.restore();
  }
  panel(game,cam,v,bots){
    const c=this.c,ww=Math.max(v.w,Math.min(v.h*1.28,v.w*1.8));
    const hh=Math.min(v.h*.283,Math.max(v.w*.20,v.h*.21));
    c.save();c.translate(integer((v.w-ww)/2),integer(v.h-hh+1));c.scale(ww/900,hh/156);
    c.drawImage(this.art.panel,0,0);
    const priority=this.warningLights && WARNINGS.find(w=>this.warningLights&w.bit);
    const warningText=game.wingLoss?WARNING_UI[this.warningLanguage].wing:priority?.[this.warningLanguage]?.label;
    if(warningText){
      rect(c,376,53,148,20,'#261c22');rect(c,380,55,140,15,'#a62831');
      path(c,[[381,55],[518,55]],'#ff8878');
      label(c,'!  '+warningText,450,63,'#fff2d9',warningText.length>17?9:11);
    }
    const rx=187,ry=82,cx=rx+59,cy=ry+35;
    c.save();c.beginPath();c.rect(rx,ry,118,66);c.clip();
    c.fillStyle='#17322d';c.fillRect(rx,ry,118,66);
    const dark='#375649',bright='#9ab085',lime='#c2d490';
    for(const radius of [10,20,30])circle(c,cx,cy,radius,dark);
    path(c,[[cx,ry+5],[cx,ry+65]],dark);
    path(c,[[cx-35,cy],[cx+35,cy]],dark);
    const sweep=this.clock*1.65-Math.PI/2;
    path(c,[[cx,cy],[cx+Math.cos(sweep)*31,cy+Math.sin(sweep)*31]],'#81a670');
    for(const b of bots){
      const a=angleDiff(b.bearing,cam.yaw),dist=clamp(b.range*.092,4,29);
      const dx=Math.sin(a)*dist,dy=-Math.cos(a)*dist;
      if(b.runner){
        poly(c,[[cx+dx,cy+dy-4],[cx+dx+4,cy+dy],[cx+dx,cy+dy+4],[cx+dx-4,cy+dy]],'#ffd088');
      }else rect(c,cx+dx-1,cy+dy-1,3,3,Math.cos(a)<0?'#edaa72':lime);
    }
    label(c,'RDR',rx+4,ry+6,bright,7,'left');label(c,'360',rx+114,ry+6,bright,7,'right');
    path(c,[[cx-3,cy+2],[cx,cy-3],[cx+3,cy+2]],'#cbd7af');c.restore();
    // Artificial horizon, recessed in the central instrument.
    c.save();c.beginPath();c.arc(450,115,28,0,TAU);c.clip();c.fillStyle='#597e86';c.fillRect(416,81,69,68);
    c.translate(450,115);c.rotate(-cam.bank);const hy=cam.pitch*70-3;
    rect(c,-37,hy,74,45,'#94775b');path(c,[[-34,hy],[34,hy]],'#d7c497',2);
    for(let j=-2;j<=2;j++)if(j!==0)path(c,[[-6,hy+j*7],[6,hy+j*7]],'#c9c6ac');
    c.restore();circle(c,450,115,28,'#838b79');
    path(c,[[430,113],[441,113],[445,117],[450,113],[455,117],[459,113],[470,113]],'#e2bd78',2);
    // Stores monitor, including an overhead aircraft silhouette and live stores.
    const mx=595,my=82;rect(c,mx,my,118,66,'#18352f');
    label(c,'STORES',mx+4,my+6,bright,7,'left');label(c,'A/A',mx+114,my+6,bright,7,'right');
    const ax=mx+42,ay=my+32;
    poly(c,[[ax,ay-16],[ax+2,ay-12],[ax+3,ay-3],[ax+14,ay+4],[ax+14,ay+6],[ax+3,ay+3],[ax+3,ay+10],[ax+7,ay+14],[ax+1,ay+12],[ax,ay+14],[ax-1,ay+12],[ax-7,ay+14],[ax-3,ay+10],[ax-3,ay+3],[ax-14,ay+6],[ax-14,ay+4],[ax-3,ay-3],[ax-2,ay-12]],'#97b284');
    for(let i=0;i<3;i++){path(c,[[mx+72,my+20+9*i],[mx+107,my+20+9*i]],dark,2);path(c,[[mx+72,my+20+9*i],[mx+72+([game.rockets/6,game.rounds/240,game.flares/6][i])*35,my+20+9*i]],lime,2);}
    label(c,'F/A-18E',mx+4,my+59,bright,7,'left');
    c.restore();
  }
}
