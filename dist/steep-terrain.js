import {cameraAxes,clamp} from './geometry.js';
import {WEATHER_SHIFT,WEATHER_MASK,windX,windZ} from './coastal-art.js';

const SIZE=1024,MASK=SIZE-1,CELL=16,CELLS=SIZE/CELL,FAR=1480;
const panoramaScale=4096/(2*Math.PI),skyTop=0xff50382d,skyBottom=0xff958ba4;

export function terrainBounds(heights){
  const tops=new Uint8Array(CELLS*CELLS);let ceiling=0;
  for(let z=0;z<SIZE;z+=CELL)for(let x=0;x<SIZE;x+=CELL){
    let top=0;
    // Include shared edges because terrain height is bilinearly interpolated.
    for(let j=0;j<=CELL;j++)for(let i=0;i<=CELL;i++){
      top=Math.max(top,heights[(((z+j)&MASK)<<10)+((x+i)&MASK)]);
    }
    tops[(z/CELL)*CELLS+x/CELL]=top;ceiling=Math.max(top,ceiling);
  }
  return {tops,ceiling};
}

// Return camera-forward depth. Skip a whole terrain tile whenever the ray clears its highest point.
export function traceTerrain(scene,cam,dx,dy,dz,limit=FAR){
  const {tops,ceiling}=scene.bounds;
  if(dy>=0 && cam.alt>ceiling)return Infinity;
  let t=1;
  if(dy<-.0001 && cam.alt>ceiling)t=Math.max(t,(ceiling-cam.alt)/dy);
  if(dy>.0001)limit=Math.min(limit,(ceiling-cam.alt)/dy);
  const sea=dy<0?-cam.alt/dy:Infinity;
  limit=Math.min(limit,sea);
  const tx=cam.x+dx*t,tz=cam.z+dz*t;
  let gx=Math.floor(tx/CELL),gz=Math.floor(tz/CELL);
  const sx=dx<0?-1:1,sz=dz<0?-1:1;
  const strideX=Math.abs(dx)>.00001?CELL/Math.abs(dx):Infinity;
  const strideZ=Math.abs(dz)>.00001?CELL/Math.abs(dz):Infinity;
  let endX=Number.isFinite(strideX)?((gx+(sx>0?1:0))*CELL-cam.x)/dx:Infinity;
  let endZ=Number.isFinite(strideZ)?((gz+(sz>0?1:0))*CELL-cam.z)/dz:Infinity;
  const stride=1.7/Math.max(.25,Math.abs(dx),Math.abs(dz));
  while(t<=limit){
    const end=Math.min(endX,endZ,limit),top=tops[(gz&63)*CELLS+(gx&63)];
    if(top && cam.alt+dy*(dy>0?t:end)<=top+.01){
      let before=t;
      for(let s=t;;s=Math.min(end,s+stride)){
        if(cam.alt+dy*s<=scene.heightAt(cam.x+dx*s,cam.z+dz*s)){
          let near=before,far=s;
          for(let i=0;i<3;i++){
            const mid=(near+far)*.5;
            if(cam.alt+dy*mid>scene.heightAt(cam.x+dx*mid,cam.z+dz*mid))near=mid;else far=mid;
          }
          return far;
        }
        if(s>=end)break;
        before=s;
      }
    }
    if(end>=limit)break;
    if(endX<=end){gx+=sx;endX+=strideX;}
    if(endZ<=end){gz+=sz;endZ+=strideZ;}
    t=end;
  }
  return sea>=1&&sea<=limit?sea:Infinity;
}

export class SteepTerrain{
  constructor(scene){
    this.scene=scene;scene.bounds=terrainBounds(scene.art.heights);
    const sky=scene.art.horizon,buffer=document.createElement('canvas');
    buffer.width=sky.width;buffer.height=sky.height;
    const ctx=buffer.getContext('2d',{willReadFrequently:true});ctx.drawImage(sky,0,0);
    this.sky=new Uint32Array(ctx.getImageData(0,0,sky.width,sky.height).data.buffer);
    this.skyHeight=sky.height;
    this.canvas=document.createElement('canvas');this.ctx=this.canvas.getContext('2d',{alpha:false});
    this.clock=-Infinity;
  }
  paint(cam,v,time){
    const w=Math.ceil(v.w/3),h=Math.ceil(v.h/3),field=this.scene;
    if(this.canvas.width!==w||this.canvas.height!==h||!this.image){
      this.canvas.width=w;this.canvas.height=h;this.image=this.ctx.createImageData(w,h);
      this.colors=new Uint32Array(this.image.data.buffer);
    }
    const {forward,right,up}=cameraAxes(cam);
    const u0=(v.w/(2*w)-v.cx)/v.f,du=v.w/(w*v.f),ax=right.x*du,ay=right.y*du,az=right.z*du;
    const driftX=time*windX,driftZ=time*windZ,fog=field.shadedFog,maps=field.paintMap;
    const aerial=Math.floor(clamp((cam.alt-110)/200,0,3));
    for(let row=0,k=0;row<h;row++){
      const b=(v.cy-(row+.5)*v.h/h)/v.f;
      let dx=forward.x+u0*right.x+b*up.x,dy=forward.y+u0*right.y+b*up.y,dz=forward.z+u0*right.z+b*up.z;
      for(let col=0;col<w;col++,k++,dx+=ax,dy+=ay,dz+=az){
        const d=traceTerrain(field,cam,dx,dy,dz);
        if(!Number.isFinite(d)){
          const sy=Math.round(471-panoramaScale*Math.atan2(dy,Math.hypot(dx,dz)));
          if(sy<0)this.colors[k]=skyTop;
          else if(sy>=this.skyHeight)this.colors[k]=skyBottom;
          else this.colors[k]=this.sky[sy*4096+((Math.round(512+panoramaScale*Math.atan2(dx,dz)))&4095)];
          continue;
        }
        const wx=cam.x+d*dx,wz=cam.z+d*dz,x=Math.floor(wx),z=Math.floor(wz);
        const shift=d>v.f*1.44?2:d>v.f*.60?1:0,map=shift===2?maps.far:shift===1?maps.medium:maps.fine;
        let pigment=map[(((z&MASK)>>shift)<<(10-shift))+((x&MASK)>>shift)];
        if(d<v.f*.18){
          const grain=maps.micro[((Math.floor(wz*3)&255)<<8)+(Math.floor(wx*3)&255)];
          pigment=(pigment&240)+clamp((pigment&15)+grain,0,15);
        }
        const sx=(Math.floor(wx-driftX)>>WEATHER_SHIFT)&WEATHER_MASK,sz=(Math.floor(wz-driftZ)>>WEATHER_SHIFT)&WEATHER_MASK;
        const shade=field.weather.shadow[(sz<<8)+sx],haze=Math.min(31,Math.round((1-Math.exp(-d*.00155))*31)+aerial);
        this.colors[k]=fog[(shade*32+haze)*96+pigment];
      }
    }
    this.ctx.putImageData(this.image,0,0);this.clock=time;
  }
  draw(c,cam,v,time){
    if(time<this.clock||time-this.clock>=1/35||this.canvas.width!==Math.ceil(v.w/3)||this.canvas.height!==Math.ceil(v.h/3))this.paint(cam,v,time);
    c.drawImage(this.canvas,0,0,v.w,v.h);
  }
}
