// Integer pixels keep the little radar plots and their silhouettes sharp at cockpit resolution.
function line(c, points, colour) {
  c.fillStyle=colour;
  for(let i=1;i<points.length;i++){
    let [x,y]=points[i-1].map(Math.round);
    const [endX,endY]=points[i].map(Math.round);
    const dx=Math.abs(endX-x),dy=-Math.abs(endY-y);
    const sx=x<endX?1:-1,sy=y<endY?1:-1;
    let error=dx+dy;
    for(;;){
      c.fillRect(x,y,1,1);
      if(x===endX&&y===endY)break;
      const twice=2*error;
      if(twice>=dy){error+=dy;x+=sx;}
      if(twice<=dx){error+=dx;y+=sy;}
    }
  }
}

function face(c, points, colour) {
  c.fillStyle=colour;
  const rows=points.map(p=>p[1]);
  const top=Math.floor(Math.min(...rows)),bottom=Math.ceil(Math.max(...rows));
  for(let y=top;y<bottom;y++){
    const hits=[],scan=y+.5;
    for(let i=0,j=points.length-1;i<points.length;j=i++){
      const [x1,y1]=points[j],[x2,y2]=points[i];
      if((y1>scan)!==(y2>scan))hits.push(x1+(x2-x1)*(scan-y1)/(y2-y1));
    }
    hits.sort((a,b)=>a-b);
    for(let i=0;i+1<hits.length;i+=2){
      const left=Math.ceil(hits[i]-.5),right=Math.ceil(hits[i+1]-.5);
      if(right>left)c.fillRect(left,y,right-left,1);
    }
  }
}

function jet(c,x,y,heading,scale,palette){
  const co=Math.cos(heading)*scale,si=Math.sin(heading)*scale;
  const at=([u,v])=>[x+u*co-v*si,y+u*si+v*co];
  const silhouette=[[0,-12],[2,-8],[3,-3],[9,3],[10,6],[4,4],[3,7],[6,10],[6,11],[2,10],[0,9],[-2,10],[-6,11],[-6,9],[-3,6],[-4,3],[-10,6],[-9,3],[-3,-3],[-2,-8]];
  face(c,silhouette.map(at),palette[0]);
  face(c,[[0,-11],[-1,-4],[-8,4],[-1,1],[0,7],[1,1]].map(at),palette[1]);
  line(c,[[0,-6],[0,-3]].map(at),palette[2]);
  if(scale>.6)line(c,[[-2,6],[-1,8]].map(at),palette[2]);
}

function rangeArc(c,cx,cy,radius,colour){
  const points=[];
  for(let i=0;i<=42;i++){
    const a=-Math.PI+i*Math.PI/42;
    points.push([cx+radius*Math.cos(a),cy+.82*radius*Math.sin(a)]);
  }
  line(c,points,colour);
}

const amberJet=['#df9559','#ffe0a2','#624f4a'];
const iceJet=['#9eb6d0','#e1ecdf','#536780'];
const redJet=['#ce8077','#ffc098','#70455c'];

export function paintModeTile(canvas,mission){
  const c=canvas.getContext('2d');if(!c)return;
  const duel=mission==='dogfight';
  c.save();c.scale(canvas.width/82,canvas.height/46);
  c.fillStyle=duel?'#19212f':'#17282c';c.fillRect(0,0,82,46);
  c.fillStyle=duel?'#202a39':'#1b3033';
  for(let x=8;x<82;x+=12)c.fillRect(x,0,1,46);
  for(let y=8;y<46;y+=10)c.fillRect(0,y,82,1);
  if(duel){
    rangeArc(c,39,43,36,'#2c3948');rangeArc(c,39,43,20,'#2a3847');
    line(c,[[8,11],[6,15],[7,22],[13,29],[21,33],[29,34],[39,31],[46,26],[49,20]],'#92706e');
    line(c,[[29,35],[39,32],[47,27],[50,21]],'#db8e79');
    line(c,[[75,31],[78,23],[75,16],[69,10],[60,7],[48,7],[38,10],[30,17],[28,23]],'#566785');
    line(c,[[49,6],[37,9],[29,16],[27,22]],'#92a8be');
    jet(c,26,25,-2.76,.67,iceJet);
    jet(c,52,17,.48,.74,redJet);
  }else{
    rangeArc(c,17,47,24,'#2c4846');rangeArc(c,17,47,43,'#314d49');rangeArc(c,17,47,64,'#2b4545');
    face(c,[[0,36],[9,34],[17,37],[30,32],[36,34],[45,29],[50,32],[61,23],[65,26],[70,24],[82,30],[82,46],[0,46]],'#1e3436');
    line(c,[[38,33],[45,29],[50,32],[61,23],[65,26],[70,24],[81,29]],'#40534c');
    face(c,[[0,42],[8,39],[18,42],[27,38],[38,39],[48,34],[53,36],[65,31],[72,34],[82,32],[82,46],[0,46]],'#142526');
    line(c,[[4,44],[11,41],[18,36],[25,32]],'#91724e');
    line(c,[[13,42],[21,36],[26,33]],'#e39f63');
    jet(c,29,28,.68,.85,amberJet);
    jet(c,49,13,-.29,.36,iceJet);jet(c,59,9,-.29,.42,iceJet);jet(c,68,14,-.29,.34,iceJet);
    line(c,[[46,10],[46,7],[49,7]],'#758b7e');line(c,[[71,17],[71,20],[68,20]],'#758b7e');
  }
  for(const [x,y,sx,sy] of [[2,2,1,1],[79,2,-1,1],[2,43,1,-1],[79,43,-1,-1]]){
    line(c,[[x+sx*3,y],[x,y],[x,y+sy*2]],duel?'#576273':'#50645c');
  }
  c.restore();
}

const brokenOutline=[[-32,-15],[-27,-18],[38,-1],[43,-5],[45,-4],[44,12],[41,13],[40,9],[20,11],[3,16],[-27,20],[-32,18],[-29,15],[-34,13],[-30,9],[-32,7],[-28,5],[-34,2],[-31,-1],[-34,-4],[-29,-7],[-32,-10]];

export function drawWingBreak(c,v,side,age,reduced){
  const duration=1.42;
  if(age<0||age>=duration)return;
  const t=reduced ? .28 : age/duration,hand=side<0?-1:1;
  const x=v.w*(.5+hand*(.215+.31*t)),y=v.h*(.664-.69*t+.68*t*t);
  const scale=Math.min(v.w*.00215,v.h*.0041)*(1-.56*t);
  const spin=reduced ? -.32 : -.32+.55*Math.sin(t*Math.PI)+1.31*t;
  const roll=reduced ? .9 : Math.cos(.10+t*4.05),under=roll<0;
  const depth=Math.max(.09,Math.abs(roll))*(under?-1:1),co=Math.cos(spin),si=Math.sin(spin);
  const at=([u,vv])=>[x+hand*scale*(u*co-vv*depth*si),y+scale*(u*si+vv*depth*co)];
  const paint=(colour,pts)=>face(c,pts.map(at),colour);
  const stroke=(colour,pts)=>line(c,pts.map(at),colour);
  c.save();
  if(!reduced){
    c.globalAlpha*=Math.min(1,(1-t)*6);
    const rivets=[[-.10,.105,0],[-.034,.082,.1],[.064,.071,.03],[.033,.144,.05],[-.07,.047,.08]];
    for(const [dx,dy,delay] of rivets){
      const s=Math.max(0,t-delay);if(!s||s>.8)continue;
      const ax=v.w*(.5+hand*(.19+dx*s)),ay=v.h*(.66-dy*s+.27*s*s);
      const size=Math.max(1,Math.round(scale*(s<.16?1.8:1.2)));
      c.fillStyle=s<.12?'#f5bd77':'#74777a';c.fillRect(Math.round(ax),Math.round(ay),size*2,size);
    }
  }
  paint('#29353d',brokenOutline);
  paint(under?'#586268':'#899494',[[-29,-15],[-26,-16],[39,0],[40,8],[18,10],[2,14],[-26,18],[-28,16],[-26,12],[-29,9],[-26,5],[-31,2],[-28,-1],[-30,-4],[-26,-7]]);
  paint(under?'#444d52':'#637277',[[-22,9],[10,7],[38,4],[39,8],[17,10],[0,14],[-26,17]]);
  paint(under?'#6e7776':'#b5b9aa',[[-26,-16],[39,0],[36,2],[-23,-13]]);
  paint('#535e60',[[30,-2],[39,0],[40,8],[32,9]]);
  paint(under?'#b07b5c':'#e1aa76',[[32,-1],[35,0],[36,8],[33,8]]);
  stroke('#48565b',[[-22,8],[10,6],[37,3]]);stroke('#475355',[[12,7],[14,11]]);
  stroke('#525b5d',[[-11,-12],[-9,7]]);stroke('#bac2b4',[[41,-3],[43,-4],[42,10]]);
  // Roundel with short pale bars makes the separated panel identifiable as it tumbles.
  paint('#455663',[[-3,-5],[12,-4],[12,0],[-3,-1]]);
  paint(under?'#acaea5':'#e2dfc9',[[-1,-4],[2,-4],[2,-2],[-1,-2]]);
  paint(under?'#acaea5':'#e2dfc9',[[8,-3],[11,-3],[11,-1],[8,-1]]);
  paint(under?'#acaea5':'#e2dfc9',[[4,-6],[6,-4],[8,-3],[6,-2],[6,0],[4,-1],[2,-1],[3,-3],[2,-4]]);
  stroke('#d2ad86',[[-30,-10],[-27,-8],[-30,-5]]);stroke('#b79575',[[-31,2],[-27,4],[-29,7]]);
  stroke('#3a3c3c',[[-29,16],[-24,12],[-26,9]]);
  c.restore();
}
