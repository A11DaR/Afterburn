import {angleDiff,clamp} from './geometry.js';
import {surfacePaint,weatherField,WEATHER_SHIFT,WEATHER_MASK,windX,windZ} from './coastal-art.js';

const MAP=1024, MASK=MAP-1, PANO_SCALE=4096/(Math.PI*2);
const packed=(r,g,b)=>(255<<24)|(b<<16)|(g<<8)|r;
const shadowStride=32*96;
const occlusionRanges=[35,65,100,150,220,315,440,620,840,1120,1480];

function shadowPalette(fog){
  const table=new Uint32Array(shadowStride*7);
  table.set(fog.subarray(0,shadowStride));
  for(let shade=1;shade<=6;shade++)for(let level=0;level<32;level++){
    const amount=shade/6*(1-level/34);
    for(let colour=0;colour<96;colour++){
      const id=level*96+colour,p=fog[id];
      table[shade*shadowStride+id]=packed(
        Math.round((p&255)*(1-.28*amount)+5*amount),
        Math.round(((p>>>8)&255)*(1-.21*amount)+6*amount),
        Math.round(((p>>>16)&255)*(1-.13*amount)+8*amount));
    }
  }
  return table;
}
async function loadImage(path) {
  const img=new Image();img.src='art/'+path;
  await img.decode();return img;
}
export async function loadArt() {
  const [heightData,horizon,panel,jets,aft,weather,coast,palette]=await Promise.all([
    loadImage('terrain.png'),loadImage('horizon.png'),loadImage('cockpit.png'),loadImage('bandits.png'),loadImage('aft.png'),loadImage('weather.png'),loadImage('coast.png'),
    fetch('art/palette.json').then(r=>{if(!r.ok)throw new Error('palette');return r.json();})
  ]);
  const raw=document.createElement('canvas');raw.width=MAP;raw.height=MAP;
  const ctx=raw.getContext('2d',{willReadFrequently:true});ctx.drawImage(heightData,0,0);
  const pixels=ctx.getImageData(0,0,MAP,MAP).data;
  const heights=new Uint8Array(MAP*MAP), terrain=new Uint8Array(MAP*MAP), ripple=new Uint8Array(MAP*MAP);
  for(let i=0,p=0;i<heights.length;i++,p+=4){heights[i]=pixels[p];terrain[i]=pixels[p+1];ripple[i]=pixels[p+2];}
  for(let i=0;i<16;i++) {
    const k=i/15;palette.push([144+Math.round(k*90),137+Math.round(k*43),141+Math.round(k*3)]);
  }
  const fog=new Uint32Array(32*96);
  for(let level=0;level<32;level++){
    const t=level/31*.93;
    palette.forEach(([r,g,b],id)=>fog[level*96+id]=packed(
      Math.round(r*(1-t)+181*t),Math.round(g*(1-t)+143*t),Math.round(b*(1-t)+151*t)));
  }
  return {heights,terrain,ripple,fog,horizon,panel,jets,aft,weather,coast};
}

export class Scenery {
  constructor(art) {
    this.art=art;
    this.land=document.createElement('canvas');
    this.ctx=this.land.getContext('2d',{willReadFrequently:true});
    this.world=document.createElement('canvas');
    this.wc=this.world.getContext('2d',{alpha:false,willReadFrequently:true});
    this.paintMap=surfacePaint(art.terrain,art.ripple);
    this.weather=weatherField();this.shadedFog=shadowPalette(art.fog);
    this.lastPaint=-Infinity;
    this.samples=[];
    for(let z=1.8;z<1480;z+=.80+z*.0158) this.samples.push({z,fog:Math.round((1-Math.exp(-z*.00155))*31)});
  }
  heightAt(x,z){
    const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz,h=this.art.heights;
    const col=ix&MASK,next=(ix+1)&MASK,row=(iz&MASK)<<10,forward=((iz+1)&MASK)<<10;
    const a=h[row+col]+(h[row+next]-h[row+col])*fx;
    const b=h[forward+col]+(h[forward+next]-h[forward+col])*fx;
    return a+(b-a)*fz;
  }
  resize(v) {
    const radius=Math.ceil(Math.hypot(Math.max(v.cx,v.w-v.cx),Math.max(v.cy,v.h-v.cy)))+3;
    this.padX=Math.ceil(radius-Math.min(v.cx,v.w-v.cx));this.padY=Math.ceil(radius-Math.min(v.cy,v.h-v.cy));
    const w=v.w+this.padX*2,h=v.h+this.padY*2;
    this.world.width=this.land.width=w;this.world.height=this.land.height=h;
    this.wc.imageSmoothingEnabled=false;this.ctx.imageSmoothingEnabled=false;
    this.data=this.ctx.createImageData(w,h);this.columns=new Int16Array(w);
    this.occluders=occlusionRanges.map(range=>({range,columns:new Int16Array(w)}));
    this.colors=new Uint32Array(this.data.data.buffer);this.lastPaint=-Infinity;
  }
  paint(cam,v,clock) {
    const w=this.world.width,h=this.world.height,cx=v.cx+this.padX,cy=v.cy+this.padY;
    const horizon=cy+v.f*Math.tan(cam.pitch), sky=this.art.horizon, c=this.wc;
    const scale=v.f/PANO_SCALE, imageWidth=sky.width*scale;
    let skyLeft=cx-(512+cam.yaw*PANO_SCALE)*scale;
    skyLeft=((skyLeft%imageWidth)+imageWidth)%imageWidth-imageWidth;
    const skyTop=horizon-471*scale;
    c.fillStyle='#2d3850';c.fillRect(0,0,w,h);
    c.fillStyle='#a48b95';c.fillRect(0,Math.round(horizon),w,h);
    for(let x=skyLeft;x<w;x+=imageWidth) {
      const from=Math.max(0,Math.floor(x)),to=Math.min(w,Math.ceil(x+imageWidth));
      if(to>from)c.drawImage(sky,(from-x)/scale,0,(to-from)/scale,sky.height,from,Math.round(skyTop),to-from,Math.ceil(sky.height*scale));
    }
    if(cam.alt>160){
      c.fillStyle='rgba(55,77,115,'+Math.min(.115,(cam.alt-160)*.00025)+')';c.fillRect(0,0,w,h);
    }
    this.colors.fill(0);this.columns.fill(h);
    const {heights}=this.art,{fine,medium,far,micro}=this.paintMap;
    const fog=this.shadedFog,shadow=this.weather.shadow;
    const left=-cx/v.f, sn=Math.sin(cam.yaw),cs=Math.cos(cam.yaw);
    const xStart=sn+left*cs, zStart=cs-left*sn;
    const sunAngle=angleDiff((729-512)/PANO_SCALE,cam.yaw),sunVisible=Math.abs(sunAngle)<1.12;
    const sunX=cx+Math.tan(sunAngle)*v.f, rayWidth=v.f*.125;
    const driftX=clock*windX,driftZ=clock*windZ;
    const aerial=Math.floor(clamp((cam.alt-110)/200,0,3));
    const columns=this.columns,colors=this.colors;
    let occluder=0;
    for(const layer of this.samples) {
      const d=layer.z, projected=v.f/d, dx=d*cs/v.f,dz=-d*sn/v.f;
      if(occluder<this.occluders.length&&d>=this.occluders[occluder].range)this.occluders[occluder++].columns.set(columns);
      const shift=d>v.f*1.44?2:d>v.f*.60?1:0,map=shift===2?far:shift===1?medium:fine;
      const rowShift=10-shift,levelFog=Math.min(31,layer.fog+aerial)*96,close=d<v.f*.18;
      let wx=cam.x+d*xStart, wz=cam.z+d*zStart;
      for(let x=0;x<w;x++,wx+=dx,wz+=dz) {
        const ix=Math.floor(wx),iz=Math.floor(wz),row=(iz&MASK)<<10,col=ix&MASK;
        const index=row+col,base=heights[index];
        let level=base;
        if(base>0 && d<640){
          const fx=wx-ix,fz=wz-iz,right=(ix+1)&MASK,forward=((iz+1)&MASK)<<10;
          const top=base+(heights[row+right]-base)*fx;
          const lower=heights[forward+col]+(heights[forward+right]-heights[forward+col])*fx;
          level=top+(lower-top)*fz;
        }
        let y=(horizon+(cam.alt-level)*projected)|0;
        const old=columns[x];
        if(y>=old)continue;
        if(y<0)y=0;
        let colour=map[(((iz&MASK)>>shift)<<rowShift)+(col>>shift)];
        if(close){
          const grit=micro[((Math.floor(wz*3)&255)<<8)+(Math.floor(wx*3)&255)];
          if(grit)colour=(colour&240)+Math.max(0,Math.min(15,(colour&15)+grit));
        }
        if(colour>=73&&colour<79&&sunVisible) {
          const distance=Math.abs(x-sunX);
          if(distance<rayWidth && colour-64>8+distance/rayWidth*5.5)
            colour=80+Math.min(15,Math.max(0,colour-64));
        }
        const weatherX=(Math.floor(wx-driftX)>>WEATHER_SHIFT)&WEATHER_MASK;
        const weatherZ=(Math.floor(wz-driftZ)>>WEATHER_SHIFT)&WEATHER_MASK;
        const pixelColour=fog[shadow[(weatherZ<<8)+weatherX]*shadowStride+levelFog+colour];
        for(let pix=y*w+x,end=old*w+x;pix<end;pix+=w)colors[pix]=pixelColour;
        columns[x]=y;
      }
    }
    while(occluder<this.occluders.length)this.occluders[occluder++].columns.set(columns);
    this.ctx.putImageData(this.data,0,0);
    c.drawImage(this.land,0,0);
    if(this.cloudLayer)this.cloudLayer(c,{...cam,bank:0},{...v,w,h,cx,cy,occluders:this.occluders},clock);
  }
  draw(c,cam,v,clock) {
    if(clock-this.lastPaint>=1/35 || clock<this.lastPaint || Math.abs(angleDiff(cam.yaw,this.lastYaw??cam.yaw))>.26) {
      this.paint(cam,v,clock);this.lastPaint=clock;this.lastYaw=cam.yaw;
    }
    c.save();c.translate(Math.round(v.cx),Math.round(v.cy));c.rotate(-cam.bank);
    c.drawImage(this.world,Math.round(-v.cx-this.padX),Math.round(-v.cy-this.padY));c.restore();
  }
}
