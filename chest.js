// ════════════════ 宝箱渲染引擎 ════════════════
const C=document.createElement('canvas');
C.style.cssText='position:fixed;bottom:-40px;right:-60px;width:340px;height:400px;pointer-events:none;z-index:999;transition:transform .3s ease,opacity .3s ease';
document.body.appendChild(C);
const X=C.getContext('2d');
let W,H,flr,chestSkin=0,rewardSkin=0;
try{const s=JSON.parse(localStorage.getItem('learnAppSkins')||'{}');if(s.chest!==undefined)chestSkin=+s.chest;if(s.item!==undefined)rewardSkin=+s.item;}catch(_){}
let minimized=false;
function R(){W=340;H=400;flr=H*.76;const d=Math.min(devicePixelRatio||1,2);C.width=W*d;C.height=H*d;X.setTransform(d,0,0,d,0,0);}
R();window.addEventListener('resize',R);
// K 固定 220/520 保持宝箱原始大小
const _K0=Math.min(220,260)/520;
const K=()=>_K0;
const CX=()=>W/2, CY=()=>H*.66;
let lidFY=0,lidFR=0,lidFV=0,lidRV=0,lidPhase='closed',lidCloseStart=0,lidCloseTarget=0,lidCloseProgress=0,lidCloseDuration=.55;
let open=false,items=[],sparks=[],radiance=[],glowA=0,T=0,idleBob=0;
function easeOutCubic(t){return 1-Math.pow(1-t,3);}
function mkGrad(stops){const g=X.createLinearGradient(stops[0],stops[1],stops[2],stops[3]);for(let i=4;i<stops.length;i+=2)g.addColorStop(stops[i],stops[i+1]);return g;}
function mkRadial(x,y,r0,r1,stops){const g=X.createRadialGradient(x,y,r0,x,y,r1);for(let i=0;i<stops.length;i+=2)g.addColorStop(stops[i],stops[i+1]);return g;}
function gold(x1,y1,x2,y2){return mkGrad([x1,y1,x2,y2,0,'#e8d060',.12,'#fcf4b0',.28,'#b08820',.46,'#906010',.62,'#d0a838',.78,'#f0d868',1,'#986818']);}
function silver(x1,y1,x2,y2){return mkGrad([x1,y1,x2,y2,0,'#d8e8f0',.14,'#f0f8ff',.3,'#a0c0d8',.48,'#7098b0',.64,'#b0d0e0',.8,'#d0e8f8',1,'#8098a8']);}
function copper(x1,y1,x2,y2){return mkGrad([x1,y1,x2,y2,0,'#609050',.14,'#80c060',.3,'#407030',.48,'#306020',.64,'#609050',.8,'#80b860',1,'#508040']);}
function darkGold(x1,y1,x2,y2){return mkGrad([x1,y1,x2,y2,0,'#c0a040',.14,'#e0c060',.3,'#806020',.48,'#604018',.64,'#a08030',.8,'#d0b050',1,'#705020']);}
function bloodGold(x1,y1,x2,y2){return mkGrad([x1,y1,x2,y2,0,'#d05040',.15,'#e87868',.35,'#903020',.55,'#681810',.75,'#b04838',.9,'#d86048',1,'#702018']);}
function obsidian(x1,y1,x2,y2){return mkGrad([x1,y1,x2,y2,0,'#161028',.35,'#221a38',.65,'#0e0a1a',1,'#080510']);}
function rivet(x,y,r,c){X.fillStyle='rgba(0,0,0,.35)';X.beginPath();X.arc(x,y,r*1.1,0,Math.PI*2);X.fill();X.fillStyle=c||'#f0d868';X.beginPath();X.arc(x,y,r,0,Math.PI*2);X.fill();X.fillStyle='rgba(255,255,255,.35)';X.beginPath();X.arc(x-r*.22,y-r*.28,r*.3,0,Math.PI*2);X.fill();}
function shadow(cx,by,bw,bh){X.fillStyle='rgba(0,0,0,.4)';X.beginPath();X.ellipse(cx,by+bh+10,bw*.42,bh*.1,0,0,Math.PI*2);X.fill();}
function base(cx,by,bw,fill,border){const py=by+2;X.fillStyle='rgba(0,0,0,.25)';X.beginPath();X.ellipse(cx,py+12,bw*.46,bw*.48*.09,0,0,Math.PI*2);X.fill();X.fillStyle=fill||'#1c1830';X.beginPath();X.roundRect(cx-bw*.55,py,bw*1.1,12,6);X.fill();X.strokeStyle=border||'rgba(120,100,180,.12)';X.lineWidth=1;X.beginPath();X.roundRect(cx-bw*.55,py,bw*1.1,12,6);X.stroke();}
function drawGem(x,y,r,hue){const g=mkRadial(x-r*.1,y-r*.1,r*.02,x,y,r,[0,'hsl('+hue+',90%,70%)',.2,'hsl('+hue+',80%,45%)',.5,'hsl('+hue+',70%,22%)',.8,'hsl('+hue+',60%,8%)',1,'hsl('+hue+',50%,3%)']);X.fillStyle=g;X.beginPath();X.arc(x,y,r,0,Math.PI*2);X.fill();X.strokeStyle='rgba(255,255,255,'+(hue>200?.25:.2)+')';X.lineWidth=r*.12;X.beginPath();X.arc(x,y,r,0,Math.PI*2);X.stroke();X.fillStyle='rgba(255,255,255,.2)';X.beginPath();X.arc(x-r*.2,y-r*.25,r*.22,0,Math.PI*2);X.fill();}

// ════════════════ SKIN 0: 鎏金蟠龙宝箱 ════════════════
// 八角形箱体 + 三层莲花底座 + 蟠龙圆牌徽记 + 高弧顶盖子 + 龙角装饰
function body0(bx,by,bw,bh){
  const k=K(),cx=bx+bw/2,cut=bw*.12;
  shadow(cx,by,bw,bh);
  // 八角形箱体
  const bg=mkGrad([bx,by,bx+bw,by,0,'#2a1010',.3,'#3a1812',.5,'#200c08',.8,'#140604',1,'#0a0202']);
  X.fillStyle=bg;X.beginPath();
  X.moveTo(bx+cut,by);X.lineTo(bx+bw-cut,by);
  X.lineTo(bx+bw,by+cut);X.lineTo(bx+bw,by+bh-cut);
  X.lineTo(bx+bw-cut,by+bh);X.lineTo(bx+cut,by+bh);
  X.lineTo(bx,by+bh-cut);X.lineTo(bx,by+cut);
  X.closePath();X.fill();
  // 八角鎏金边框
  X.strokeStyle='rgba(255,200,60,.2)';X.lineWidth=k*.35;X.stroke();
  // 上下横条
  const barH=bh*.06;
  for(const yo of[by+bh*.025,by+bh-barH-bh*.025]){
    X.fillStyle=gold(bx,yo,bx,yo+barH);X.fillRect(bx-k*4,yo,bw+k*8,barH);
    X.strokeStyle='rgba(255,240,180,.2)';X.lineWidth=k*.2;X.strokeRect(bx-k*4,yo,bw+k*8,barH);
  }
  // 八个小切角处铆钉
  for(const[rx,ry] of[[bx+cut*.45,by+cut*.45],[bx+bw-cut*.45,by+cut*.45],[bx+bw-cut*.45,by+bh-cut*.45],[bx+cut*.45,by+bh-cut*.45],[bx+cut*.45,by+bh*.5],[bx+bw-cut*.45,by+bh*.5]])rivet(rx,ry,bh*.026);
  // ═══ 蟠龙徽记 ═══
  const dx=cx,dy=by+bh*.44,dr=bh*.13;
  for(let l=0;l<3;l++){
    const lr=dr*(.65+l*.15),la=l*Math.PI/8;
    X.fillStyle='rgba(180,130,40,'+(.08+l*.04)+')';
    X.beginPath();
    for(let p=0;p<8;p++){
      const a=p*Math.PI/4+la,px=dx+Math.cos(a)*lr,py=dy+Math.sin(a)*lr;
      const pa=p*Math.PI/4+la-Math.PI/8,prx=dx+Math.cos(pa)*lr*.65,pry=dy+Math.sin(pa)*lr*.65;
      p===0?X.moveTo(px,py):X.lineTo(px,py);X.lineTo(prx,pry);
    }
    X.closePath();X.fill();
  }
  const dg=mkRadial(dx,dy-dr*.06,0,dx,dy,dr*.55,[0,'#fff8d0',.08,'#e8c040',.35,'#a87818',.62,'#603008',.85,'#200800',.95,'#0c0400',1,'#040100']);
  X.fillStyle=dg;X.beginPath();X.arc(dx,dy,dr*.55,0,Math.PI*2);X.fill();
  X.strokeStyle='rgba(255,200,60,.35)';X.lineWidth=k*.5;X.beginPath();X.arc(dx,dy,dr*.55,0,Math.PI*2);X.stroke();
  X.save();X.globalAlpha=.55;X.strokeStyle='#f8d868';X.lineWidth=k*.85;
  X.beginPath();X.arc(dx-dr*.08,dy-dr*.08,dr*.28,Math.PI*.8,Math.PI*1.9);X.stroke();
  X.beginPath();X.arc(dx+dr*.12,dy+dr*.12,dr*.22,Math.PI*-.1,Math.PI*1.2);X.stroke();X.restore();
  const hx=dx+dr*.22,hy=dy-dr*.2;
  X.fillStyle='#f0c850';X.beginPath();X.moveTo(hx,hy-dr*.07);X.lineTo(hx+dr*.1,hy);X.lineTo(hx,hy+dr*.07);X.closePath();X.fill();
  X.strokeStyle='#c09020';X.lineWidth=k*.35;
  X.beginPath();X.moveTo(hx+dr*.07,hy-dr*.03);X.quadraticCurveTo(hx+dr*.16,hy-dr*.08,hx+dr*.2,hy-dr*.03);X.stroke();
  X.beginPath();X.moveTo(hx+dr*.07,hy+dr*.03);X.quadraticCurveTo(hx+dr*.16,hy+dr*.08,hx+dr*.2,hy+dr*.03);X.stroke();
  drawGem(dx-dr*.22,dy+dr*.15,dr*.12,0);
  const cg=mkRadial(dx,dy,0,dx,dy,dr*.08,[0,'#ffffff',.4,'rgba(255,240,200,.5)',1,'rgba(255,180,60,0)']);
  X.fillStyle=cg;X.beginPath();X.arc(dx,dy,dr*.08,0,Math.PI*2);X.fill();
  base(cx,by+bh,bw,'#1c1010','rgba(180,120,40,.15)');
}
function lid0(lx,ly,lw,lh,rot){
  X.save();X.translate(lx+lw/2,ly+lh/2);X.rotate(rot);X.translate(-lx-lw/2,-ly-lh/2);
  const k=K(),lt=ly-lh*.44,cut=lw*.12;
  // 高弧顶 + 八角收边
  X.beginPath();
  X.moveTo(lx+cut,ly+lh);X.quadraticCurveTo(lx+cut,lt-lh*.05,lx+lw*.1,lt-lh*.22);
  X.quadraticCurveTo(lx+lw/2,lt-lh*.35,lx+lw*.9,lt-lh*.22);
  X.quadraticCurveTo(lx+lw-cut,lt-lh*.05,lx+lw-cut,ly+lh);
  X.closePath();
  const lg=mkGrad([lx,ly,lx,lt-lh*.16,0,'#3a1410',.35,'#5a2018',.65,'#1c0804',1,'#0c0200']);
  X.fillStyle=lg;X.fill();X.strokeStyle='rgba(0,0,0,.08)';X.lineWidth=k*.45;X.stroke();
  // 鎏金框
  X.beginPath();
  X.moveTo(lx+cut-k*3,ly+lh);X.quadraticCurveTo(lx+cut-k*3,lt-lh*.03,lx+lw*.1,lt-lh*.19);
  X.quadraticCurveTo(lx+lw/2,lt-lh*.32,lx+lw*.9,lt-lh*.19);
  X.quadraticCurveTo(lx+lw-cut+k*3,lt-lh*.03,lx+lw-cut+k*3,ly+lh);
  X.lineWidth=k*3;X.strokeStyle='#c89830';X.stroke();
  X.lineWidth=k*.55;X.strokeStyle='rgba(255,240,200,.18)';X.stroke();
  // 顶脊
  X.beginPath();X.moveTo(lx+cut,lt-lh*.08);X.quadraticCurveTo(lx+lw/2,lt-lh*.37,lx+lw-cut,lt-lh*.08);
  X.lineWidth=k*2.2;X.strokeStyle='#e0c040';X.stroke();
  X.lineWidth=k*.4;X.strokeStyle='rgba(255,240,200,.14)';X.stroke();
  // 中央金钮
  const fx=lx+lw/2,fy=lt-lh*.18,fr=lh*.04;
  const fg=mkRadial(fx,fy-fr*.08,0,fx,fy,fr,[0,'#fffce0',.3,'#e8c040',.6,'#a07018',.85,'#503008',1,'#200800']);
  X.fillStyle=fg;X.beginPath();X.arc(fx,fy,fr,0,Math.PI*2);X.fill();
  X.strokeStyle='rgba(255,240,180,.25)';X.lineWidth=k*.2;X.beginPath();X.arc(fx,fy,fr,0,Math.PI*2);X.stroke();
  // 龙角装饰
  for(let i=-1;i<=1;i+=2){
    const hx2=fx+i*lw*.16,hy2=lt-lh*.1;
    X.fillStyle='#c89830';X.beginPath();X.moveTo(hx2-k*2.5,hy2);X.lineTo(hx2+k*2.5,hy2);
    X.quadraticCurveTo(hx2+k*4,hy2-lh*.15,hx2+k*6,hy2-lh*.2);X.lineTo(hx2-k*2,hy2-lh*.08);
    X.closePath();X.fill();
    X.strokeStyle='rgba(255,240,200,.25)';X.lineWidth=k*.2;X.stroke();
  }
  X.restore();
}

// ════════════════ SKIN 1: 暗影邪魔宝箱 ════════════════
// 倒梯形箱体（上窄下宽）+ 六芒星眼徽记 + 尖刺平顶盖子 + 侧翼装饰
function body1(bx,by,bw,bh){
  const k=K(),cx=bx+bw/2,inset=bw*.08;
  shadow(cx,by,bw,bh);
  const bg=mkGrad([bx,by,bx+bw,by,0,'#100818',.3,'#180e24',.5,'#0c0612',.8,'#080410',1,'#040208']);
  X.fillStyle=bg;
  // 倒梯形：上窄下宽
  X.beginPath();X.moveTo(bx+inset,by);X.lineTo(bx+bw-inset,by);
  X.lineTo(bx+bw,by+bh);X.lineTo(bx,by+bh);X.closePath();X.fill();
  X.strokeStyle='rgba(0,0,0,.12)';X.lineWidth=k*.45;X.stroke();
  // 暗金边框（沿倒梯形）
  const barH=bh*.055;
  for(const[ty,tw,ins] of[[by+bh*.02,bw-inset*2,inset],[by+bh-barH-bh*.02,bw,0]]){
    X.fillStyle=darkGold(bx,ty,bx,ty+barH);
    X.fillRect(bx+ins-k*3,ty,tw+k*6,barH);
    X.strokeStyle='rgba(220,180,100,.18)';X.lineWidth=k*.2;
    X.strokeRect(bx+ins-k*3,ty,tw+k*6,barH);
  }
  // 四角铆钉
  for(const[rx,ry] of[[bx+inset+bh*.05,by+bh*.06],[bx+bw-inset-bh*.05,by+bh*.06],[bx+bh*.05,by+bh-bh*.06],[bx+bw-bh*.05,by+bh-bh*.06]])rivet(rx,ry,bh*.03,'#c09040');
  // ═══ 邪魔之眼 ═══
  const ex=cx,ey=by+bh*.42,er=bh*.12;
  for(let l=0;l<2;l++){
    const lr=er*(.55+l*.22);
    X.fillStyle='rgba(160,100,200,'+(.06+l*.04)+')';
    X.beginPath();
    for(let p=0;p<6;p++){
      const a=p*Math.PI/3-Math.PI/2,px=ex+Math.cos(a)*lr,py=ey+Math.sin(a)*lr;
      const pa=p*Math.PI/3-Math.PI/2+Math.PI/6,prx=ex+Math.cos(pa)*lr*.4,pry=ey+Math.sin(pa)*lr*.4;
      p===0?X.moveTo(px,py):X.lineTo(px,py);X.lineTo(prx,pry);
    }
    X.closePath();X.fill();
  }
  const eg=mkRadial(ex,ey-er*.06,0,ex,ey,er*.5,[0,'#ffffff',.04,'#e8d8ff',.18,'#b060f0',.45,'#5018a0',.7,'#180838',.88,'#080218',1,'#020008']);
  X.fillStyle=eg;X.beginPath();X.ellipse(ex,ey,er*.3,er*.5,0,0,Math.PI*2);X.fill();
  X.strokeStyle='rgba(200,150,255,.3)';X.lineWidth=k*.45;X.beginPath();X.ellipse(ex,ey,er*.3,er*.5,0,0,Math.PI*2);X.stroke();
  X.fillStyle='#000';X.beginPath();X.ellipse(ex,ey,er*.1,er*.28,0,0,Math.PI*2);X.fill();
  X.fillStyle='rgba(255,255,255,.5)';X.beginPath();X.arc(ex-er*.04,ey-er*.15,er*.06,0,Math.PI*2);X.fill();
  for(let v=0;v<6;v++){
    const va=v*Math.PI/3;
    X.strokeStyle='rgba(255,60,100,'+(.08+Math.sin(T*3+v)*.04)+')';X.lineWidth=k*.25;
    X.beginPath();X.moveTo(ex,ey);X.lineTo(ex+Math.cos(va)*er*.4,ey+Math.sin(va)*er*.4);X.stroke();
  }
  const cg=mkRadial(ex,ey,0,ex,ey,er*.07,[0,'rgba(200,150,255,.6)',.5,'rgba(100,50,200,.2)',1,'rgba(0,0,0,0)']);
  X.fillStyle=cg;X.beginPath();X.arc(ex,ey,er*.07,0,Math.PI*2);X.fill();
  base(cx,by+bh,bw,'#100a18','rgba(160,100,200,.1)');
}
function lid1(lx,ly,lw,lh,rot){
  X.save();X.translate(lx+lw/2,ly+lh/2);X.rotate(rot);X.translate(-lx-lw/2,-ly-lh/2);
  const k=K(),lt=ly-lh*.3,inset=lw*.08;
  // 平顶盖子 + 尖刺
  X.beginPath();
  X.moveTo(lx+inset,ly+lh);X.lineTo(lx+inset,lt+lh*.05);
  X.lineTo(lx+lw*.12,lt-lh*.05);X.lineTo(lx+lw*.88,lt-lh*.05);
  X.lineTo(lx+lw-inset,lt+lh*.05);X.lineTo(lx+lw-inset,ly+lh);
  X.closePath();
  const lg=mkGrad([lx,ly,lx,lt,0,'#200e30',.4,'#381848',.7,'#120818',1,'#080410']);
  X.fillStyle=lg;X.fill();X.strokeStyle='rgba(0,0,0,.08)';X.lineWidth=k*.4;X.stroke();
  // 暗金边框
  X.beginPath();
  X.moveTo(lx+inset-k*3,ly+lh);X.lineTo(lx+inset-k*3,lt+lh*.06);
  X.lineTo(lx+lw*.12,lt-lh*.03);X.lineTo(lx+lw*.88,lt-lh*.03);
  X.lineTo(lx+lw-inset+k*3,lt+lh*.06);X.lineTo(lx+lw-inset+k*3,ly+lh);
  X.lineWidth=k*2.4;X.strokeStyle='#a08030';X.stroke();
  X.lineWidth=k*.45;X.strokeStyle='rgba(220,180,100,.16)';X.stroke();
  // 三根尖刺
  for(let i=-1;i<=1;i++){
    const sx=lx+lw*(.25+.5*(i+1)/2),sy=lt-lh*.03,th=lh*(.16+Math.abs(i)*.06);
    X.fillStyle='#402818';X.beginPath();X.moveTo(sx-k*2.5,sy);X.lineTo(sx+k*2.5,sy);
    X.lineTo(sx,lt-th);X.closePath();X.fill();
    X.strokeStyle='#a08030';X.lineWidth=k*.3;X.stroke();
  }
  // 中央邪眼钮
  const fx=lx+lw/2,fy=lt-lh*.06,fr=lh*.028;
  const fg=mkRadial(fx,fy,0,fx,fy,fr,[0,'#d8c0ff',.3,'#8040c0',.65,'#301060',1,'#100420']);
  X.fillStyle=fg;X.beginPath();X.arc(fx,fy,fr,0,Math.PI*2);X.fill();
  X.fillStyle='#000';X.beginPath();X.ellipse(fx,fy,fr*.3,fr*.55,0,0,Math.PI*2);X.fill();
  X.restore();
}

// ════════════════ SKIN 2: 青铜莲华宝箱 ════════════════
// 圆角方形箱体 + 多层莲花浮雕徽记 + 弧形穹顶盖子 + 铜铃装饰
function body2(bx,by,bw,bh){
  const k=K(),cx=bx+bw/2,r=bw*.06;
  shadow(cx,by,bw,bh);
  const bg=mkGrad([bx,by,bx+bw,by,0,'#1a2010',.3,'#263818',.55,'#121c08',.8,'#1a2410',1,'#0c1004']);
  X.fillStyle=bg;
  // 圆角方形
  X.beginPath();X.roundRect(bx,by,bw,bh,r);X.fill();
  X.strokeStyle='rgba(0,0,0,.15)';X.lineWidth=k*.5;X.stroke();
  // 铜绿横条
  const barH=bh*.058;
  for(const yo of[by+bh*.02,by+bh-barH-bh*.02]){
    X.fillStyle=copper(bx,yo,bx,yo+barH);X.fillRect(bx-k*3,yo,bw+k*6,barH);
    X.strokeStyle='rgba(140,220,120,.15)';X.lineWidth=k*.2;X.strokeRect(bx-k*3,yo,bw+k*6,barH);
  }
  // 四角绿松石
  for(const[gx,gy] of[[bx+bh*.08,by+bh*.08],[bx+bw-bh*.08,by+bh*.08],[bx+bh*.08,by+bh-bh*.08],[bx+bw-bh*.08,by+bh-bh*.08]])drawGem(gx,gy,bh*.042,140);
  // ═══ 三层莲华 ═══
  const lx2=cx,ly2=by+bh*.44,lr=bh*.12;
  for(let l=0;l<3;l++){
    const rr=lr*(.55+l*.18),ra=l*Math.PI/10;
    X.fillStyle='rgba(80,150,60,'+(.05+l*.04)+')';
    X.beginPath();
    for(let p=0;p<8;p++){
      const a=p*Math.PI/4+ra,px=lx2+Math.cos(a)*rr,py=ly2+Math.sin(a)*rr;
      const pa1=p*Math.PI/4+ra-Math.PI/8,cx1=lx2+Math.cos(pa1)*rr*.55,cy1=ly2+Math.sin(pa1)*rr*.55;
      p===0?X.moveTo(px,py):X.lineTo(px,py);X.lineTo(cx1,cy1);
    }
    X.closePath();X.fill();
  }
  const lg2=mkRadial(lx2,ly2-lr*.05,0,lx2,ly2,lr*.42,[0,'#c8f8a0',.15,'#60c840',.45,'#208030',.75,'#0a2810',.92,'#041004',1,'#010401']);
  X.fillStyle=lg2;X.beginPath();X.arc(lx2,ly2,lr*.42,0,Math.PI*2);X.fill();
  X.strokeStyle='rgba(180,240,140,.3)';X.lineWidth=k*.4;X.beginPath();X.arc(lx2,ly2,lr*.42,0,Math.PI*2);X.stroke();
  X.fillStyle='rgba(200,255,160,.25)';
  X.beginPath();
  for(let p=0;p<8;p++){
    const a=p*Math.PI/4-Math.PI/2,tipX=lx2+Math.cos(a)*lr*.32,tipY=ly2+Math.sin(a)*lr*.32;
    const mx=lx2+Math.cos(a+Math.PI/8)*lr*.1,my=ly2+Math.sin(a+Math.PI/8)*lr*.1;
    p===0?X.moveTo(tipX,tipY):X.lineTo(tipX,tipY);X.lineTo(mx,my);
  }
  X.closePath();X.fill();
  const cg=mkRadial(lx2,ly2,0,lx2,ly2,lr*.1,[0,'rgba(255,255,255,.5)',.5,'rgba(200,255,180,.15)',1,'rgba(0,0,0,0)']);
  X.fillStyle=cg;X.beginPath();X.arc(lx2,ly2,lr*.1,0,Math.PI*2);X.fill();
  base(cx,by+bh,bw,'#141a10','rgba(80,140,50,.1)');
}
function lid2(lx,ly,lw,lh,rot){
  X.save();X.translate(lx+lw/2,ly+lh/2);X.rotate(rot);X.translate(-lx-lw/2,-ly-lh/2);
  const k=K(),lt=ly-lh*.4;
  // 弧形穹顶
  X.beginPath();
  X.moveTo(lx,ly+lh);X.quadraticCurveTo(lx,lt-lh*.02,lx+lw*.12,lt-lh*.2);
  X.quadraticCurveTo(lx+lw/2,lt-lh*.32,lx+lw*.88,lt-lh*.2);
  X.quadraticCurveTo(lx+lw,lt-lh*.02,lx+lw,ly+lh);
  X.closePath();
  const lg=mkGrad([lx,ly,lx,lt-lh*.16,0,'#1e2e16',.4,'#304828',.7,'#0e1806',1,'#040802']);
  X.fillStyle=lg;X.fill();X.strokeStyle='rgba(0,0,0,.08)';X.lineWidth=k*.4;X.stroke();
  // 铜绿边框
  X.beginPath();
  X.moveTo(lx-k*3,ly+lh);X.quadraticCurveTo(lx-k*3,lt,lx+lw*.12,lt-lh*.17);
  X.quadraticCurveTo(lx+lw/2,lt-lh*.29,lx+lw*.88,lt-lh*.17);
  X.quadraticCurveTo(lx+lw+k*3,lt,lx+lw+k*3,ly+lh);
  X.lineWidth=k*2.4;X.strokeStyle='#609050';X.stroke();
  X.lineWidth=k*.5;X.strokeStyle='rgba(120,200,100,.18)';X.stroke();
  // 顶脊
  X.beginPath();X.moveTo(lx,lt-lh*.06);X.quadraticCurveTo(lx+lw/2,lt-lh*.34,lx+lw,lt-lh*.06);
  X.lineWidth=k*1.8;X.strokeStyle='#80b060';X.stroke();
  // 中央大绿松石
  const fx=lx+lw/2,fy=lt-lh*.2;
  drawGem(fx,fy,lh*.045,150);
  // 两侧铜铃
  for(let i=-1;i<=1;i+=2){
    const bx2=fx+i*lw*.2,by2=lt-lh*.08;
    X.fillStyle=copper(bx2-lh*.015,by2,bx2+lh*.015,by2);
    X.beginPath();X.arc(bx2,by2,lh*.02,0,Math.PI*2);X.fill();
    X.strokeStyle='rgba(140,220,120,.15)';X.lineWidth=k*.15;X.beginPath();X.arc(bx2,by2,lh*.02,0,Math.PI*2);X.stroke();
    X.fillStyle='rgba(255,255,255,.1)';X.beginPath();X.arc(bx2-lh*.005,by2-lh*.008,lh*.006,0,Math.PI*2);X.fill();
  }
  X.restore();
}

// ════════════════ SKIN 3: 血月修罗宝箱 ════════════════
// 六角形箱体 + 血月徽记 + 尖顶盖子 + 血槽纹路
function body3(bx,by,bw,bh){
  const k=K(),cx=bx+bw/2,cut=bw*.1;
  shadow(cx,by,bw,bh);
  const bg=mkGrad([bx,by,bx+bw,by,0,'#180a0a',.3,'#241010',.55,'#100606',.8,'#0c0404',1,'#040101']);
  X.fillStyle=bg;
  // 六角形
  X.beginPath();
  X.moveTo(bx+cut,by);X.lineTo(bx+bw-cut,by);
  X.lineTo(bx+bw,by+bh*.5);X.lineTo(bx+bw-cut,by+bh);
  X.lineTo(bx+cut,by+bh);X.lineTo(bx,by+bh*.5);
  X.closePath();X.fill();
  X.strokeStyle='rgba(255,100,60,.15)';X.lineWidth=k*.35;X.stroke();
  // 血金横条
  const barH=bh*.055;
  for(const yo of[by+bh*.02,by+bh-barH-bh*.02]){
    X.fillStyle=bloodGold(bx,yo,bx,yo+barH);X.fillRect(bx-k*4,yo,bw+k*8,barH);
    X.strokeStyle='rgba(255,180,160,.2)';X.lineWidth=k*.2;X.strokeRect(bx-k*4,yo,bw+k*8,barH);
  }
  // 四角血金铆钉
  for(const[rx,ry] of[[bx+cut*.5,by+bh*.06],[bx+bw-cut*.5,by+bh*.06],[bx+cut*.5,by+bh-bh*.06],[bx+bw-cut*.5,by+bh-bh*.06]])rivet(rx,ry,bh*.028,'#d86048');
  // 血槽纹路 — 三道竖直暗痕
  X.save();X.globalAlpha=.08;X.strokeStyle='#000';X.lineWidth=k*1.2;
  for(let i=-1;i<=1;i++){const vx=cx+i*bw*.15;X.beginPath();X.moveTo(vx,by+bh*.1);X.lineTo(vx,by+bh*.9);X.stroke();}
  X.restore();
  // ═══ 血月 ═══
  const mx=cx,my=by+bh*.44,mr=bh*.12;
  const halo=mkRadial(mx,my,0,mx,my,mr*1.2,[0,'rgba(255,40,20,.18)',.5,'rgba(180,10,0,.06)',1,'rgba(0,0,0,0)']);
  X.fillStyle=halo;X.beginPath();X.arc(mx,my,mr*1.2,0,Math.PI*2);X.fill();
  const mg=mkRadial(mx-mr*.08,my-mr*.08,0,mx,my,mr,[0,'#ff3020',.15,'#d01810',.45,'#800808',.72,'#300202',.9,'#100101',1,'#040000']);
  X.fillStyle=mg;X.beginPath();X.arc(mx,my,mr,0,Math.PI*2);X.fill();
  X.strokeStyle='rgba(255,100,80,.25)';X.lineWidth=k*.5;X.beginPath();X.arc(mx,my,mr,0,Math.PI*2);X.stroke();
  X.save();X.globalCompositeOperation='destination-out';
  X.fillStyle='#000';X.beginPath();X.arc(mx+mr*.35,my-mr*.35,mr*.55,0,Math.PI*2);X.fill();X.restore();
  X.beginPath();X.arc(mx,my,mr,0,Math.PI*2);X.strokeStyle='rgba(255,100,80,.25)';X.lineWidth=k*.5;X.stroke();
  for(let s=0;s<3;s++){
    const sx=mx+mr*(.2+s*.18),sy=my+mr*(.1+s*.2);
    X.strokeStyle='rgba(255,60,40,'+(.25-s*.06)+')';X.lineWidth=k*.4;
    X.beginPath();X.moveTo(sx-mr*.12,sy-mr*.12);X.lineTo(sx+mr*.12,sy+mr*.12);X.stroke();
  }
  const cg=mkRadial(mx,my,0,mx,my,mr*.1,[0,'rgba(255,200,180,.5)',.5,'rgba(255,80,60,.15)',1,'rgba(0,0,0,0)']);
  X.fillStyle=cg;X.beginPath();X.arc(mx,my,mr*.1,0,Math.PI*2);X.fill();
  base(cx,by+bh,bw,'#140a0a','rgba(200,80,40,.1)');
}
function lid3(lx,ly,lw,lh,rot){
  X.save();X.translate(lx+lw/2,ly+lh/2);X.rotate(rot);X.translate(-lx-lw/2,-ly-lh/2);
  const k=K(),lt=ly-lh*.42,cut=lw*.1;
  // 尖顶三角形盖子
  X.beginPath();
  X.moveTo(lx+cut,ly+lh);X.lineTo(lx+cut,lt-lh*.02);
  X.lineTo(lx+lw/2,lt-lh*.35);X.lineTo(lx+lw-cut,lt-lh*.02);
  X.lineTo(lx+lw-cut,ly+lh);X.closePath();
  const lg=mkGrad([lx,ly,lx,lt-lh*.16,0,'#200c08',.4,'#381410',.7,'#100604',1,'#060201']);
  X.fillStyle=lg;X.fill();X.strokeStyle='rgba(0,0,0,.08)';X.lineWidth=k*.4;X.stroke();
  // 血金边框
  X.beginPath();
  X.moveTo(lx+cut-k*3,ly+lh);X.lineTo(lx+cut-k*3,lt);
  X.lineTo(lx+lw/2,lt-lh*.33);X.lineTo(lx+lw-cut+k*3,lt);
  X.lineTo(lx+lw-cut+k*3,ly+lh);
  X.lineWidth=k*2.4;X.strokeStyle='#b04838';X.stroke();
  X.lineWidth=k*.5;X.strokeStyle='rgba(255,140,120,.16)';X.stroke();
  // 尖顶脊
  X.beginPath();X.moveTo(lx+lw/2,lt-lh*.33);X.lineTo(lx+lw/2,ly+lh);
  X.lineWidth=k*1.5;X.strokeStyle='#c85840';X.stroke();
  // 中央血金钮
  const fx=lx+lw/2,fy=ly+lh*.35,fr=lh*.032;
  const fg=mkRadial(fx,fy,0,fx,fy,fr,[0,'#ffc0a0',.3,'#d85040',.65,'#801810',1,'#300604']);
  X.fillStyle=fg;X.beginPath();X.arc(fx,fy,fr,0,Math.PI*2);X.fill();
  X.strokeStyle='rgba(255,160,120,.2)';X.lineWidth=k*.16;X.beginPath();X.arc(fx,fy,fr,0,Math.PI*2);X.stroke();
  X.restore();
}

// ════════════════ SKIN 4: 霜寒玄冰宝箱 ════════════════
// 八角菱形箱体 + 冰晶雪花徽记 + 多层冰晶盖子 + 霜花点缀
function body4(bx,by,bw,bh){
  const k=K(),cx=bx+bw/2,cut=bw*.06;
  shadow(cx,by,bw,bh);
  const bg=mkGrad([bx,by,bx+bw,by,0,'#162432',.3,'#1e3040',.55,'#101e28',.8,'#0a141c',1,'#04080c']);
  X.fillStyle=bg;
  // 八边形菱形（八角 + 内凹腰线）
  X.beginPath();
  X.moveTo(bx+cut,by);X.lineTo(bx+bw-cut,by);
  X.lineTo(bx+bw,by+bh*.3);X.lineTo(bx+bw-cut,by+bh);
  X.lineTo(bx+cut,by+bh);X.lineTo(bx,by+bh*.3);
  X.closePath();X.fill();
  X.strokeStyle='rgba(180,220,255,.12)';X.lineWidth=k*.3;X.stroke();
  // 银白横条
  const barH=bh*.055;
  for(const yo of[by+bh*.02,by+bh-barH-bh*.02]){
    X.fillStyle=silver(bx,yo,bx,yo+barH);X.fillRect(bx-k*4,yo,bw+k*8,barH);
    X.strokeStyle='rgba(220,245,255,.2)';X.lineWidth=k*.2;X.strokeRect(bx-k*4,yo,bw+k*8,barH);
  }
  // 四角冰锥
  const icH=bh*.14;
  for(const[ix2,iy2,dir] of[[bx+bh*.04,by+bh*.04,-1],[bx+bw-bh*.04,by+bh*.04,-1],[bx+bh*.04,by+bh-bh*.04,1],[bx+bw-bh*.04,by+bh-bh*.04,1]]){
    const iceG=mkGrad([ix2,iy2,ix2,iy2-icH*dir,0,'rgba(220,248,255,.55)',.4,'rgba(140,200,240,.28)',.8,'rgba(60,140,210,.06)',1,'rgba(20,80,140,0)']);
    X.fillStyle=iceG;X.beginPath();X.moveTo(ix2-k*3.5,iy2);X.lineTo(ix2+k*3.5,iy2);X.lineTo(ix2,iy2+icH*dir);X.closePath();X.fill();
  }
  // ═══ 冰晶雪花 ═══
  const sx4=cx,sy4=by+bh*.44,sr2=bh*.115;
  const halo2=mkRadial(sx4,sy4,0,sx4,sy4,sr2*1.35,[0,'rgba(180,230,255,.2)',.45,'rgba(80,160,220,.06)',1,'rgba(0,0,0,0)']);
  X.fillStyle=halo2;X.beginPath();X.arc(sx4,sy4,sr2*1.35,0,Math.PI*2);X.fill();
  const snowG=mkRadial(sx4,sy4,0,sx4,sy4,sr2,[0,'#ffffff',.06,'#e8f8ff',.25,'#b0ddf8',.5,'#5890b8',.72,'#204868',.88,'#0a1a28',1,'#020810']);
  X.fillStyle=snowG;
  X.beginPath();
  for(let a=0;a<6;a++){
    const ang=a*Math.PI/3-Math.PI/2,tipX=sx4+Math.cos(ang)*sr2,tipY=sy4+Math.sin(ang)*sr2;
    const midX=sx4+Math.cos(ang)*sr2*.28,midY=sy4+Math.sin(ang)*sr2*.28;
    const sideAng=ang+Math.PI/6;
    const sX2=sx4+Math.cos(sideAng)*sr2*.16,sY2=sy4+Math.sin(sideAng)*sr2*.16;
    a===0?X.moveTo(tipX,tipY):X.lineTo(tipX,tipY);
    X.lineTo(sX2,sY2);X.lineTo(midX,midY);
    const sX2b=sx4+Math.cos(sideAng-Math.PI/3)*sr2*.16,sY2b=sy4+Math.sin(sideAng-Math.PI/3)*sr2*.16;
    X.lineTo(sX2b,sY2b);
  }
  X.closePath();X.fill();
  X.strokeStyle='rgba(230,245,255,.35)';X.lineWidth=k*.45;X.stroke();
  for(let sc=0;sc<6;sc++){
    const sa2=sc*Math.PI/3+Math.PI/6,scx=sx4+Math.cos(sa2)*sr2*.6,scy=sy4+Math.sin(sa2)*sr2*.6;
    X.fillStyle='rgba(210,240,255,.35)';
    X.beginPath();
    for(let v2=0;v2<6;v2++){const va2=v2*Math.PI/3,pr2=k*2.2;v2===0?X.moveTo(scx+Math.cos(va2)*pr2,scy+Math.sin(va2)*pr2):X.lineTo(scx+Math.cos(va2)*pr2,scy+Math.sin(va2)*pr2);}
    X.closePath();X.fill();
  }
  const cg=mkRadial(sx4,sy4,0,sx4,sy4,sr2*.22,[0,'#ffffff',.3,'rgba(240,250,255,.7)',.6,'rgba(180,220,255,.2)',1,'rgba(100,180,240,0)']);
  X.fillStyle=cg;X.beginPath();X.arc(sx4,sy4,sr2*.22,0,Math.PI*2);X.fill();
  base(cx,by+bh,bw,'#0e1822','rgba(120,170,200,.08)');
}
function lid4(lx,ly,lw,lh,rot){
  X.save();X.translate(lx+lw/2,ly+lh/2);X.rotate(rot);X.translate(-lx-lw/2,-ly-lh/2);
  const k=K(),lt=ly-lh*.44;
  // 多层冰晶穹顶
  X.beginPath();
  X.moveTo(lx+k*4,ly+lh);X.quadraticCurveTo(lx+k*4,lt-lh*.04,lx+lw*.1,lt-lh*.26);
  X.quadraticCurveTo(lx+lw/2,lt-lh*.4,lx+lw*.9,lt-lh*.26);
  X.quadraticCurveTo(lx+lw-k*4,lt-lh*.04,lx+lw-k*4,ly+lh);
  X.closePath();
  const lg=mkGrad([lx,ly,lx,lt-lh*.2,0,'#162636',.45,'#243448',.7,'#0c141c',1,'#04080c']);
  X.fillStyle=lg;X.fill();X.strokeStyle='rgba(0,0,0,.06)';X.lineWidth=k*.4;X.stroke();
  // 三层冰晶叠加
  for(let layer=0;layer<3;layer++){
    const loff=lh*(.03+layer*.035);
    X.save();X.globalAlpha=.15+layer*.04;
    X.beginPath();
    X.moveTo(lx+k*7,ly+lh-loff);X.quadraticCurveTo(lx+k*7,lt-lh*.02,lx+lw*.12,lt-lh*.22);
    X.quadraticCurveTo(lx+lw/2,lt-lh*.36,lx+lw*.88,lt-lh*.22);
    X.quadraticCurveTo(lx+lw-k*7,lt-lh*.02,lx+lw-k*7,ly+lh-loff);
    X.closePath();
    const iceG=mkGrad([lx,lt,lx,ly+lh,0,'rgba(220,248,255,.6)',.4,'rgba(130,200,230,.25)',.8,'rgba(50,110,180,.05)',1,'rgba(10,40,80,0)']);
    X.fillStyle=iceG;X.fill();X.restore();
  }
  // 银白框
  X.beginPath();
  X.moveTo(lx+k*5,ly+lh);X.quadraticCurveTo(lx+k*5,lt-lh*.02,lx+lw*.1,lt-lh*.22);
  X.quadraticCurveTo(lx+lw/2,lt-lh*.36,lx+lw*.9,lt-lh*.22);
  X.quadraticCurveTo(lx+lw-k*5,lt-lh*.02,lx+lw-k*5,ly+lh);
  X.lineWidth=k*2.4;X.strokeStyle='#a8c8d8';X.stroke();
  X.lineWidth=k*.5;X.strokeStyle='rgba(220,240,255,.2)';X.stroke();
  // 顶脊银线
  X.beginPath();X.moveTo(lx+k*8,lt-lh*.14);X.quadraticCurveTo(lx+lw/2,lt-lh*.38,lx+lw-k*8,lt-lh*.14);
  X.lineWidth=k*1.8;X.strokeStyle='#c8dce8';X.stroke();
  // 霜花
  for(let f=0;f<5;f++){
    const fx2=lx+lw*(.15+f*.175),fy2=lt-lh*.08;
    X.fillStyle='rgba(220,245,255,.28)';
    X.beginPath();
    for(let p2=0;p2<6;p2++){const pa2=p2*Math.PI/3,pr3=lh*.024;p2===0?X.moveTo(fx2+Math.cos(pa2)*pr3,fy2+Math.sin(pa2)*pr3):X.lineTo(fx2+Math.cos(pa2)*pr3,fy2+Math.sin(pa2)*pr3);}
    X.closePath();X.fill();
  }
  // 顶部冰晶核心
  const fx3=lx+lw/2,fy3=lt-lh*.29;
  const fg=mkRadial(fx3,fy3,0,fx3,fy3,lh*.035,[0,'rgba(255,255,255,.75)',.3,'rgba(200,240,255,.45)',.65,'rgba(100,160,220,.12)',1,'rgba(40,80,140,0)']);
  X.fillStyle=fg;X.beginPath();X.arc(fx3,fy3,lh*.035,0,Math.PI*2);X.fill();
  X.restore();
}

// ════════════════ SKIN 5: 聚雷玄铁宝箱 ════════════════
// 方形箱体 + 雷电球徽记（不动） + 弧形盖子 + 暗金钉
function body5(bx,by,bw,bh){
  const k=K(),cx=bx+bw/2;
  shadow(cx,by,bw,bh);
  X.fillStyle=obsidian(bx,by,bx+bw,by);X.fillRect(bx,by,bw,bh);
  const barH=bh*.06;
  for(const yo of[by+bh*.02,by+bh-barH-bh*.02]){
    X.fillStyle=darkGold(bx,yo,bx,yo+barH);X.fillRect(bx-k*3,yo,bw+k*6,barH);
    X.strokeStyle='rgba(220,200,140,.18)';X.lineWidth=k*.22;X.strokeRect(bx-k*3,yo,bw+k*6,barH);
  }
  const vw=bh*.05;
  for(let s of[bx,bx+bw-vw]){
    X.fillStyle=darkGold(s,by,s+vw,by);X.fillRect(s-k*3,by-k*1,vw,bh+k*2);
    X.strokeStyle='rgba(200,180,120,.13)';X.lineWidth=k*.18;X.strokeRect(s-k*3,by-k*1,vw,bh+k*2);
  }
  const cs=bh*.048;
  for(const[cx3,cy3] of[[bx+bh*.035,by+bh*.035],[bx+bw-bh*.035,by+bh*.035],[bx+bh*.035,by+bh-bh*.035],[bx+bw-bh*.035,by+bh-bh*.035]]){
    X.fillStyle=darkGold(cx3-cs,cy3-cs,cx3+cs,cy3+cs);X.fillRect(cx3-cs,cy3-cs,cs*2,cs*2);
    X.strokeStyle='rgba(255,220,160,.15)';X.lineWidth=k*.12;X.strokeRect(cx3-cs,cy3-cs,cs*2,cs*2);
  }
  // ═══ 雷电球徽记（不动） ═══
  const ox2=cx,oy2=by+bh*.43,or2=bh*.105;
  const orbG=mkRadial(ox2,oy2,0,ox2,oy2,or2,[0,'#ffffff',.06,'#e8d8ff',.2,'#a060e8',.45,'#5020a0',.75,'#1c0c48',1,'#080418']);
  X.fillStyle=orbG;X.beginPath();X.arc(ox2,oy2,or2,0,Math.PI*2);X.fill();
  X.strokeStyle='rgba(200,150,255,.3)';X.lineWidth=k*.55;X.beginPath();X.arc(ox2,oy2,or2,0,Math.PI*2);X.stroke();
  for(let l=0;l<4;l++){
    const la=l*Math.PI/2+Math.PI/4;
    X.save();X.globalAlpha=.4;X.strokeStyle='#d8c0ff';X.lineWidth=k*.5;
    X.beginPath();
    const startX=ox2+Math.cos(la)*or2*.65,startY=oy2+Math.sin(la)*or2*.65;
    X.moveTo(startX,startY);
    const mx2=startX+Math.cos(la)*or2*.3,my2=startY+Math.sin(la)*or2*.3;
    X.lineTo(mx2,my2);
    const ex2=mx2+Math.cos(la+Math.PI/5)*or2*.22,ey2=my2+Math.sin(la+Math.PI/5)*or2*.22;
    X.lineTo(ex2,ey2);
    X.stroke();X.restore();
  }
  for(let p=0;p<8;p++){
    const pa3=p*Math.PI/4+T*.25,pr4=or2*1.12+Math.sin(T*6+p)*or2*.1,px4=ox2+Math.cos(pa3)*pr4,py4=oy2+Math.sin(pa3)*pr4;
    X.fillStyle='rgba(180,130,240,.5)';X.beginPath();X.arc(px4,py4,k*1.2,0,Math.PI*2);X.fill();
  }
  base(cx,by+bh,bw,'#0e0a18','rgba(130,110,170,.08)');
}
function lid5(lx,ly,lw,lh,rot){
  X.save();X.translate(lx+lw/2,ly+lh/2);X.rotate(rot);X.translate(-lx-lw/2,-ly-lh/2);
  const k=K(),lt=ly-lh*.36;
  X.beginPath();
  X.moveTo(lx-k*3,ly+lh);X.quadraticCurveTo(lx-k*3,lt-lh*.06,lx,lt-lh*.14);
  X.quadraticCurveTo(lx+lw/2,lt-lh*.2,lx+lw+k*3,lt-lh*.06);
  X.quadraticCurveTo(lx+lw+k*3,lt-lh*.06,lx+lw+k*3,ly+lh);X.closePath();
  const lg=mkGrad([lx,ly,lx,lt,0,'#1a1028',.4,'#281840',.7,'#0c0818',1,'#040210']);
  X.fillStyle=lg;X.fill();X.strokeStyle='rgba(0,0,0,.08)';X.lineWidth=k*.4;X.stroke();
  X.beginPath();
  X.moveTo(lx-k*4,ly+lh);X.quadraticCurveTo(lx-k*4,lt-lh*.04,lx,lt-lh*.11);
  X.quadraticCurveTo(lx+lw/2,lt-lh*.17,lx+lw+k*4,lt-lh*.04);
  X.quadraticCurveTo(lx+lw+k*4,lt-lh*.04,lx+lw+k*4,ly+lh);
  X.lineWidth=k*2.8;X.strokeStyle='#a08030';X.stroke();
  X.lineWidth=k*.5;X.strokeStyle='rgba(220,200,140,.16)';X.stroke();
  X.beginPath();X.moveTo(lx-k*2,lt-lh*.02);X.quadraticCurveTo(lx+lw/2,lt-lh*.22,lx+lw+k*2,lt-lh*.02);
  X.lineWidth=k*2;X.strokeStyle='#c0a040';X.stroke();
  X.lineWidth=k*.4;X.strokeStyle='rgba(240,220,160,.14)';X.stroke();
  const fx4=lx+lw/2,fy4=lt-lh*.08,fr=lh*.036;
  const fg=mkRadial(fx4,fy4-fr*.08,0,fx4,fy4,fr,[0,'#fffce0',.3,'#e8c040',.6,'#a07018',.85,'#503008',1,'#200800']);
  X.fillStyle=fg;X.beginPath();X.arc(fx4,fy4,fr,0,Math.PI*2);X.fill();
  X.strokeStyle='rgba(255,240,180,.25)';X.lineWidth=k*.2;X.beginPath();X.arc(fx4,fy4,fr,0,Math.PI*2);X.stroke();
  for(let i=-1;i<=1;i+=2){
    rivet(fx4+i*lw*.18,lt-lh*.04,lh*.016,'#b08830');
    rivet(fx4+i*lw*.3,lt-lh*.01,lh*.013,'#b08830');
  }
  X.restore();
}

// ════════════════ 分发 ════════════════
const BODY_FNS=[body0,body1,body2,body3,body4,body5];
const LID_FNS=[lid0,lid1,lid2,lid3,lid4,lid5];
function cb(){const k=K(),cx=CX(),cy=CY();return {x:cx-250*k/2,y:cy-132*k*.4,w:250*k,h:132*k};}
function body(bx,by,bw,bh){BODY_FNS[Math.min(chestSkin,5)](bx,by,bw,bh);}
function lid(lx,ly,lw,lh,rot){LID_FNS[Math.min(chestSkin,5)](lx,ly,lw,lh,rot);}

// ════════════════ REWARD 0: 金银财宝 ════════════════
function coin0(x,y,r,rt,color,letter){
  X.save();X.translate(x,y);X.rotate(rt);
  const c=color||[255,225,60];
  const clamp=v=>Math.max(0,Math.min(255,v));
  const e0=c.map(v=>clamp(v-130));
  X.fillStyle='rgb('+e0[0]+','+e0[1]+','+e0[2]+')';
  X.beginPath();X.arc(0,0,r,0,Math.PI*2);X.fill();
  const g=X.createRadialGradient(-r*.08,-r*.1,0,0,0,r*.93);
  const b1=c.map(v=>clamp(v-20)),b2=c.map(v=>clamp(v-55)),b3=c.map(v=>clamp(v-85));
  g.addColorStop(0,'rgb('+c[0]+','+c[1]+','+c[2]+')');
  g.addColorStop(.28,'rgb('+b1[0]+','+b1[1]+','+b1[2]+')');
  g.addColorStop(.55,'rgb('+b2[0]+','+b2[1]+','+b2[2]+')');
  g.addColorStop(.76,'rgb('+b1[0]+','+b1[1]+','+b1[2]+')');
  g.addColorStop(.88,'rgb('+b2[0]+','+b2[1]+','+b2[2]+')');
  g.addColorStop(1,'rgb('+b3[0]+','+b3[1]+','+b3[2]+')');
  X.fillStyle=g;X.beginPath();X.arc(0,0,r*.93,0,Math.PI*2);X.fill();
  X.strokeStyle='rgba(255,255,255,.3)';X.lineWidth=r*.025;
  for(let i=0;i<32;i++){const a=Math.PI*2*i/32;X.beginPath();X.moveTo(Math.cos(a)*r*.78,Math.sin(a)*r*.78);X.lineTo(Math.cos(a)*r*.88,Math.sin(a)*r*.88);X.stroke();}
  X.strokeStyle='rgba(255,255,255,.45)';X.lineWidth=r*.04;X.beginPath();X.arc(0,0,r*.78,0,Math.PI*2);X.stroke();
  X.strokeStyle='rgba(0,0,0,.22)';X.lineWidth=r*.03;X.beginPath();X.arc(0,0,r*.48,0,Math.PI*2);X.stroke();
  X.strokeStyle='rgba(255,255,255,.35)';X.lineWidth=r*.025;X.beginPath();X.arc(0,0,r*.5,0,Math.PI*2);X.stroke();
  if(letter){
    X.fillStyle='rgba(0,0,0,.28)';X.font='bold '+Math.floor(r*.7)+'px serif';X.textAlign='center';X.textBaseline='middle';
    X.fillText(letter,r*.03,r*.03+1);
    X.fillStyle='rgba(255,255,255,.55)';X.fillText(letter,0,1);
  }
  X.fillStyle='rgba(255,255,255,.16)';X.beginPath();X.arc(-r*.2,-r*.26,r*.18,0,Math.PI*2);X.fill();
  X.fillStyle='rgba(255,255,255,.05)';X.beginPath();X.arc(r*.26,r*.22,r*.1,0,Math.PI*2);X.fill();
  X.restore();
}
function trash0(x,y,r,rt){
  X.save();X.translate(x,y);X.rotate(rt);
  X.fillStyle='#9a8a70';
  X.beginPath();X.moveTo(-r*.7,-r*.4);X.lineTo(r*.3,-r*.8);X.lineTo(r*.85,-r*.15);
  X.lineTo(r*.5,r*.65);X.lineTo(-r*.35,r*.7);X.lineTo(-r*.8,r*.15);X.closePath();X.fill();
  X.strokeStyle='rgba(0,0,0,.15)';X.lineWidth=r*.05;X.stroke();
  X.strokeStyle='#6a5a40';X.lineWidth=r*.03;X.beginPath();X.moveTo(-r*.3,-r*.5);X.lineTo(r*.1,r*.3);X.stroke();
  X.beginPath();X.moveTo(r*.4,-r*.15);X.lineTo(-r*.35,r*.45);X.stroke();
  X.fillStyle='rgba(80,60,0,.15)';X.beginPath();X.arc(r*.15,-r*.1,r*.12,0,Math.PI*2);X.fill();
  X.restore();
}
function gem0(x,y,r,rt,hue,hue2){
  X.save();X.translate(x,y);X.rotate(rt);
  const h=hue||200;
  const g=X.createRadialGradient(-r*.12,-r*.12,0,0,0,r);
  g.addColorStop(0,'hsl('+h+',80%,55%)');g.addColorStop(.3,'hsl('+h+',70%,40%)');
  g.addColorStop(.6,'hsl('+h+',60%,18%)');g.addColorStop(1,'hsl('+h+',50%,5%)');
  X.fillStyle=g;
  X.beginPath();X.moveTo(0,-r);X.lineTo(r*.7,0);X.lineTo(0,r*.7);X.lineTo(-r*.7,0);X.closePath();X.fill();
  X.strokeStyle='rgba(255,255,255,.15)';X.lineWidth=r*.07;X.stroke();
  X.fillStyle='rgba(255,255,255,.15)';X.beginPath();X.moveTo(0,-r);X.lineTo(0,0);X.lineTo(-r*.18,-r*.22);X.closePath();X.fill();
  X.restore();
}

// ════════════════ REWARD 1: 珠宝奇珍 ════════════════
function stone1(x,y,r,rt){
  X.save();X.translate(x,y);X.rotate(rt);
  X.fillStyle='#8a8590';
  X.beginPath();X.moveTo(-r*.65,-r*.35);X.lineTo(r*.2,-r*.78);X.lineTo(r*.82,-r*.08);
  X.lineTo(r*.45,r*.62);X.lineTo(-r*.3,r*.72);X.lineTo(-r*.78,r*.12);X.closePath();X.fill();
  X.strokeStyle='rgba(255,255,255,.06)';X.lineWidth=r*.05;X.stroke();
  X.fillStyle='#6a6570';X.beginPath();X.moveTo(-r*.65,-r*.35);X.lineTo(r*.2,-r*.78);X.lineTo(r*.08,-r*.25);X.lineTo(-r*.25,-r*.08);X.closePath();X.fill();
  X.restore();
}
function agate1(x,y,r,rt){
  X.save();X.translate(x,y);X.rotate(rt);
  const g=X.createRadialGradient(0,0,0,0,0,r);
  g.addColorStop(0,'#f04020');g.addColorStop(.12,'#e82818');g.addColorStop(.2,'#f8d0b0');
  g.addColorStop(.35,'#d01810');g.addColorStop(.45,'#fff0e0');g.addColorStop(.55,'#c01008');
  g.addColorStop(.65,'#ffe8d0');g.addColorStop(.78,'#901008');g.addColorStop(.88,'#b81810');g.addColorStop(1,'#600808');
  X.fillStyle=g;X.beginPath();X.arc(0,0,r,0,Math.PI*2);X.fill();
  X.strokeStyle='rgba(255,255,255,.1)';X.lineWidth=r*.07;X.beginPath();X.arc(0,0,r,0,Math.PI*2);X.stroke();
  X.fillStyle='rgba(255,255,255,.08)';X.beginPath();X.arc(-r*.2,-r*.25,r*.3,0,Math.PI*2);X.fill();
  X.restore();
}
function pearl1(x,y,r,rt,pearlType){
  X.save();X.translate(x,y);X.rotate(rt);
  const isBlack=pearlType===0;
  const g=X.createRadialGradient(-r*.15,-r*.2,0,0,0,r);
  if(isBlack){
    g.addColorStop(0,'#a8b0a0');g.addColorStop('.12','#687868');g.addColorStop('.3','#304030');
    g.addColorStop('.55','#1a2018');g.addColorStop('.8','#0c1008');g.addColorStop(1,'#040804');
  }else{
    g.addColorStop(0,'#fef8e8');g.addColorStop('.18','#f8e8c0');g.addColorStop('.38','#e8c888');
    g.addColorStop('.6','#c8a058');g.addColorStop('.82','#987038');g.addColorStop(1,'#584018');
  }
  X.fillStyle=g;X.beginPath();X.arc(0,0,r*.88,0,Math.PI*2);X.fill();
  X.strokeStyle='rgba(255,255,255,.15)';X.lineWidth=r*.05;X.beginPath();X.arc(0,0,r*.88,0,Math.PI*2);X.stroke();
  if(isBlack){
    X.fillStyle='rgba(120,180,150,.15)';X.beginPath();X.ellipse(-r*.1,-r*.2,r*.3,r*.2,0,0,Math.PI*2);X.fill();
    X.fillStyle='rgba(255,255,255,.2)';X.beginPath();X.arc(-r*.15,-r*.25,r*.08,0,Math.PI*2);X.fill();
  }else{
    X.fillStyle='rgba(255,240,200,.15)';X.beginPath();X.ellipse(-r*.1,-r*.25,r*.3,r*.16,0,0,Math.PI*2);X.fill();
    X.fillStyle='rgba(255,255,240,.35)';X.beginPath();X.arc(-r*.18,-r*.28,r*.1,0,Math.PI*2);X.fill();
  }
  X.restore();
}
function jade1(x,y,r,rt){
  X.save();X.translate(x,y);X.rotate(rt);
  const g=X.createRadialGradient(-r*.1,-r*.1,0,0,0,r);
  g.addColorStop(0,'#a0f0c0');g.addColorStop(.3,'#40b060');g.addColorStop(.65,'#107028');g.addColorStop(1,'#042010');
  X.fillStyle=g;
  X.beginPath();X.moveTo(0,-r);X.lineTo(r*.72,0);X.lineTo(0,r*.72);X.lineTo(-r*.72,0);X.closePath();X.fill();
  X.strokeStyle='rgba(255,255,255,.1)';X.lineWidth=r*.05;X.stroke();
  X.save();X.globalAlpha=.1;X.strokeStyle='#a0ffc0';X.lineWidth=r*.025;
  for(let f=0;f<3;f++){
    X.beginPath();X.moveTo(-r*.2+f*r*.2,-r*.15+f*r*.15);X.quadraticCurveTo(0,f*r*.1,r*.2+f*r*.1,r*.1+f*r*.05);X.stroke();
  }
  X.restore();
  X.fillStyle='rgba(255,255,255,.12)';X.beginPath();X.moveTo(0,-r);X.lineTo(0,0);X.lineTo(-r*.16,-r*.22);X.closePath();X.fill();
  X.restore();
}
function ruby1(x,y,r,rt){
  X.save();X.translate(x,y);X.rotate(rt);
  const g=X.createRadialGradient(-r*.1,-r*.1,0,0,0,r);
  g.addColorStop(0,'#ff9090');g.addColorStop(.3,'#e03040');g.addColorStop(.65,'#801020');g.addColorStop(1,'#300408');
  X.fillStyle=g;
  X.beginPath();X.moveTo(0,-r);X.lineTo(r*.68,0);X.lineTo(0,r*.68);X.lineTo(-r*.68,0);X.closePath();X.fill();
  X.strokeStyle='rgba(255,255,255,.1)';X.lineWidth=r*.05;X.stroke();
  X.fillStyle='rgba(255,255,255,.12)';X.beginPath();X.moveTo(0,-r);X.lineTo(0,0);X.lineTo(-r*.14,-r*.2);X.closePath();X.fill();
  X.restore();
}
function diamond1(x,y,r,rt,fire1,fire2){
  X.save();X.translate(x,y);X.rotate(rt);
  const K2=r/40,f1=fire1||hslFire(),f2=fire2||hslFire();
  X.beginPath();X.moveTo(0,r*1.05);X.lineTo(-r*.95,r*-.05);X.lineTo(r*.95,r*-.05);X.closePath();
  const pav=X.createLinearGradient(0,r*.6,0,r*-.05);
  pav.addColorStop(0,'#407090');pav.addColorStop(.4,'#5898b0');pav.addColorStop(.7,'#78b8c8');pav.addColorStop(1,'#98d0e0');
  X.fillStyle=pav;X.fill();X.strokeStyle='rgba(255,255,255,.2)';X.lineWidth=K2*.7;X.stroke();
  X.save();X.globalAlpha=.22;X.strokeStyle='#fff';X.lineWidth=K2*.18;
  X.beginPath();X.moveTo(0,r*1.05);X.lineTo(0,r*-.05);X.stroke();
  X.beginPath();X.moveTo(0,r*1.05);X.lineTo(-r*.5,r*-.05);X.stroke();
  X.beginPath();X.moveTo(0,r*1.05);X.lineTo(r*.5,r*-.05);X.stroke();X.restore();
  X.strokeStyle='rgba(255,255,255,.35)';X.lineWidth=K2;X.beginPath();X.moveTo(-r*.95,r*-.05);X.lineTo(r*.95,r*-.05);X.stroke();
  const crownH=r*.55;
  X.beginPath();X.moveTo(-r*.95,r*-.05);X.lineTo(-r*.52,r*-.05-crownH);X.lineTo(r*.52,r*-.05-crownH);X.lineTo(r*.95,r*-.05);X.closePath();
  const cr=X.createLinearGradient(0,r*-.05-crownH,0,r*-.05);
  cr.addColorStop(0,'#e0f0ff');cr.addColorStop(.25,'#c8e8f8');cr.addColorStop(.6,'#90c8e0');cr.addColorStop(1,'#60a0c0');
  X.fillStyle=cr;X.fill();X.strokeStyle='rgba(255,255,255,.2)';X.lineWidth=K2*.7;X.stroke();
  X.save();X.globalAlpha=.2;X.strokeStyle='#fff';X.lineWidth=K2*.18;
  X.beginPath();X.moveTo(0,r*-.05);X.lineTo(0,r*-.05-crownH);X.stroke();
  X.beginPath();X.moveTo(-r*.52,r*-.05-crownH);X.lineTo(-r*.7,r*-.05);X.stroke();
  X.beginPath();X.moveTo(r*.52,r*-.05-crownH);X.lineTo(r*.7,r*-.05);X.stroke();X.restore();
  X.fillStyle=f1;
  X.beginPath();X.moveTo(0,r*-.05-crownH*.7);X.lineTo(-r*.52,r*-.05-crownH);X.lineTo(-r*.7,r*-.05);X.lineTo(-r*.3,r*-.05);X.closePath();X.fill();
  X.fillStyle=f2;
  X.beginPath();X.moveTo(0,r*-.05-crownH*.7);X.lineTo(r*.52,r*-.05-crownH);X.lineTo(r*.7,r*-.05);X.lineTo(r*.3,r*-.05);X.closePath();X.fill();
  X.beginPath();X.moveTo(-r*.52,r*-.05-crownH);X.lineTo(r*.52,r*-.05-crownH);
  X.lineTo(r*.32,r*-.05-crownH-r*.08);X.lineTo(-r*.32,r*-.05-crownH-r*.08);X.closePath();
  const tg=X.createLinearGradient(0,r*-.05-crownH-r*.08,0,r*-.05-crownH);
  tg.addColorStop(0,'#ffffff');tg.addColorStop(.5,'#f0f6ff');tg.addColorStop(1,'#d8e8f4');
  X.fillStyle=tg;X.fill();X.strokeStyle='rgba(255,255,255,.4)';X.lineWidth=K2*.4;X.stroke();
  X.fillStyle='rgba(255,255,255,.3)';X.beginPath();X.ellipse(-r*.05,r*-.05-crownH*.8,r*.08,r*.04,-.2,0,Math.PI*2);X.fill();
  X.save();X.globalAlpha=.22;
  for(let j=0;j<3;j++){const sa=-Math.PI/2+j*Math.PI/2;X.fillStyle='rgba(255,255,255,.6)';X.beginPath();X.moveTo(0,r*-.05-crownH*.5);X.lineTo(Math.cos(sa)*r*.35,Math.sin(sa)*r*.13+r*-.05-crownH*.3);X.lineTo(Math.cos(sa+.15)*r*.13,Math.sin(sa+.15)*r*.07+r*-.05-crownH*.3);X.closePath();X.fill();}
  X.restore();
  for(let j=0;j<4;j++){const sxX=((j%2===0)?-1:1)*r*(.28+j*.07);const syX=r*-.05-crownH*(.28+j*.11);const hues=[200,215,235,270][j];X.fillStyle='hsla('+hues+',80%,75%,.3)';X.beginPath();X.arc(sxX,syX,K2*.65,0,Math.PI*2);X.fill();}
  X.restore();
}
function hslFire(){
  const h=[198,202,208,215,222,235,255,270,290,330,350,360][Math.floor(Math.random()*12)];
  return 'hsla('+h+','+(55+Math.random()*35)+'%,'+(50+Math.random()*40)+'%,'+(.45+Math.random()*.3)+')';
}

// ════════════════ REWARD 2: 灵石奇珍 ════════════════
function crystalShard(x,y,r,rt){
  X.save();X.translate(x,y);X.rotate(rt);
  X.fillStyle='#787080';
  X.beginPath();X.moveTo(-r*.65,-r*.45);X.lineTo(r*.18,-r*.8);X.lineTo(r*.75,-r*.18);
  X.lineTo(r*.55,r*.52);X.lineTo(-r*.08,r*.68);X.lineTo(-r*.7,r*.22);X.closePath();X.fill();
  X.strokeStyle='rgba(200,200,220,.15)';X.lineWidth=r*.04;X.stroke();
  X.fillStyle='rgba(180,180,220,.1)';X.beginPath();X.moveTo(-r*.65,-r*.45);X.lineTo(r*.18,-r*.8);X.lineTo(r*.1,-r*.28);X.lineTo(-r*.28,-r*.08);X.closePath();X.fill();
  X.restore();
}
function spiritMarrow(x,y,r,rt){
  X.save();X.translate(x,y);X.rotate(rt);
  const g=X.createRadialGradient(-r*.06,-r*.12,0,0,0,r);
  g.addColorStop(0,'#e8fff0');g.addColorStop(.12,'#c0ffd8');g.addColorStop(.3,'#50e080');
  g.addColorStop(.55,'#188040');g.addColorStop(.78,'#0a3818');g.addColorStop(1,'#041808');
  X.fillStyle=g;X.beginPath();X.ellipse(0,0,r*.86,r*.58,0,0,Math.PI*2);X.fill();
  X.strokeStyle='rgba(180,240,210,.12)';X.lineWidth=r*.04;X.beginPath();X.ellipse(0,0,r*.86,r*.58,0,0,Math.PI*2);X.stroke();
  X.save();X.globalAlpha=.08;X.fillStyle='#fff';
  X.beginPath();X.ellipse(-r*.15,-r*.05,r*.3,r*.15,-.2,0,Math.PI*2);X.fill();
  X.beginPath();X.ellipse(r*.1,r*.05,r*.22,r*.12,.15,0,Math.PI*2);X.fill();
  X.restore();
  X.fillStyle='rgba(255,255,255,.18)';X.beginPath();X.ellipse(-r*.12,-r*.16,r*.22,r*.12,-.25,0,Math.PI*2);X.fill();
  X.fillStyle='rgba(160,240,200,.06)';X.beginPath();X.ellipse(0,0,r*1.05,r*.7,0,0,Math.PI*2);X.fill();
  X.restore();
}
function bloodJade(x,y,r,rt){
  X.save();X.translate(x,y);X.rotate(rt);
  X.beginPath();X.moveTo(0,-r*1.05);
  X.quadraticCurveTo(r*.68,-r*.32,r*.62,r*.3);
  X.quadraticCurveTo(r*.52,r*.82,0,r*.88);
  X.quadraticCurveTo(-r*.52,r*.82,-r*.62,r*.3);
  X.quadraticCurveTo(-r*.68,-r*.32,0,-r*1.05);
  X.closePath();
  const g=X.createRadialGradient(-r*.08,-r*.12,0,0,0,r);
  g.addColorStop(0,'#ff5858');g.addColorStop(.18,'#e02030');g.addColorStop(.48,'#801020');
  g.addColorStop(.75,'#400810');g.addColorStop(1,'#180208');
  X.fillStyle=g;X.fill();
  X.strokeStyle='rgba(255,180,180,.1)';X.lineWidth=r*.04;X.stroke();
  X.save();X.globalAlpha=.12;X.strokeStyle='#800020';X.lineWidth=r*.025;
  for(let v=0;v<3;v++){
    X.beginPath();X.moveTo(-r*.35,-r*.4+v*r*.35);X.quadraticCurveTo(0,-r*.3+v*r*.4,r*.35,-r*.35+v*r*.3);X.stroke();
  }
  X.restore();
  X.fillStyle='rgba(255,255,255,.12)';X.beginPath();X.ellipse(-r*.08,-r*.32,r*.16,r*.25,-.18,0,Math.PI*2);X.fill();
  X.restore();
}
function soulCore(x,y,r,rt){
  X.save();X.translate(x,y);X.rotate(rt+T*.6);
  const sr=r*.75;
  for(let ring=0;ring<3;ring++){
    const rr=sr*(.48+ring*.24);
    const ringRot=T*(1.8+ring*1.3)*(-1+ring%2*2);
    X.save();X.rotate(ringRot);
    const ringAlpha=.22+ring*.06;
    X.strokeStyle='hsla('+(240+ring*35)+',75%,'+(48+ring*12)+'%,'+ringAlpha+')';
    X.lineWidth=r*.05*(1+ring*.2);X.setLineDash([r*.12,r*.06+ring*.03]);
    X.beginPath();X.arc(0,0,rr,0,Math.PI*2);X.stroke();
    X.setLineDash([]);
    X.restore();
  }
  const coreG=X.createRadialGradient(0,0,0,0,0,sr*.35);
  coreG.addColorStop(0,'#ffffff');coreG.addColorStop(.1,'#e0d0ff');
  coreG.addColorStop(.3,'#8040e0');coreG.addColorStop(.6,'#3018a0');
  coreG.addColorStop(.82,'#100840');coreG.addColorStop(1,'#040210');
  X.fillStyle=coreG;X.beginPath();X.arc(0,0,sr*.35,0,Math.PI*2);X.fill();
  const glowG=X.createRadialGradient(0,0,sr*.15,0,0,sr*.65);
  glowG.addColorStop(0,'rgba(180,140,255,.2)');glowG.addColorStop(1,'rgba(0,0,0,0)');
  X.fillStyle=glowG;X.beginPath();X.arc(0,0,sr*.65,0,Math.PI*2);X.fill();
  X.restore();
}
function holyStone(x,y,r,rt){
  X.save();X.translate(x,y);X.rotate(rt);
  const or3=r*.6;
  for(let i=0;i<16;i++){
    const ra=i*Math.PI*2/16;const rayLen=or3*(.75+(i%3)*.18);
    X.fillStyle='rgba(255,220,100,'+(.12+(i%3)*.08)+')';
    X.beginPath();X.moveTo(0,0);X.lineTo(Math.cos(ra-or3*.05)*rayLen,Math.sin(ra-or3*.05)*rayLen);X.lineTo(Math.cos(ra+or3*.05)*rayLen,Math.sin(ra+or3*.05)*rayLen);X.closePath();X.fill();
  }
  X.beginPath();
  for(let p=0;p<16;p++){
    const pa4=p*Math.PI/8-Math.PI/2,pr5=p%2===0?or3:or3*.48;
    p===0?X.moveTo(Math.cos(pa4)*pr5,Math.sin(pa4)*pr5):X.lineTo(Math.cos(pa4)*pr5,Math.sin(pa4)*pr5);
  }
  X.closePath();
  const sg=X.createRadialGradient(0,-or3*.08,0,0,0,or3);
  sg.addColorStop(0,'#ffffff');sg.addColorStop('.06','#fff8d0');sg.addColorStop('.22','#e0c040');
  sg.addColorStop('.48','#a08020');sg.addColorStop('.72','#604810');sg.addColorStop(1,'#201808');
  X.fillStyle=sg;X.fill();X.strokeStyle='rgba(255,240,180,.25)';X.lineWidth=r*.035;X.stroke();
  const cg=X.createRadialGradient(0,0,0,0,0,or3*.22);
  cg.addColorStop(0,'#ffffff');cg.addColorStop('.25','#fff8e0');cg.addColorStop('.6','#e0c040');cg.addColorStop(1,'rgba(160,120,30,0)');
  X.fillStyle=cg;X.beginPath();X.arc(0,0,or3*.22,0,Math.PI*2);X.fill();
  for(let d=0;d<8;d++){
    const da=d*Math.PI/4;
    X.fillStyle='rgba(255,240,180,.35)';X.beginPath();X.arc(Math.cos(da)*or3*.95,Math.sin(da)*or3*.95,r*.04,0,Math.PI*2);X.fill();
  }
  X.restore();
}

// ════════════════ 开/关 ════════════════
function doOpen(t){items.length=0;sparks.length=0;radiance.length=0;open=true;lidPhase='flying';lidFV=-9;lidRV=(Math.random()-.5)*3.5;glowA=1;lidFY=0;lidFR=0;const b=cb(),chestTop=b.y+b.h*.12;if(t>=4){const hue=rewardSkin===0?40:rewardSkin===1?200:140;for(let i=0;i<30;i++){const a=-Math.PI/2+(Math.random()-.5)*.7;radiance.push({x:b.x+b.w/2+(Math.random()-.5)*b.w*.3,y:chestTop,vx:Math.cos(a)*(1+Math.random()*4),vy:-2-Math.random()*5,r:3+Math.random()*7,life:.6+Math.random()*1.2,hue:hue+Math.random()*25});}}const counts=[0,7,10,12,15,20];const n=counts[t]||10;for(let i=0;i<n;i++){const a=-Math.PI/2+(Math.random()-.5)*1.3;const it={x:b.x+b.w/2+(Math.random()-.5)*25,y:chestTop,vx:Math.cos(a)*(3+Math.random()*5),vy:Math.sin(a)*(3+Math.random()*5)-2.5,r:5+Math.random()*6,rt:Math.random()*6,rv:(Math.random()-.5)*8,life:2.5+Math.random()*2,g:.12,shiny:false};if(rewardSkin===0){if(t===1){it.type='trash';it.fn=trash0;}else if(t===2){it.type='coin';it.fn=coin0;it.color=[240,190,130];it.letter='¢';}else if(t===3){it.type='coin';it.fn=coin0;it.color=[210,215,230];it.letter='S';}else if(t===4){it.type='coin';it.fn=coin0;it.color=[255,225,60];it.letter='G';it.shiny=true;}else if(t===5){if(i<n*.35){it.type='gem';it.fn=gem0;it.hue=[200,300,30][i%3];it.r=5+Math.random()*5;it.shiny=true;}else{it.type='coin';it.fn=coin0;it.color=[255,225,60];it.letter='G';it.shiny=true;}}}else if(rewardSkin===1){if(t===1){it.type='stone';it.fn=stone1;it.r=3+Math.random()*4;}else if(t===2){it.type='agate';it.fn=agate1;it.r=5+Math.random()*5;}else if(t===3){it.type='pearl';it.fn=pearl1;it.r=5+Math.random()*5;it.shiny=true;it.pearlType=Math.random()<.5?0:1;}else if(t===4){if(Math.random()<.5){it.type='jade';it.fn=jade1;}else{it.type='ruby';it.fn=ruby1;}it.r=5+Math.random()*5;it.shiny=true;}else if(t===5){it.type='gem';it.fn=diamond1;it.r=6+Math.random()*5;it.shiny=true;it.fire1=hslFire();it.fire2=hslFire();}}else{if(t===1){it.type='crystal';it.fn=crystalShard;it.r=3+Math.random()*4;}else if(t===2){it.type='marrow';it.fn=spiritMarrow;it.r=5+Math.random()*5;it.shiny=true;}else if(t===3){it.type='bloodJade';it.fn=bloodJade;it.r=5+Math.random()*4;it.shiny=true;}else if(t===4){it.type='soulCore';it.fn=soulCore;it.r=6+Math.random()*4;it.shiny=true;}else if(t===5){it.type='holy';it.fn=holyStone;it.r=6+Math.random()*5;it.shiny=true;}}items.push(it);}for(let i=0;i<18+t*5;i++)sparks.push({x:b.x+b.w/2+(Math.random()-.5)*100,y:b.y-8,vx:(Math.random()-.5)*6,vy:-Math.random()*7-2,r:1+Math.random()*2.5,life:.4+Math.random()*.8});}
function doClose(){if(!open)return;open=false;lidPhase='closing';lidCloseStart=lidFY;lidCloseTarget=-cb().h*.28;lidCloseProgress=0;lidCloseDuration=.5;}

// ════════════════ 主循环 ════════════════
function loop(ts){requestAnimationFrame(loop);const dt=Math.min((ts-(loop._t||ts))/1000,.08);loop._t=ts;T+=dt;idleBob+=dt;if(lidPhase==='flying'){lidFV+=.14;lidFY+=lidFV*dt*40;lidFR+=lidRV*dt;if(lidFY<-55){lidPhase='closing';lidCloseStart=lidFY;lidCloseTarget=-cb().h*.28;lidCloseProgress=0;lidCloseDuration=.58;}}else if(lidPhase==='closing'){lidCloseProgress+=dt/lidCloseDuration;const t2=Math.min(lidCloseProgress,1);lidFY=lidCloseStart+(lidCloseTarget-lidCloseStart)*easeOutCubic(t2);lidFR=lidFR*(1-t2);if(lidCloseProgress>=1){lidFY=lidCloseTarget;lidFR=0;lidPhase='closed';}}if(glowA>0)glowA-=dt*.8;for(const it of items){it.vy+=it.g;it.x+=it.vx*dt*30;it.y+=it.vy*dt*30;it.life-=dt;if(it.y>flr-it.r){it.y=flr-it.r;it.vy*=-.28;it.vx*=.65;if(Math.abs(it.vy)<.25)it.vy=it.vx=0;}it.rt+=(it.rv||0)*dt;}for(let i=items.length-1;i>=0;i--){if(items[i].life<=0)items.splice(i,1);}for(const s of sparks){s.x+=s.vx*dt*40;s.y+=s.vy*dt*40;s.life-=dt;}for(let i=sparks.length-1;i>=0;i--){if(sparks[i].life<=0)sparks.splice(i,1);}for(const r of radiance){r.x+=r.vx*dt*30;r.y+=r.vy*dt*30;r.life-=dt;r.r*=.995;}for(let i=radiance.length-1;i>=0;i--){if(radiance[i].life<=0)radiance.splice(i,1);}if(Math.random()<.15)sparks.push({x:W*.2+Math.random()*W*.6,y:flr-Math.random()*20,vx:(Math.random()-.5)*.3,vy:-.4-Math.random()*.5,life:.8+Math.random()*1.2,r:.4+Math.random()*.8});X.fillStyle='rgba(0,0,0,0)';X.clearRect(0,0,W,H);for(const r of radiance){const a2=Math.max(0,Math.min(1,r.life/.8));X.fillStyle='hsla('+r.hue+',80%,'+(55+a2*20)+'%,'+(a2*.45).toFixed(2)+')';X.beginPath();X.arc(r.x,r.y,r.r,0,Math.PI*2);X.fill();}for(const it of items){if(!it.fn)continue;if(it.type==='coin')it.fn(it.x,it.y,it.r,it.rt,it.color,it.letter);else if(it.type==='gem')it.fn(it.x,it.y,it.r,it.rt,it.fire1!==undefined?it.fire1:it.hue,it.fire2);else if(it.type==='pearl')it.fn(it.x,it.y,it.r,it.rt,it.pearlType);else it.fn(it.x,it.y,it.r,it.rt);}for(const s of sparks){X.fillStyle='rgba(255,220,140,'+Math.min(s.life,.55)+')';X.beginPath();X.arc(s.x,s.y,s.r,0,Math.PI*2);X.fill();}if(glowA>.01){const b2=cb();X.save();X.globalAlpha=glowA*.16;const cg4=mkRadial(b2.x+b2.w/2,b2.y+b2.h*.3,0,b2.x+b2.w/2,b2.y,b2.w*.42,[0,'rgba(255,200,80,.25)',1,'rgba(0,0,0,0)']);X.fillStyle=cg4;X.fillRect(b2.x-b2.w*.15,b2.y-b2.h*.08,b2.w*1.3,b2.h*1.3);X.restore();}const bob=Math.sin(idleBob*1.8)*1.2;const b3=cb();body(b3.x,b3.y+bob,b3.w,b3.h);lid(b3.x,b3.y+(lidPhase==='closed'?-b3.h*.28:lidFY)+bob,b3.w,b3.h*.28,lidPhase==='closed'?0:lidFR);}requestAnimationFrame(loop);

// ════════════════ API ════════════════
window.openChest=function(tier){if(minimized){minimized=false;C.style.transform='';C.style.opacity='1';}doOpen(tier||3);};
window.doCloseChest=function(){doClose();};
window.setChestSkin=function(skin){chestSkin=skin;try{const s=JSON.parse(localStorage.getItem('learnAppSkins')||'{}');s.chest=String(skin);localStorage.setItem('learnAppSkins',JSON.stringify(s));}catch(_){}syncSkinUI();};
window.setRewardSkin=function(skin){rewardSkin=skin;try{const s=JSON.parse(localStorage.getItem('learnAppSkins')||'{}');s.item=String(skin);localStorage.setItem('learnAppSkins',JSON.stringify(s));}catch(_){}syncSkinUI();};
window.getChestSkin=function(){return chestSkin;};window.getRewardSkin=function(){return rewardSkin;};
function syncSkinUI(){try{const p=document.getElementById('skinPopup');if(!p)return;p.querySelectorAll('.theme-dot').forEach(d=>{const cat=d.getAttribute('data-skin-cat');if(cat==='chest')d.style.outline=+d.getAttribute('data-skin')===chestSkin?'2px solid var(--accent)':'';if(cat==='item')d.style.outline=+d.getAttribute('data-skin')===rewardSkin?'2px solid var(--accent)':'';});}catch(_){}}
setTimeout(syncSkinUI,100);
