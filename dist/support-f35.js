// A small, depth-tested pixel sprite from an original faceted airframe. X is starboard,
// Y is up, and Z points toward the nose. Independent ally airframe.
const W=310,H=268,CX=155,CY=135,PIXELS=12,MODEL_SPAN=10.56;
const BODY=0,FLAME=2,FIRE=4,CORE=5,FLAP=6;
const hingeAt=x=>-2.39+(Math.abs(x)-1.77)*.239;
const clamp=(x,min,max)=>Math.min(max,Math.max(min,x));
const littleEndian=new Uint8Array(new Uint32Array([1]).buffer)[0]===1;
const pack=(r,g,b)=>littleEndian?(r|g<<8|b<<16|255<<24)>>>0:(r<<24|g<<16|b<<8|255)>>>0;
const ink=pack(49,61,71);
const vertices=[],faces=[],vertexIds=new Map(),ramps=new Map();

function ramp(hex){
  if(!ramps.has(hex)){
    const n=parseInt(hex,16),channels=[n>>16,(n>>8)&255,n&255];
    ramps.set(hex,Array.from({length:13},(_,i)=>pack(...channels.map(v=>Math.min(255,Math.round(v*(.65+.037*i)))))));
  }
  return ramps.get(hex);
}
function face(points,hex,part=BODY,out=[0,1,0],glow=false){
  let nx=0,ny=0,nz=0;
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];
    nx+=(a[1]-b[1])*(a[2]+b[2]);ny+=(a[2]-b[2])*(a[0]+b[0]);nz+=(a[0]-b[0])*(a[1]+b[1]);
  }
  const sign=nx*out[0]+ny*out[1]+nz*out[2]<0?-1:1,k=sign/(Math.hypot(nx,ny,nz)||1);
  const indices=points.map(p=>{
    const key=part+':'+p.map(a=>Math.round(a*10000)).join(',');
    if(!vertexIds.has(key)){vertexIds.set(key,vertices.length);vertices.push([...p,part]);}
    return vertexIds.get(key);
  });
  faces.push({indices,nx:nx*k,ny:ny*k,nz:nz*k,ramp:ramp(hex),part,glow});
}
function ring(x,y,z,wx,hy,count=8){
  return Array.from({length:count},(_,i)=>{
    const a=i*2*Math.PI/count;return [x+wx*Math.cos(a),y+hy*Math.sin(a),z];
  });
}
function loft(rings,colours,part=BODY,glow=false){
  for(let j=1;j<rings.length;j++){
    const a=rings[j-1],b=rings[j];
    for(let i=0;i<a.length;i++){
      const next=(i+1)%a.length,angle=(i+.5)*2*Math.PI/a.length;
      face([a[i],a[next],b[next],b[i]],colours[i%colours.length],part,[Math.cos(angle),Math.sin(angle),0],glow);
    }
  }
}
function panel(s,outline,y,colour,part=BODY,bottom=false){
  face(outline.map(([x,z])=>[s*x,y,z]),colour,part,[0,bottom?-1:1,0]);
}
function plate(s,outline,y,depth,top,bottom,part=BODY){
  panel(s,outline,y,top,part);panel(s,outline,y-depth,bottom,part,true);
  for(let i=0;i<outline.length;i++){
    const [x,z]=outline[i],[u,w]=outline[(i+1)%outline.length];
    face([[s*x,y,z],[s*u,y,w],[s*u,y-depth,w],[s*x,y-depth,z]],'55616a',part,[s*(z-w),0,u-x]);
  }
}

// Original stylized F-35I airframe: single centerline exhaust, broad faceted
// fuselage, clipped swept wings, side inlets, and outward-canted twin tails.
const skin=['747f86','8d989c','a1aaa9','849095','616f79','626e75','737e85','79868e'];
const rings=[[8.1,.035,.045,.05],[6.65,.40,.30,.07],[5.05,.76,.48,.12],[3.55,1.02,.69,.16],[1.9,1.52,.82,.04],[.2,1.67,.85,.02],[-2.15,1.53,.76,.03],[-4.4,1.22,.67,.06],[-5.65,.83,.63,.02],[-6.96,.65,.59,0]].map(([z,x,y,b])=>ring(0,b,z,x,y));
loft(rings,skin);
face(rings.at(-1),'414951',BODY,[0,0,-1]);
// Gold-tinted bubble canopy, modeled in three dimensions.
const glass=['52656d','7b887f','b1a58a','ab9775','627177','3e505e','435864','465963'];
loft([[5.5,.08,.05],[4.95,.42,.28],[4.12,.62,.61],[3.2,.66,.69],[2.43,.48,.43],[1.65,.13,.08]].map(([z,x,y])=>ring(0,.63,z,x,y)),glass);
for(const s of [-1,1]){
  // Angular, clipped trapezoid wing. No external stores or wingtip rails.
  const wing=[[1.25,2.05],[5.20,-.33],[5.28,-1.90],[2.58,-3.14],[1.20,-2.85]];
  plate(s,wing,.06,.17,'8e9b9e','667681');
  panel(s,[[1.35,1.99],[5.20,-.33],[5.22,-.51],[1.43,1.75]],.078,'bac0ba');
  panel(s,[[2.5,-2.78],[5.21,-1.64],[5.26,-1.88],[2.58,-3.12]],.083,'78888d');
  // Wing insignia: pale roundel with two blue triangles.
  const cx=3.42,cz=-.9,rad=.48;
  const circle=Array.from({length:12},(_,i)=>[cx+Math.cos(i*Math.PI/6)*rad,cz+Math.sin(i*Math.PI/6)*rad]);
  panel(s,circle,.085,'d4d9d4');
  for(const dir of [-1,1])panel(s,[[cx,cz+dir*.32],[cx-.29,cz-dir*.17],[cx+.29,cz-dir*.17]],.089,'5479a3');
  // Side inlet and raised diverterless intake shoulder.
  const inlet=(z,k)=>[[.88,.49],[1.74,.36],[1.84,-.13],[1.43,-.62],[.85,-.40]].map(([x,y])=>[s*(1.30+(x-1.30)*k),-.04+(y+.04)*k,z]);
  const lip=inlet(2.85,1),inside=inlet(2.87,.75),back=inlet(1.35,1.04);
  for(let i=0;i<lip.length;i++){const n=(i+1)%lip.length;face([lip[i],lip[n],back[n],back[i]],'819198',BODY,[s,0,0]);}
  face(lip,'a0aaa8',BODY,[0,0,1]);face(inside,'273946',BODY,[0,0,1]);
  plate(s,[[.77,4.65],[1.70,2.60],[1.87,1.38],[1.42,-1.8],[.93,-1.95]],.25,.19,'869499','6b7983');
  // Independent all-moving horizontal tailplane.
  const tail=[[.88,-3.45],[1.55,-3.48],[3.70,-5.15],[3.48,-6.50],[1.08,-6.13]];
  plate(s,tail,.16,.14,'8c999e','687983');
  panel(s,[[1.03,-3.50],[3.70,-5.15],[3.66,-5.30],[1.17,-3.70]],.18,'afb9b9');
  // Two widely spaced, outward-canted swept fins.
  const fin=(y,z,o=0)=>[s*(1.00+.53*y+.055*(z+5)+o),y,z];
  const outline=[[.26,-2.92],[.53,-2.82],[2.75,-4.42],[2.83,-5.98],[.45,-6.47],[.22,-5.95]];
  for(const side of [-1,1])face(outline.map(([y,z])=>fin(y,z,side*.065)),side>0?'788990':'647780',BODY,[side*s,0,0]);
  for(let i=0;i<outline.length;i++){
    const [y,z]=outline[i],[Y,Z]=outline[(i+1)%outline.length];
    face([fin(y,z,.065),fin(Y,Z,.065),fin(Y,Z,-.065),fin(y,z,-.065)],'9eaaa9',BODY,[0,1,0]);
  }
  // Blue and white identification stripe on both fin faces.
  for(const side of [-1,1]){
    const decal=(points,c)=>face(points.map(([y,z])=>fin(y,z,side*.075)),c,BODY,[s*side,0,0]);
    decal([[1.80,-4.48],[2.33,-4.88],[2.38,-5.76],[1.80,-5.82]],'e7e9df');
    decal([[1.90,-4.55],[2.00,-4.63],[2.03,-5.80],[1.91,-5.81]],'4d79ab');
    decal([[2.21,-4.80],[2.31,-4.87],[2.36,-5.77],[2.25,-5.78]],'4d79ab');
  }
}
// Single circular exhaust and layered flame; no second engine.
const steel=['59616a','818580','90928a','616d72','47515b','4a535c','59626b','70797c'];
loft([ring(0,0,-5.72,.78,.69),ring(0,0,-6.29,.72,.66),ring(0,0,-6.86,.66,.61),ring(0,0,-6.94,.69,.64)],steel);
face(ring(0,0,-6.95,.69,.64),'333b41',BODY,[0,0,-1]);
face(ring(0,0,-6.96,.54,.48),'817266',BODY,[0,0,-1]);
face(ring(0,0,-6.97,.43,.38),'3e3835',BODY,[0,0,-1]);
face(ring(0,0,-6.98,.23,.20),'d39765',CORE,[0,0,-1],true);
loft([ring(0,0,-6.96,.48,.43),ring(0,0,-7.65,.31,.29),ring(0,0,-8.74,.12,.11),ring(0,0,-9.18,.01,.01)],['e58d59','ffd087','ffe4a5','f4b576','bd7781','bd7980','e19061','ffbf77'],FLAME,true);
const count=vertices.length,screenX=new Float32Array(count),screenY=new Float32Array(count),screenZ=new Float32Array(count);
const depth=new Float32Array(W*H),ce=Math.cos(.49),se=Math.sin(.49);
let surface,mask,lastFrame='';
function target(ctx){
  if(surface)return surface;
  let canvas;
  if(typeof OffscreenCanvas==='function')canvas=new OffscreenCanvas(W,H);
  else if(ctx.canvas.ownerDocument){canvas=ctx.canvas.ownerDocument.createElement('canvas');canvas.width=W;canvas.height=H;}
  else canvas=new ctx.canvas.constructor(W,H);
  const context=canvas.getContext('2d'),image=context.createImageData(W,H);
  surface={canvas,context,image,rgba:new Uint32Array(image.data.buffer)};mask=new Uint8Array(W*H);
  return surface;
}

function triangle(a,b,c,colour,pixels){
  const ax=screenX[a],ay=screenY[a],az=screenZ[a];
  let bx=screenX[b],by=screenY[b],bz=screenZ[b],cx=screenX[c],cy=screenY[c],cz=screenZ[c];
  let area=(bx-ax)*(cy-ay)-(cx-ax)*(by-ay);
  if(Math.abs(area)<.01)return;
  if(area<0){[bx,cx]=[cx,bx];[by,cy]=[cy,by];[bz,cz]=[cz,bz];area=-area;}
  const left=Math.max(1,Math.ceil(Math.min(ax,bx,cx)-.5)),right=Math.min(W-2,Math.floor(Math.max(ax,bx,cx)-.5));
  const top=Math.max(1,Math.ceil(Math.min(ay,by,cy)-.5)),bottom=Math.min(H-2,Math.floor(Math.max(ay,by,cy)-.5));
  const abx=bx-ax,aby=by-ay,bcx=cx-bx,bcy=cy-by,cax=ax-cx,cay=ay-cy;
  const dzdx=((bz-az)*(cy-ay)-(cz-az)*aby)/area,dzdy=(abx*(cz-az)-(cx-ax)*(bz-az))/area;
  const dx=left+.5;
  for(let y=top;y<=bottom;y++){
    const dy=y+.5;let ab=abx*(dy-ay)-aby*(dx-ax),bc=bcx*(dy-by)-bcy*(dx-bx),ca=cax*(dy-cy)-cay*(dx-cx);
    let z=az+dzdx*(dx-ax)+dzdy*(dy-ay),idx=y*W+left;
    for(let x=left;x<=right;x++,idx++,ab-=aby,bc-=bcy,ca-=cay,z+=dzdx){
      if(ab>=-.0001&&bc>=-.0001&&ca>=-.0001&&z>=depth[idx]-.00001){
        depth[idx]=z;pixels[idx]=colour;mask[idx]=1;
      }
    }
  }
}

function render(frame,bank,pitch,slip,front,burn,flameLength,lost,age,reduced,onFire,powered,flapAngle){
  const cb=Math.cos(bank),sb=Math.sin(bank),cp=Math.cos(pitch),sp=Math.sin(pitch),ch=Math.cos(slip),sh=Math.sin(slip);
  // Rotated local unit axes, then the elevated observer basis and fixed high-left sun.
  const axes=[[cb*ch+sb*sp*sh,-sb*cp,cb*-sh+sb*sp*ch],[sb*ch-cb*sp*sh,cb*cp,-sb*sh-cb*sp*ch],[cp*sh,sp,cp*ch]];
  const hand=front?-1:1;
  const xx=axes.map(a=>hand*a[0]*PIXELS),yy=axes.map(a=>-(a[1]*ce+hand*a[2]*se)*PIXELS);
  const zz=axes.map(a=>a[1]*se-hand*a[2]*ce),sun=axes.map(a=>-.48*a[0]+.82*a[1]+.30*a[2]);
  const t=clamp(age,0,1.4),breakTime=reduced ? .30 : t;
  const twist=lost*breakTime*3.7,tw=Math.cos(twist),sw=Math.sin(twist),flip=breakTime*2.4,cf=Math.cos(flip),sf=Math.sin(flip);
  let xmin=W-1,xmax=0,ymin=H-1,ymax=0;
  for(let i=0;i<count;i++){
    let [x,y,z,part]=vertices[i];
    if(Math.abs(part)===FLAP){
      const hinge=hingeAt(x),dz=z-hinge,a=flapAngle*Math.PI/180;
      const dy=y-.034;
      z=hinge+dz*Math.cos(a)-dy*Math.sin(a);y=.034+dy*Math.cos(a)+dz*Math.sin(a);
      part=Math.sign(part);
    }
    if(part===FLAME||part===FIRE){
      if((part===FLAME&&!burn)||(part===FIRE&&!onFire))continue;
      z=-6.96+(z+6.96)*flameLength;
    }
    if(Math.abs(part)===3&&part/3!==lost)continue;
    if(lost&&part===lost){
      if(age>1.34)continue;
      const ox=x-lost*3.85,oz=z+1.05,tx=ox*tw+y*sw,ty=y*tw-ox*sw;
      x=lost*(3.85+.35+3.6*breakTime)+tx;
      y=.17+.92*breakTime-1.60*breakTime*breakTime+ty*cf+oz*sf;
      z=-1.05-.45-3.5*breakTime+oz*cf-ty*sf;
    }
    const u=CX+x*xx[0]+y*xx[1]+z*xx[2],v=CY+x*yy[0]+y*yy[1]+z*yy[2];
    screenX[i]=u;screenY[i]=v;screenZ[i]=x*zz[0]+y*zz[1]+z*zz[2];
    xmin=Math.min(xmin,u);xmax=Math.max(xmax,u);ymin=Math.min(ymin,v);ymax=Math.max(ymax,v);
  }
  depth.fill(-Infinity);mask.fill(0);frame.rgba.fill(0);
  for(const f of faces){
    if((f.part===FLAME&&!burn)||(f.part===FIRE&&!onFire)||(f.part===CORE&&!powered)||
      (Math.abs(f.part)===3&&f.part/3!==lost)||(lost&&(f.part===lost||f.part===lost*FLAP)&&age>1.34))continue;
    const light=f.nx*sun[0]+f.ny*sun[1]+f.nz*sun[2];
    const colour=f.ramp[f.glow?10:clamp(Math.round(6+6*light),0,12)],ids=f.indices;
    for(let j=2;j<ids.length;j++)triangle(ids[0],ids[j-1],ids[j],colour,frame.rgba);
  }
  const left=Math.max(1,Math.floor(xmin)-2),right=Math.min(W-2,Math.ceil(xmax)+2);
  const top=Math.max(1,Math.floor(ymin)-2),bottom=Math.min(H-2,Math.ceil(ymax)+2);
  for(let y=top;y<=bottom;y++)for(let p=y*W+left,last=y*W+right;p<=last;p++){
    if(!mask[p]&&(mask[p-1]||mask[p+1]||mask[p-W]||mask[p+W]))frame.rgba[p]=ink;
  }
  frame.bounds=[left,top,right-left+1,bottom-top+1];
  frame.context.putImageData(frame.image,0,0,left,top,right-left+1,bottom-top+1);
}

export function drawSupportF35(ctx,{x,y,span,bank=0,attitude=0,slip=0,rear=false,boost=false,speed=398,throttle=398,wingLoss=null,time=0,reduced=false,onFire=false,powered=true,flapAngle=0}){
  if(!(span>0))return;
  const frame=target(ctx),side=wingLoss?.side||0,age=wingLoss?.age||0;
  const power=clamp((throttle-210)/546,0,1),flow=clamp((speed-180)/620,0,1);
  const phase=reduced?0:Math.floor(time*11)%8;
  const flicker=Math.sin(phase*2.3);
  const length=onFire ? .96+.16*flicker : .80+power*.32+flow*.14+.10*flicker;
  const flap=Math.round(flapAngle);
  const key=[Math.round(bank*480),Math.round(attitude*480),Math.round(slip*480),rear,boost,onFire,powered,boost||onFire?Math.round(length*100):0,side,side?Math.round(age*90):0,reduced,flap].join('/');
  if(key!==lastFrame){render(frame,bank,attitude,slip,rear,boost,length,side,age,reduced,onFire,powered,flap);lastFrame=key;}
  const [left,top,width,height]=frame.bounds,k=span/(PIXELS*MODEL_SPAN);
  ctx.save();ctx.imageSmoothingEnabled=false;
  ctx.drawImage(frame.canvas,left,top,width,height,Math.round(x+(left-CX)*k),Math.round(y+(top-CY)*k),Math.max(1,Math.round(width*k)),Math.max(1,Math.round(height*k)));
  ctx.restore();
}
