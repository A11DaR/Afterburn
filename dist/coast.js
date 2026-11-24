import {clamp,cameraAxes} from './geometry.js';
import {cloudSprites,groundSprites,random32,CLOUD_CELL,WEATHER_PERIOD,WEATHER_SHIFT,WEATHER_MASK,windX,windZ} from './coastal-art.js';

const period=1024;
const wrap=(x,size)=>x-Math.round(x/size)*size;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};

function axes(cam){
  return {sn:Math.sin(cam.yaw),cs:Math.cos(cam.yaw),rollY:Math.sin(cam.bank),...cameraAxes(cam)};
}
function depthAt(view,dx,dy,dz){return dx*view.forward.x+dy*view.forward.y+dz*view.forward.z;}
function projected(cam,v,view,x,z,alt,depth){
  const dx=x-cam.x,dy=alt-cam.alt,dz=z-cam.z,scale=v.f/depth;
  return {x:v.cx+(dx*view.right.x+dy*view.right.y+dz*view.right.z)*scale,
    y:v.cy-(dx*view.up.x+dy*view.up.y+dz*view.up.z)*scale};
}

function nearField(range){return {range,bins:Array.from({length:256},()=>[])};}
function fileProp(field,prop){
  prop.x=(prop.x%period+period)%period;prop.z=(prop.z%period+period)%period;
  field.bins[((prop.z>>6)<<4)+(prop.x>>6)].push(prop);
}

// The voxel renderer records the skyline at several distances. A high cloud can now
// cover distant land while a nearer canyon wall can still pass in front of it.
function cloudClip(c,v,depth,x0,x1,top,bottom){
  const masks=v.occluders;if(!masks||depth<masks[0].range)return true;
  let i=0;while(i+1<masks.length&&masks[i+1].range<=depth)i++;
  const columns=masks[i].columns,left=clamp(Math.floor(x0)-2,0,v.w-1),right=clamp(Math.ceil(x1)+2,left,v.w-1);
  const stride=4;let min=v.h,max=0;
  for(let x=left;x<=right;x+=stride){min=Math.min(min,columns[x]);max=Math.max(max,columns[x]);}
  min=Math.min(min,columns[right]);max=Math.max(max,columns[right]);
  if(top>max+2)return false;
  if(bottom<=min-1)return true;
  c.beginPath();c.moveTo(left,0);c.lineTo(right,0);c.lineTo(right,columns[right]+.5);
  for(let x=right;x>left;x-=stride)c.lineTo(x,columns[x]+.5);
  c.lineTo(left,columns[left]+.5);c.closePath();c.clip();return true;
}

export class Coast {
  constructor(art,scenery){
    this.art=art;this.scenery=scenery;this.cloudArt=cloudSprites();this.smallArt=groundSprites();
    this.fields=[nearField(420),nearField(228)];this.vessels=[{x:577,z:260,course:.21},{x:515,z:735,course:2.82}];
    const random=random32(691);
    const place=(field,x,z,kind,size,extra={})=>fileProp(field,{x,z,kind,size,alt:scenery.heightAt(x,z),...extra});
    place(this.fields[0],612,425,0,20);place(this.fields[0],476,789,0,14);
    for(let grove=0;grove<125;grove++){
      const x=random()*period,z=random()*period;
      for(let i=0;i<5;i++){
        const tx=x+(random()-.5)*24,tz=z+(random()-.5)*21,h=scenery.heightAt(tx,tz);
        if(h>14&&h<124&&Math.abs(scenery.heightAt(tx+3,tz)-h)<5)
          place(this.fields[0],tx,tz,2+Math.floor(random()*3),8+random()*7);
      }
    }
    const scatter=(x,z)=>{
      for(let n=0;n<3;n++){
        const tx=x+(random()-.5)*14,tz=z+(random()-.5)*12,h=scenery.heightAt(tx,tz);
        if(h<1.4||h>143)continue;
        const steep=Math.abs(scenery.heightAt(tx+2,tz)-scenery.heightAt(tx-2,tz))+
          Math.abs(scenery.heightAt(tx,tz+2)-scenery.heightAt(tx,tz-2));
        if(steep>6.8)continue;
        const rock=h<28||steep>2.4||random()>.56;
        const kind=rock?(random()>.48?6:5):(random()>.60?8:7);
        place(this.fields[1],tx,tz,kind,rock?3+random()*5.3:2.3+random()*3.5);
      }
    };
    for(let i=0;i<490;i++)scatter(random()*period,random()*period);
    for(const [x,z] of [[551,150],[548,168],[601,429],[613,405],[472,765]])scatter(x,z);
    // Occasional larger anchored crests sit above the finer colour in the water map.
    for(let z=0;z<period;z+=32)for(let x=0;x<period;x+=32){
      if(random()>.60)continue;
      const px=x+5+random()*22,pz=z+5+random()*22,length=6+random()*9;
      if(scenery.heightAt(px,pz)>.12||scenery.heightAt(px-length*.56,pz+1)>.22||scenery.heightAt(px+length*.56,pz+2)>.22)continue;
      place(this.fields[1],px,pz,9,length,{heading:(random()-.5)*.46,phase:random()*6.28});
    }
  }

  sky(c,cam,v,clock){
    const view=axes(cam),draw=[],driftX=clock*windX,driftZ=clock*windZ;
    for(const bank of this.scenery.weather.banks){
      const dx=wrap(bank.x+driftX-cam.x,WEATHER_PERIOD),dz=wrap(bank.z+driftZ-cam.z,WEATHER_PERIOD);
      const forward=depthAt(view,dx,180-cam.alt,dz);
      const distance=Math.hypot(dx,dz);
      if(forward<-bank.span*.47||distance>1120)continue;
      const puffs=[];let x0=v.w,x1=0,y0=v.h,y1=0;
      for(const l of bank.lobes){
        const x=cam.x+dx+(l.x-bank.x),z=cam.z+dz+(l.z-bank.z);
        const depth=depthAt(view,x-cam.x,l.y-cam.alt,z-cam.z);
        if(depth<Math.max(10,l.rx*.28))continue;
        if(!v.occluders&&!this.visible(cam,{x,z,alt:l.y},l.ry*.5,Math.hypot(x-cam.x,z-cam.z)))continue;
        const p=projected(cam,v,view,x,z,l.y,depth),scale=v.f/depth;
        const rightRadius=Math.hypot(view.cs*l.rx,view.sn*l.rz),alongRadius=Math.hypot(view.sn*l.rx,view.cs*l.rz);
        const slope=(cam.alt-l.y)/depth;
        const w=rightRadius*scale*2.22,h=Math.hypot(l.ry,slope*alongRadius)*scale*2.17;
        const left=p.x-w/2,top=p.y-h/2;
        if(left>v.w||left+w<0||top>v.h||top+h<0)continue;
        x0=Math.min(x0,left);x1=Math.max(x1,left+w);y0=Math.min(y0,top);y1=Math.max(y1,top+h);
        puffs.push({left,top,w,h,depth,slope,shape:l.shape});
      }
      if(puffs.length)draw.push({puffs,x0,x1,y0,y1,forward,span:bank.span,distance});
    }
    draw.sort((a,b)=>b.forward-a.forward);
    for(const b of draw){
      c.save();
      if(cloudClip(c,v,b.forward-b.span*.20,b.x0,b.x1,b.y0,b.y1)){
        b.puffs.sort((a,z)=>z.depth-a.depth);
        const haze=(1-.49*smooth(180,950,b.distance))*(1-smooth(900,1120,b.distance));
        for(const p of b.puffs){
          const row=clamp(Math.round(Math.atan(p.slope)/.42)+1,0,3);
          c.save();c.globalAlpha*=haze*(.18+.80*smooth(18,83,p.depth));
          c.translate(p.left+p.w/2,p.top+p.h/2);c.rotate(-cam.bank);
          c.drawImage(this.cloudArt,p.shape*CLOUD_CELL,row*CLOUD_CELL,CLOUD_CELL,CLOUD_CELL,
            Math.round(-p.w/2),Math.round(-p.h/2),Math.max(1,Math.round(p.w)),Math.max(1,Math.round(p.h)));c.restore();
        }
      }
      c.restore();
    }
  }

  cloudBetween(cam,x,z,alt,clock){
    if(Math.max(cam.alt,alt)<134||Math.min(cam.alt,alt)>228)return false;
    const {ceiling,base}=this.scenery.weather;
    for(let i=1;i<=5;i++){
      const t=i/6,y=cam.alt+(alt-cam.alt)*t;if(y<127||y>231)continue;
      const xx=(Math.floor(cam.x+(x-cam.x)*t-clock*windX)>>WEATHER_SHIFT)&WEATHER_MASK;
      const zz=(Math.floor(cam.z+(z-cam.z)*t-clock*windZ)>>WEATHER_SHIFT)&WEATHER_MASK;
      const id=(zz<<8)+xx;
      if(ceiling[id]&&y>base[id]+3&&y<ceiling[id]-3)return true;
    }
    return false;
  }

  surface(c,cam,v,clock){
    const draw=[],view=axes(cam);
    const add=(prop,x,z,range)=>{
      const dx=x-cam.x,dz=z-cam.z,sea=prop.kind===9,alt=prop.alt+(sea ? .24 : .1);
      const depth=depthAt(view,dx,alt-cam.alt,dz);
      if(depth<2.8||depth>range||dx*dx+dz*dz>range*range)return;
      const scale=v.f/depth;
      const size=prop.size*scale;if(size<(sea?4:2))return;
      const p=projected(cam,v,view,x,z,alt,depth);
      if(p.x<-size||p.x>v.w+size||p.y<-size||p.y>v.h+size*1.35)return;
      const dist=Math.hypot(dx,dz);
      if(!this.visible(cam,{x,z,alt},sea?.2:prop.size*.45,dist)||this.cloudBetween(cam,x,z,alt,clock))return;
      draw.push({prop,x,z,depth,size,p,range,dist});
    };
    for(const field of this.fields){
      const radius=field.range;
      for(let gz=Math.floor((cam.z-radius)/64);gz<=Math.floor((cam.z+radius)/64);gz++){
        const zbase=Math.floor(gz/16)*period;
        for(let gx=Math.floor((cam.x-radius)/64);gx<=Math.floor((cam.x+radius)/64);gx++){
          const xbase=Math.floor(gx/16)*period,bin=field.bins[((gz&15)<<4)+(gx&15)];
          for(const prop of bin)add(prop,xbase+prop.x,zbase+prop.z,radius);
        }
      }
    }
    for(let i=0;i<this.vessels.length;i++){
      const boat=this.vessels[i],phase=clock*.016+i;
      const x=cam.x+wrap(boat.x+Math.sin(phase)*15-cam.x,period),z=cam.z+wrap(boat.z+Math.sin(phase*.8)*47-cam.z,period);
      if(this.scenery.heightAt(x,z)<.6)add({kind:1,size:17,course:boat.course,alt:.35},x,z,420);
    }
    draw.sort((a,b)=>b.depth-a.depth);
    for(const item of draw){
      const {prop,x,z,p,size,dist,range}=item;
      c.save();
      if(prop.kind===9){
        this.crest(c,cam,v,view,item,clock);
      }else{
        if(prop.kind===1)this.wake(c,cam,v,view,x,z,prop.course);
        c.translate(Math.round(p.x),Math.round(p.y));c.rotate(-cam.bank);
        c.globalAlpha=(1-.38*smooth(80,range,dist))*(1-smooth(range*.85,range,dist));
        if(prop.kind>=5){
          c.drawImage(this.smallArt,(prop.kind-5)*32,0,32,32,-size*.68,-size,size*1.36,size);
        }else{
          const w=size*.8;
          if(prop.kind===1&&Math.cos(cam.yaw-prop.course)<0)c.scale(-1,1);
          c.drawImage(this.art.coast,prop.kind*64,0,64,80,-w/2,-size,w,size);
          if(prop.kind===0){
            c.globalAlpha*=.25+.5*(.5+.5*Math.cos(clock*1.46))**6;
            c.fillStyle='#ffe5a8';c.fillRect(-w*.15,-size*.82,w*.30,Math.max(1,size*.014));
          }
        }
      }
      c.restore();
    }
  }

  crest(c,cam,v,view,item,clock){
    const {prop,x,z,dist,range}=item;
    const sx=Math.cos(prop.heading),sz=Math.sin(prop.heading),sway=Math.sin(clock*.32+prop.phase)*.55;
    const half=prop.size*.50;
    const at=(t,offset)=>{
      const bow=prop.size*(.11*t*t+.04*t)+offset+sway;
      const xx=x+t*half*sx-bow*sz,zz=z+t*half*sz+bow*sx;
      const depth=depthAt(view,xx-cam.x,.32-cam.alt,zz-cam.z);
      return depth>1.5?projected(cam,v,view,xx,zz,.32,depth):null;
    };
    const ribbon=(lo,hi,offset,thickness)=>{
      const a=at(lo,offset),b=at((lo+hi)*.5,offset-.10),d=at(hi,offset),e=at((lo+hi)*.5,offset+thickness);
      if(!a||!b||!d||!e)return;
      c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.lineTo(d.x,d.y);c.lineTo(e.x,e.y);c.closePath();c.fill();
    };
    const fade=1-smooth(range*.64,range,dist);
    c.globalAlpha=.61*fade;c.fillStyle='#416c75';ribbon(-1,.70,1.0,1.0);
    c.globalAlpha=.78*fade;c.fillStyle='#b6c9b7';ribbon(-.90,.12,0,.74);ribbon(.24,.94,.12,.54);
  }

  wake(c,cam,v,view,x,z,course){
    const fx=Math.sin(course),fz=Math.cos(course);
    for(const side of [-1,1]){
      c.beginPath();let points=0;
      for(const [aft,spread] of [[3,.9],[9,2.2],[15,3.6],[22,5.4]]){
        const xx=x-fx*aft+fz*spread*side,zz=z-fz*aft-fx*spread*side;
        const d=depthAt(view,xx-cam.x,.16-cam.alt,zz-cam.z);if(d<2)continue;
        const p=projected(cam,v,view,xx,zz,.16,d);
        if(points++)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y);
      }
      c.strokeStyle='rgba(190,208,193,.67)';c.lineWidth=1;c.stroke();
    }
  }

  visible(cam,world,height,distance){
    const n=Math.ceil(distance/21);
    for(let i=1;i<n;i++){
      const t=i/n,x=cam.x+(world.x-cam.x)*t,z=cam.z+(world.z-cam.z)*t;
      if(this.scenery.heightAt(x,z)>cam.alt+(world.alt+height-cam.alt)*t+.75)return false;
    }
    return true;
  }
}
