import {clamp,project} from './geometry.js';

const TAU=2*Math.PI;
const outline='#263439';
const gunWhite='#fff6d8',gunHot='#ffc372';
const seekerIdle='#b9d6a8',seekerTrack='#ffd184',seekerReady='#ceffa7';
const gateLight='#9ce9d6',gateDark='#294a49',gateBack='#5c9992';
const cursorBlue='#a8e2ff';
const mono='"Consolas","Liberation Mono",monospace';
const octagon=Array.from({length:8},(_,i)=>{
  const a=(i+.5)*Math.PI/4;return [Math.cos(a),Math.sin(a)];
});
const snap=n=>Math.round(n)+.5;

function setup(c){
  c.save();c.shadowColor='transparent';c.shadowBlur=0;c.shadowOffsetX=0;c.shadowOffsetY=0;
  c.lineJoin='miter';c.lineCap='butt';c.setLineDash([]);
}
function doubleStroke(c,colour,width=1,under=outline){
  c.strokeStyle=under;c.lineWidth=width+2;c.stroke();
  c.strokeStyle=colour;c.lineWidth=width;c.stroke();
}
function move(c,x,y){c.moveTo(snap(x),snap(y));}
function to(c,x,y){c.lineTo(snap(x),snap(y));}

// A fixed white boresight with an open centre. Its short shoulders read even inside the seeker.
export function drawGunPipper(c,x,y,r,hot=false){
  setup(c);
  const arm=clamp(Math.round(r*.46),6,15),gap=clamp(Math.round(arm*.28),2,4),tick=arm<10?2:3;
  c.beginPath();
  move(c,x-arm,y-tick);to(c,x-arm,y);to(c,x-gap,y);
  move(c,x+gap,y);to(c,x+arm,y);to(c,x+arm,y-tick);
  move(c,x,y+gap);to(c,x,y+arm*.76);
  doubleStroke(c,hot?gunHot:gunWhite);
  c.fillStyle=outline;c.fillRect(Math.round(x)-1,Math.round(y)-1,3,3);
  c.fillStyle=hot?'#ffe3a2':gunWhite;c.fillRect(Math.round(x),Math.round(y),1,1);
  c.restore();
}

function caption(c,text,x,y,colour,size,width){
  const w=width||Math.ceil(text.length*size*.64+7),h=size+5;
  c.fillStyle='#273739';c.fillRect(Math.round(x-w/2),Math.round(y-h/2),w,h);
  c.font='bold '+size+'px '+mono;c.textAlign='center';c.textBaseline='middle';
  c.fillStyle=colour;c.fillText(text,Math.round(x),Math.round(y)+.5);
}

// Only the missile symbol encloses a target. Tracking fills the outer arc clockwise.
export function drawSeeker(c,x,y,r,progress,active,ready){
  if(!(r>0))return;
  setup(c);
  const locked=Boolean(ready),tracking=Boolean(active)||locked;
  const colour=locked?seekerReady:tracking?seekerTrack:seekerIdle;
  const cx=snap(x),cy=snap(y),start=-Math.PI/2,segment=tracking ? .82 : .48;
  c.beginPath();
  for(let i=0;i<4;i++){
    const mid=start+(i+.5)*Math.PI/2,a=mid-segment*.74,b=mid+segment*.74;
    c.moveTo(cx+r*Math.cos(a),cy+r*Math.sin(a));c.arc(cx,cy,r,a,b);
  }
  doubleStroke(c,colour,1,tracking?'#34433a':'rgba(39,55,54,.68)');
  const p=locked?1:clamp(Number(progress)||0,0,1);
  if(tracking&&p>.008){
    c.beginPath();c.arc(cx,cy,r+3,start,start+TAU*p);doubleStroke(c,colour,locked?1.75:2);
  }
  if(locked){
    const font=r<19?8:10;
    caption(c,'R · ПУСК',x,y+r+font+5,seekerReady,font);
  }
  c.restore();
}

export function drawPilotCursor(c,x,y){
  setup(c);
  c.beginPath();
  move(c,x-2,y-3);to(c,x,y-5);to(c,x+2,y-3);
  move(c,x+3,y-2);to(c,x+5,y);to(c,x+3,y+2);
  move(c,x+2,y+3);to(c,x,y+5);to(c,x-2,y+3);
  move(c,x-3,y+2);to(c,x-5,y);to(c,x-3,y-2);
  doubleStroke(c,cursorBlue);c.restore();
}

function gateVertex(x,z,alt,cam,v,sn,cs){
  const world={x,z,alt},depth=(x-cam.x)*sn+(z-cam.z)*cs;
  return {world,depth,p:project(world,cam,v)};
}
// Clip the world segment before projecting. A gate can surround the camera while crossing it.
function projectedEdge(a,b,cam,v){
  const near=.9;
  if(a.depth<near&&b.depth<near)return null;
  let p=a.p,q=b.p;
  if(a.depth<near||b.depth<near){
    const t=(near-a.depth)/(b.depth-a.depth),u=a.world,w=b.world;
    const cut=project({x:u.x+(w.x-u.x)*t,z:u.z+(w.z-u.z)*t,alt:u.alt+(w.alt-u.alt)*t},cam,v);
    if(a.depth<near)p=cut;else q=cut;
  }
  // Keep partly visible edges, and avoid huge Canvas paths at the projection plane.
  let lo=0,hi=1;const dx=q.x-p.x,dy=q.y-p.y;
  for(const [delta,distance] of [[-dx,p.x+3],[dx,v.w+3-p.x],[-dy,p.y+3],[dy,v.h+3-p.y]]){
    if(delta===0){if(distance<0)return null;continue;}
    const t=distance/delta;
    if(delta<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);
    if(lo>hi)return null;
  }
  return [p.x+dx*lo,p.y+dy*lo,p.x+dx*hi,p.y+dy*hi];
}
function addEdge(c,edge){if(edge){move(c,edge[0],edge[1]);to(c,edge[2],edge[3]);}}

function edgePointer(c,v,cam,centre,number){
  let dx=centre.x-v.cx,dy=centre.y-v.cy;
  if(!centre.visible){
    const side=Math.sin(centre.delta),behind=Math.max(0,-Math.cos(centre.delta));
    const lateral=Math.abs(side)<.065?0:side;
    dx=lateral*Math.cos(cam.bank)+behind*.70*Math.sin(cam.bank);
    dy=-lateral*Math.sin(cam.bank)+behind*.70*Math.cos(cam.bank);
  }
  const len=Math.hypot(dx,dy);if(!len)return;
  dx/=len;dy/=len;
  const reach=Math.min((v.w*.5-17)/Math.max(.001,Math.abs(dx)),
    (dy<0?v.cy-v.h*.14:v.h*.69-v.cy)/Math.max(.001,Math.abs(dy)));
  const x=v.cx+dx*reach,y=v.cy+dy*reach,nx=-dy,ny=dx;
  c.beginPath();move(c,x-dx*5+nx*4,y-dy*5+ny*4);to(c,x+dx*2,y+dy*2);to(c,x-dx*5-nx*4,y-dy*5-ny*4);
  doubleStroke(c,gateLight,1.5,gateDark);
  if(number!=null&&v.w>300)caption(c,String(number),x-dx*15,y-dy*15,gateLight,8,13);
}

export function drawLessonGate(c,v,cam,gate){
  if(!gate||!(gate.radius>0))return;
  const centre=project(gate,cam,v),yaw=gate.yaw||0,r=gate.radius;
  const rightX=Math.cos(yaw),rightZ=-Math.sin(yaw),sn=Math.sin(cam.yaw),cs=Math.cos(cam.yaw);
  const centreDepth=(gate.x-cam.x)*sn+(gate.z-cam.z)*cs;
  setup(c);
  if(centreDepth<-.98*r){
    edgePointer(c,v,cam,centre,gate.number);c.restore();return;
  }
  const front=[],back=[];
  for(const [u,h] of octagon){
    const x=gate.x+r*u*rightX,z=gate.z+r*u*rightZ,alt=gate.alt+r*h;
    front.push(gateVertex(x,z,alt,cam,v,sn,cs));
    back.push(gateVertex(x+r*.075*Math.sin(yaw),z+r*.075*Math.cos(yaw),alt,cam,v,sn,cs));
  }
  const screenRadius=v.f*r/Math.max(.90,Math.abs(centreDepth));
  const nearEdges=front.map((vertex,i)=>projectedEdge(vertex,front[(i+1)%8],cam,v));
  if(!nearEdges.some(Boolean)){
    if(!centre.visible||centre.x<0||centre.x>v.w||centre.y<0||centre.y>v.h)edgePointer(c,v,cam,centre,gate.number);
    c.restore();return;
  }
  const width=clamp(screenRadius*.035,1,3);
  if(screenRadius>16){
    c.beginPath();
    for(let i=0;i<8;i++){
      addEdge(c,projectedEdge(back[i],back[(i+1)%8],cam,v));
      addEdge(c,projectedEdge(front[i],back[i],cam,v));
    }
    doubleStroke(c,gateBack,1,gateDark);
  }
  c.beginPath();nearEdges.forEach(e=>addEdge(c,e));doubleStroke(c,gateLight,width,gateDark);
  if(screenRadius>18){
    const bead=clamp(Math.round(screenRadius*.074),2,6);
    for(const vertex of front){
      const p=vertex.p;if(vertex.depth<=.9||!p.visible||p.x<2||p.y<2||p.x>v.w-2||p.y>v.h-2)continue;
      const x=Math.round(p.x-bead/2),y=Math.round(p.y-bead/2);
      c.fillStyle=gateDark;c.fillRect(x-1,y-1,bead+2,bead+2);
      c.fillStyle='#ffe3a6';c.fillRect(x,y,bead,bead);
    }
  }
  if(gate.number!=null&&centre.visible&&screenRadius>8&&screenRadius<v.h*.44){
    const upper=Math.min(...front.map(vertex=>vertex.p.y));
    if(upper>=17&&upper<v.h*.87&&centre.x>27&&centre.x<v.w-27){
      const tag=gate.total!=null?gate.number+' / '+gate.total:String(gate.number);
      caption(c,tag,centre.x,upper-9,gateLight,screenRadius>30?9:8);
    }
  }
  c.restore();
}
