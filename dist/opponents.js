import {TAU,clamp,angleDiff,approach,relativeTo,recordTrail} from './geometry.js';

const duelPilots=[
  {name:'Искра',brief:'Держит длинные прямые',extendAt:92,extendTime:3.0,pace:0,turn:.84,breakTime:1.5},
  {name:'Стриж',brief:'Разгоняется после виража',extendAt:86,extendTime:3.6,pace:9,turn:.96,breakTime:1.8},
  {name:'Тень',brief:'Меняет курс и сбрасывает ловушки',extendAt:62,extendTime:1.9,pace:3,turn:1.10,breakTime:2.3}
];

export function newOpponent(game,slot) {
  const duel=game.missionId==='dogfight';
  const arcade=game.profile==='arcade';
  const angle=game.yaw+(duel?(arcade?[-.14,.46,-.67]:[-.17,.78,-1.03])[game.wave]:[arcade?.145:.001,.56,2.98,-.85,-2.57][slot]);
  const distance=duel?(arcade?[225,173,145]:[133,112,96])[game.wave]:[arcade?315:225,275,176,308,227][slot];
  const x = game.x + Math.sin(angle)*distance, z = game.z + Math.cos(angle)*distance;
  const heightOffset=duel?[3,10,-6][game.wave]:[2,34,21,48,-12][slot];
  const alt=Math.max(game.heightAt(x,z)+22,game.alt+heightOffset+Math.tan(game.pitch)*distance*.8);
  const heading=duel?angle+Math.PI+(game.wave===1?-.68:.54):game.yaw+[.012,-1.37,.18,1.54,-.4][slot];
  const b = {id:game.nextId++,slot,x,z,alt,heading,pitch:slot===0?game.pitch:0,bank:0,
    speed:slot===0?38:51, side:slot%2===0?1:-1, phase:game.random()*TAU,
    state:'approach',timer:slot===0?4.2:1.4+game.random()*1.5, goalHeading:heading,
    cruiseAlt:alt, hp:100,claimed:false,occluded:false,sightIn:0, history:[],sampleIn:0,
    decoys:slot===0 && game.wave===0?0:1+(game.wave===2 && slot%2===1?1:0),
    reactAt:null, defenseWait:0, attackWait:2.5+game.random()*3.5,
    lastTurn:0, signal:0};
  b.runner=!duel&&slot===0;b.duelist=duel;
  if(duel){
    b.slot=game.wave;b.state='pursue';b.timer=2.4;b.speed=48+game.wave*4;
    b.attackWait=2.5-game.wave*.35;b.decoys=game.wave===2?2:game.wave;
    if(arcade)b.pilot=duelPilots[game.wave];
  }
  Object.assign(b,relativeTo(b,game));
  return b;
}
function changeState(b,state,timer,heading) {
  b.state=state;b.timer=timer;
  if (heading!==undefined)b.goalHeading=heading;
}
export function markIncoming(game, b) {
  if (b.defenseWait>0) return;
  b.reactAt=.28+game.random()*.24 + (b.slot===0 && game.wave===0 ? .24:0);
  
}
function chooseState(game,b) {
  if(b.range<(b.pilot?.extendAt??69) && b.state!=='extend'){
    changeState(b,'extend',(b.pilot?.extendTime??2.2)+game.random(),b.heading+b.side*.35);return;
  }
  if(b.timer>0 && b.range<515)return;
  if(b.range>470){changeState(b,'pursue',3.5);return;}
  if(b.state==='approach' || b.state==='pursue' || b.state==='extend'){
    if(b.state==='approach' && b.slot===0){changeState(b,'extend',2.6,b.heading+b.side*.82);return;}
    b.side*=-1;
    changeState(b,'flank',3.5+game.random()*2.4);return;
  }
  changeState(b,'pursue',4+game.random()*2);
}
export function flyOpponent(game,b,dt) {
  b.timer-=dt;b.attackWait-=dt;b.defenseWait=Math.max(0,b.defenseWait-dt);b.signal=Math.max(0,b.signal-dt);
  Object.assign(b,relativeTo(b,game));
  const towardsPlayer=angleDiff(b.bearing+Math.PI,0);
  if (b.reactAt!==null) {
    b.reactAt-=dt;
    if (b.reactAt<=0) {
      b.reactAt=null;
      if (b.claimed) {
        changeState(b,'evade',(b.pilot?.breakTime??1.85)+.55,b.heading+b.side*1.95);
        b.defenseWait=3;b.signal=1.15;
        if(b.decoys>0) {
          b.decoys--;game.shedPursuer(b);game.emit('botFlare',b);
        }
      }
    }
  }
  if (b.state!=='evade' || b.timer<=0){
    if(b.runner&&game.exit)b.state='egress';else chooseState(game,b);
  }
  let desired=b.goalHeading, targetAlt=b.cruiseAlt, speed=41+game.wave*2, turn=.67;
  if(b.state==='egress'&&game.exit){
    desired=Math.atan2(game.exit.x-b.x,game.exit.z-b.z)+.028*Math.sin(game.waveTime*.45);
    targetAlt=b.cruiseAlt;speed=39+game.wave*4;turn=.68;
  }else if(b.state==='pursue'){
    const followX=game.x-Math.sin(game.yaw)*96, followZ=game.z-Math.cos(game.yaw)*96;
    desired=b.range>235 || b.slot%2===0 ? towardsPlayer : Math.atan2(followX-b.x,followZ-b.z);
    targetAlt=game.alt+12+7*Math.sin(game.time*.51+b.phase);
    speed=clamp(game.speed/9+(b.range-130)*.12,32,77);turn=.84;
  }else if(b.state==='flank'){
    const cross=game.yaw+b.side*Math.PI*.5;
    const tx=game.x+Math.sin(cross)*128+Math.sin(game.yaw)*48;
    const tz=game.z+Math.cos(cross)*128+Math.cos(game.yaw)*48;
    desired=Math.atan2(tx-b.x,tz-b.z);
    targetAlt=game.alt+28+12*Math.sin(game.time*.45+b.phase);speed=56;turn=.88;
  }else if(b.state==='extend'){
    targetAlt=Math.max(game.alt+16,b.alt+3);speed=70;turn=.78;
  }else if(b.state==='evade'){
    targetAlt=b.alt+20*b.side;speed=76;turn=2.05;
  }else{
    speed=b.slot===0?38:51;desired=b.goalHeading+Math.sin(game.waveTime*.4+b.phase)*.012;
  }
  if(b.pilot){speed+=b.pilot.pace;turn*=b.pilot.turn;}
  else if(b.duelist){speed+=4+game.wave*2;turn*=1.1+game.wave*.07;}
  // Look ahead along the jet's own path. Climb before reaching the ridge.
  const sx=Math.sin(b.heading),cz=Math.cos(b.heading);
  const ahead=Math.max(game.heightAt(b.x+sx*32,b.z+cz*32),game.heightAt(b.x+sx*69,b.z+cz*69));
  const ground=game.heightAt(b.x,b.z);
  targetAlt=Math.max(targetAlt,ahead+24,ground+21);
  const delta=angleDiff(desired,b.heading);
  b.lastTurn=clamp(delta*1.6,-turn,turn);
  b.heading=angleDiff(b.heading+b.lastTurn*dt,0);
  b.bank=approach(b.bank,clamp(b.lastTurn*.93,-1.19,1.19),3.1,dt);
  if(game.profile==='arcade')speed-=clamp((Math.abs(b.bank)-.58)*18,0,11);
  b.speed=approach(b.speed,speed,1.4,dt);
  b.pitch=approach(b.pitch,clamp((targetAlt-b.alt)/76,-.54,.73),2.3,dt);
  if (ground+12>b.alt)b.pitch=Math.max(b.pitch,.48);
  const step=b.speed*dt, travel=Math.cos(b.pitch)*step;
  b.x+=Math.sin(b.heading)*travel;b.z+=Math.cos(b.heading)*travel;
  b.alt=Math.max(game.heightAt(b.x,b.z)+8,b.alt+Math.sin(b.pitch)*step);
  Object.assign(b,relativeTo(b,game));
  b.sightIn-=dt;
  if(b.sightIn<=0){b.occluded=game.terrainBetween(game,b);b.sightIn=.09;}
  recordTrail(b,dt,.105,21);
}
export function attackScore(game,b) {
  if(b.attackWait>0 || b.occluded || b.state==='evade' || b.state==='extend' || b.range<52 || b.range>490)return -Infinity;
  const towards=angleDiff(b.bearing+Math.PI,0);
  const error=Math.abs(angleDiff(towards,b.heading));
  if(error>.97 || Math.abs(b.pitch+b.elev)>.72)return -Infinity;
  return 1.5-error-Math.abs(b.range-185)*.0015+(Math.cos(b.bearing-game.yaw)<0 ? .22:0);
}
