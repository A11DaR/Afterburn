const pixelIcons={
  emblem(c){
    const p=(pts,col)=>{c.fillStyle=col;c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();};
    p([[0,3],[15,5],[22,12],[29,5],[45,3],[41,8],[32,9],[22,21],[12,9],[4,8]],'#ffac65');
    p([[3,11],[12,12],[18,19],[14,18],[9,15],[6,15]],'#d68954');
    p([[42,11],[33,12],[27,19],[31,18],[36,15],[39,15]],'#d68954');
    p([[19,8],[22,4],[25,8],[22,11]],'#ffc084');
  },
  play(c){c.fillStyle='#2e2419';c.beginPath();c.moveTo(2,1);c.lineTo(11,6);c.lineTo(2,11);c.fill();},
  camera(c,external){
    c.fillStyle=external?'#ffc28d':'#c4cfca';
    for(const [x,y,w,h] of [[5,2,5,2],[1,4,14,2],[1,6,2,7],[13,6,2,7],[2,12,12,2],[6,6,4,1],[5,7,1,3],[10,7,1,3],[6,10,4,1]])c.fillRect(x,y,w,h);
  },
  sound(c,off){
    c.fillStyle=off?'#95a1a0':'#c4d1c9';c.fillRect(1,6,4,5);
    c.beginPath();c.moveTo(4,6);c.lineTo(9,2);c.lineTo(9,14);c.lineTo(4,10);c.fill();
    const px=(x,y)=>c.fillRect(x,y,1,1);
    if(off){[[11,6],[12,7],[13,8],[14,9],[11,9],[12,8],[13,7],[14,6]].forEach(([x,y])=>px(x,y));}
    else {c.fillRect(11,6,1,5);c.fillRect(14,5,1,7);[[10,5],[10,11],[13,4],[13,12]].forEach(([x,y])=>px(x,y));}
  },
  music(c,off){
    c.fillStyle=off?'#84918d':'#c4d1c9';
    for(const [x,y,w,h] of [[5,3,2,9],[7,3,6,2],[12,3,2,8],[2,11,5,3],[1,12,4,2],[9,10,5,3]])c.fillRect(x,y,w,h);
    if(off){c.fillStyle='#102020';for(let i=1;i<15;i++)c.fillRect(i,14-i,2,2);c.fillStyle='#b19b90';for(let i=1;i<15;i++)c.fillRect(i,15-i,1,1);}
  },
  full(c){c.fillStyle='#c4cfca';for(const [x,y,sx,sy] of [[2,2,1,1],[14,2,-1,1],[2,14,1,-1],[14,14,-1,-1]]){c.fillRect(sx>0?x:x-4,y,5,1);c.fillRect(x,sy>0?y:y-4,1,5);}},
  pause(c){c.fillStyle='#c4cfca';c.fillRect(4,3,3,10);c.fillRect(10,3,3,10);},
  hull(c){
    c.strokeStyle='#b3c799';c.lineWidth=1.3;
    c.beginPath();[[14,1],[16,5],[16,9],[27,15],[27,17],[17,14],[16,17],[19,20],[15,19],[14,21],[13,19],[9,20],[12,17],[11,14],[1,17],[1,15],[12,9],[12,5],[14,1]].forEach(([x,y],i)=>i?c.lineTo(x+.5,y+.5):c.moveTo(x+.5,y+.5));c.stroke();
  },
  missile(c){
    c.strokeStyle='#dbb590';c.lineWidth=1.3;c.beginPath();
    [[3,18],[7,11],[10,12],[17,6],[19,2],[23,2],[22,6],[19,10],[15,14],[15,17],[10,20],[10,16],[6,18],[3,18]].forEach(([x,y],i)=>i?c.lineTo(x+.5,y+.5):c.moveTo(x+.5,y+.5));c.stroke();c.fillStyle='#dbb590';c.fillRect(1,20,3,1);
  },
  rounds(c){
    for(const x of [5,12,19]){c.fillStyle='#c6b898';c.fillRect(x,8,4,10);c.fillRect(x+1,5,2,3);c.fillRect(x+1,3,1,2);c.fillRect(x,19,4,1);c.fillStyle='#655f53';c.fillRect(x+3,9,1,8);}
  },
  flares(c){
    c.fillStyle='#d0a17e';for(const [x,y] of [[6,12],[16,6],[23,11]]){c.fillRect(x-3,y,7,1);c.fillRect(x,y-3,1,7);c.fillRect(x-1,y-1,3,3);}
    for(const [x,y] of [[8,16],[9,18],[10,20],[15,12],[14,15],[13,18],[21,15],[19,17],[17,19]])c.fillRect(x,y,1,2);
  }
};
export function paintIcon(canvas,off=false){
  const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);pixelIcons[canvas.dataset.icon]?.(c,off);
}
