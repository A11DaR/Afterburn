// Tiled pigment and weather maps are baked once. The flight renderer only reads them.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const MAP=1024, MASK=1023, TILE=256;
export const WEATHER_PERIOD=2048, WEATHER_SHIFT=3, WEATHER_MASK=255;
export const windX=.54,windZ=.26;

export function random32(seed){
  let s=seed>>>0;
  return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
}

function pigmentTile(){
  const sea=new Int8Array(TILE*TILE),stone=new Int8Array(TILE*TILE),micro=new Int8Array(TILE*TILE);
  const random=random32(78471);
  const at=(x,z)=>((Math.round(z)&255)<<8)+(Math.round(x)&255);
  // Broken, wind-combed arcs. The dark lip and interrupted highlight move with the sea surface.
  for(let i=0;i<340;i++){
    const cx=random()*TILE,cz=random()*TILE,length=4+random()*12;
    const arc=.7+random()*2,slant=(random()-.38)*.32,light=2+Math.floor(random()*4);
    const notch=(random()-.5)*.75;
    for(let dx=-length;dx<=length;dx++){
      const t=dx/length,xx=cx+dx,zz=cz+dx*slant+arc*t*t;
      const edge=(1-Math.abs(t))*(light+1);
      const crest=at(xx,zz),lip=at(xx,zz+1);
      sea[lip]=Math.min(sea[lip],-1-Math.round(edge*.27));
      if(Math.abs(t-notch)>.10)sea[crest]=Math.max(sea[crest],Math.round(edge));
      if(light>4&&t>-.52&&t<.17)sea[at(xx,zz-.8)]=Math.max(sea[at(xx,zz-.8)],2);
    }
  }
  for(let i=0;i<550;i++){
    const cx=random()*TILE,cz=random()*TILE,w=2+random()*7,h=1+random()*3.5,shade=random()>.61?2:-2;
    for(let z=-Math.ceil(h);z<=h;z++)for(let x=-Math.ceil(w);x<=w;x++){
      const d=(x/w)**2+(z/h)**2;
      if(d<1)stone[at(cx+x+z*.8,cz+z)]=Math.round(shade*(1-d*.65));
    }
  }
  // Sub-metre pebbles and flecks only resolve during a low pass.
  for(let i=0;i<1650;i++){
    const x=random()*TILE,z=random()*TILE,n=1+Math.floor(random()*4);
    for(let k=0;k<n;k++)micro[at(x+k,z)]=k<n-1?2:1;
    if(n>2)micro[at(x+1,z+1)]=-2;
  }
  return {sea,stone,micro};
}

function shoreline(terrain){
  // A two-metre shore-distance map, including the seam of the repeating world tile.
  const side=512,mask=511,depth=new Uint8Array(side*side),queue=new Uint32Array(side*side);
  depth.fill(31);let end=0;
  for(let z=0;z<side;z++)for(let x=0;x<side;x++){
    const id=(z<<9)+x,ix=x*2,iz=z*2;
    if(terrain[(iz<<10)+ix]>=64)continue;
    depth[id]=0;
    if(terrain[(((iz+2)&MASK)<<10)+ix]>=64||terrain[(((iz-2)&MASK)<<10)+ix]>=64||
       terrain[(iz<<10)+((ix+2)&MASK)]>=64||terrain[(iz<<10)+((ix-2)&MASK)]>=64)queue[end++]=id;
  }
  const visit=(id,d)=>{if(depth[id]>d){depth[id]=d;queue[end++]=id;}};
  for(let n=0;n<end;n++){
    const id=queue[n],d=depth[id]+1;if(d>14)continue;
    const x=id&mask,row=id&~mask;
    visit(row+((x-1)&mask),d);visit(row+((x+1)&mask),d);
    visit((id-side)&262143,d);visit((id+side)&262143,d);
  }
  return depth;
}

function smaller(source,size){
  const half=size>>1,result=new Uint8Array(half*half);
  for(let z=0;z<half;z++)for(let x=0;x<half;x++){
    const i=z*2*size+x*2,a=source[i],b=source[i+1],c=source[i+size],d=source[i+size+1];
    const band=a&240;
    let sum=a&15,count=1;
    if((b&240)===band){sum+=b&15;count++;}
    if((c&240)===band){sum+=c&15;count++;}
    if((d&240)===band){sum+=d&15;count++;}
    result[z*half+x]=band+Math.round(sum/count);
  }
  return result;
}

export function surfacePaint(terrain,ripple){
  const {sea,stone,micro}=pigmentTile(),shore=shoreline(terrain);
  const fine=new Uint8Array(terrain.length);
  for(let z=0;z<MAP;z++)for(let x=0;x<MAP;x++){
    const i=(z<<10)+x,material=terrain[i],p=((z&255)<<8)+(x&255);
    if(material<64){
      const band=material&240;
      fine[i]=band+clamp((material&15)+stone[p],0,15);continue;
    }
    const coast=shore[((z>>1)<<9)+(x>>1)];
    const next=terrain[(((z+2)&MASK)<<10)+x],previous=terrain[(((z-2)&MASK)<<10)+x];
    const level=material-64,n=next>=64?next-64:level,s=previous>=64?previous-64:level;
    let value=Math.round(level*.50+(n+s)*.25)+sea[p];
    if(coast<9){
      value+=Math.max(0,3-(coast>>1));
      if((coast<=1&&level>8)||(coast===3&&sea[p]>2&&ripple[i]>104))value=Math.max(value,13+(level>13));
      if(level>=14)value=Math.max(value,level);
    }
    fine[i]=64+clamp(value,1,15);
  }
  const medium=smaller(fine,MAP),far=smaller(medium,MAP>>1);
  return {fine,medium,far,micro};
}

// Each cloud is a small world-space group. The same ellipsoids cast its shadow below.
export function weatherField(){
  const random=random32(19263),banks=[];
  const shadow=new Uint8Array(256*256),ceiling=new Uint8Array(256*256),base=new Uint8Array(256*256);
  const stamp=(l,x,z,rx,rz,shade)=>{
    const unit=1<<WEATHER_SHIFT;
    for(let j=Math.floor((z-rz)/unit);j<=(z+rz)/unit;j++)for(let i=Math.floor((x-rx)/unit);i<=(x+rx)/unit;i++){
      const u=((i+.5)*unit-x)/rx,v=((j+.5)*unit-z)/rz,k=1-u*u-v*v;
      if(k<=0)continue;
      const ix=((j&WEATHER_MASK)<<8)+(i&WEATHER_MASK);
      if(shade){shadow[ix]=Math.max(shadow[ix],Math.min(6,Math.ceil(k*7)));continue;}
      const dz=Math.sqrt(k)*l.ry,low=Math.round(l.y-dz),high=Math.round(l.y+dz);
      ceiling[ix]=Math.max(ceiling[ix],high);
      base[ix]=base[ix]?Math.min(base[ix],low):low;
    }
  };
  function bank(x,z,y,span,heading){
    const lobes=[],alongX=Math.cos(heading),alongZ=Math.sin(heading);
    function lobe(t,offset,radius,alt,vertical){
      const px=x+t*alongX-offset*alongZ,pz=z+t*alongZ+offset*alongX;
      const l={x:px,z:pz,y:y+alt,rx:radius*(.87+random()*.18),rz:radius*(.80+random()*.24),
        ry:vertical,shape:Math.floor(random()*4)};
      lobes.push(l);stamp(l,px,pz,l.rx,l.rz,false);
      stamp(l,px-l.y*.25,pz-l.y*.41,l.rx*1.30,l.rz*1.35,true);
    }
    for(let i=0;i<5;i++){
      const t=(i-2)*span*.145,envelope=1-Math.abs(i-2)*.18;
      lobe(t,(random()-.5)*span*.09,span*(.13+.035*random())*envelope,
        span*.015*envelope,span*(.083+.016*random())*envelope);
    }
    lobe((random()-.5)*span*.20,span*.073,span*.155,span*.045,span*.108);
    lobe((random()-.5)*span*.34,-span*.085,span*.130,span*.015,span*.070);
    banks.push({x,z,y,span,lobes});
  }
  // Two flanking banks give scale to the inlet while leaving a clear lane toward the sunset.
  bank(300,554,171,210,.24);bank(823,717,180,250,-.36);
  bank(361,968,161,206,.72);bank(682,185,183,126,-.35);
  for(let z=0;z<6;z++)for(let x=0;x<7;x++){
    const px=(x+.16+random()*.72)*WEATHER_PERIOD/7,pz=(z+.12+random()*.75)*WEATHER_PERIOD/6;
    if(px>160&&px<940&&pz<1030)continue;
    bank(px,pz,151+random()*44,145+random()*134,(random()-.5)*2.6);
  }
  return {banks,shadow,ceiling,base};
}

const cloudColours=[
  [113,111,133],[130,123,141],[148,132,146],[168,144,152],[187,154,155],
  [203,162,154],[222,174,154],[234,186,156],[245,201,164],[250,216,177],[253,227,190]
];
export const CLOUD_CELL=52;
export function cloudSprites(){
  const canvas=document.createElement('canvas'),s=CLOUD_CELL;
  canvas.width=s*4;canvas.height=s*4;
  const ctx=canvas.getContext('2d'),image=ctx.createImageData(canvas.width,canvas.height),bytes=image.data;
  for(let view=0;view<4;view++)for(let shape=0;shape<4;shape++){
    const elevation=(view-1)*.42,phase=shape*2.1+.53;
    for(let z=0;z<s;z++)for(let x=0;x<s;x++){
      const u=(x+.5-s/2)/(s*.483),v=(z+.5-s/2)/(s*.469),a=Math.atan2(v,u);
      const edge=.93+.045*Math.sin(4*a+phase)+.027*Math.sin(7*a+phase*.59)+.014*Math.cos(a*12+phase);
      const d=(u*u+v*v)/(edge*edge);
      if(d>1)continue;
      const nz=Math.sqrt(1-d),up=-v*Math.cos(elevation)+nz*Math.sin(elevation);
      const tu=u*.94+phase*.13,tv=v;
      const tufts=.075*Math.sin(9*tu+2*tv+phase)*Math.cos(8*tv-3*tu)+.042*Math.cos(20*tu-12*tv);
      const light=.48+.41*up+.24*u+.12*nz+tufts;
      const tone=clamp(Math.floor(light*10.5),0,10),rgb=cloudColours[tone];
      const i=(((z+view*s)*canvas.width+x+shape*s)<<2);
      bytes[i]=rgb[0];bytes[i+1]=rgb[1];bytes[i+2]=rgb[2];bytes[i+3]=255;
    }
  }
  ctx.putImageData(image,0,0);return canvas;
}

// Tiny face-lit stones and wind-cropped plants share the coastline sprite sheet's foot anchor.
export function groundSprites(){
  const canvas=document.createElement('canvas');canvas.width=4*32;canvas.height=32;
  const c=canvas.getContext('2d');
  const poly=(colour,pts)=>{c.fillStyle=colour;c.beginPath();c.moveTo(pts[0],pts[1]);for(let i=2;i<pts.length;i+=2)c.lineTo(pts[i],pts[i+1]);c.closePath();c.fill();};
  for(let k=0;k<4;k++){
    c.save();c.translate(k*32,0);c.fillStyle='rgba(57,57,61,.43)';c.fillRect(2,28,23,2);
    if(k<2){
      const warm=k===1,edge=warm?'#8e7064':'#59636a',shade=warm?'#735c56':'#49545e',lit=warm?'#c29776':'#9c9a90';
      poly(edge,[2,27,5,21,10,20,14,12,22,11,26,16,29,25,23,29,9,30]);
      poly(shade,[2,27,5,21,12,22,17,15,17,22,22,29,9,30]);
      poly(lit,[11,20,15,13,22,11,26,16,20,16,17,20]);
      poly(warm?'#a98269':'#788786',[18,22,21,17,26,16,30,25,22,28]);
      c.fillStyle=warm?'#d7aa80':'#b7ad96';c.fillRect(17,13,5,1);c.fillRect(6,22,4,1);
      c.fillStyle=edge;c.fillRect(0,29,4,2);c.fillRect(27,28,4,2);
    }else{
      poly('#52584a',[4,26,5,22,9,21,6,15,13,21,12,11,17,19,21,10,21,17,26,14,24,21,29,19,27,26,18,30,9,29]);
      poly(k===2?'#778568':'#978966',[7,20,11,20,14,24,13,15,17,21,21,14,20,21,25,17,21,25,13,27]);
      poly(k===2?'#9fa57c':'#c2a278',[18,21,22,14,21,20,27,18,22,23]);
      c.fillStyle='#757763';c.fillRect(3,28,4,1);c.fillRect(21,27,6,1);
    }
    c.restore();
  }
  return canvas;
}
