/* HOLLOWMERE — THE BACKSTORY
   The opening cinematic: about eighty seconds of painted, lit and animated scenes, narration
   and score that tell how you came to be caught in the house. Everything is drawn live on a
   2D canvas (textures are generated when it starts) and every sound is made with Web Audio,
   so there is no video file to download.

   index.html decides WHEN it plays (once for an account, every visit for a guest, any time
   from the title screen) and calls:

     HMStory.play({ac, out, reduceFlash, onEnd})
       ac           the game's AudioContext (optional: without it the story plays silent)
       out          the node to send sound into (the game's master volume)
       reduceFlash  the PHOTOSENSITIVITY setting: no lightning flashes, flickering lights,
                    bright flares or hard jump cut
       onEnd        called once, when the story finishes or is skipped

   The player's "reduce motion" system setting is respected too: no camera moves or shake.
   ESC, the SKIP button, or holding a tap skips it.

   Layout of this file:
     helpers, noise and generated textures (TEXTURES)
     shared drawing: corridor renderer, light map, people, the thing, sigil (DRAWING)
     the seven scenes (SCENES), the score (SOUND), the player (PLAYER)
   Every scene is drawn on a 1600x900 stage that is scaled to cover the screen. Everything
   in a scene is a pure function of time, so the story can be scrubbed or recorded. */
(function(){
'use strict';
const TAU=Math.PI*2,SW=1600,SH=900,VX=800,VY=450,F=700;
const css=`
#storyOv{position:fixed;inset:0;z-index:90;background:#000;opacity:0;transition:opacity .6s;cursor:default;
  -webkit-user-select:none;user-select:none;touch-action:none}
#storyOv.on{opacity:1}
#storyOv canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
#storyLine{position:absolute;left:50%;bottom:9.5%;transform:translateX(-50%);width:min(820px,88vw);text-align:center;
  font-family:'IM Fell English',serif;font-style:italic;font-size:clamp(17px,2.4vw,25px);line-height:1.45;color:#ddd5c2;
  text-shadow:0 2px 10px #000,0 0 22px rgba(0,0,0,.95);opacity:0;transition:opacity .9s}
#storyLine.on{opacity:1}
#storySkip{position:absolute;right:22px;bottom:20px;font-family:'Cormorant SC',serif;font-size:14px;letter-spacing:4px;
  color:#8f8874;background:rgba(8,8,12,.55);border:1px solid #2c2a26;padding:9px 16px;cursor:pointer;opacity:.75;transition:opacity .3s,color .3s}
#storySkip:hover,#storySkip:focus-visible{opacity:1;color:#e2d9c2;outline:none;border-color:#6b604a}
#storyHint{position:absolute;left:22px;bottom:24px;font-family:'Cormorant SC',serif;font-size:12px;letter-spacing:3px;color:#5d584c;opacity:.8}
#storyBar{position:absolute;left:0;bottom:0;height:2px;background:linear-gradient(90deg,#5a2a10,#ffb060);width:0;opacity:.55}
`;

/* ================= helpers ================= */
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const ease=x=>x<=0?0:x>=1?1:x*x*(3-2*x);
const easeIn=x=>x<=0?0:x>=1?1:x*x*x;
const easeOut=x=>x<=0?0:x>=1?1:1-Math.pow(1-x,3);
const lerp=(a,b,t)=>a+(b-a)*t;
const win=(t,a,b,fi,fo)=>ease((t-a)/fi)*(1-ease((t-(b-fo))/fo));   /* 0→1 between a and b, with fades */
function rng(seed){let s=seed>>>0||1;return ()=>{s=(s+0x6D2B79F5)>>>0;let z=s;z=Math.imul(z^(z>>>15),z|1);z^=z+Math.imul(z^(z>>>7),z|61);return ((z^(z>>>14))>>>0)/4294967296;};}
const hash=i=>{let x=Math.imul(i^0x9e3779b9,0x85ebca6b);x^=x>>>13;x=Math.imul(x,0xc2b2ae35);x^=x>>>16;return (x>>>0)/4294967296;};
function cv(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function poly(g,pts){g.beginPath();g.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)g.lineTo(pts[i][0],pts[i][1]);g.closePath();}
function rgrad(g,x,y,r,stops){const gr=g.createRadialGradient(x,y,0,x,y,Math.max(0.01,r));stops.forEach(s=>gr.addColorStop(s[0],s[1]));return gr;}
function glow(g,x,y,r,rgb,a){if(a<=0.002||r<=0)return;g.save();g.globalCompositeOperation='lighter';
  g.fillStyle=rgrad(g,x,y,r,[[0,`rgba(${rgb},${a})`],[0.35,`rgba(${rgb},${a*0.35})`],[1,`rgba(${rgb},0)`]]);
  g.fillRect(x-r,y-r,r*2,r*2);g.restore();}

/* ================= TEXTURES ================= */
function Noise(seed){
  const r=rng(seed),G=new Float32Array(65536);for(let i=0;i<G.length;i++)G[i]=r();
  function n(x,y,p){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,P=p||256;
    const a=((xi%P)+P)%P&255,b=(((xi+1)%P)+P)%P&255,c=yi&255,d=(yi+1)&255;
    const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
    return lerp(lerp(G[c*256+a],G[c*256+b],u),lerp(G[d*256+a],G[d*256+b],u),v);}
  function fbm(x,y,oct,p){let s=0,a=0.5,f=1,nm=0;for(let i=0;i<oct;i++){s+=a*n(x*f,y*f,p?p*f:0);nm+=a;a*=0.5;f*=2;}return s/nm;}
  return {n,fbm};
}
function pixels(w,h,fn){const c=cv(w,h),g=c.getContext('2d'),im=g.createImageData(w,h),d=im.data;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=fn(x,y),i=(y*w+x)*4;d[i]=v[0];d[i+1]=v[1];d[i+2]=v[2];d[i+3]=v.length>3?v[3]:255;}
  g.putImageData(im,0,0);return c;}
function age(c,N,k,stain){/* darken a texture with tileable grime */
  const g=c.getContext('2d'),w=c.width,h=c.height,im=g.getImageData(0,0,w,h),d=im.data;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;
    let m=1-k+k*1.4*N.fbm(x/64,y/64,4,w/64);
    if(stain){const s=N.fbm(x/40+9,y/140,3,w/40);if(s>0.6)m*=1-(s-0.6)*1.6;}
    m*=0.92+0.16*N.n(x*0.9,y*0.9);
    d[i]*=m;d[i+1]*=m;d[i+2]*=m;}
  g.putImageData(im,0,0);return c;}

let ASSETS=null;
function assets(){
  if(ASSETS)return ASSETS;
  const N=Noise(1887),A={N};
  /* storm clouds and drifting fog: tile left-to-right */
  A.clouds=pixels(1024,320,(x,y)=>{const v=N.fbm(x/128,y/64,5,8),e=Math.sin(Math.PI*y/320);
    const a=clamp((v-0.42)*3.2,0,1)*e;const lit=clamp((N.fbm(x/128+3,(y-6)/64,4,8)-v)*6+0.3,0,1);
    return [16+lit*30,18+lit*32,30+lit*40,a*235];});
  A.fog=pixels(1024,256,(x,y)=>{const v=N.fbm(x/128,y/48+7,4,8),e=Math.pow(Math.sin(Math.PI*y/256),1.5);
    return [205,212,228,clamp(v*1.8-0.55,0,1)*e*255];});
  A.grain=[0,1,2].map(k=>{const r=rng(77+k);return pixels(256,256,()=>{const v=r()*255;return [v,v,v,255];});});
  /* wallpaper: an old damask, water-stained */
  {const c=cv(256,256),g=c.getContext('2d');g.fillStyle='#26302a';g.fillRect(0,0,256,256);
    g.fillStyle='rgba(60,74,58,.5)';for(let x=0;x<256;x+=32)g.fillRect(x,0,2,256);
    const motif=(cx,cy)=>{g.save();g.translate(cx,cy);g.strokeStyle='rgba(150,165,120,.22)';g.fillStyle='rgba(140,155,110,.16)';g.lineWidth=2;
      g.beginPath();g.ellipse(0,0,34,52,0,0,TAU);g.stroke();
      for(let i=0;i<3;i++){g.save();g.rotate((i-1)*0.7);g.beginPath();g.ellipse(0,-20,8,20,0,0,TAU);g.fill();g.restore();}
      g.beginPath();g.moveTo(0,-4);g.quadraticCurveTo(10,18,0,40);g.quadraticCurveTo(-10,18,0,-4);g.fill();
      g.beginPath();g.arc(-22,30,5,0,TAU);g.arc(22,30,5,0,TAU);g.fill();g.restore();};
    for(let ox=-256;ox<=256;ox+=256)for(let oy=-256;oy<=256;oy+=256){motif(64+ox,64+oy);motif(192+ox,192+oy);
      g.fillStyle='rgba(150,165,120,.18)';g.beginPath();g.arc(192+ox,64+oy,4,0,TAU);g.arc(64+ox,192+oy,4,0,TAU);g.fill();}
    A.wall=age(c,N,0.55,true);}
  /* wainscot panels */
  {const c=cv(128,128),g=c.getContext('2d');g.fillStyle='#2b1b11';g.fillRect(0,0,128,128);
    for(let x=0;x<128;x+=64){g.fillStyle='#24160d';g.fillRect(x+8,14,48,100);
      g.fillStyle='rgba(255,210,160,.08)';g.fillRect(x+8,14,48,3);g.fillRect(x+8,14,3,100);
      g.fillStyle='rgba(0,0,0,.35)';g.fillRect(x+8,111,48,3);g.fillRect(x+53,14,3,100);}
    g.fillStyle='rgba(255,210,160,.1)';g.fillRect(0,0,128,4);g.fillStyle='rgba(0,0,0,.4)';g.fillRect(0,4,128,3);
    A.wain=age(c,N,0.4,false);}
  /* floorboards with a worn red runner */
  A.floor=age(pixels(256,256,(x,y)=>{
    const pl=Math.floor(x/32),off=hash(pl)*256,joint=((y+off)%256)<3,edge=x%32<2;
    const gr=0.75+0.25*Math.sin((x+N.fbm(x/16,y/64,3)*40)*0.9)+0.1*N.n(x/3,y/30);
    let c=[60*gr,40*gr,26*gr];
    if(x>=72&&x<184){const u=x-72,v=y%64;
      c=[86,20,22];if(u<6||u>105)c=[40,10,12];
      if(u>=9&&u<12||u>=99&&u<102)c=[120,92,48];
      const dd=Math.abs((u-56))+Math.abs(v-32);if(dd>22&&dd<26)c=[110,84,44];if(dd<6)c=[110,84,44];
      const wear=N.fbm(x/20,y/40,3);c=c.map(q=>q*(0.6+0.5*wear));}
    else if(edge||joint)c=[14,9,6];
    return c;}),N,0.35,false);
  /* cellar brick */
  A.brick=age(pixels(256,256,(x,y)=>{
    const row=Math.floor(y/32),bx=(x+(row%2)*32)%256,col=Math.floor(bx/64),id=row*8+col;
    const m=(y%32)<4||(bx%64)<4;if(m)return [26,23,20];
    const h=hash(id),k=0.75+0.5*N.n(x/4,y/4);
    return [(62+h*30)*k,(32+h*14)*k,(26+h*8)*k];}),N,0.5,true);
  /* flagstones */
  A.stone=age(pixels(256,256,(x,y)=>{
    const r=Math.floor(y/64),off=(r%2)*48,c=Math.floor(((x+off)%256)/80),id=r*7+c;
    const inX=(x+off)%256-c*80,inY=y%64;if(inX<3||inY<3||(c===3&&inX>=16))return [14,13,12];
    const h=hash(id+50),k=0.7+0.45*N.fbm(x/12,y/12,3);
    return [(48+h*20)*k,(46+h*18)*k,(44+h*16)*k];}),N,0.35,false);
  /* door planks */
  A.door=pixels(256,512,(x,y)=>{
    const pl=Math.floor(x/64),e=x%64<3;if(e)return [12,7,4];
    const gr=0.65+0.35*Math.sin((x*0.35+N.fbm(x/20,y/90,4)*14+pl*3))+0.15*N.n(x/2,y/24);
    const knot=Math.hypot(x%64-32-(hash(pl)-0.5)*30,(y-hash(pl+9)*512))<9?0.5:1;
    return [58*gr*knot,34*gr*knot,20*gr*knot];});
  A.pat={};['wall','wain','brick','stone','door','floor'].forEach(k=>{A.pat[k]=null;});
  /* the light map: a quarter-size darkness layer with holes cut where light falls */
  A.lm=cv(400,225);A.lg=A.lm.getContext('2d');
  /* fixed shapes: lightning, trees, veins, runes, cracks */
  const r=rng(7);
  function bolt(x0,y0,x1,y1,d,wd,out){if(d===0){out.push([x0,y0,x1,y1,wd]);return;}
    const mx=(x0+x1)/2+(r()-0.5)*Math.hypot(x1-x0,y1-y0)*0.32,my=(y0+y1)/2+(r()-0.5)*20;
    bolt(x0,y0,mx,my,d-1,wd,out);bolt(mx,my,x1,y1,d-1,wd,out);
    if(d>2&&r()<0.4)bolt(mx,my,mx+(r()-0.3)*220,my+120+r()*160,d-2,wd*0.5,out);}
  A.bolts=[[260,0,420,520],[1240,0,1120,470]].map(b=>{const o=[];bolt(b[0],b[1],b[2],b[3],7,3,o);return o;});
  function tree(d){const n={len:d===7?1:0.62+r()*0.22,ang:d===7?0:(r()-0.5)*1.1,d,kids:[]};
    if(d>0){const k=d>5?2:(r()<0.3?3:2);for(let i=0;i<k;i++)n.kids.push(tree(d-1));}return n;}
  A.trees=[tree(7),tree(7),tree(7)];
  A.veins=[];for(let v=0;v<16;v++){let a=v/16*TAU+r()*0.3,x=0,y=0,w=5;const pts=[[0,0]];
    for(let s=0;s<18;s++){a+=(r()-0.5)*0.7;x+=Math.cos(a)*20;y+=Math.sin(a)*14;pts.push([x,y]);}A.veins.push({pts,w});}
  A.runes=[];for(let i=0;i<20;i++){const st=[];for(let k=0;k<3;k++)st.push([Math.floor(r()*3)/2,Math.floor(r()*3)/2,Math.floor(r()*3)/2,Math.floor(r()*3)/2]);A.runes.push(st);}
  A.cracks=[];for(let i=0;i<8;i++){let a=i/8*TAU+r()*0.5,x=0,y=0;const p=[[0,0]];for(let s=0;s<7;s++){a+=(r()-0.5)*0.9;const l=0.12+r()*0.1;x+=Math.cos(a)*l;y+=Math.sin(a)*l;p.push([x,y]);}A.cracks.push(p);}
  ASSETS=A;return A;
}
function pattern(g,A,k){if(!A.pat[k])A.pat[k]=g.createPattern(A[k],'repeat');return A.pat[k];}

/* ================= DRAWING ================= */
/* --- the light map: darkness over everything, with light cut out of it --- */
function darkBegin(A,a,rgb){const l=A.lg;l.globalCompositeOperation='source-over';l.clearRect(0,0,400,225);
  l.fillStyle=`rgba(${rgb||'0,0,0'},${a})`;l.fillRect(0,0,400,225);l.globalCompositeOperation='destination-out';}
function lightAt(A,x,y,r,s){if(r<=0||s<=0)return;const l=A.lg,X=x/4,Y=y/4,R=r/4;
  l.fillStyle=rgrad(l,X,Y,R,[[0,`rgba(0,0,0,${s})`],[0.45,`rgba(0,0,0,${s*0.6})`],[1,'rgba(0,0,0,0)']]);l.fillRect(X-R,Y-R,R*2,R*2);}
function darkEnd(g,A){A.lg.globalCompositeOperation='source-over';g.drawImage(A.lm,0,0,SW,SH);}

/* --- a one-point-perspective room: floor, ceiling, two walls, an end wall --- */
const P=(X,Y,z)=>[VX+X*F/z,VY-Y*F/z];
function room(g,A,c){
  const W=c.W,zF=c.zFar,cz=c.camZ||0;
  g.fillStyle=c.ceil;g.fillRect(0,0,SW,SH);
  /* ceiling beams */
  if(c.beams){g.fillStyle=c.beams;for(let k=Math.ceil(cz/c.beamGap);;k++){const z=k*c.beamGap-cz;if(z<0.35)continue;if(z>zF)break;
      const a=P(-W,c.top,z),b=P(W,c.top,z),hh=0.05*F/z;g.fillRect(a[0],a[1],b[0]-a[0],hh);}}
  /* floor, one row at a time */
  const ft=A[c.floor],fw=ft.width,fh=ft.height,y0=Math.floor(VY-c.bot*F/zF);
  for(let y=y0;y<SH;y+=2){const z=-c.bot*F/(y+1-VY),xl=VX-W*F/z,xr=VX+W*F/z;
    const v=Math.floor((((z+cz)*c.fs)%fh+fh)%fh);g.drawImage(ft,0,v,fw,1,xl,y,xr-xl,2.6);}
  /* side walls, one column at a time */
  const ut=A[c.wall],lt=c.low?A[c.low]:null,xe=VX-W*F/zF;
  for(let side=-1;side<=1;side+=2)for(let i=0;i<xe;i+=4){
    const x=side<0?i:SW-i-4,z=W*F/(VX-i),u=Math.floor((((z+cz)*c.ws)%ut.width+ut.width)%ut.width);
    const top=VY-c.top*F/z,sp=VY-(lt?c.split:c.bot)*F/z,bot=VY-c.bot*F/z;
    g.drawImage(ut,u,0,1,ut.height,x,top,4.7,sp-top);
    if(lt)g.drawImage(lt,u%lt.width,0,1,lt.height,x,sp,4.7,bot-sp);}
  /* the end wall */
  const a=P(-W,c.top,zF),b=P(W,c.bot,zF),k=F/zF/c.ws;
  g.save();g.beginPath();g.rect(a[0],a[1],b[0]-a[0],b[1]-a[1]);g.clip();g.translate(a[0],a[1]);g.scale(k,k);
  g.fillStyle=pattern(g,A,c.wall);g.fillRect(0,0,(b[0]-a[0])/k,(b[1]-a[1])/k);g.restore();
  /* distance haze: the far end sinks into the dark */
  const ha=c.hazeA||0.82;g.fillStyle=rgrad(g,VX,VY,560,[[0,`rgba(${c.haze||'0,0,0'},${ha})`],[0.25,`rgba(${c.haze||'0,0,0'},${ha*0.67})`],[1,'rgba(0,0,0,0)']]);g.fillRect(0,0,SW,SH);
}
function wallQuad(side,W,z1,z2,y1,y2){const A=P(side*W,y2,z1),B=P(side*W,y2,z2),C=P(side*W,y1,z2),D=P(side*W,y1,z1);return [A,B,C,D];}

/* --- a walking person seen from behind, feet at (x,y), k pixels per world unit --- */
function person(g,x,y,k,ph,o){
  o=o||{};const s=k*0.95,sw=Math.sin(ph*Math.PI),bob=Math.abs(Math.cos(ph*Math.PI))*0.012*s;
  g.save();g.translate(x,y-bob);g.fillStyle=o.col||'#030304';g.strokeStyle=o.col||'#030304';g.lineCap='round';
  /* legs */
  g.lineWidth=0.07*s;g.beginPath();g.moveTo(-0.05*s,-0.42*s);g.lineTo(-0.06*s+sw*0.03*s,-0.02*s-Math.max(0,sw)*0.03*s);
  g.moveTo(0.05*s,-0.42*s);g.lineTo(0.06*s-sw*0.03*s,-0.02*s-Math.max(0,-sw)*0.03*s);g.stroke();
  /* coat, swaying */
  const cs=sw*0.025*s;
  g.beginPath();g.moveTo(-0.11*s,-0.78*s);g.quadraticCurveTo(-0.15*s,-0.5*s,-0.17*s+cs,-0.3*s);g.lineTo(0.17*s+cs,-0.3*s);
  g.quadraticCurveTo(0.15*s,-0.5*s,0.11*s,-0.78*s);g.closePath();g.fill();
  /* shoulders, collar, head, hat brim */
  g.beginPath();g.ellipse(0,-0.79*s,0.13*s,0.05*s,0,0,TAU);g.fill();
  g.beginPath();g.ellipse(0,-0.9*s,0.055*s,0.068*s,0,0,TAU);g.fill();
  if(!o.bare){g.beginPath();g.ellipse(0,-0.94*s,0.1*s,0.022*s,0,0,TAU);g.fill();g.fillRect(-0.05*s,-1.0*s,0.1*s,0.06*s);}
  /* left arm swinging, right arm out with the candle */
  g.lineWidth=0.05*s;g.beginPath();g.moveTo(-0.12*s,-0.76*s);g.lineTo(-0.15*s-sw*0.03*s,-0.5*s);g.stroke();
  if(o.candle){g.beginPath();g.moveTo(0.12*s,-0.76*s);g.lineTo(0.2*s,-0.6*s);g.lineTo(0.26*s,-0.6*s);g.stroke();}
  else{g.beginPath();g.moveTo(0.12*s,-0.76*s);g.lineTo(0.15*s+sw*0.03*s,-0.5*s);g.stroke();}
  g.restore();
  return [x+0.27*s,y-bob-0.66*s];   /* where the candle flame sits */
}
function flame(g,x,y,s,t,lean,i){
  const f=0.85+0.15*Math.sin(t*17+i)*Math.sin(t*7.3+i*2);
  g.save();g.translate(x,y);g.rotate(lean||0);
  g.fillStyle=rgrad(g,0,-s*0.4,s*1.2,[[0,'rgba(255,250,220,1)'],[0.35,'rgba(255,190,90,.95)'],[1,'rgba(255,120,30,0)']]);
  g.beginPath();g.moveTo(0,-s*1.6*f);g.quadraticCurveTo(s*0.55,-s*0.3,0,s*0.25);g.quadraticCurveTo(-s*0.55,-s*0.3,0,-s*1.6*f);g.fill();
  g.fillStyle='rgba(120,160,255,.5)';g.beginPath();g.ellipse(0,0,s*0.16,s*0.22,0,0,TAU);g.fill();
  g.restore();}

/* --- the thing that walks the floors: feet at (x,y), k pixels per world unit --- */
function thing(g,x,y,k,st){
  const s=k,ph=st.ph||0,sw=Math.sin(ph*Math.PI),tl=st.tilt||0;
  g.save();g.translate(x,y);g.lineCap='round';g.lineJoin='round';
  const C='#020203';g.strokeStyle=C;g.fillStyle=C;
  /* legs: long, the knees a little wrong */
  const leg=(sx,f)=>{g.lineWidth=0.035*s;g.beginPath();g.moveTo(sx*0.05*s,-0.58*s);
    g.lineTo(sx*0.07*s+f*0.05*s,-0.3*s);g.lineTo(sx*0.05*s+f*0.02*s,-0.01*s-Math.max(0,f)*0.04*s);g.stroke();};
  leg(-1,sw);leg(1,-sw);
  /* torso, hunched under the ceiling */
  g.beginPath();g.moveTo(-0.05*s,-0.58*s);g.quadraticCurveTo(-0.09*s,-0.85*s,-0.07*s,-1.0*s);g.lineTo(0.09*s,-1.02*s);
  g.quadraticCurveTo(0.1*s,-0.85*s,0.05*s,-0.58*s);g.closePath();g.fill();
  /* ribs, barely lit */
  g.strokeStyle='rgba(90,96,110,.18)';g.lineWidth=0.006*s;
  for(let i=0;i<5;i++){const yy=-0.92*s+i*0.05*s;g.beginPath();g.moveTo(-0.06*s,yy);g.quadraticCurveTo(0,yy+0.02*s,0.065*s,yy);g.stroke();}
  g.strokeStyle=C;
  /* arms to below the knee, fingers like twigs */
  const arm=(sx,f)=>{const shx=sx*0.09*s,shy=-0.99*s,ex=sx*0.14*s+f*0.03*s,ey=-0.64*s,hx=sx*0.12*s+f*0.06*s,hy=-0.3*s;
    g.lineWidth=0.026*s;g.beginPath();g.moveTo(shx,shy);g.lineTo(ex,ey);g.lineTo(hx,hy);g.stroke();
    g.lineWidth=0.007*s;for(let i=0;i<4;i++){g.beginPath();g.moveTo(hx,hy);
      g.quadraticCurveTo(hx+(i-1.5)*0.012*s,hy+0.06*s,hx+(i-1.5)*0.022*s+sx*0.01*s,hy+0.12*s+(i===0||i===3?-0.02*s:0));g.stroke();}};
  arm(-1,-sw);arm(1,sw);
  /* rags hanging from the shoulders */
  g.fillStyle='rgba(8,8,10,.92)';
  for(let i=0;i<7;i++){const x0=(-0.1+i*0.033)*s,l=(0.28+hash(i+3)*0.25)*s,swy=Math.sin((st.t||0)*1.7+i)*0.02*s+sw*0.01*s;
    g.beginPath();g.moveTo(x0-0.014*s,-0.99*s);g.lineTo(x0+0.014*s,-0.99*s);g.lineTo(x0+0.01*s+swy,-0.99*s+l);
    g.lineTo(x0+swy,-0.99*s+l-0.03*s);g.lineTo(x0-0.01*s+swy,-0.99*s+l+0.01*s);g.closePath();g.fill();}
  /* neck and long head, tilted */
  g.fillStyle=C;g.save();g.translate(0.01*s,-1.02*s);g.rotate(tl);
  g.lineWidth=0.025*s;g.beginPath();g.moveTo(0,0);g.lineTo(0.005*s,-0.05*s);g.stroke();
  g.beginPath();g.ellipse(0.005*s,-0.11*s,0.045*s,0.075*s,0.05,0,TAU);g.fill();
  if(st.eyes>0){const b=st.blink?0.15:1;
    g.fillStyle=`rgba(230,238,255,${st.eyes})`;g.beginPath();g.ellipse(-0.014*s,-0.12*s,0.006*s,0.006*s*b,0,0,TAU);g.ellipse(0.022*s,-0.12*s,0.006*s,0.006*s*b,0,0,TAU);g.fill();
    glow(g,0.004*s,-0.12*s,0.06*s,'200,215,255',0.35*st.eyes);}
  g.restore();g.restore();}

/* --- your soul: a pale shape that thins to a wisp below the waist --- */
function ghost(g,x,y,s,t,a,pull){
  g.save();g.translate(x,y);g.globalCompositeOperation='lighter';
  const body=(k,al)=>{
    const gr=g.createLinearGradient(0,-s,0,0);gr.addColorStop(0,`rgba(215,228,255,${al})`);gr.addColorStop(0.55,`rgba(150,175,255,${al*0.6})`);gr.addColorStop(1,'rgba(120,150,255,0)');
    g.fillStyle=gr;g.beginPath();g.ellipse(0,-0.9*s,0.065*s*k,0.08*s*k,0,0,TAU);g.fill();
    g.beginPath();g.moveTo(-0.12*s*k,-0.78*s);g.quadraticCurveTo(-0.16*s*k,-0.55*s,-0.13*s*k,-0.3*s);
    for(let i=0;i<=8;i++){const u=i/8,xx=lerp(-0.13,0.13,u)*s*k,yy=(-0.12+0.1*Math.sin(u*Math.PI)+0.05*Math.sin(t*3+u*9))*s;g.lineTo(xx+Math.sin(t*2+u*6)*0.02*s,yy);}
    g.quadraticCurveTo(0.16*s*k,-0.55*s,0.12*s*k,-0.78*s);g.quadraticCurveTo(0,-0.84*s,-0.12*s*k,-0.78*s);g.fill();
    /* arms: hanging, then thrown up as it is dragged down */
    const up=pull||0;g.strokeStyle=`rgba(180,200,255,${al*0.8})`;g.lineWidth=0.035*s*k;g.lineCap='round';
    [-1,1].forEach(sd=>{g.beginPath();g.moveTo(sd*0.12*s*k,-0.76*s);
      g.quadraticCurveTo(sd*0.2*s,lerp(-0.6,-1.0,up)*s,sd*lerp(0.17,0.24,up)*s,lerp(-0.42,-1.15,up)*s+Math.sin(t*2+sd)*0.02*s);g.stroke();});};
  body(1.25,0.12*a);body(1,0.3*a);body(0.55,0.4*a);
  /* trailing motes */
  for(let i=0;i<20;i++){const u=(t*0.5+hash(i))%1;g.fillStyle=`rgba(190,210,255,${(1-u)*0.5*a})`;g.fillRect((hash(i+5)-0.5)*0.3*s+Math.sin(t+i)*6,-u*s*0.9,2,2);}
  g.restore();}
/* --- the Heart: two swollen chambers, vessels into the vault, veins through the stone --- */
function heartOrgan(g,A,x,y,R,p,t){
  const N=A.N,sq=1+0.08*p,sy=1-0.03*p;
  g.save();g.translate(x,y);g.lineCap='round';
  /* veins into the wall */
  A.veins.forEach(v=>{const L=v.pts.length;for(let j=1;j<L;j++){const a=v.pts[j-1],b=v.pts[j];
    g.strokeStyle=`rgba(${50+110*p},${4+8*p},8,${(0.55+0.3*p)*(1-j/L*0.7)})`;g.lineWidth=Math.max(0.8,v.w*1.1*(1-j/L));
    g.beginPath();g.moveTo(a[0]*1.9,a[1]*1.7);g.lineTo(b[0]*1.9,b[1]*1.7);g.stroke();}});
  /* great vessels up into the vault */
  const tube=(pts,w)=>{g.strokeStyle='#1c0306';g.lineWidth=w;g.beginPath();g.moveTo(pts[0],pts[1]);g.bezierCurveTo(pts[2],pts[3],pts[4],pts[5],pts[6],pts[7]);g.stroke();
    g.strokeStyle='#4a0a10';g.lineWidth=w*0.6;g.stroke();g.strokeStyle='rgba(255,150,140,.12)';g.lineWidth=w*0.15;g.save();g.translate(-w*0.18,-w*0.1);g.stroke();g.restore();};
  tube([-20,-70,-40,-170,-150,-210,-230,-300],34);tube([25,-75,50,-190,170,-200,250,-310],28);tube([5,-80,10,-200,-10,-260,0,-360],22);
  tube([-60,40,-140,80,-200,90,-300,120],18);tube([60,50,140,90,200,100,320,110],16);
  /* the chambers */
  const lobe=(cx,cy,rx,ry,seed,c0,c1)=>{g.beginPath();for(let i=0;i<=48;i++){const a=i/48*TAU,r=1+0.16*(N.n(Math.cos(a)*1.4+seed,Math.sin(a)*1.4+seed)-0.5);
      const px=cx+Math.cos(a)*rx*r*sq,py=cy+Math.sin(a)*ry*r*sy;i?g.lineTo(px,py):g.moveTo(px,py);}
    g.fillStyle=rgrad(g,cx-rx*0.35,cy-ry*0.4,Math.max(rx,ry)*1.5,[[0,c0],[0.5,c1],[1,'#0e0103']]);g.fill();};
  lobe(30,-20,R*0.62,R*0.7,7,'#4e0c12','#2a0408');
  lobe(-22,10,R*0.82,R*0.95,3,'#5e1016','#300509');
  /* the groove between them, surface veins, a wet sheen */
  g.strokeStyle='rgba(15,0,2,.85)';g.lineWidth=5;g.beginPath();g.moveTo(10,-80);g.bezierCurveTo(30,-20,10,40,-10,90);g.stroke();
  for(let i=0;i<9;i++){const a0=hash(i+11)*TAU,x0=Math.cos(a0)*R*0.3,y0=Math.sin(a0)*R*0.35;g.strokeStyle=i%3?'rgba(30,0,4,.75)':'rgba(70,40,90,.4)';
    g.lineWidth=i%3?2.4:1.6;g.beginPath();g.moveTo(x0,y0);let xx=x0,yy=y0,a=a0;
    for(let k=0;k<6;k++){a+=(hash(i*7+k)-0.5)*1.2;xx+=Math.cos(a)*R*0.12;yy+=Math.sin(a)*R*0.12;g.lineTo(xx,yy);}g.stroke();}
  g.fillStyle=`rgba(255,200,190,${0.22+0.25*p})`;
  [[-50,-40,16,6,-0.5],[-30,-62,8,3,-0.4],[40,-50,10,4,-0.6],[-62,10,6,10,0.3]].forEach(e=>{g.beginPath();g.ellipse(e[0],e[1],e[2],e[3],e[4],0,TAU);g.fill();});
  /* it sweats a little dark fluid */
  for(let i=0;i<4;i++){const u=(t*0.25+hash(i+30))%1,dx=-50+i*35;g.fillStyle=`rgba(60,0,4,${0.8*(1-u)})`;g.beginPath();g.ellipse(dx,R*0.7+u*90,3,5,0,0,TAU);g.fill();}
  g.restore();}
/* --- the face, close --- */
function face(g,A,d,o){
  const m=ease((d-0.2)/1.2),tl=o.motion?Math.sin(d*0.8)*0.03:0;
  g.save();g.rotate(tl);
  const outline=()=>{g.beginPath();g.moveTo(0,-400);g.bezierCurveTo(130,-400,185,-300,170,-170);g.bezierCurveTo(160,-90,195,-40,185,20);
    g.bezierCurveTo(175,90,120,110,110,170);g.bezierCurveTo(100,260,60,340+m*60,0,360+m*80);g.bezierCurveTo(-60,340+m*60,-100,260,-110,170);
    g.bezierCurveTo(-120,110,-175,90,-185,20);g.bezierCurveTo(-195,-40,-160,-90,-170,-170);g.bezierCurveTo(-185,-300,-130,-400,0,-400);g.closePath();};
  outline();g.fillStyle=rgrad(g,-50,60,460,[[0,'#6a6e78'],[0.35,'#3a3d45'],[0.75,'#15161a'],[1,'#060607']]);g.fill();
  g.save();outline();g.clip();
  /* mottled skin */
  g.globalCompositeOperation='multiply';g.globalAlpha=0.9;g.drawImage(A.clouds,-420,-420,900,900);g.drawImage(A.clouds,-200,-100,700,500);
  g.globalCompositeOperation='source-over';g.globalAlpha=1;
  /* hollows: brow, temples, cheeks */
  const dark=(x,y,rx,ry,a)=>{g.save();g.translate(x,y);g.scale(rx/100,ry/100);g.fillStyle=rgrad(g,0,0,100,[[0,`rgba(0,0,0,${a})`],[1,'rgba(0,0,0,0)']]);g.fillRect(-100,-100,200,200);g.restore();};
  dark(-80,-120,130,60,0.6);dark(80,-120,130,60,0.6);dark(-150,-200,60,130,0.5);dark(150,-200,60,130,0.5);
  dark(-120,90,70,120,0.75);dark(120,90,70,120,0.75);
  /* veins at the temples */
  g.strokeStyle='rgba(40,45,80,.45)';g.lineWidth=2;
  [[-1],[1]].forEach(([sd])=>{g.beginPath();g.moveTo(sd*150,-300);g.bezierCurveTo(sd*120,-260,sd*165,-230,sd*130,-180);g.moveTo(sd*140,-250);g.lineTo(sd*105,-235);g.stroke();});
  /* a cold light from below and to the right */
  g.fillStyle=rgrad(g,140,260,380,[[0,'rgba(150,170,210,.18)'],[1,'rgba(150,170,210,0)']]);g.fillRect(-300,-420,600,900);
  g.restore();
  g.strokeStyle='rgba(140,160,200,.25)';g.lineWidth=3;g.save();outline();g.clip();g.translate(-6,0);outline();g.stroke();g.restore();
  /* sockets and the eyes deep in them */
  [-1,1].forEach(sd=>{g.save();g.translate(sd*72,-95);g.rotate(sd*0.18);
    g.fillStyle=rgrad(g,0,0,70,[[0,'rgba(0,0,0,1)'],[0.6,'rgba(0,0,0,.9)'],[1,'rgba(0,0,0,0)']]);g.beginPath();g.ellipse(0,0,62,72,0,0,TAU);g.fill();
    g.fillStyle='#e8eeff';g.beginPath();g.arc(sd*3,6,5.5,0,TAU);g.fill();g.restore();
    glow(g,sd*72+sd*3,-89,70,'190,210,255',o.flash?0.45:0.3);});
  /* no nose: two slits */
  g.fillStyle='rgba(0,0,0,.85)';[-1,1].forEach(sd=>{g.beginPath();g.ellipse(sd*12,40,5,20,sd*0.25,0,TAU);g.fill();});
  /* the mouth: a lipless split that keeps opening, needle teeth */
  const mh=24+200*m,mw=46+30*m,my=170+m*40;
  g.fillStyle=rgrad(g,0,my,mh,[[0,'#000'],[0.8,'#0a0002'],[1,'#1e0408']]);g.beginPath();g.ellipse(0,my,mw,mh,0,0,TAU);g.fill();
  for(let row=-1;row<=1;row+=2)for(let i=0;i<13;i++){const u=i/12,x=lerp(-mw*0.92,mw*0.92,u),edge=my+row*mh*Math.sqrt(Math.max(0,1-Math.pow(x/mw,2)))*0.97;
    const L=(18+hash(i+row*20+40)*26)*(0.6+0.4*Math.sin(u*Math.PI)),tilt=(hash(i+row*5)-0.5)*6;
    g.fillStyle='rgba(205,196,170,.9)';g.beginPath();g.moveTo(x-2.6,edge);g.lineTo(x+2.6,edge);g.lineTo(x+tilt,edge-row*L);g.closePath();g.fill();}
  g.restore();}
/* --- the Heart's sigil --- */
function sigil(g,cx,cy,r,a,col,rot,A,runes){
  if(a<=0.003)return;
  g.save();g.translate(cx,cy);g.globalAlpha=clamp(a,0,1);g.strokeStyle=col;g.lineWidth=Math.max(1,r*0.025);
  g.beginPath();g.arc(0,0,r,0,TAU);g.stroke();
  g.beginPath();g.arc(0,0,r*0.8,0,TAU);g.stroke();
  g.beginPath();g.arc(0,0,r*0.4,0,TAU);g.stroke();
  g.beginPath();
  for(let i=0;i<4;i++){const an=i*TAU/4;g.moveTo(Math.cos(an)*r,Math.sin(an)*r);g.lineTo(Math.cos(an)*r*1.18,Math.sin(an)*r*1.18);}
  for(let i=0;i<3;i++){const an=-Math.PI/2+i*TAU/3,bn=-Math.PI/2+(i+1)*TAU/3;
    g.moveTo(Math.cos(an)*r*0.8,Math.sin(an)*r*0.8);g.lineTo(Math.cos(bn)*r*0.8,Math.sin(bn)*r*0.8);}
  g.stroke();
  if(runes&&A){g.rotate(rot||0);g.lineWidth=Math.max(1,r*0.018);
    for(let i=0;i<20;i++){g.save();g.rotate(i/20*TAU);g.translate(0,-r*0.9);const q=r*0.07;
      g.beginPath();A.runes[i].forEach(sg=>{g.moveTo((sg[0]-0.5)*q,(sg[1]-0.5)*q);g.lineTo((sg[2]-0.5)*q,(sg[3]-0.5)*q);});g.stroke();g.restore();}}
  g.restore();}
function ember(g,x,y,r,a){
  if(a<=0.01)return;
  glow(g,x,y,r*7,'255,140,40',0.55*a);
  g.save();g.globalAlpha=clamp(a,0,1);
  g.fillStyle=rgrad(g,x,y,r*1.6,[[0,'rgba(255,248,225,1)'],[0.5,'rgba(255,190,90,.95)'],[1,'rgba(255,120,30,0)']]);
  g.beginPath();g.moveTo(x,y-r*1.4);g.lineTo(x+r,y);g.lineTo(x,y+r*1.4);g.lineTo(x-r,y);g.closePath();g.fill();g.restore();}
function sparks(g,x,y,t0,t,n,seed,spd,col){/* a burst of sparks thrown out at t0, falling */
  const d=t-t0;if(d<0||d>1)return;
  g.save();g.globalCompositeOperation='lighter';
  for(let i=0;i<n;i++){const a=hash(seed+i)*TAU,v=spd*(0.4+hash(seed+i+50)*0.8),px=x+Math.cos(a)*v*d,py=y+Math.sin(a)*v*d+220*d*d,al=(1-d)*(0.6+0.4*hash(i+seed+9));
    g.fillStyle=`rgba(${col||'255,180,90'},${al})`;g.fillRect(px-1.4,py-1.4,2.8,2.8);}
  g.restore();}
function motes(g,cx,cy,r,t,n,seed,rgb,a){/* dust hanging in a pool of light */
  g.save();g.globalCompositeOperation='lighter';
  for(let i=0;i<n;i++){const h1=hash(seed+i),h2=hash(seed+i*3+1),h3=hash(seed+i*7+2);
    const x=cx+(h1-0.5)*2*r+Math.sin(t*0.3+i)*14,y=cy+(h2-0.5)*2*r+((t*(6+h3*10)+h3*200)%60)-30;
    const d=Math.hypot(x-cx,y-cy)/r;if(d>1)continue;
    g.fillStyle=`rgba(${rgb},${a*(1-d)*(0.4+h3*0.6)})`;g.fillRect(x,y,1.6+h3*1.4,1.6+h3*1.4);}
  g.restore();}

/* post-processing shared by every scene: letterbox, grain, vignette */
function post(g,A,w,h,T){
  g.fillStyle=rgrad(g,w/2,h/2,Math.max(w,h)*0.75,[[0,'rgba(0,0,0,0)'],[0.55,'rgba(0,0,0,0.12)'],[1,'rgba(0,0,0,0.78)']]);g.fillRect(0,0,w,h);
  const fi=Math.floor(Math.max(0,T)*24),gimg=A.grain[fi%3],ox=hash(fi)*256,oy=hash(fi+1)*256;
  g.save();g.globalAlpha=0.07;g.globalCompositeOperation='overlay';
  for(let x=-ox;x<w;x+=256)for(let y=-oy;y<h;y+=256)g.drawImage(gimg,x,y);
  g.restore();
  const bar=Math.round(h*0.065);g.fillStyle='#000';g.fillRect(0,0,w,bar);g.fillRect(0,h-bar,w,bar);
}

/* ================= SCENES ================= */
/* thing's walk in scene 4, shared by the picture and the sound */
const T4={step:1.45,d:0.75,z0:7.6};
const thingZ=t=>{const n=Math.min(Math.max(0,t)/T4.step,10.2/T4.step),k=Math.floor(n);return T4.z0-(k+ease(n-k))*T4.d;};
const SCONCES=[[-1,1.6],[1,2.7],[-1,3.8],[1,4.9],[-1,6.0],[1,7.1],[-1,8.2],[1,9.3]];
function sconceOut(zs){for(let t=0;t<12;t+=0.01)if(thingZ(t)<zs-0.5)return t;return 99;}
/* heartbeats in scene 3: steady, racing as it takes your soul, then slow */
const BEATS3=(()=>{const b=[];let t=0.3;while(t<12.6){b.push(t);t+=t<6.5?0.95:t<10.5?lerp(0.95,0.48,(t-6.5)/4):0.9;}return b;})();
const pulseAt=(beats,t)=>{let p=0;for(const b of beats){const d=t-b;if(d>=0&&d<1.2)p+=Math.exp(-d*9)+(d>0.22?0.6*Math.exp(-(d-0.22)*9):0);}return Math.min(1.4,p);};
/* scene 5: embers launched from the Heart, then where they land */
const E5=Array.from({length:8},(_,i)=>({t0:0.9+i*0.5,fl:1.3,f:3-Math.floor(i/2),side:i%2}));
/* scene 6: embers strike the seal one after another */
const STRIKE6=Array.from({length:8},(_,i)=>2.3+i*0.34);

function scenes(A){
  const N=A.N;
  return [
  { /* 1. THE HOUSE */
    dur:12,
    lines:[[0.8,'They built Hollowmere Manor on a hill no one would farm.',3.42],
           [5.6,'It was finished in a single winter. The family who built it was never seen again.',4.99]],
    draw(g,t,o){
      const Z=o.motion?1+0.12*ease(t/12):1.04,PY=o.motion?-20*ease(t/12):0;
      const layer=k=>{const z=1+(Z-1)*k;g.setTransform(o.base[0]*z,0,0,o.base[0]*z,o.base[1]+(1-z)*VX*o.base[0],o.base[2]+((1-z)*520+PY*k)*o.base[0]);};
      /* lightning: two strikes */
      let L=0;const strikes=[3.2,8.4];strikes.forEach(s=>{const d=t-s;if(d>0&&d<1)L=Math.max(L,Math.exp(-d*5)*(d<0.07||(d>0.14&&d<0.22)?1:0.35));});
      layer(0.15);
      const sky=g.createLinearGradient(0,-100,0,700);sky.addColorStop(0,'#03040a');sky.addColorStop(0.55,'#0b1020');sky.addColorStop(1,'#1a1a2c');
      g.fillStyle=sky;g.fillRect(-200,-200,2000,1300);
      for(let i=0;i<90;i++){const x=hash(i)*1600,y=hash(i+300)*420,tw=0.4+0.6*Math.sin(t*2+i);g.fillStyle=`rgba(200,210,255,${0.25*tw*hash(i+7)})`;g.fillRect(x,y,1.4,1.4);}
      /* the moon, its halo, the far clouds crossing it */
      const mx=1180,my=170;glow(g,mx,my,260,'170,185,220',0.22);
      g.fillStyle='#d9dcea';g.beginPath();g.arc(mx,my,46,0,TAU);g.fill();
      g.fillStyle='rgba(120,125,145,.35)';[[-14,-10,10],[12,8,7],[-4,16,6],[16,-14,5]].forEach(c=>{g.beginPath();g.arc(mx+c[0],my+c[1],c[2],0,TAU);g.fill();});
      const cw=A.clouds.width;
      for(let k=0;k<2;k++){const sp=k?14:7,y=k?60:-40,sc=k?1.25:0.9,off=((t*sp+k*400)%(cw*sc));
        g.globalAlpha=k?0.95:0.75;for(let x=-off;x<1800;x+=cw*sc)g.drawImage(A.clouds,x-100,y,cw*sc,320*sc);g.globalAlpha=1;}
      /* the bolt itself */
      strikes.forEach((s,i)=>{const d=t-s;if(d<0||d>0.35)return;const a=(d<0.07||(d>0.14&&d<0.22)?1:0.25)*(o.flash?1:0.2);
        g.save();g.globalCompositeOperation='lighter';g.lineCap='round';
        A.bolts[i].forEach(sg=>{g.strokeStyle=`rgba(150,170,255,${0.25*a})`;g.lineWidth=sg[4]*5;g.beginPath();g.moveTo(sg[0],sg[1]);g.lineTo(sg[2],sg[3]);g.stroke();
          g.strokeStyle=`rgba(235,240,255,${a})`;g.lineWidth=sg[4];g.beginPath();g.moveTo(sg[0],sg[1]);g.lineTo(sg[2],sg[3]);g.stroke();});g.restore();});
      /* far hills */
      layer(0.35);
      g.fillStyle='#0a0d18';g.beginPath();g.moveTo(-200,1000);g.lineTo(-200,560);
      for(let x=-200;x<=1800;x+=40)g.lineTo(x,540-60*N.fbm(x/300,1,3)-30*Math.sin(x/260));g.lineTo(1800,1000);g.closePath();g.fill();
      const fw=A.fog.width;g.globalAlpha=0.28;for(let x=-((t*10)%fw);x<1800;x+=fw)g.drawImage(A.fog,x-100,470,fw,200);g.globalAlpha=1;
      /* the hill and the house */
      layer(1);
      g.fillStyle='#05060b';g.beginPath();g.moveTo(-200,1000);g.lineTo(-200,720);g.quadraticCurveTo(400,640,800,610);g.quadraticCurveTo(1200,630,1800,740);g.lineTo(1800,1000);g.closePath();g.fill();
      /* the path up to the door */
      g.fillStyle='#0e0f16';g.beginPath();g.moveTo(760,612);g.quadraticCurveTo(700,700,820,780);g.quadraticCurveTo(940,860,860,1000);g.lineTo(1000,1000);
      g.quadraticCurveTo(1060,850,900,770);g.quadraticCurveTo(800,700,840,612);g.closePath();g.fill();
      mansion(g,A,800,612,1,t,L,o);
      /* a tree on the hill */
      g.strokeStyle='#04050a';drawTree(g,A.trees[1],1330,700,0,26,120,t,0.6);
      /* crows */
      g.strokeStyle='#020204';g.lineWidth=2.2;
      for(let i=0;i<4;i++){const x=((t*70+i*330)%2100)-250,y=230+i*28+Math.sin(t*1.3+i)*12,f=Math.sin(t*9+i*2)*7;
        g.beginPath();g.moveTo(x-12,y-f);g.quadraticCurveTo(x-5,y-2,x,y);g.quadraticCurveTo(x+5,y-2,x+12,y-f);g.stroke();}
      g.globalAlpha=0.32;for(let x=-((t*18)%fw);x<1800;x+=fw)g.drawImage(A.fog,x-100,600,fw,160);g.globalAlpha=1;
      /* the foreground: a gnarled tree and the iron fence */
      layer(1.6);
      g.strokeStyle='#010102';drawTree(g,A.trees[0],70,960,0.08,40,230,t,1);
      fence(g,880,o.flash?L:0);
      g.globalAlpha=0.25;for(let x=-((t*30)%fw);x<1800;x+=fw)g.drawImage(A.fog,x-100,760,fw*1.4,260);g.globalAlpha=1;
      g.setTransform(o.base[0],0,0,o.base[0],o.base[1],o.base[2]);
      rain(g,t,230,0.14,1,7);rain(g,t*1.2,70,0.26,2.2,13);
      /* splashes along the fence line */
      for(let i=0;i<26;i++){const ph=(t*2.3+hash(i))%1;if(ph>0.18)continue;const x=hash(i+40)*1600,y=870+hash(i+90)*20;
        g.strokeStyle=`rgba(170,185,220,${0.3*(1-ph/0.18)})`;g.lineWidth=1;g.beginPath();g.arc(x,y,ph*40,Math.PI*1.1,Math.PI*1.9);g.stroke();}
      if(L>0){g.fillStyle=`rgba(190,205,255,${o.flash?L*0.5:L*0.06})`;g.fillRect(0,0,SW,SH);}
    }},
  { /* 2. YOU */
    dur:11,
    lines:[[0.8,'Years later, you came to the house with a candle, looking for something.',3.99],
           [6.0,'You never found it. The house found you.',2.41]],
    draw(g,t,o){
      const camZ=o.motion?t*0.3:0.6,stop=9.3,tw=Math.min(t,stop);
      const fz=1.75+tw*0.14+(t>stop?0:0);                 /* your distance ahead of the camera */
      const C={W:1,top:0.62,bot:-0.55,split:-0.14,zFar:14-camZ,camZ,ceil:'#0d0a08',beams:'#060403',beamGap:1.4,
        floor:'floor',fs:128,wall:'wall',low:'wain',ws:332};
      room(g,A,C);
      /* end of the hall: a door with a thread of grey light under it */
      const zE=C.zFar,d1=P(-0.32,0.25,zE),d2=P(0.32,-0.55,zE);
      g.fillStyle='#120b07';g.fillRect(d1[0],d1[1],d2[0]-d1[0],d2[1]-d1[1]);
      g.fillStyle='rgba(150,165,200,.5)';g.fillRect(d1[0],d2[1]-2,d2[0]-d1[0],2);
      /* portraits and doors along the walls */
      const eyes=[];
      [[-1,2.2],[1,3.4],[-1,5.0],[1,6.6],[-1,8.0],[1,9.6],[-1,11.2],[1,12.6]].forEach(([side,Zw],i)=>{
        const z1=Zw-camZ,z2=z1+0.55;if(z1<0.9||z2>C.zFar)return;
        if(i%3===2){const q=wallQuad(side,1,z1,z2+0.15,-0.55,0.3);g.fillStyle='#140c07';poly(g,q);g.fill();
          g.strokeStyle='rgba(0,0,0,.6)';g.lineWidth=3;poly(g,q);g.stroke();return;}
        const q=wallQuad(side,1,z1,z2,0.02,0.45);g.fillStyle='#3a2a12';poly(g,q);g.fill();
        const qi=wallQuad(side,1,z1+0.05,z2-0.05,0.07,0.4);g.fillStyle='#0f0d0b';poly(g,qi);g.fill();
        const cx=(qi[0][0]+qi[1][0])/2,cy=(qi[0][1]+qi[3][1]+qi[1][1]+qi[2][1])/4,fw=Math.abs(qi[0][0]-qi[1][0]),fh=Math.abs(qi[3][1]-qi[0][1])*0.8;
        g.fillStyle='#2a2420';g.beginPath();g.ellipse(cx,cy-fh*0.05,fw*0.18,fh*0.22,0,0,TAU);g.fill();
        g.fillStyle='#16110e';g.beginPath();g.ellipse(cx,cy+fh*0.3,fw*0.32,fh*0.2,0,Math.PI,0);g.fill();
        eyes.push([cx,cy-fh*0.08,fw*0.07]);});
      /* your shadow, thrown huge on the left wall */
      const fk=F/fz,fx=VX+0.12*F/fz,fy=VY+0.55*F/fz,ph=tw*1.6;
      const lit=t<9.7?1:Math.max(0,1-(t-9.7)*6);
      if(lit>0){g.save();g.globalAlpha=0.55*lit;g.transform(1,0,-0.35,1,0,0);person(g,fx*0.55+180,fy+20,fk*1.7,ph,{col:'#000'});g.restore();}
      const cp=person(g,fx,fy,fk,t<stop?ph:Math.round(ph),{candle:true});
      /* the light: a candle that gutters in a draught, then goes out */
      const gust=ease((t-8.6)/1.1),out=t>9.75,fl=0.9+0.1*Math.sin(t*13)*Math.sin(t*5.1);
      const R=(out?0:1)*fk*1.55*fl*(1-gust*0.4);
      darkBegin(A,0.84,'2,1,0');
      if(R>0)lightAt(A,cp[0],cp[1],R,1);
      lightAt(A,(d1[0]+d2[0])/2,d2[1],60,0.35);
      darkEnd(g,A);
      if(R>0){glow(g,cp[0],cp[1],R*0.9,'255,150,70',0.22);motes(g,cp[0],cp[1],R*0.6,t,50,11,'255,210,160',0.6);
        flame(g,cp[0],cp[1],0.035*fk,t,gust*0.9+Math.sin(t*9)*0.08*gust,1);}
      if(out){const d=t-9.75;g.strokeStyle=`rgba(170,170,170,${0.35*Math.max(0,1-d)})`;g.lineWidth=2;g.beginPath();g.moveTo(cp[0],cp[1]);
        for(let i=1;i<14;i++)g.lineTo(cp[0]+Math.sin(i*0.7+t*3)*8*i/14+i*2,cp[1]-i*7*Math.min(1,d*2));g.stroke();
        /* in the dark, the portraits are watching */
        if(t>10)eyes.forEach(e=>{const a=0.5*ease((t-10)/0.6);g.fillStyle=`rgba(230,225,200,${a})`;
          g.fillRect(e[0]-e[2]-1,e[1],2,2);g.fillRect(e[0]+e[2]-1,e[1],2,2);});}
    }},
  { /* 3. THE HEART */
    dur:13,
    lines:[[0.8,'You died here, on the cellar floor.',2.26],
           [4.6,'Beneath the stones, something beats like a heart.',2.89],
           [8.0,'It caught your soul as it left you. It has not let go since.',3.84]],
    draw(g,t,o){
      const p=pulseAt(BEATS3,t),shake=o.motion?p*(t>6.5&&t<10.8?4:1.5):0;
      g.save();g.translate((hash(Math.floor(t*30))-0.5)*shake,(hash(Math.floor(t*30)+7)-0.5)*shake);
      if(o.motion){const z=1+0.05*ease(t/13);g.translate(VX,VY);g.scale(z,z);g.translate(-VX,-VY);}
      const C={W:2.2,top:0.9,bot:-0.55,zFar:4.2,ceil:'#070505',floor:'stone',fs:180,wall:'brick',ws:220,haze:'8,0,0'};
      room(g,A,C);
      /* vaulted ribs */
      g.strokeStyle='#1a1512';
      [1.4,2.4,3.4].forEach(z=>{const a=P(-2.2,0.3,z),b=P(2.2,0.3,z),r=(b[0]-a[0])/2;g.lineWidth=0.14*F/z;
        g.beginPath();g.ellipse(VX,a[1],r,r*0.42,0,Math.PI,TAU);g.stroke();
        g.fillStyle='#120e0c';g.fillRect(a[0]-0.08*F/z,a[1],0.16*F/z,(VY+0.55*F/z)-a[1]);g.fillRect(b[0]-0.08*F/z,a[1],0.16*F/z,(VY+0.55*F/z)-a[1]);});
      /* the Heart, grown into the far wall, and the veins it has pushed through the stone */
      const hx=VX,hy=VY+0.02*F/4.2,HR=100;
      g.fillStyle=rgrad(g,hx,hy,260,[[0,'rgba(0,0,0,.95)'],[0.6,'rgba(0,0,0,.6)'],[1,'rgba(0,0,0,0)']]);g.fillRect(hx-260,hy-260,520,520);
      heartOrgan(g,A,hx,hy,HR,p,t);
      glow(g,hx,hy,HR*3,'180,16,16',(o.flash?0.14:0.09)+0.16*p);
      /* the sigil scored into the floor */
      const sy=VY+0.55*F/2.3,flare=t>10.4?Math.exp(-(t-10.4)*1.5):0;
      g.save();g.translate(VX,sy);g.scale(1,0.26);
      sigil(g,0,0,190,0.35+0.35*p+flare,'#ff3a2a');
      g.globalCompositeOperation='lighter';sigil(g,0,0,190,(0.15*p+flare*(o.flash?0.8:0.3)),'#ffb0a0');g.restore();
      glow(g,VX,sy,240,'255,40,30',0.12+0.18*p+flare*(o.flash?0.5:0.2));
      /* you, on the floor, the candle beside you guttering out */
      const bx=1020,by=VY+0.55*F/1.55,cand=t<2.2?1:Math.max(0,1-(t-2.2)*2);
      g.fillStyle='#030203';g.save();g.translate(bx,by);
      g.beginPath();g.ellipse(-150,-10,26,22,0,0,TAU);g.fill();
      g.beginPath();g.moveTo(-128,-26);g.quadraticCurveTo(-40,-50,40,-28);g.lineTo(150,-22);g.lineTo(160,4);g.lineTo(40,6);g.quadraticCurveTo(-40,12,-128,8);g.closePath();g.fill();
      g.lineWidth=14;g.lineCap='round';g.strokeStyle='#030203';g.beginPath();g.moveTo(-100,-10);g.lineTo(-190,24);g.lineTo(-250,30);g.stroke();
      g.restore();
      g.fillStyle='#d8cfb8';g.fillRect(bx+200,by-36,10,30);
      /* your soul rises out of you... */
      const rise=ease((t-1.6)/2.6),pull=easeIn((t-8.2)/2.3);
      let sx=lerp(bx-40,bx-60,rise),syy=lerp(by,by-70,rise);
      sx=lerp(sx,VX,pull);syy=lerp(syy,sy,pull);
      const sa=(t<1.6?0:ease((t-1.6)/1.2))*(1-ease((t-10.2)/0.4));
      /* light: the candle, the Heart, the sigil, a grate of moonlight */
      darkBegin(A,0.9,'3,0,0');
      if(cand>0)lightAt(A,bx+205,by-40,320*cand*(0.9+0.1*Math.sin(t*15)),1);
      lightAt(A,hx,hy,330+120*p,0.85);lightAt(A,VX,sy,260+100*p+flare*300,0.8);
      if(sa>0)lightAt(A,sx,syy-120,300,0.7*sa);
      lightAt(A,520,640,180,0.4);
      darkEnd(g,A);
      if(cand>0)flame(g,bx+205,by-40,13*cand,t,Math.sin(t*3)*0.1,2);
      /* ...and the Heart reaches up for it */
      const reach=ease((t-6.4)/1.6);
      if(reach>0&&sa>0){g.save();g.lineCap='round';
        for(let i=0;i<6;i++){const a0=i/6*TAU,x0=VX+Math.cos(a0)*120,y0=sy+Math.sin(a0)*30,ty=syy-0.62*F/2.0*(1-pull*0.75)+i*20;
          const c1x=x0+Math.cos(a0)*80,c1y=y0-180,c2x=sx+Math.sin(t*3+i)*60,c2y=ty-80;
          g.beginPath();g.moveTo(x0,y0);const steps=24;
          for(let k=1;k<=steps*reach;k++){const u=k/steps,iu=1-u;
            g.lineTo(iu*iu*iu*x0+3*iu*iu*u*c1x+3*iu*u*u*c2x+u*u*u*(sx+Math.sin(i)*20),iu*iu*iu*y0+3*iu*iu*u*c1y+3*iu*u*u*c2y+u*u*u*ty);}
          g.strokeStyle='rgba(255,40,30,.12)';g.lineWidth=20-i;g.stroke();g.strokeStyle='#5a0a0e';g.lineWidth=7-i*0.6;g.stroke();}
        g.restore();}
      if(sa>0){const sc=F/2.0*(1-pull*0.75);g.save();g.translate(sx,syy);g.scale(1-pull*0.45,1+pull*0.9);
        ghost(g,0,0,sc,t,sa,pull);g.restore();glow(g,sx,syy-0.55*sc,0.8*sc,'160,185,255',0.28*sa);}
      g.save();g.globalCompositeOperation='lighter';
      for(let i=0;i<5;i++){const k=i/4;g.fillStyle=`rgba(120,140,190,${0.022})`;poly(g,[[440+k*30,0],[500-k*30,0],[610-k*60,700],[430+k*60,700]]);g.fill();}
      g.fillStyle='rgba(130,150,200,.05)';g.beginPath();g.ellipse(520,700,110,22,0,0,TAU);g.fill();g.restore();
      motes(g,520,380,240,t,40,33,'170,185,230',0.5);
      g.restore();
    }},
  { /* 4. THE THING */
    dur:12,
    lines:[[0.8,'You are not alone in there. Something tall and patient walks its four floors.',4.57],
           [6.0,'It feeds on the souls the Heart keeps. Tonight, it is hungry.',4.06]],
    draw(g,t,o){
      const close=t>=10.4;
      if(!close){
        const sway=o.motion?Math.sin(t*0.7)*4:0;g.save();g.translate(sway,Math.sin(t*0.5)*2);
        const C={W:1,top:0.62,bot:-0.55,split:-0.14,zFar:11,camZ:0,ceil:'#08090b',beams:'#040506',beamGap:1.4,floor:'floor',fs:128,wall:'wall',low:'wain',ws:332,haze:'0,0,4',hazeA:0.3};
        room(g,A,C);
        /* a tall window at the end of the hall, moonlight behind it */
        const w0=P(-0.34,0.5,11),w1=P(0.34,-0.3,11);g.fillStyle='rgba(90,110,160,.85)';g.fillRect(w0[0],w0[1],w1[0]-w0[0],w1[1]-w0[1]);
        g.fillStyle='#07080c';g.fillRect((w0[0]+w1[0])/2-2,w0[1],4,w1[1]-w0[1]);for(let i=1;i<4;i++)g.fillRect(w0[0],w0[1]+(w1[1]-w0[1])*i/4,w1[0]-w0[0],3);
        rain(g,t*0.3,40,0.12,1,3);
        const zt=thingZ(t),n=Math.min(t/T4.step,10.2/T4.step),ph=n,k=F/zt;
        /* sconces on both walls */
        const lights=[];
        SCONCES.forEach(([side,zs],i)=>{const off=sconceOut(zs),a=clamp(1-(t-off)/0.35,0,1);
          const p=P(side*0.98,0.2,zs);g.fillStyle='#1c140a';g.fillRect(p[0]-0.03*F/zs,p[1],0.06*F/zs,0.05*F/zs);
          const fl=o.flash?(0.85+0.15*Math.sin(t*19+i*3)*Math.sin(t*7+i)+(Math.sin(t*31+i*5)>0.97?-0.4:0)):0.92;
          lights.push({x:p[0],y:p[1]-0.03*F/zs,r:0.95*F/zs*fl*a,a,zs,i,off});});
        /* its shadow, thrown toward you by the lights behind it */
        const fx=VX,fy=VY+0.55*k;
        const back=lights.filter(l=>l.zs>zt&&l.a>0).length;
        if(back){g.fillStyle=`rgba(0,0,0,${0.25+0.1*back})`;poly(g,[[fx-0.06*k,fy],[fx+0.06*k,fy],[fx+0.3*k+60,SH],[fx-0.3*k-60,SH]]);g.fill();}
        thing(g,fx,fy,k,{ph,t,tilt:o.motion?0.35*win(t,6.4,9.2,0.5,0.6):0,eyes:ease(t/2),blink:t>4.1&&t<4.26});
        darkBegin(A,0.93,'0,1,6');
        lights.forEach(l=>{if(l.a>0)lightAt(A,l.x,l.y,l.r,0.95);});
        lightAt(A,fx,fy-1.1*k,0.25*k,0.25);
        lightAt(A,VX,(w0[1]+w1[1])/2,240,0.85);lightAt(A,VX,VY+0.55*F/11+30,320,0.4);
        darkEnd(g,A);
        glow(g,VX,(w0[1]+w1[1])/2,200,'120,140,200',0.12);
        lights.forEach(l=>{if(l.a<=0){const d=t-l.off-0.35;if(d<1.5){g.strokeStyle=`rgba(160,160,160,${0.3*(1-d/1.5)})`;g.lineWidth=1.5;g.beginPath();
              g.moveTo(l.x,l.y);for(let i=1;i<10;i++)g.lineTo(l.x+Math.sin(i+t*2)*4,l.y-i*6*Math.min(1,d*2));g.stroke();}return;}
          glow(g,l.x,l.y,l.r*0.8,'255,160,80',0.18*l.a);flame(g,l.x,l.y,0.03*F/l.zs*l.a,t,0,l.i);});
        /* the eyes, again, over the dark */
        const ea=ease(t/2)*(t>4.1&&t<4.26?0.1:1);
        if(ea>0){const hx=fx+0.014*k,hy=fy-1.14*k;glow(g,hx,hy,0.08*k,'200,215,255',0.25*ea);}
        g.restore();
      }else{
        /* close: its face, out of the dark */
        const d=t-10.4,a=o.flash?ease(d/0.06):ease(d/0.5),z=o.motion?0.92+d*0.06:1;
        g.fillStyle='#000';g.fillRect(0,0,SW,SH);
        g.save();g.translate(VX,440);g.scale(z,z);g.globalAlpha=a;face(g,A,d,o);g.restore();
        g.fillStyle=rgrad(g,VX,470,700,[[0.3,'rgba(0,0,0,0)'],[1,'rgba(0,0,0,.95)']]);g.fillRect(0,0,SW,SH);
      }
    }},
  { /* 5. THE EMBERS */
    dur:11,
    lines:[[0.8,'Your passing left eight embers, scattered through the house. Two on every floor.',4.9],
           [6.2,'Fragments of your old memory lie with them, somewhere in the dark.',3.91]],
    draw(g,t,o){
      const pz=o.motion?lerp(1.7,1,easeOut((t-0.2)/4.5)):1,py=o.motion?lerp(-330,0,easeOut((t-0.2)/4.5)):0;
      g.save();g.translate(VX,450);g.scale(pz,pz);g.translate(-VX,-450+py);
      const sky=g.createLinearGradient(0,0,0,600);sky.addColorStop(0,'#04050a');sky.addColorStop(1,'#0e1220');g.fillStyle=sky;g.fillRect(-400,-400,2400,1100);
      /* earth under the house */
      g.fillStyle=rgrad(g,VX,880,700,[[0,'#2a0a08'],[0.4,'#120806'],[1,'#060404']]);g.fillRect(-400,640,2400,900);
      g.strokeStyle='rgba(40,24,16,.6)';g.lineWidth=2;for(let i=0;i<30;i++){const x=hash(i)*1600,y=660+hash(i+5)*300;g.beginPath();g.moveTo(x,y);g.quadraticCurveTo(x+20,y+30,x+5+hash(i+9)*40,y+60);g.stroke();}
      const X0=430,X1=1170,FL=[130,270,410,550,690];   /* attic, upper hall, ground floor, cellar */
      /* roof and outer walls */
      g.fillStyle='#0b0b10';poly(g,[[X0-40,FL[0]+10],[VX,10],[X1+40,FL[0]+10]]);g.fill();
      g.strokeStyle='rgba(60,64,80,.4)';g.lineWidth=1;for(let i=1;i<10;i++){const y=10+i*15;const hw=(y-10)/150*(X1-X0+80)/2;g.beginPath();g.moveTo(VX-hw,y);g.lineTo(VX+hw,y);g.stroke();}
      g.fillStyle='#0b0b10';g.fillRect(1010,30,34,90);
      const rooms=[['#221a20',[X0,640,X1]],['#1d2420',[X0,760,X1]],['#251e17',[X0,560,X1]],['#1a1715',[X0,900,X1]]];
      for(let f=0;f<4;f++){const y0=FL[f],y1=FL[f+1],[col,div]=rooms[f];
        g.save();g.beginPath();if(f===0){poly(g,[[X0+20,y1],[X0+20,y0+50],[VX,y0-100],[X1-20,y0+50],[X1-20,y1]]);}else g.rect(X0,y0,X1-X0,y1-y0);g.clip();
        g.fillStyle=col;g.fillRect(X0,y0-160,X1-X0,y1-y0+160);
        if(f===1||f===2){g.globalAlpha=0.35;g.fillStyle=pattern(g,A,'wall');g.save();g.translate(0,y0);g.scale(0.5,0.5);g.fillRect(X0*2,0,(X1-X0)*2,(y1-y0)*2);g.restore();g.globalAlpha=1;}
        if(f===3){g.globalAlpha=0.6;g.fillStyle=pattern(g,A,'brick');g.save();g.translate(0,y0);g.scale(0.45,0.45);g.fillRect(X0/0.45,0,(X1-X0)/0.45,(y1-y0)/0.45);g.restore();g.globalAlpha=1;}
        g.restore();
        /* the floor slab and room walls */
        g.fillStyle='#09080a';g.fillRect(X0-10,y1-8,X1-X0+20,10);
        div.slice(1,-1).forEach(x=>g.fillRect(x-5,y0,10,y1-y0-50));}
      furnish(g,X0,X1,FL,t);
      g.fillStyle='#09080a';g.fillRect(X0-14,FL[0]+10,14,FL[4]-FL[0]-10);g.fillRect(X1,FL[0]+10,14,FL[4]-FL[0]-10);
      /* the Heart in the earth, its roots up into the cellar */
      const hx=VX,hy=780,p=pulseAt([0.4,1.35,2.3,3.25,4.2,5.15,6.1,7.05,8,8.95,9.9],t);
      g.save();g.translate(hx,hy);A.veins.forEach(v=>{g.strokeStyle=`rgba(${70+100*p},8,10,.6)`;g.lineWidth=2;g.beginPath();
        v.pts.forEach((q,j)=>{j?g.lineTo(q[0]*1.4,q[1]*1.1):g.moveTo(0,0);});g.stroke();});g.restore();
      g.fillStyle=rgrad(g,hx-10,hy-10,60,[[0,'#7a141a'],[1,'#1a0204']]);g.beginPath();g.ellipse(hx,hy,48*(1+0.07*p),40*(1+0.07*p),0,0,TAU);g.fill();
      sigil(g,hx,hy,70,0.25+0.35*p,'#ff4030');glow(g,hx,hy,160,'200,30,20',0.25+0.3*p);
      /* the thing, crossing the upper hall */
      const tx=lerp(X0+60,X1-80,ease((t-2.5)/7)),k=100;
      thing(g,tx,FL[2]-8,k,{ph:t*0.7,t,eyes:1,tilt:0});
      /* embers */
      const lit=[];
      E5.forEach((e,i)=>{if(t<e.t0)return;const u=clamp((t-e.t0)/e.fl,0,1);
        const tx2=e.side?lerp(VX+80,X1-60,hash(i+3)):lerp(X0+60,VX-80,hash(i+3)),ty=FL[e.f]+(FL[e.f+1]-FL[e.f])*0.62;
        const pos=v=>[lerp(hx,tx2,easeOut(v)),lerp(hy,ty,v)-Math.sin(v*Math.PI)*120];
        if(u<1){g.save();g.globalCompositeOperation='lighter';for(let j=1;j<14;j++){const q=pos(Math.max(0,u-j*0.02));g.fillStyle=`rgba(255,150,60,${0.3*(1-j/14)})`;g.fillRect(q[0]-2,q[1]-2,4,4);}g.restore();}
        const q=pos(u);ember(g,q[0],q[1],6,1);if(u>=1){lit.push(q);sparks(g,q[0],q[1],e.t0+e.fl,t,18,i*40,120);}});
      /* memory fragments drifting down */
      for(let i=0;i<6;i++){const s0=5.8+i*0.4;if(t<s0)continue;const u=clamp((t-s0)/2.8,0,1),f=1+(i%3);
        const x=lerp(X0+90,X1-90,hash(i+70))+Math.sin(u*9+i)*20,y=lerp(FL[f]+10,FL[f+1]-14,easeOut(u));
        g.save();g.translate(x,y);g.rotate(Math.sin(u*7+i)*0.6*(1-u));g.fillStyle='rgba(205,195,170,.85)';g.fillRect(-11,-8,22,16);
        g.fillStyle='rgba(60,50,40,.6)';g.fillRect(-8,-5,16,9);g.restore();}
      darkBegin(A,0.82,'2,2,6');
      lit.forEach(q=>lightAt(A,(q[0]-VX)*pz+VX,(q[1]-450+py)*pz+450,190*pz,0.95));
      lightAt(A,VX,(hy-450+py)*pz+450,240*pz,0.8);
      darkEnd(g,A);
      lit.forEach(q=>glow(g,q[0],q[1],90,'255,150,60',0.2));
      g.restore();
    }},
  { /* 6. THE DOOR */
    dur:12,
    lines:[[0.8,'Gather the embers. Break the seal on the front door. Leave.',3.53],
           [4.9,'If it takes you, the embers scatter, the seal re-forms, and the Heart drags you back down to begin again.',6.23]],
    draw(g,t,o){
      const fall=o.motion?easeIn((t-9.6)/1.6):0,slam=t>7.6&&t<8.2?Math.exp(-(t-7.6)*8):0;
      g.save();g.translate(o.motion?(hash(Math.floor(t*40))-0.5)*slam*30:0,-fall*1100);
      if(o.motion){const z=1+0.06*ease(t/7.6);g.translate(VX,VY);g.scale(z,z);g.translate(-VX,-VY);}
      /* the hall: stone walls, flagged floor, a long rug */
      const ft=A.stone,y0=Math.floor(VY+0.55*F/1.6);
      g.fillStyle=pattern(g,A,'stone');g.save();g.scale(1.3,1.3);g.fillRect(-200,-200,2000/1.3,(y0+200)/1.3);g.restore();
      g.fillStyle='rgba(0,0,0,.4)';g.fillRect(-200,-200,2000,y0+200);
      for(let y=y0;y<SH+200;y+=2){const z=0.55*F/(y+1-VY),xl=VX-6*F/z,xr=VX+6*F/z,v=Math.floor(((z*160)%256+256)%256);g.drawImage(ft,0,v,256,1,xl,y,xr-xl,2.6);}
      g.fillStyle='#3a0d10';poly(g,[[VX-150,y0],[VX+150,y0],[VX+420,SH+200],[VX-420,SH+200]]);g.fill();
      g.strokeStyle='rgba(160,120,60,.35)';g.lineWidth=3;poly(g,[[VX-135,y0+4],[VX+135,y0+4],[VX+395,SH+200],[VX-395,SH+200]]);g.stroke();
      /* the doorway: stone surround, stained-glass fan, two oak doors */
      const dx0=VX-200,dx1=VX+200,dTop=60,dBot=y0,ar=200;
      g.fillStyle='#2a2622';g.beginPath();g.moveTo(dx0-60,dBot);g.lineTo(dx0-60,dTop+ar);g.arc(VX,dTop+ar,ar+60,Math.PI,0);g.lineTo(dx1+60,dBot);g.closePath();g.fill();
      for(let i=0;i<=12;i++){const a=Math.PI+i/12*Math.PI;g.strokeStyle='rgba(0,0,0,.55)';g.lineWidth=3;g.beginPath();
        g.moveTo(VX+Math.cos(a)*ar,dTop+ar+Math.sin(a)*ar);g.lineTo(VX+Math.cos(a)*(ar+60),dTop+ar+Math.sin(a)*(ar+60));g.stroke();}
      g.fillStyle='#35302a';poly(g,[[VX-26,dTop-62],[VX+26,dTop-62],[VX+18,dTop+4],[VX-18,dTop+4]]);g.fill();
      /* stained glass */
      const gl=['120,20,24','30,40,110','150,100,30','40,90,60'];
      for(let i=0;i<8;i++){const a0=Math.PI+i/8*Math.PI,a1=Math.PI+(i+1)/8*Math.PI;g.fillStyle=`rgba(${gl[i%4]},${0.55+0.15*Math.sin(t*0.8+i)})`;
        g.beginPath();g.moveTo(VX,dTop+ar);g.arc(VX,dTop+ar,ar-6,a0,a1);g.closePath();g.fill();}
      g.strokeStyle='#0c0a08';g.lineWidth=5;for(let i=0;i<=8;i++){const a=Math.PI+i/8*Math.PI;g.beginPath();g.moveTo(VX,dTop+ar);g.lineTo(VX+Math.cos(a)*ar,dTop+ar+Math.sin(a)*ar);g.stroke();}
      g.beginPath();g.arc(VX,dTop+ar,ar*0.45,Math.PI,0);g.stroke();g.lineWidth=8;g.beginPath();g.moveTo(dx0,dTop+ar);g.lineTo(dx1,dTop+ar);g.stroke();
      /* the dawn behind the doors */
      const brk=t>5.2&&t<7.6,open=brk?ease((t-5.4)/1.6)*0.32:t>=7.6?Math.max(0,0.32*(1-(t-7.6)*8)):0;
      if(open>0.002){const gx=VX,gw=400*open;g.fillStyle=rgrad(g,gx,dTop+ar+120,300,[[0,'rgba(255,240,210,1)'],[1,'rgba(255,190,120,.6)']]);g.fillRect(gx-gw,dTop+ar,gw*2,dBot-dTop-ar);}
      /* door leaves, swinging in on their hinges */
      const leaf=(side)=>{g.save();const hx=side<0?dx0:dx1;g.translate(hx,0);g.scale(1-open*1.6,1);if(side>0)g.scale(-1,1);
        const lw=200,ty=dTop+ar,lh=dBot-ty;
        g.fillStyle=pattern(g,A,'door');g.save();g.translate(0,ty);g.scale(0.78,0.78);g.fillRect(0,0,lw/0.78,lh/0.78);g.restore();
        g.fillStyle=`rgba(0,0,0,${0.15+open*1.5})`;g.fillRect(0,ty,lw,lh);
        [[24,ty+24,152,150],[24,ty+200,152,200]].forEach(r=>{g.fillStyle='rgba(0,0,0,.25)';g.fillRect(r[0],r[1],r[2],r[3]);
          g.fillStyle='rgba(255,210,160,.07)';g.fillRect(r[0],r[1],r[2],3);g.fillRect(r[0],r[1],3,r[3]);
          g.fillStyle='rgba(0,0,0,.45)';g.fillRect(r[0],r[1]+r[3]-3,r[2],3);g.fillRect(r[0]+r[2]-3,r[1],3,r[3]);});
        g.fillStyle='#0e0f12';[ty+40,ty+lh-70].forEach(y=>{g.fillRect(0,y,150,12);g.beginPath();g.arc(150,y+6,10,0,TAU);g.fill();
          g.fillStyle='rgba(150,150,160,.35)';for(let r=0;r<5;r++)g.fillRect(14+r*30,y+4,4,4);g.fillStyle='#0e0f12';});
        g.strokeStyle='#14141a';g.lineWidth=6;g.beginPath();g.arc(lw-40,ty+lh*0.48,22,0,TAU);g.stroke();
        g.fillStyle='#14141a';g.beginPath();g.arc(lw-40,ty+lh*0.48-24,9,0,TAU);g.fill();
        g.restore();};
      leaf(-1);leaf(1);
      /* chains across the doors */
      const chA=t<5.2?1:t<7.6?0:ease((t-7.8)/0.8),drop=t>=5.2&&t<7.6?easeIn((t-5.2)/0.9):0;
      const cy=dTop+ar+230;
      if(chA>0||drop>0)[[dx0+10,dTop+ar+30,dx1-10,dBot-40],[dx1-10,dTop+ar+30,dx0+10,dBot-40]].forEach(c=>{
        const n=22;g.save();g.globalAlpha=chA>0?chA:1;
        for(let i=0;i<n;i++){const u=(i+0.5)/n;let x=lerp(c[0],c[2],u),y=lerp(c[1],c[3],u);if(drop>0){y+=drop*(400+i*12);x+=(u-0.5)*drop*-80;}
          const a=Math.atan2(c[3]-c[1],c[2]-c[0])+drop*(i%2?0.6:-0.6);
          g.save();g.translate(x,y);g.rotate(a);g.strokeStyle='#2c2b2e';g.lineWidth=i%2?5:4;g.beginPath();g.ellipse(0,0,13,i%2?3:7,0,0,TAU);g.stroke();
          g.strokeStyle='rgba(180,180,190,.25)';g.lineWidth=1;g.beginPath();g.ellipse(0,-1,12,i%2?2:6,0,Math.PI,TAU);g.stroke();g.restore();}
        g.restore();});
      /* the seal */
      const hit=STRIKE6.filter(s=>t>=s).length,crack=hit/8,shat=t>=5.2&&t<7.6,reform=t>=7.6?ease((t-7.6)/1.2):0;
      const sp=STRIKE6.reduce((a,s)=>a+(t>=s?Math.exp(-(t-s)*7):0),0);
      if(!shat){sigil(g,VX,cy,150,(t<7.6?0.75+0.25*sp:reform),t<7.6?'#ff5a30':'#d01818',t*0.15,A,true);
        glow(g,VX,cy,260,t<7.6?'255,90,40':'220,20,20',(t<7.6?0.25+0.3*sp:0.4*reform)*(o.flash?1:0.6));
        if(t<5.2&&crack>0){g.save();g.translate(VX,cy);g.strokeStyle=`rgba(255,230,190,${0.6+0.4*sp})`;g.lineWidth=2.4;
          A.cracks.slice(0,hit).forEach(cr=>{g.beginPath();cr.forEach((q,j)=>{j?g.lineTo(q[0]*160,q[1]*160):g.moveTo(0,0);});g.stroke();});g.restore();}}
      else{const d=t-5.2;g.save();g.translate(VX,cy);
        for(let i=0;i<10;i++){const a=i/10*TAU,dist=d*(260+hash(i)*200),al=Math.max(0,1-d*0.9);
          g.save();g.rotate(a);g.translate(0,-dist);g.rotate(d*(hash(i+3)-0.5)*8);g.globalAlpha=al;g.strokeStyle='#ff7040';g.lineWidth=4;
          g.beginPath();g.arc(0,dist,150,-Math.PI/2-0.3,-Math.PI/2+0.3);g.stroke();g.restore();}g.restore();
        sparks(g,VX,cy,5.2,t,60,600,520,'255,200,120');}
      /* embers: they come in from the dark, circle, and strike */
      for(let i=0;i<8;i++){const s=STRIKE6[i],a0=i/8*TAU;let x,y,a=1;
        if(t<s){const u=ease((t-0.5-i*0.12)/1.6),ang=a0+t*1.6,rr=lerp(900,230,u);x=VX+Math.cos(ang)*rr;y=cy+Math.sin(ang)*rr*0.6;if(t<0.5+i*0.12)continue;
          const k2=easeIn((t-(s-0.3))/0.3);x=lerp(x,VX,k2);y=lerp(y,cy,k2);}
        else if(t>=7.8){const u=easeOut((t-7.8)/1.4);x=lerp(VX,VX+Math.cos(a0)*1000,u);y=lerp(cy,cy+Math.sin(a0)*700,u);a=1-u;}
        else continue;
        ember(g,x,y,7,a);}
      /* light */
      darkBegin(A,0.86,'2,1,1');
      [[dx0-170,330],[dx1+170,330]].forEach((p,i)=>lightAt(A,p[0],p[1],300*(t<7.6?1:Math.max(0.35,1-(t-7.6))),0.9));
      lightAt(A,VX,cy,300+120*sp,0.9);
      if(open>0)lightAt(A,VX,dTop+ar+200,1400*open/0.32,1);
      darkEnd(g,A);
      [[dx0-170,330],[dx1+170,330]].forEach((p,i)=>{g.fillStyle='#16110a';g.fillRect(p[0]-10,p[1],20,26);
        const a=t<7.6?1:Math.max(0.35,1-(t-7.6));flame(g,p[0],p[1]-4,16*a,t,0,i+5);glow(g,p[0],p[1],140,'255,160,80',0.25*a);});
      /* dawn: rays pour through the gap */
      if(open>0.002){const k=open/0.32*(o.flash?1:0.6);g.save();g.globalCompositeOperation='lighter';
        for(let i=0;i<7;i++){const a=(i-3)*0.2+Math.sin(t*0.4+i)*0.03,len=1100;g.fillStyle=`rgba(255,225,170,${0.06*k})`;
          poly(g,[[VX-10,dTop+ar+40],[VX+10,dTop+ar+40],[VX+Math.sin(a+0.08)*len,dTop+ar+40+Math.cos(a)*len],[VX+Math.sin(a-0.08)*len,dTop+ar+40+Math.cos(a)*len]]);g.fill();}
        g.restore();motes(g,VX,600,420,t,70,77,'255,230,190',0.7*k);}
      /* the red takes everything */
      if(t>7.6){g.fillStyle=`rgba(70,0,0,${0.45*ease((t-7.6)/1.5)})`;g.fillRect(-200,-200,2000,2400);}
      g.restore();
      if(fall>0){g.fillStyle=`rgba(0,0,0,${fall})`;g.fillRect(0,0,SW,SH);
        const k=ease((t-10.3)/0.6)*(1-ease((t-11.3)/0.5));sigil(g,VX,560,170,0.8*k,'#c01818');glow(g,VX,560,260,'200,20,20',0.35*k);}
      else if(!o.motion&&t>9.6)g.fillStyle=`rgba(0,0,0,${ease((t-9.6)/1)})`,g.fillRect(0,0,SW,SH);
    }},
  { /* 7. TITLE */
    dur:8,
    lines:[],
    draw(g,t,o){
      g.fillStyle='#030305';g.fillRect(0,0,SW,SH);
      const p=pulseAt([2.9,3.85],t);glow(g,VX,420,520,'150,20,20',0.15+0.3*p);
      const fw=A.fog.width;
      for(let k=0;k<3;k++){g.globalAlpha=0.09+k*0.03;const off=(t*(10+k*8)+k*300)%fw;for(let x=-off;x<1800;x+=fw)g.drawImage(A.fog,x-100,250+k*140-t*6,fw,260);}
      g.globalAlpha=1;
      /* embers rising */
      g.save();g.globalCompositeOperation='lighter';
      for(let i=0;i<70;i++){const sp=0.08+hash(i)*0.1,u=(t*sp+hash(i+9))%1,x=hash(i+20)*1600+Math.sin(t*1.5+i)*20,y=950-u*1050;
        g.fillStyle=`rgba(255,${140+hash(i)*80|0},60,${Math.sin(u*Math.PI)*0.7})`;g.fillRect(x,y,2.2,2.2);}
      g.restore();
      /* the title catches, letter by letter */
      const T='HOLLOWMERE',out=1-ease((t-6.4)/1.4);
      g.textAlign='center';g.textBaseline='middle';g.font="600 150px 'Cormorant SC',serif";
      /* on a narrow screen the stage is cropped at the sides: shrink the title to fit what shows */
      const fit=Math.min(1,(o.vw||SW)*0.86/g.measureText(T).width);
      g.save();g.translate(VX,470);g.scale(fit,fit);g.translate(-VX,-470);
      const total=g.measureText(T).width;let x=VX-total/2;
      for(let i=0;i<T.length;i++){const cw=g.measureText(T[i]).width,s=0.6+i*0.13,a=ease((t-s)/0.5)*out;
        const fl=t<s+0.5?(0.6+0.4*Math.sin(t*40+i*7)):1;
        if(a>0){g.shadowColor='rgba(255,140,50,.6)';g.shadowBlur=28;g.fillStyle=`rgba(232,222,198,${a*fl})`;g.fillText(T[i],x+cw/2,420);}
        x+=cw;}
      g.shadowBlur=0;
      const sa=ease((t-2.4)/1.2)*out;
      g.strokeStyle=`rgba(160,140,110,${0.5*sa})`;g.lineWidth=1;g.beginPath();g.moveTo(VX-330,510);g.lineTo(VX-30,510);g.moveTo(VX+30,510);g.lineTo(VX+330,510);g.stroke();
      ember(g,VX,510,5,sa);
      g.font="34px 'Cormorant SC',serif";g.fillStyle=`rgba(175,162,136,${sa})`;g.fillText('THE HEART OF THE HOUSE IS HUNGRY',VX,565);
      g.restore();
      g.textAlign='start';g.textBaseline='alphabetic';
    }},
  ];
}

/* --- scene 1 pieces --- */
function drawTree(g,n,x,y,ang,wd,len,t,wind){
  const a=ang+n.ang+Math.sin(t*1.1+n.d*0.8+x*0.01)*0.035*(8-n.d)*wind;
  const L=len*n.len,x2=x+Math.sin(a)*L,y2=y-Math.cos(a)*L;
  g.lineWidth=wd;g.lineCap='round';g.beginPath();g.moveTo(x,y);g.lineTo(x2,y2);g.stroke();
  n.kids.forEach(k=>drawTree(g,k,x2,y2,a,wd*0.66,L,t,wind));}
function rain(g,t,n,a,wd,len){
  g.strokeStyle=`rgba(160,175,210,${a})`;g.lineWidth=wd;g.beginPath();
  for(let i=0;i<n;i++){const sp=0.9+hash(i+n)*0.5,x=((hash(i*3+n)*1900+t*140*sp)%1900)-150,y=((hash(i*7+n)*1000+t*1300*sp)%1000)-50;
    g.moveTo(x,y);g.lineTo(x-len*0.3,y+len*2);}
  g.stroke();}
function fence(g,base,L){
  g.fillStyle='#010102';g.strokeStyle='#010102';
  g.fillRect(-300,base-150,2200,9);g.fillRect(-300,base-40,2200,9);
  for(let x=-300;x<1900;x+=46){g.fillRect(x-3,base-190,6,230);
    g.beginPath();g.moveTo(x-8,base-188);g.lineTo(x,base-212);g.lineTo(x+8,base-188);g.closePath();g.fill();
    if(L>0){g.fillStyle=`rgba(160,175,220,${0.25*L})`;g.fillRect(x+2,base-190,1.5,230);g.fillStyle='#010102';}}
  g.lineWidth=3;for(let x=-277;x<1900;x+=46){g.beginPath();g.arc(x,base-120,9,0,TAU);g.stroke();}}
function mansion(g,A,x,base,s,t,L,o){
  g.save();g.translate(x,base);g.scale(s,s);
  const path=()=>{g.beginPath();
    const R=(x0,y0,x1,y1)=>{g.rect(x0,y0,x1-x0,y1-y0);};
    R(-180,-150,180,0);poly2(g,[[-195,-150],[-170,-212],[170,-212],[195,-150]]);poly2(g,[[-62,-212],[0,-282],[62,-212]]);
    R(-262,-262,-185,0);poly2(g,[[-272,-262],[-224,-392],[-175,-262]]);R(-226,-420,-222,-390);
    R(186,-302,256,0);poly2(g,[[178,-302],[221,-452],[264,-302]]);R(219,-482,223,-450);
    R(-382,-112,-262,0);poly2(g,[[-392,-112],[-322,-168],[-252,-112]]);
    R(256,-96,392,0);poly2(g,[[250,-96],[282,-138],[366,-138],[400,-96]]);
    R(-100,-262,-80,-200);R(92,-252,110,-200);R(-346,-190,-332,-150);
    poly2(g,[[-138,-212],[-120,-246],[-102,-212]]);R(-136,-212,-104,-190);poly2(g,[[102,-212],[120,-246],[138,-212]]);R(104,-212,136,-190);};
  path();g.fillStyle='#07080e';g.fill();
  /* moonlight raking across the facade from the right */
  g.save();path();g.clip();
  const mg=g.createLinearGradient(400,-460,-200,0);mg.addColorStop(0,`rgba(110,125,165,${0.22+0.4*L})`);mg.addColorStop(0.6,'rgba(60,70,100,.05)');mg.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=mg;g.fillRect(-420,-500,840,520);
  /* shingles on the roofs and siding lines */
  g.strokeStyle='rgba(0,0,0,.45)';g.lineWidth=1;for(let y=-212;y<-150;y+=7){g.beginPath();g.moveTo(-200,y);g.lineTo(200,y);g.stroke();}
  for(let y=-140;y<0;y+=10){g.beginPath();g.moveTo(-400,y);g.lineTo(400,y);g.stroke();}
  g.restore();
  /* windows */
  const W=[];for(let r=0;r<2;r++)for(let c=0;c<6;c++)W.push([-150+c*54+(c>2?18:0),-128+r*62,22,38]);
  W.push([-232,-230,16,30],[-232,-150,16,30],[212,-270,18,32],[212,-190,18,32],[212,-110,18,32],[-340,-90,16,28],[300,-78,16,26],[-12,-262,24,26],[-128,-208,14,16],[112,-208,14,16]);
  const litI=t>4?[2,7,9,13,15]:[13,15];
  W.forEach((w,i)=>{const on=litI.indexOf(i)>=0;
    const f=on?0.7+0.3*Math.sin(t*(2.3+i*0.3)+i)*Math.sin(t*1.1+i*2):0;
    g.fillStyle=on?`rgba(255,${150+(i*13)%50},70,${0.55+0.4*f})`:`rgba(70,82,110,${0.16+0.3*L})`;
    g.beginPath();g.moveTo(w[0],w[1]+w[3]);g.lineTo(w[0],w[1]+w[2]/2);g.arc(w[0]+w[2]/2,w[1]+w[2]/2,w[2]/2,Math.PI,0);g.lineTo(w[0]+w[2],w[1]+w[3]);g.closePath();g.fill();
    g.fillStyle='#07080e';g.fillRect(w[0]+w[2]/2-1,w[1],2,w[3]);g.fillRect(w[0],w[1]+w[3]*0.55,w[2],2);
    if(on)glow(g,w[0]+w[2]/2,w[1]+w[3]/2,50,'255,150,60',0.16*f);
    /* someone at the tower window */
    if(i===13){const a=win(t,6.6,9.6,0.6,0.8);if(a>0){g.fillStyle=`rgba(8,6,6,${0.9*a})`;g.beginPath();g.arc(w[0]+w[2]/2,w[1]+12,5,0,TAU);g.fill();
        g.fillRect(w[0]+3,w[1]+16,w[2]-6,w[3]-16);g.fillStyle=`rgba(220,215,200,${0.6*a})`;g.fillRect(w[0]+w[2]/2-3,w[1]+11,1.5,1.5);g.fillRect(w[0]+w[2]/2+1.5,w[1]+11,1.5,1.5);}}});
  /* porch and steps */
  g.fillStyle='#05060a';g.fillRect(-54,-76,108,76);poly(g,[[-64,-76],[0,-108],[64,-76]]);g.fill();
  g.fillStyle='rgba(255,150,60,.18)';g.fillRect(-16,-56,32,56);
  g.fillStyle='#0b0c12';for(let i=0;i<4;i++)g.fillRect(-70+i*6,-6+i*0,140-i*12,6);
  g.fillStyle='#0a0b12';[-50,-30,30,50].forEach(px=>g.fillRect(px-3,-76,6,76));
  /* chimney smoke */
  [[-90,-262],[101,-252],[-339,-190]].forEach((c,k)=>{for(let i=0;i<12;i++){const ag=(t*0.22+i/12+k*0.3)%1;
    const px=c[0]+ag*90+Math.sin(ag*6+i)*8,py=c[1]-ag*140,r=6+ag*34;g.fillStyle=`rgba(70,74,90,${(1-ag)*0.12})`;g.beginPath();g.arc(px,py,r,0,TAU);g.fill();}});
  g.restore();}
function poly2(g,pts){g.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)g.lineTo(pts[i][0],pts[i][1]);g.closePath();}

/* --- scene 5: what is in each room --- */
function furnish(g,X0,X1,FL,t){
  g.fillStyle='#050406';g.strokeStyle='#050406';g.lineCap='round';
  const f=(y)=>y-8;
  /* attic: trunks, a dressmaker's dummy, a rocking chair, cobwebs */
  let y=f(FL[1]);
  g.fillRect(540,y-34,70,34);g.fillRect(620,y-24,50,24);g.beginPath();g.ellipse(575,y-34,35,8,0,Math.PI,TAU);g.fill();
  g.beginPath();g.ellipse(760,y-70,16,24,0,0,TAU);g.fill();g.fillRect(756,y-46,8,40);g.fillRect(740,y-6,40,6);
  const rk=Math.sin(t*1.2)*0.12;g.save();g.translate(960,y);g.rotate(rk);g.lineWidth=5;g.beginPath();g.arc(0,0,40,Math.PI*1.15,Math.PI*1.85);g.stroke();
  g.fillRect(-26,-40,52,6);g.fillRect(-26,-80,6,44);g.fillRect(20,-80,6,44);g.fillRect(-26,-80,52,5);g.restore();
  g.strokeStyle='rgba(150,150,160,.25)';g.lineWidth=1;g.beginPath();for(let i=0;i<6;i++){g.moveTo(X0+30,FL[0]+60);g.lineTo(X0+30+Math.cos(i*0.3)*60,FL[0]+60+Math.sin(i*0.3)*60);}g.stroke();g.strokeStyle='#050406';
  /* upper hall: a bed, a wardrobe, a portrait, a grandfather clock */
  y=f(FL[2]);g.fillRect(470,y-30,120,22);g.fillRect(470,y-60,10,60);g.fillRect(580,y-44,10,44);g.fillRect(490,y-40,40,10);
  g.fillRect(660,y-110,60,110);g.fillStyle='rgba(60,50,40,.3)';g.fillRect(689,y-104,2,98);g.fillStyle='#050406';
  g.fillRect(880,y-120,46,60);g.fillStyle='#14110e';g.fillRect(886,y-114,34,48);g.fillStyle='#050406';
  g.fillRect(1060,y-130,34,130);g.fillStyle='#16130f';g.beginPath();g.arc(1077,y-108,12,0,TAU);g.fill();
  g.strokeStyle='#050406';g.lineWidth=2;g.beginPath();g.moveTo(1077,y-108);g.lineTo(1077+Math.sin(t)*8,y-116);g.stroke();
  const pend=Math.sin(t*3)*0.4;g.beginPath();g.moveTo(1077,y-92);g.lineTo(1077+Math.sin(pend)*18,y-92+Math.cos(pend)*18);g.stroke();g.fillStyle='#050406';
  /* ground floor: a piano, a dining table under a chandelier, bookshelves */
  y=f(FL[3]);g.fillRect(470,y-56,110,40);g.fillRect(476,y-16,6,16);g.fillRect(570,y-16,6,16);g.fillRect(470,y-60,110,6);
  g.fillRect(660,y-40,160,8);g.fillRect(670,y-32,6,32);g.fillRect(804,y-32,6,32);
  [680,720,760,800].forEach(cx=>{g.fillRect(cx-6,y-30,12,6);g.fillRect(cx-6,y-56,4,28);});
  g.lineWidth=2;g.beginPath();g.moveTo(740,FL[2]+2);g.lineTo(740,FL[2]+40);g.stroke();g.beginPath();g.ellipse(740,FL[2]+46,40,8,0,0,Math.PI);g.stroke();
  g.fillRect(960,y-120,120,120);g.fillStyle='rgba(60,40,30,.5)';for(let r=0;r<4;r++)for(let b=0;b<9;b++)g.fillRect(966+b*12,y-114+r*29,8,22-hash(r*9+b)*8);g.fillStyle='#050406';
  /* stairs between floors */
  g.strokeStyle='rgba(30,24,20,.9)';g.lineWidth=4;
  [[X1-130,FL[3],X1-30,FL[2]],[X0+30,FL[2],X0+130,FL[1]],[X1-130,FL[4]-8,X1-30,FL[3]]].forEach(s=>{g.beginPath();for(let i=0;i<=8;i++){const xx=lerp(s[0],s[2],i/8),yy=lerp(s[1]-8,s[3],i/8);g.lineTo(xx,yy);g.lineTo(xx+(s[2]-s[0])/8,yy);}g.stroke();});
  /* cellar: barrels, crates, a chained door */
  y=f(FL[4]);g.fillStyle='#050406';
  [[500,y],[560,y],[530,y-50]].forEach(b=>{g.beginPath();g.ellipse(b[0],b[1]-24,24,26,0,0,TAU);g.fill();});
  g.fillRect(900,y-50,60,50);g.fillRect(960,y-34,40,34);g.fillRect(920,y-90,44,40);
  g.fillRect(760,y-100,60,100);g.strokeStyle='rgba(120,120,130,.35)';g.lineWidth=2;g.beginPath();g.moveTo(760,y-70);g.lineTo(820,y-30);g.moveTo(820,y-70);g.lineTo(760,y-30);g.stroke();
}

/* ================= SOUND ================= */
/* the narrator: one track with every line already in place on the story's clock */
const VOICE_URL=new URL('backstory-voice.mp3',(document.currentScript&&document.currentScript.src)||location.href).href;
let voiceBytes=null,voiceFetch=null;const voiceDecoded=new WeakMap();
function fetchVoice(){
  if(voiceBytes)return Promise.resolve(voiceBytes);
  if(!voiceFetch)voiceFetch=fetch(VOICE_URL).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.arrayBuffer();})
    .then(b=>voiceBytes=b).catch(e=>{voiceFetch=null;console.warn('Story voice failed to load:',e);return null;});
  return voiceFetch;
}
function decodeVoice(ac){
  if(voiceDecoded.has(ac))return Promise.resolve(voiceDecoded.get(ac));
  return fetchVoice().then(b=>b&&new Promise((res,rej)=>ac.decodeAudioData(b.slice(0),res,rej)))
    .then(buf=>{if(buf)voiceDecoded.set(ac,buf);return buf;}).catch(e=>{console.warn('Story voice failed to decode:',e);return null;});
}
function makeSound(ac,out,S,SC){
  if(!ac||!out)return null;
  /* main carries everything; bus (the score and effects) dips under the narrator */
  const main=ac.createGain();main.gain.value=0;main.connect(out);
  const bus=ac.createGain();bus.connect(main);
  const t0=ac.currentTime+0.05;
  main.gain.setTargetAtTime(1,t0,0.6);
  const T=(sc,at)=>t0+S[sc]+at;
  /* the narrator's voice: a little air around it, a soft room behind */
  const vo=ac.createGain();vo.gain.value=0.95;vo.connect(main);
  const vroom=ac.createConvolver(),vwet=ac.createGain();vwet.gain.value=0.16;
  {const n=Math.floor(ac.sampleRate*1.8),ir=ac.createBuffer(2,n,ac.sampleRate);
   for(let c=0;c<2;c++){const d=ir.getChannelData(c);for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/n,3.2);}
   vroom.buffer=ir;}
  vo.connect(vroom);vroom.connect(vwet);vwet.connect(main);
  if(SC)SC.forEach((sc,i)=>sc.lines.forEach(([st,,len])=>{if(!len)return;const a=T(i,st);
    bus.gain.setTargetAtTime(0.6,a-0.25,0.12);bus.gain.setTargetAtTime(1,a+len,0.35);}));
  let vsrc=null,stopped=false;
  const startVoice=buf=>{if(!buf||stopped)return;
    const off=Math.max(0,ac.currentTime+0.02-t0);if(off>=buf.duration)return;
    vsrc=ac.createBufferSource();vsrc.buffer=buf;vsrc.connect(vo);vsrc.start(t0+off,off);};
  if(voiceDecoded.has(ac))startVoice(voiceDecoded.get(ac));else decodeVoice(ac).then(startVoice);
  const noise=ac.createBuffer(1,ac.sampleRate*2,ac.sampleRate);
  {const d=noise.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;}
  const live=[];
  function noiseHit(at,dur,f,q,vol,type,f2){
    const s=ac.createBufferSource();s.buffer=noise;s.loop=true;s.loopStart=Math.random();
    const fl=ac.createBiquadFilter();fl.type=type||'lowpass';fl.frequency.setValueAtTime(f,at);fl.Q.value=q||0.7;
    if(f2)fl.frequency.exponentialRampToValueAtTime(f2,at+dur);
    const g=ac.createGain();g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(vol,at+Math.min(0.03,dur*0.3));
    g.gain.exponentialRampToValueAtTime(0.0001,at+dur);
    s.connect(fl);fl.connect(g);g.connect(bus);s.start(at);s.stop(at+dur+0.05);}
  function swell(at,dur,f,q,vol,type,f2){/* a noise that rises and falls */
    const s=ac.createBufferSource();s.buffer=noise;s.loop=true;
    const fl=ac.createBiquadFilter();fl.type=type||'bandpass';fl.frequency.setValueAtTime(f,at);fl.Q.value=q||1;
    if(f2)fl.frequency.exponentialRampToValueAtTime(f2,at+dur);
    const g=ac.createGain();g.gain.setValueAtTime(0.0001,at);g.gain.exponentialRampToValueAtTime(vol,at+dur*0.6);g.gain.exponentialRampToValueAtTime(0.0001,at+dur);
    s.connect(fl);fl.connect(g);g.connect(bus);s.start(at);s.stop(at+dur+0.05);}
  function tone(at,dur,f0,f1,vol,type,att){
    const o=ac.createOscillator();o.type=type||'sine';o.frequency.setValueAtTime(f0,at);
    if(f1)o.frequency.exponentialRampToValueAtTime(f1,at+dur);
    const g=ac.createGain();g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(vol,at+(att||0.01));
    g.gain.exponentialRampToValueAtTime(0.0001,at+dur);
    o.connect(g);g.connect(bus);o.start(at);o.stop(at+dur+0.05);}
  function pad(at,dur,freqs,vol,type,lp){
    const f=ac.createBiquadFilter();f.type='lowpass';f.frequency.value=lp||1200;const g=ac.createGain();
    g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(vol,at+dur*0.4);g.gain.linearRampToValueAtTime(0,at+dur);f.connect(g);g.connect(bus);
    freqs.forEach((fr,i)=>{const o=ac.createOscillator();o.type=type||'triangle';o.frequency.value=fr;o.detune.value=(i%2?6:-6);o.connect(f);o.start(at);o.stop(at+dur+0.05);});}
  const beat=(at,vol)=>{tone(at,0.32,64,38,vol);tone(at+0.22,0.3,58,36,vol*0.7);noiseHit(at,0.08,120,0.5,vol*0.25);};
  const step=(at,vol,f)=>{noiseHit(at,0.16,f||380,1.3,vol,'bandpass');tone(at,0.12,95,55,vol*0.4);};
  const creak=(at,dur,f,vol)=>{const o=ac.createOscillator();o.type='sawtooth';o.frequency.setValueAtTime(f,at);o.frequency.linearRampToValueAtTime(f*1.35,at+dur*0.5);o.frequency.linearRampToValueAtTime(f*0.9,at+dur);
    const bp=ac.createBiquadFilter();bp.type='bandpass';bp.frequency.value=f*6;bp.Q.value=6;const g=ac.createGain();
    g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(vol,at+0.05);g.gain.linearRampToValueAtTime(vol*0.6,at+dur*0.8);g.gain.linearRampToValueAtTime(0,at+dur);
    const am=ac.createOscillator(),ag=ac.createGain();am.frequency.value=23;ag.gain.value=vol*0.5;am.connect(ag);ag.connect(g.gain);
    o.connect(bp);bp.connect(g);g.connect(bus);o.start(at);am.start(at);o.stop(at+dur+0.05);am.stop(at+dur+0.05);};
  /* a low drone under the whole story */
  [[55,'sawtooth',0.018],[55.35,'sawtooth',0.018],[27.5,'sine',0.055],[82.6,'sine',0.008]].forEach(([f,ty,v])=>{
    const o=ac.createOscillator();o.type=ty;o.frequency.value=f;
    const lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=240;
    const g=ac.createGain();g.gain.value=v;o.connect(lp);lp.connect(g);g.connect(bus);o.start(t0);live.push(o);});
  /* 1. storm: rain, wind, thunder, crows */
  {const s=ac.createBufferSource();s.buffer=noise;s.loop=true;const hp=ac.createBiquadFilter();hp.type='highpass';hp.frequency.value=900;
   const g=ac.createGain();g.gain.setValueAtTime(0.0001,t0);g.gain.exponentialRampToValueAtTime(0.06,t0+1.5);
   g.gain.setValueAtTime(0.06,T(1,-1.2));g.gain.exponentialRampToValueAtTime(0.0001,T(1,1));
   s.connect(hp);hp.connect(g);g.connect(bus);s.start(t0);s.stop(T(1,1.1));}
  swell(T(0,0),13,280,0.8,0.05,'bandpass',420);swell(T(0,5),9,350,1.2,0.035,'bandpass',220);
  [3.2,8.4].forEach((s,i)=>{noiseHit(T(0,s+0.05),0.35,2600,0.6,0.25,'highpass');noiseHit(T(0,s+0.3+i*0.15),3.6,150,0.6,0.55);noiseHit(T(0,s+0.9),2.6,90,0.6,0.4);});
  [5.1,5.45,9.8].forEach(at=>{noiseHit(T(0,at),0.22,1250,5,0.09,'bandpass',900);tone(T(0,at),0.2,620,480,0.02,'sawtooth');});
  /* 2. the corridor: your steps, the boards, a draught, the candle going out */
  for(let k=0;k<15;k++){const at=0.4+k/1.6;if(at>9.3)break;step(T(1,at),0.12+0.02*(k%2));}
  creak(T(1,3.1),0.9,70,0.05);creak(T(1,6.8),1.2,58,0.05);
  swell(T(1,8.4),1.6,500,0.7,0.12,'bandpass',1400);noiseHit(T(1,9.72),0.35,900,0.8,0.12,'bandpass',300);
  tone(T(1,10.1),0.9,1760,1700,0.006,'sine',0.3);
  /* 3. the Heart: beats, the soul rising, the tendrils, the pull, the boom */
  BEATS3.forEach(b=>beat(T(2,b),b<6.5?0.4:b<10.5?0.5:0.3));
  noiseHit(T(2,2.2),0.4,500,1,0.05,'bandpass');
  [880,1318.5,1760].forEach((f,i)=>{const at=T(2,1.6+i*0.3),o=ac.createOscillator(),g=ac.createGain(),v=ac.createOscillator(),vg=ac.createGain();
    o.frequency.value=f;v.frequency.value=5+i;vg.gain.value=f*0.01;v.connect(vg);vg.connect(o.frequency);
    g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(0.018,at+1.5);g.gain.linearRampToValueAtTime(0.012,at+5);g.gain.linearRampToValueAtTime(0,at+8.5);
    o.connect(g);g.connect(bus);o.start(at);v.start(at);o.stop(at+8.6);v.stop(at+8.6);});
  for(let i=0;i<6;i++)swell(T(2,6.4+i*0.3),1.6,160+i*40,3,0.07,'bandpass',90);
  tone(T(2,8.2),2.3,600,90,0.05,'triangle',1.2);
  tone(T(2,10.4),3.5,70,28,0.5);noiseHit(T(2,10.4),2.8,140,0.5,0.45);noiseHit(T(2,10.4),0.4,3000,0.5,0.08,'highpass');
  /* 4. the thing: its steps, the lights dying, its breath, its growl, the face */
  for(let k=1;k<=7;k++){const at=k*T4.step-0.2;if(at>10.3)break;step(T(3,at),0.16+k*0.025,240);tone(T(3,at),0.25,58,40,0.12+k*0.02);}
  SCONCES.forEach(([s,zs])=>{const at=sconceOut(zs);if(at>0.2&&at<10.3)noiseHit(T(3,at),0.4,1800,0.7,0.07,'bandpass',500);});
  for(let i=0;i<5;i++){const at=T(3,0.9+i*2);swell(at,1.3,300+i*20,2,0.06+i*0.015,'bandpass',220);}
  {const at=T(3,6.6);const o=ac.createOscillator();o.type='sawtooth';o.frequency.setValueAtTime(46,at);o.frequency.linearRampToValueAtTime(36,at+3.8);
   const lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=320;const g=ac.createGain();
   g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(0.17,at+3.4);g.gain.exponentialRampToValueAtTime(0.0001,at+3.85);
   const tr=ac.createOscillator(),tg=ac.createGain();tr.frequency.value=13;tg.gain.value=0.07;tr.connect(tg);tg.connect(g.gain);
   o.connect(lp);lp.connect(g);g.connect(bus);o.start(at);tr.start(at);o.stop(at+4);tr.stop(at+4);}
  [233.1,246.9,329.6,349.2,466.2].forEach(f=>tone(T(3,10.4),1.6,f,f*0.97,0.05,'sawtooth',0.005));
  noiseHit(T(3,10.4),0.9,2400,0.6,0.22,'highpass');tone(T(3,10.4),2,55,30,0.35);
  /* 5. the embers: whooshes out of the Heart, a chime where each one lands */
  [0.4,1.35,2.3,3.25,4.2,5.15,6.1,7.05,8,8.95,9.9].forEach(b=>beat(T(4,b),0.14));
  const notes=[659.3,784,880,987.8,1174.7,987.8,1318.5,1568];
  E5.forEach((e,i)=>{swell(T(4,e.t0),e.fl,600,1,0.04,'bandpass',1600);const at=T(4,e.t0+e.fl);tone(at,2.4,notes[i],0,0.065);tone(at,1.4,notes[i]*2.01,0,0.018);});
  for(let i=0;i<6;i++)noiseHit(T(4,5.8+i*0.4+2.6),0.12,3000,2,0.02,'bandpass');
  /* 6. the door: embers strike, the seal shatters, the doors open, then slam */
  for(let i=0;i<8;i++)swell(T(5,0.5+i*0.12),1.8,700,1,0.025,'bandpass',300);
  STRIKE6.forEach((s,i)=>{tone(T(5,s),1.2,1046.5+i*60,0,0.05);tone(T(5,s),0.4,90,50,0.18);noiseHit(T(5,s),0.25,2400,1,0.06,'bandpass');});
  noiseHit(T(5,5.2),1.6,3000,0.6,0.25,'highpass');tone(T(5,5.2),2.4,110,40,0.4);
  for(let i=0;i<14;i++)tone(T(5,5.25+hash(i)*0.9),0.5,2000+hash(i+4)*3000,0,0.02);
  for(let i=0;i<6;i++)noiseHit(T(5,5.4+i*0.12),0.12,1800,3,0.06,'bandpass');
  creak(T(5,5.5),1.8,52,0.08);
  pad(T(5,5.6),2.2,[523.3,659.3,784,1046.5],0.035,'sine',2400);
  noiseHit(T(5,7.6),2.2,110,0.5,0.6);tone(T(5,7.6),2.8,62,30,0.5);noiseHit(T(5,7.6),0.3,1500,0.6,0.15,'bandpass');
  pad(T(5,7.7),2.2,[73.4,77.8,110],0.06,'sawtooth',300);
  swell(T(5,9.5),2,900,0.6,0.16,'lowpass',90);beat(T(5,10.4),0.4);
  /* 7. the title: a cold chord, two last heartbeats */
  pad(T(6,0.3),7.3,[220,261.6,329.6,392,523.3],0.03,'triangle',1600);
  beat(T(6,2.9),0.45);beat(T(6,3.85),0.35);noiseHit(T(6,2.9),3.5,80,0.5,0.15);
  return {t0,stop(){
    stopped=true;
    const n=ac.currentTime;main.gain.cancelScheduledValues(n);main.gain.setValueAtTime(main.gain.value,n);main.gain.linearRampToValueAtTime(0,n+0.5);
    setTimeout(()=>{live.forEach(o=>{try{o.stop();}catch(e){}});try{if(vsrc)vsrc.stop();}catch(e){}try{main.disconnect();}catch(e){}},700);}};
}

/* ================= PLAYER ================= */
let playing=null;
/* the story is never allowed to stand between the player and the game: if it
   can't start, it ends at once and hands over */
function play(opt){
  opt=opt||{};
  if(playing)return playing.stop;
  try{return start(opt);}catch(e){
    console.warn('Story could not start:',e);
    const ov=document.getElementById('storyOv');if(ov)ov.remove();
    playing=null;setTimeout(()=>{try{if(opt.onEnd)opt.onEnd();}catch(e2){console.warn(e2);}},0);
    return ()=>{};
  }
}
function start(opt){
  if(!document.getElementById('storyCss')){const st=document.createElement('style');st.id='storyCss';st.textContent=css;document.head.appendChild(st);}
  const A=assets(),SC=scenes(A),starts=[];let total=0;SC.forEach(s=>{starts.push(total);total+=s.dur;});
  const motion=!opt.reduceMotion&&!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
  const o={flash:!opt.reduceFlash,motion,base:[1,0,0]};

  const ov=document.createElement('div');ov.id='storyOv';ov.setAttribute('role','dialog');ov.setAttribute('aria-label','The backstory of Hollowmere');
  ov.innerHTML='<canvas></canvas><div id="storyLine" aria-live="polite"></div><div id="storyHint">ESC TO SKIP</div>'
    +'<button id="storySkip" type="button">SKIP ›</button><div id="storyBar"></div>';
  document.body.appendChild(ov);
  const cvs=ov.querySelector('canvas'),g=cvs.getContext('2d'),lineEl=ov.querySelector('#storyLine'),barEl=ov.querySelector('#storyBar');
  if('ontouchstart' in window)ov.querySelector('#storyHint').textContent='HOLD TO SKIP';
  /* q drops the canvas resolution on a device that can't keep up */
  let w=0,h=0,dpr=1,q=1,ema=16,lastF=0,slowN=0;
  function size(){dpr=Math.min(2,window.devicePixelRatio||1)*q;w=innerWidth;h=innerHeight;cvs.width=Math.round(w*dpr);cvs.height=Math.round(h*dpr);}
  size();addEventListener('resize',size);
  requestAnimationFrame(()=>ov.classList.add('on'));

  const snd=(()=>{try{return opt.ac&&opt.ac.state!=='closed'?makeSound(opt.ac,opt.out,starts,SC):null;}catch(e){console.warn('Story sound failed:',e);return null;}})();
  const useAudioClock=snd&&opt.ac.state==='running';
  const p0=performance.now();
  const now=opt.time||(()=>useAudioClock?opt.ac.currentTime-snd.t0:(performance.now()-p0)/1000);   /* opt.time: for recording */

  let curLine='',done=false,raf=0,holdT=null;const warned=new Set();
  const warnOnce=e=>{const k=String(e&&e.message||e);if(!warned.has(k)){warned.add(k);console.warn('Story frame:',e);}};
  function frame(){
    if(done)return;
    const T=Math.max(0,now());   /* the audio clock starts a moment in the future: never draw at a negative time */
    if(!(T<total)){finish();return;}   /* also ends on a NaN clock */
    raf=requestAnimationFrame(frame);
    try{draw(T);}catch(e){warnOnce(e);}
  }
  function draw(T){
    if(!(w>=1&&h>=1)||!cvs.width||!cvs.height)return;   /* hidden or zero-size window: nothing to draw */
    const pn=performance.now();if(lastF&&!opt.time){ema=ema*0.9+Math.min(200,pn-lastF)*0.1;
      if(ema>40&&q>0.5&&++slowN>45){q-=0.25;slowN=0;ema=16;size();}}lastF=pn;
    let i=0;while(i<SC.length-1&&T>=starts[i+1])i++;
    const sc=SC[i],t=Math.max(0,T-starts[i]);
    /* the 1600x900 stage, scaled to cover the screen */
    const s=Math.max(w/SW,h/SH)*dpr,ox=(w*dpr-SW*s)/2,oy=(h*dpr-SH*s)/2;o.base=[s,ox,oy];o.vw=Math.min(SW,w*dpr/s);
    g.setTransform(1,0,0,1,0,0);g.fillStyle='#000';g.fillRect(0,0,cvs.width,cvs.height);
    g.setTransform(s,0,0,s,ox,oy);
    g.save();try{sc.draw(g,t,o);}catch(e){warnOnce(e);}g.restore();
    g.setTransform(dpr,0,0,dpr,0,0);g.globalAlpha=1;g.globalCompositeOperation='source-over';g.shadowBlur=0;
    /* fade between scenes */
    const edge=Math.min(1,t/0.9,(sc.dur-t)/0.9);
    if(edge<1){g.fillStyle=`rgba(0,0,0,${1-ease(edge)})`;g.fillRect(0,0,w,h);}
    post(g,A,w,h,T);
    /* narration: each line holds until the next, and clears before the scene ends */
    let ln='';sc.lines.forEach(([st,txt])=>{if(t>=st&&t<sc.dur-0.9)ln=txt;});
    if(ln!==curLine){curLine=ln;lineEl.classList.remove('on');
      clearTimeout(frame._t);frame._t=setTimeout(()=>{lineEl.textContent=curLine;if(curLine)lineEl.classList.add('on');},curLine?380:0);}
    barEl.style.width=(T/total*100).toFixed(2)+'%';
  }
  function stopEvt(e){e.stopPropagation();}
  function onKey(e){
    if(done)return;
    e.stopImmediatePropagation();
    if(e.code==='Escape'){e.preventDefault();finish();}
    else if(e.code!=='Tab')e.preventDefault();   /* Enter / Space must not wake the night underneath */
  }
  function finish(){
    if(done)return;done=true;
    cancelAnimationFrame(raf);clearTimeout(frame._t);clearTimeout(holdT);
    removeEventListener('keydown',onKey,true);removeEventListener('resize',size);
    if(snd)snd.stop();
    ov.classList.remove('on');
    setTimeout(()=>ov.remove(),650);
    playing=null;
    try{if(opt.onEnd)opt.onEnd();}catch(e){console.warn(e);}
  }
  addEventListener('keydown',onKey,true);
  ['click','pointerdown','pointerup','mousedown','mouseup','touchstart','touchend','contextmenu'].forEach(ev=>ov.addEventListener(ev,stopEvt));
  ov.addEventListener('contextmenu',e=>e.preventDefault());
  ov.querySelector('#storySkip').addEventListener('click',e=>{e.stopPropagation();finish();});
  /* a long press anywhere skips (for touch screens) */
  ov.addEventListener('pointerdown',e=>{if(e.target.id==='storySkip')return;clearTimeout(holdT);holdT=setTimeout(finish,900);});
  ['pointerup','pointercancel','pointerleave'].forEach(ev=>ov.addEventListener(ev,()=>clearTimeout(holdT)));
  raf=requestAnimationFrame(frame);
  playing={stop:finish};
  return finish;
}

/* preload(ac?): fetch the narrator early; with an audio context, decode it too (recording needs it ready) */
function preload(ac){return ac?decodeVoice(ac):fetchVoice();}
window.HMStory={play,preload,get playing(){return !!playing;}};
})();
