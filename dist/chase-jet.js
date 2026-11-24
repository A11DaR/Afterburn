// A small, depth-tested pixel sprite from an original faceted airframe. X is starboard,
// Y is up, and Z points toward the nose. Only the outer main wing follows a break.
const W=310,H=268,CX=155,CY=135,PIXELS=13,MODEL_SPAN=12.62;
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

const skin=['81939c','a1b0b4','b4bfbd','8497a0','647682','647682','70838b','80949b'];
const hull=[[9.24,.04,.04,.07],[7.45,.33,.29,.07],[6,.48,.42,.10],[4.7,.68,.53,.13],
  [2.6,.92,.61,.13],[.2,1.22,.59,.07],[-2.9,1.28,.53,.04],[-5.55,1.0,.46,.02],[-6.62,.59,.28,0]];
const bodyRings=hull.map(([z,rx,ry,base])=>ring(0,base,z,rx,ry));
loft(bodyRings.slice(0,3),['b0b5ac','c8c9ba','d5d3c1','aab1aa','9a9e99','979e9e','a2adae','aeb7b0']);
loft(bodyRings.slice(2),skin);face(bodyRings.at(-1),'495660',BODY,[0,0,-1]);

// Low, angular arc of the canopy. Its transverse bow is a separate narrow loft.
const canopy=[[6.52,.08,.08],[6.05,.31,.28],[5.3,.49,.58],[4.67,.55,.68],[4.53,.56,.69],
  [3.93,.49,.55],[3.43,.40,.25],[3.19,.17,.07]];
const glass=['2d4356','446a81','6f98a7','9eb9b4','436477','293e51'];
for(let j=1;j<canopy.length;j++){
  const hoop=([z,rx,ry],i)=>{const a=i*Math.PI/6;return [rx*Math.cos(a),.50+ry*Math.sin(a),z];};
  for(let i=0;i<6;i++){
    const a=(i+.5)*Math.PI/6;
    face([hoop(canopy[j-1],i),hoop(canopy[j-1],i+1),hoop(canopy[j],i+1),hoop(canopy[j],i)],
      j===4?'4c5960':glass[i],BODY,[Math.cos(a),Math.sin(a),0]);
  }
}
loft([[3.49,.39,.15],[1.9,.44,.26],[-1.6,.31,.23],[-4.95,.13,.10]].map(([z,rx,ry])=>ring(0,.52,z,rx,ry)),skin);

for(const s of [-1,1]){
  const wing=[[1.77,2.20],[2.30,1.85],[6.10,-.39],[6.14,hingeAt(6.14)],[1.77,hingeAt(1.77)]];
  plate(s,wing,.035,.16,'a1aeb0','788994',s);
  for(const [inboard,outboard,inTail,outTail] of [[1.77,4.01,-3.28,-2.51],[4.06,6.06,-2.50,-1.91]]){
    const flap=[[inboard,hingeAt(inboard)],[outboard,hingeAt(outboard)],[outboard,outTail],[inboard,inTail]];
    plate(s,flap,.034,.13,'9aa8aa','617788',s*FLAP);
  }
  panel(s,[[1.79,2.15],[6.10,-.39],[6.10,-.63],[1.79,1.87]],.049,'c8c9bd',s);
  panel(s,[[1.83,-2.51],[3.89,-2.01],[3.89,-2.46],[1.85,-3.15]],.052,'7e9198',s*FLAP);
  panel(s,[[4.37,.50],[4.48,.42],[4.63,-1.66],[4.53,-1.69]],.065,'89999b',s);
  panel(s,[[5.74,-.22],[5.95,-.34],[5.96,-1.36],[5.82,-1.39]],.068,'c3906b',s);
  panel(s,[[1.85,-2.39],[3.92,-1.90],[3.92,-1.98],[1.85,-2.48]],.073,'c2bba7',s*FLAP);
  panel(s,[[1.86,-2.48],[3.92,-1.97],[3.94,-2.48],[1.88,-3.18]],-.106,'627887',s*FLAP,true);
  // Underside: shallow fairings and their long grazing-light shadow during inversion.
  const pylon=(y,z,dx)=>[s*(3.02+dx),y,z];
  face([pylon(-.12,.29,.12),pylon(-.42,-.08,.06),pylon(-.38,-1.74,.06),pylon(-.12,-2.15,.10)],'617787',s,[s,-1,0]);
  face([pylon(-.12,.29,-.12),pylon(-.42,-.08,-.06),pylon(-.38,-1.74,-.06),pylon(-.12,-2.15,-.10)],'8798a2',s,[-s,-1,0]);
  face([pylon(-.42,-.08,-.06),pylon(-.42,-.08,.06),pylon(-.38,-1.74,.06),pylon(-.38,-1.74,-.06)],'475e70',s,[0,-1,0]);
  const rail=[[6.06,.16],[6.17,.37],[6.31,.13],[6.29,-2.07],[6.14,-2.36],[6.04,-2.07]];
  plate(s,rail,.095,.19,'87969a','596977',s);
  panel(s,[[6.08,.09],[6.18,.28],[6.25,.07],[6.25,-.23],[6.08,-.23]],.103,s>0?'b8cbb6':'c47f6d',s);
  // Outer-wing national-style stencil is original, muted to match the metallic paint.
  if(s<0){
    panel(s,[[2.75,-.51],[4.09,-.51],[4.09,-.78],[2.75,-.78]],.081,'687e88',s);
    panel(s,[[3.12,-.41],[3.34,-.23],[3.64,-.31],[3.77,-.60],[3.63,-.93],[3.32,-.98],[3.10,-.80]],.085,'617787',s);
    panel(s,[[3.42,-.34],[3.52,-.57],[3.70,-.65],[3.5,-.72],[3.42,-.87],[3.34,-.71],[3.15,-.63],[3.34,-.55]],.092,'bfc4ba',s);
  }
  const lex=[[.48,5.78],[.71,5.22],[1.22,3.97],[2.04,2.28],[2.15,1.86],[1.77,.36],[1.73,-3.30],[.77,-3.30]];
  plate(s,lex,.125,.20,'91a3aa','6c7c87');
  panel(s,[[.61,5.15],[1.16,4],[2.05,2.20],[1.91,2.04],[.78,4.71]],.144,'c3c7bd');
  panel(s,[[1.24,2.44],[1.85,1.93],[1.76,.75],[1.54,-2.55],[1.37,-2.74]],.145,'7c9098');
  for(let v=0;v<3;v++){
    const z=-1.33-v*.35;
    face([[s*.81,.53,z],[s*1.14,.45,z-.03],[s*1.14,.45,z-.17],[s*.81,.53,z-.13]],'637984');
  }
  const stab=[[.96,-3.70],[1.45,-3.94],[3.75,-5.76],[3.85,-6.68],[3.54,-6.92],[1.05,-6.48]];
  plate(s,stab,.11,.13,'95a5ad','667987');
  panel(s,[[1.06,-3.81],[3.75,-5.78],[3.78,-6.02],[1.09,-4.07]],.128,'bbc3c1');
  panel(s,[[1.11,-5.96],[3.79,-6.36],[3.57,-6.85],[1.07,-6.42]],.13,'798b96');

  const cx=s*.81,ey=-.19;
  const engine=[[2.51,.62,.46],[.64,.71,.61],[-2.61,.72,.65],[-5.68,.69,.62],[-6.15,.62,.55]];
  loft(engine.map(([z,rx,ry])=>ring(cx,ey,z,rx,ry)),skin);
  const steel=['535e68','7d8585','8b8e88','606e76','48555e','4b575f','59656d','717c7e'];
  loft([ring(cx,ey,-5.81,.68,.6),ring(cx,ey,-6.16,.65,.57),ring(cx,ey,-6.83,.56,.51),ring(cx,ey,-6.94,.58,.53)],steel);
  face(ring(cx,ey,-6.948,.58,.53),'353d44',BODY,[0,0,-1]);
  face(ring(cx,ey,-6.96,.47,.41),'76665b',BODY,[0,0,-1]);
  face(ring(cx,ey,-6.97,.37,.31),'423d3a',BODY,[0,0,-1]);
  face(ring(cx,ey,-6.98,.19,.16),'b88153',CORE,[0,0,-1],true);
  if(s===1){
    const root=ring(cx+.09,ey+.21,-6.35,.43,.37,6),tip=ring(cx+.21,ey+.68,-8.1,.61,.46,6);
    loft([root,tip,ring(cx+.43,ey+.96,-9.55,.08,.10,6)],['ffb755','d65e35','9e402c','ffd680','ea793e','af4330'],FIRE,true);
    loft([ring(cx+.24,ey+1.05,-8.75,.30,.29,6),ring(cx+.42,ey+1.37,-10.05,.58,.47,6),
      ring(cx+.57,ey+1.78,-11.5,.12,.12,6)],['655c5b','72665d','5c5351','857668','79655b','655b55'],FIRE);
  }
  const flame=[[ -6.96,.41,.36],[-7.66,.28,.29],[-8.68,.11,.12],[-9.12,.012,.012]].map(([z,rx,ry])=>ring(cx,ey,z,rx,ry));
  loft(flame,['e48254','ffc579','ffe39a','e79669','b97881','bd7980','e19061','ffbf77'],FLAME,true);
  loft([ring(cx,ey,-7.70,.294,.297),ring(cx,ey,-7.84,.282,.285)],['ec9b6a','fff0b0','fff5ca','ffc481','d08d84','b47988','df8f75','ffc179'],FLAME,true);
  loft([ring(cx,ey,-8.55,.142,.154),ring(cx,ey,-8.69,.116,.129)],['e8a18a','ffd5a0','ffdbac','efb095','b7828a','ac7d92','df9d85','edaa90'],FLAME,true);

  // Angular inlet lips project slightly ahead of the engine nacelles.
  const intake=(z,scale)=>[[.69,.36],[1.56,.28],[1.63,-.10],[1.42,-.72],[.64,-.55]].map(([x,y])=>[s*(1.13+(x-1.13)*scale),-.15+(y+.15)*scale,z]);
  const lip=intake(2.62,1),inner=intake(2.635,.78),back=intake(1.92,1.03);
  for(let i=0;i<lip.length;i++){const n=(i+1)%lip.length;face([lip[i],lip[n],back[n],back[i]],i===0?'b4bbaf':'71858d',BODY,[s,0,0]);}
  face(lip,'a9b3ae',BODY,[0,0,1]);face(inner,'2f404a',BODY,[0,0,1]);
  panel(s,[[1.09,.68],[1.41,.64],[1.41,.45],[1.09,.48]],.415,'667b83');

  // Fin plane is canted outwards. Mirrored faces remain distinct from nose and tail.
  const fin=(y,z,offset=0)=>[s*(1.02+.52*y+.032*(z+5)+offset),y,z];
  const shape=[[.28,-2.64],[.60,-2.52],[3.27,-4.65],[3.20,-6.42],[.45,-6.78],[.25,-6.47]];
  face(shape.map(([y,z])=>fin(y,z,.06)),'667e8b',BODY,[s,0,0]);
  face(shape.map(([y,z])=>fin(y,z,-.06)),'506878',BODY,[-s,0,0]);
  for(let i=0;i<shape.length;i++){
    const [y,z]=shape[i],[h,l]=shape[(i+1)%shape.length];
    face([fin(y,z,.06),fin(h,l,.06),fin(h,l,-.06),fin(y,z,-.06)],i<3?'bfc4b8':'596d75',BODY,[0,1,0]);
  }
  for(const f of [-1,1]){
    const decal=(coords,fill)=>face(coords.map(([y,z])=>fin(y,z,f*.072)),fill,BODY,[f*s,0,0]);
    decal([[2.61,-4.19],[3.21,-4.72],[3.15,-6.38],[2.57,-6.45]],'e9a16a');
    decal([[2.48,-4.11],[2.57,-4.18],[2.54,-6.43],[2.45,-6.45]],'c6b89e');
    decal([[1.02,-4.67],[1.71,-4.43],[1.43,-4.86],[2.20,-4.78],[1.20,-5.54],[1.40,-5.08]],'a4afb0');
    decal([[.69,-5.96],[2.38,-6.0],[2.38,-6.10],[.68,-6.09]],'344d5c');
  }
  // Ragged exposed material along the plane where the outer wing detaches.
  const fracture=s*3;
  face([[s*1.77,.11,1.77],[s*1.84,.035,1.44],[s*1.77,-.12,.99],[s*1.86,-.04,.1],[s*1.77,-.12,-.75],
    [s*1.87,-.005,-1.76],[s*1.78,-.13,-3.21],[s*1.73,.14,-3.22],[s*1.73,.15,1.70]],'bd9978',fracture,[s,1,0]);
}

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

export function drawChaseJet(ctx,{x,y,span,bank=0,attitude=0,slip=0,rear=false,boost=false,speed=398,throttle=398,wingLoss=null,time=0,reduced=false,onFire=false,powered=true,flapAngle=0}){
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
