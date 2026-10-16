/* HOLLOWMERE — THE BACKSTORY
   The opening cinematic: about a minute of drawn scenes, narration and sound that tells how
   you came to be caught in the house. Everything is drawn on a 2D canvas and every sound is
   made with Web Audio, so there is no video file to download.

   index.html decides WHEN it plays (once for an account, every visit for a guest, any time
   from the title screen) and calls:

     HMStory.play({ac, out, reduceFlash, onEnd})
       ac           the game's AudioContext (optional: without it the story plays silent)
       out          the node to send sound into (the game's master volume)
       reduceFlash  the PHOTOSENSITIVITY setting: no lightning flashes or flickering lights
       onEnd        called once, when the story finishes or is skipped

   The player's "reduce motion" system setting is respected too: no zooms or drifting camera.
   ESC, the SKIP button, or holding a tap skips it. */
(function(){
'use strict';
const TAU=Math.PI*2;
const css=`
#storyOv{position:fixed;inset:0;z-index:90;background:#000;opacity:0;transition:opacity .6s;cursor:default;
  -webkit-user-select:none;user-select:none;touch-action:none}
#storyOv.on{opacity:1}
#storyOv canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
#storyLine{position:absolute;left:50%;bottom:11%;transform:translateX(-50%);width:min(760px,88vw);text-align:center;
  font-family:'IM Fell English',serif;font-style:italic;font-size:clamp(17px,2.5vw,24px);line-height:1.45;color:#d6cfbd;
  text-shadow:0 2px 10px #000,0 0 22px rgba(0,0,0,.9);opacity:0;transition:opacity .9s}
#storyLine.on{opacity:1}
#storySkip{position:absolute;right:22px;bottom:20px;font-family:'Cormorant SC',serif;font-size:14px;letter-spacing:4px;
  color:#8f8874;background:rgba(8,8,12,.55);border:1px solid #2c2a26;padding:9px 16px;cursor:pointer;opacity:.75;transition:opacity .3s,color .3s}
#storySkip:hover,#storySkip:focus-visible{opacity:1;color:#e2d9c2;outline:none;border-color:#6b604a}
#storyHint{position:absolute;left:22px;bottom:24px;font-family:'Cormorant SC',serif;font-size:12px;letter-spacing:3px;color:#5d584c;opacity:.8}
#storyBar{position:absolute;left:0;bottom:0;height:2px;background:linear-gradient(90deg,#5a2a10,#ffb060);width:0;opacity:.55}
`;

/* ---------- small helpers ---------- */
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const ease=x=>x<0?0:x>1?1:x*x*(3-2*x);
const lerp=(a,b,t)=>a+(b-a)*t;
function rng(seed){let s=seed>>>0||1;return ()=>((s=Math.imul(s^(s>>>15),2246822507)^Math.imul(s^(s>>>13),3266489909),s>>>0)%100000)/100000;}

/* ---------- the scenes ----------
   each: dur (s), lines [[start, text]], draw(g, w, h, t, o) where t is seconds into the scene
   and o holds {flash, motion, R}. */
function mansion(g,w,h,x,base,s,lit,t){
  /* a silhouette: main hall, two towers, a crooked wing, chimneys */
  g.fillStyle='#05060a';
  g.beginPath();
  const P=(a,b)=>g.lineTo(x+a*s,base-b*s);
  g.moveTo(x-210*s,base);
  P(-210,70);P(-160,70);P(-160,110);P(-120,150);P(-80,110);P(-80,120);   /* left wing + gable */
  P(-70,120);P(-70,190);P(-56,250);P(-42,190);P(-42,120);                /* left tower */
  P(-30,120);P(-30,135);P(0,175);P(30,135);P(30,120);                    /* centre gable */
  P(42,120);P(42,215);P(50,215);P(50,235);P(58,235);P(58,215);P(62,215);P(62,170);P(74,170);P(74,215);
  P(90,215);P(90,120);P(150,120);P(150,90);P(160,96);P(205,60);P(205,0);
  g.closePath();g.fill();
  /* the right tower, leaning a little */
  g.beginPath();g.moveTo(x+96*s,base-120*s);g.lineTo(x+98*s,base-232*s);g.lineTo(x+116*s,base-300*s);
  g.lineTo(x+134*s,base-230*s);g.lineTo(x+134*s,base-120*s);g.closePath();g.fill();
  /* windows */
  const W=[[-146,52],[-122,52],[-98,52],[-60,150],[-15,70],[15,70],[-15,105],[15,105],[110,180],[120,130],[170,40],[-170,28]];
  W.forEach(([a,b],i)=>{
    const on=lit.indexOf(i)>=0;
    const f=on?0.65+0.35*Math.sin(t*(3+i)+i*1.7)*Math.sin(t*1.3+i):0.12;
    g.fillStyle=on?`rgba(255,${150+i*4},70,${0.35+0.5*f})`:'rgba(60,70,90,.18)';
    g.fillRect(x+a*s,base-b*s,7*s,11*s);
    if(on){const gr=g.createRadialGradient(x+(a+3.5)*s,base-(b-5)*s,0,x+(a+3.5)*s,base-(b-5)*s,26*s);
      gr.addColorStop(0,`rgba(255,150,60,${0.18*f})`);gr.addColorStop(1,'rgba(255,150,60,0)');
      g.fillStyle=gr;g.fillRect(x+(a-24)*s,base-(b+24)*s,54*s,54*s);}
  });
}
function rain(g,w,h,t,R,n,alpha){
  g.strokeStyle=`rgba(150,165,200,${alpha})`;g.lineWidth=1;g.beginPath();
  for(let i=0;i<n;i++){const sp=0.9+R[i%R.length]*0.6;
    const x=((R[(i*7)%R.length]*w*1.3+t*120*sp)%(w*1.3))-w*0.15;
    const y=((R[(i*13)%R.length]*h+t*h*1.6*sp)%(h+40))-20;
    g.moveTo(x,y);g.lineTo(x-5,y+18);}
  g.stroke();}
function vignette(g,w,h,k){
  const gr=g.createRadialGradient(w/2,h/2,Math.min(w,h)*0.25,w/2,h/2,Math.max(w,h)*0.75);
  gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,`rgba(0,0,0,${k})`);g.fillStyle=gr;g.fillRect(0,0,w,h);}
function sigil(g,cx,cy,r,a,col){
  g.save();g.translate(cx,cy);g.strokeStyle=col;g.globalAlpha=a;g.lineWidth=Math.max(1,r*0.025);
  g.beginPath();g.arc(0,0,r,0,TAU);g.stroke();
  g.beginPath();g.arc(0,0,r*0.8,0,TAU);g.stroke();
  g.beginPath();g.arc(0,0,r*0.4,0,TAU);g.stroke();
  g.beginPath();
  for(let i=0;i<4;i++){const an=i*TAU/4;g.moveTo(Math.cos(an)*r,Math.sin(an)*r);g.lineTo(Math.cos(an)*r*1.18,Math.sin(an)*r*1.18);}
  for(let i=0;i<3;i++){const an=-Math.PI/2+i*TAU/3,bn=-Math.PI/2+(i+1)*TAU/3;
    g.moveTo(Math.cos(an)*r*0.8,Math.sin(an)*r*0.8);g.lineTo(Math.cos(bn)*r*0.8,Math.sin(bn)*r*0.8);}
  g.stroke();g.restore();}
function ember(g,x,y,r,a){
  const gr=g.createRadialGradient(x,y,0,x,y,r*4);
  gr.addColorStop(0,`rgba(255,220,150,${a})`);gr.addColorStop(0.25,`rgba(255,150,50,${a*0.6})`);gr.addColorStop(1,'rgba(255,120,30,0)');
  g.fillStyle=gr;g.beginPath();g.arc(x,y,r*4,0,TAU);g.fill();
  g.fillStyle=`rgba(255,240,210,${a})`;g.beginPath();g.moveTo(x,y-r);g.lineTo(x+r*0.7,y);g.lineTo(x,y+r);g.lineTo(x-r*0.7,y);g.closePath();g.fill();}
function corridor(g,w,h,depth,tint){
  /* one-point perspective hallway */
  const vx=w/2,vy=h*0.46,fw=w*0.09,fh=h*0.15;
  g.fillStyle=tint[0];g.fillRect(0,0,w,h);
  const far=[vx-fw,vy-fh,vx+fw,vy+fh];
  /* floor */
  g.fillStyle=tint[1];g.beginPath();g.moveTo(0,h);g.lineTo(far[0],far[3]);g.lineTo(far[2],far[3]);g.lineTo(w,h);g.closePath();g.fill();
  /* ceiling */
  g.fillStyle=tint[2];g.beginPath();g.moveTo(0,0);g.lineTo(far[0],far[1]);g.lineTo(far[2],far[1]);g.lineTo(w,0);g.closePath();g.fill();
  /* far wall */
  g.fillStyle=tint[3];g.fillRect(far[0],far[1],fw*2,fh*2);
  /* door frames down both walls */
  g.strokeStyle='rgba(0,0,0,.6)';g.lineWidth=2;
  for(let i=0;i<5;i++){const k=Math.pow((i+((depth%1)+1)%1)/5,1.6);
    const xl=lerp(0,far[0],k),xr=lerp(w,far[2],k),yt=lerp(0,far[1],k),yb=lerp(h,far[3],k);
    const dh=(yb-yt)*0.62;
    g.fillStyle='rgba(0,0,0,.35)';
    g.fillRect(xl,yb-dh,Math.max(2,(far[0]-xl)*0.18),dh);
    g.fillRect(xr-Math.max(2,(xr-far[2])*0.18),yb-dh,Math.max(2,(xr-far[2])*0.18),dh);
    g.beginPath();g.moveTo(xl,yb);g.lineTo(xr,yb);g.stroke();}
  return far;}

function scenes(){return [
  { /* 1. THE HOUSE */
    dur:10,
    lines:[[0.7,'They built Hollowmere Manor on a hill no one would farm.'],
           [5.2,'It was finished in a single winter. The family who built it was never seen again.']],
    draw(g,w,h,t,o){
      const z=o.motion?1+t*0.008:1;
      const sky=g.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#04050b');sky.addColorStop(0.6,'#0d1222');sky.addColorStop(1,'#141a2a');
      g.fillStyle=sky;g.fillRect(0,0,w,h);
      /* lightning: two strikes; soft when reduceFlash is on */
      let L=0;[2.6,7.1].forEach(s=>{const d=t-s;if(d>0&&d<0.9)L=Math.max(L,Math.exp(-d*6)*(d<0.08||d>0.16?1:0.3));});
      if(L>0){g.fillStyle=`rgba(190,205,255,${o.flash?L*0.55:L*0.08})`;g.fillRect(0,0,w,h);}
      /* the moon behind clouds */
      const mx=w*0.74,my=h*0.2,mr=Math.min(w,h)*0.055;
      const mg=g.createRadialGradient(mx,my,0,mx,my,mr*5);mg.addColorStop(0,'rgba(200,210,235,.32)');mg.addColorStop(1,'rgba(200,210,235,0)');
      g.fillStyle=mg;g.fillRect(mx-mr*5,my-mr*5,mr*10,mr*10);
      g.fillStyle='rgba(215,220,235,.55)';g.beginPath();g.arc(mx,my,mr,0,TAU);g.fill();
      for(let i=0;i<7;i++){const cx=((o.R[i]*w*1.4+t*(8+i*3))%(w*1.4))-w*0.2,cy=h*(0.08+o.R[i+9]*0.3);
        g.fillStyle='rgba(6,8,16,.55)';g.beginPath();g.ellipse(cx,cy,w*0.16,h*0.035,0,0,TAU);g.fill();}
      g.save();g.translate(w/2,h*0.62);g.scale(z,z);g.translate(-w/2,-h*0.62);
      /* the hill */
      g.fillStyle='#030407';g.beginPath();g.moveTo(0,h);g.lineTo(0,h*0.82);
      g.quadraticCurveTo(w*0.25,h*0.74,w*0.5,h*0.7);g.quadraticCurveTo(w*0.78,h*0.72,w,h*0.84);g.lineTo(w,h);g.closePath();g.fill();
      /* dead trees */
      g.strokeStyle='#030407';g.lineWidth=3;
      [[0.15,0.8],[0.86,0.82]].forEach(([a,b])=>{const x=w*a,y=h*b;g.beginPath();g.moveTo(x,y);g.lineTo(x+4,y-h*0.14);
        g.moveTo(x+3,y-h*0.08);g.lineTo(x-22,y-h*0.13);g.moveTo(x+4,y-h*0.11);g.lineTo(x+26,y-h*0.17);g.stroke();});
      const s=Math.min(w/700,h/520);
      mansion(g,w,h,w*0.5,h*0.705,s,t>3.5?[4,5,8]:[8],t);
      g.restore();
      rain(g,w,h,t,o.R,180,0.16);
      vignette(g,w,h,0.75);
    }},
  { /* 2. YOU */
    dur:9,
    lines:[[0.6,'Years later, you came to the house looking for something.'],
           [4.8,'You never found it. The house found you.']],
    draw(g,w,h,t,o){
      const far=corridor(g,w,h,o.motion?t*0.12:0,['#07070a','#0d0b0a','#060608','#0a0a0d']);
      /* you: a small figure walking away with a candle */
      const k=o.motion?ease(t/9):0.4;
      const fx=w/2,fy=lerp(h*0.86,far[3]+h*0.04,k),fs=lerp(1,0.45,k)*Math.min(w,h)/520;
      const flick=0.85+0.15*Math.sin(t*11)*Math.sin(t*4.3);
      const cg=g.createRadialGradient(fx+12*fs,fy-60*fs,0,fx+12*fs,fy-60*fs,260*fs);
      cg.addColorStop(0,`rgba(255,170,80,${0.42*flick})`);cg.addColorStop(1,'rgba(255,140,60,0)');
      g.fillStyle=cg;g.fillRect(0,0,w,h);
      g.fillStyle='#020203';g.beginPath();
      g.ellipse(fx,fy-92*fs,11*fs,13*fs,0,0,TAU);g.fill();                    /* head */
      g.beginPath();g.moveTo(fx-17*fs,fy-78*fs);g.lineTo(fx+17*fs,fy-78*fs);g.lineTo(fx+22*fs,fy);g.lineTo(fx-22*fs,fy);g.closePath();g.fill();
      g.fillStyle=`rgba(255,220,150,${flick})`;g.beginPath();g.ellipse(fx+20*fs,fy-66*fs,2.2*fs,4.5*fs,0,0,TAU);g.fill();
      /* the dark closing in from the far end */
      const dg=g.createLinearGradient(0,far[1],0,far[3]);dg.addColorStop(0,'rgba(0,0,0,.7)');dg.addColorStop(1,'rgba(0,0,0,.4)');
      g.fillStyle=dg;g.fillRect(far[0],far[1],far[2]-far[0],far[3]-far[1]);
      vignette(g,w,h,0.9);
    }},
  { /* 3. THE HEART */
    dur:11,
    lines:[[0.6,'You died here. Deep beneath the cellar, something beats like a heart.'],
           [5.6,'It caught your soul as it left you. It has not let go since.']],
    draw(g,w,h,t,o){
      g.fillStyle='#040203';g.fillRect(0,0,w,h);
      /* stone floor rings */
      const cx=w/2,cy=h*0.5,r=Math.min(w,h)*0.22*(o.motion?1+t*0.006:1);
      const beat=t%0.95,pulse=Math.exp(-beat*9)+0.6*Math.exp(-Math.max(0,beat-0.22)*9)*(beat>0.22?1:0);
      const glow=g.createRadialGradient(cx,cy,0,cx,cy,r*2.6);
      glow.addColorStop(0,`rgba(170,20,20,${0.35+0.35*pulse})`);glow.addColorStop(0.4,`rgba(90,6,10,${0.25+0.2*pulse})`);glow.addColorStop(1,'rgba(20,0,0,0)');
      g.fillStyle=glow;g.fillRect(0,0,w,h);
      g.strokeStyle='rgba(40,14,14,.6)';g.lineWidth=1;
      for(let i=0;i<9;i++){g.beginPath();g.moveTo(0,cy+(i-4)*h*0.11);g.lineTo(w,cy+(i-4)*h*0.11+(i-4)*12);g.stroke();}
      sigil(g,cx,cy,r*(1+0.04*pulse),0.55+0.4*pulse,'#ff4a3a');
      g.save();g.globalCompositeOperation='lighter';sigil(g,cx,cy,r*(1+0.04*pulse),0.18*pulse,'#ffb0a0');g.restore();
      /* your soul: a pale wisp pulled down and in */
      const k=ease((t-2.5)/6);
      if(t>1.5){const sx=lerp(w*0.5,cx,k),sy=lerp(h*0.12,cy,k),a=(1-k)*0.85*ease((t-1.5)/1.2);
        for(let i=0;i<14;i++){const tt=i/14,wx=sx+Math.sin(t*2+i*0.6)*14*(1-tt),wy=sy-i*9*(1-k*0.6);
          g.fillStyle=`rgba(200,215,255,${a*(1-tt)*0.5})`;g.beginPath();g.arc(wx,wy,(10-i*0.55)*(1-k*0.5),0,TAU);g.fill();}}
      if(k>=1){const a=Math.exp(-(t-8.5)*2);g.fillStyle=`rgba(200,215,255,${0.25*a})`;g.beginPath();g.arc(cx,cy,r*0.4,0,TAU);g.fill();}
      vignette(g,w,h,0.85);
    }},
  { /* 4. THE THING */
    dur:10,
    lines:[[0.6,'You are not alone in there. Something tall and patient walks its four floors.'],
           [5.2,'It feeds on the souls the Heart keeps. Tonight, it is hungry.']],
    draw(g,w,h,t,o){
      /* the hall light gutters (held steady when PHOTOSENSITIVITY is on) */
      const fl=o.flash?(Math.sin(t*23)>0.93||(t>6.3&&t<6.45)?0.35:1):0.85;
      const far=corridor(g,w,h,0,['#060709','#0b0c10','#050507','#0c0d12']);
      const lg=g.createRadialGradient(w/2,h*0.18,0,w/2,h*0.18,h*0.7);
      lg.addColorStop(0,`rgba(150,170,210,${0.16*fl})`);lg.addColorStop(1,'rgba(150,170,210,0)');
      g.fillStyle=lg;g.fillRect(0,0,w,h);
      /* it: impossibly thin, arms past its knees */
      const k=o.motion?ease((t-1)/8.5):0.5;
      const s=lerp(0.55,1.35,k)*Math.min(w,h)/520,x=w/2+Math.sin(t*0.7)*4*s,base=lerp(far[3]+h*0.02,h*0.95,k);
      const a=ease(t/2.5);
      g.globalAlpha=a;g.fillStyle='#010102';
      g.beginPath();g.ellipse(x,base-215*s,10*s,15*s,0,0,TAU);g.fill();
      g.beginPath();g.moveTo(x-14*s,base-196*s);g.lineTo(x+14*s,base-196*s);g.lineTo(x+9*s,base-95*s);
      g.lineTo(x+6*s,base);g.lineTo(x+1*s,base);g.lineTo(x,base-80*s);g.lineTo(x-1*s,base);g.lineTo(x-6*s,base);
      g.lineTo(x-9*s,base-95*s);g.closePath();g.fill();
      g.lineWidth=3*s;g.strokeStyle='#010102';g.lineCap='round';g.beginPath();
      g.moveTo(x-13*s,base-192*s);g.quadraticCurveTo(x-30*s,base-120*s,x-24*s,base-48*s);
      g.moveTo(x+13*s,base-192*s);g.quadraticCurveTo(x+30*s,base-120*s,x+26*s,base-44*s);g.stroke();
      /* its eyes, which blink once */
      const blink=(t>4.1&&t<4.28)?0.1:1;
      g.fillStyle=`rgba(225,235,255,${0.85*a})`;
      g.beginPath();g.ellipse(x-4*s,base-217*s,1.8*s,1.8*s*blink,0,0,TAU);g.ellipse(x+4*s,base-217*s,1.8*s,1.8*s*blink,0,0,TAU);g.fill();
      g.globalAlpha=1;
      vignette(g,w,h,0.9);
    }},
  { /* 5. THE EMBERS */
    dur:10,
    lines:[[0.6,'Your passing left eight embers, scattered through the house. Two on every floor.'],
           [5.4,'Fragments of your old memory lie with them, somewhere in the dark.']],
    draw(g,w,h,t,o){
      g.fillStyle='#050608';g.fillRect(0,0,w,h);
      /* the house cut open: four floors and the cellar */
      const bw=Math.min(w*0.62,h*0.9),bx=w/2-bw/2,top=h*0.14,fh=h*0.15;
      g.strokeStyle='rgba(120,130,160,.28)';g.lineWidth=1.2;
      g.beginPath();g.moveTo(bx-10,top);g.lineTo(w/2,top-h*0.08);g.lineTo(bx+bw+10,top);g.stroke();
      for(let f=0;f<=4;f++){g.beginPath();g.moveTo(bx,top+f*fh);g.lineTo(bx+bw,top+f*fh);g.stroke();}
      g.beginPath();g.moveTo(bx,top);g.lineTo(bx,top+4*fh);g.moveTo(bx+bw,top);g.lineTo(bx+bw,top+4*fh);g.stroke();
      ['ATTIC','UPPER HALL','GROUND FLOOR','CELLAR'].forEach((n,f)=>{g.fillStyle='rgba(120,130,160,.35)';
        g.font=`${Math.round(Math.max(10,h*0.018))}px 'Cormorant SC',serif`;g.fillText(n,bx+8,top+f*fh+16);});
      /* the Heart, under the cellar */
      const hx=w/2,hy=top+4*fh+h*0.07;sigil(g,hx,hy,h*0.04,0.5+0.3*Math.exp(-(t%0.95)*7),'#ff4a3a');
      /* eight embers fly out to their places, one after another */
      for(let i=0;i<8;i++){const f=Math.floor(i/2),side=i%2;
        const tx=bx+bw*(side?0.62+o.R[i]*0.3:0.08+o.R[i]*0.3),ty=top+f*fh+fh*(0.45+o.R[i+3]*0.35);
        const s0=0.8+i*0.45,k=ease((t-s0)/1.3);if(t<s0)continue;
        const x=lerp(hx,tx,k),y=lerp(hy,ty,k)-Math.sin(k*Math.PI)*h*0.08;
        ember(g,x,y,Math.max(3,h*0.007),0.9);}
      /* memory fragments: faint pale motes */
      if(t>5)for(let i=0;i<5;i++){const a=ease((t-5-i*0.4)/1.5)*0.5;
        g.fillStyle=`rgba(190,205,240,${a})`;g.beginPath();g.arc(bx+bw*o.R[i+20],top+fh*(0.3+o.R[i+30]*3.4),2.2,0,TAU);g.fill();}
      vignette(g,w,h,0.7);
    }},
  { /* 6. THE DOOR */
    dur:11,
    lines:[[0.6,'Gather the embers. Break the seal on the front door. Leave.'],
           [5.4,'If it takes you, the embers scatter, the seal re-forms, and the Heart drags you back down to begin again.']],
    draw(g,w,h,t,o){
      g.fillStyle='#060505';g.fillRect(0,0,w,h);
      const z=o.motion?1+t*0.01:1;g.save();g.translate(w/2,h/2);g.scale(z,z);g.translate(-w/2,-h/2);
      const dw=Math.min(w*0.38,h*0.5),dh=dw*1.45,dx=w/2-dw/2,dy=h*0.48-dh/2;
      /* arch and doors */
      g.fillStyle='#120d0a';g.beginPath();g.moveTo(dx-18,dy+dh);g.lineTo(dx-18,dy+dw*0.4);g.arc(w/2,dy+dw*0.4,dw/2+18,Math.PI,0);g.lineTo(dx+dw+18,dy+dh);g.closePath();g.fill();
      g.fillStyle='#1b130e';g.beginPath();g.moveTo(dx,dy+dh);g.lineTo(dx,dy+dw*0.4);g.arc(w/2,dy+dw*0.4,dw/2,Math.PI,0);g.lineTo(dx+dw,dy+dh);g.closePath();g.fill();
      g.strokeStyle='rgba(0,0,0,.7)';g.lineWidth=2;g.beginPath();g.moveTo(w/2,dy+dw*0.4-dw/2);g.lineTo(w/2,dy+dh);g.stroke();
      for(let i=1;i<4;i++){g.beginPath();g.moveTo(dx+8,dy+dh*i/4+dw*0.1);g.lineTo(dx+dw-8,dy+dh*i/4+dw*0.1);g.stroke();}
      /* the seal: bright, then cracking */
      const crack=ease((t-3.2)/1.6),sr=dw*0.3,scy=dy+dh*0.48;
      sigil(g,w/2,scy,sr,0.7*(1-crack*0.6)+0.2*Math.sin(t*3),'#ff5a3a');
      /* eight embers circle in and strike it */
      for(let i=0;i<8;i++){const an=i*TAU/8+t*0.6,k=ease((t-0.5)/2.8),rr=lerp(dw*0.9,sr*0.2,k);
        if(k<1)ember(g,w/2+Math.cos(an)*rr,scy+Math.sin(an)*rr*0.8,Math.max(3,h*0.007),0.9);}
      if(crack>0){g.strokeStyle=`rgba(255,220,170,${0.9*crack})`;g.lineWidth=2;g.beginPath();
        for(let i=0;i<6;i++){const an=o.R[i+40]*TAU;g.moveTo(w/2,scy);g.lineTo(w/2+Math.cos(an)*sr*1.1*crack,scy+Math.sin(an)*sr*1.1*crack);}g.stroke();
        /* dawn light through the gap */
        const gap=ease((t-4.2)/2)*(1-ease((t-6.5)/1.2));
        if(gap>0){const lg=g.createLinearGradient(w/2-dw*0.2,0,w/2+dw*0.2,0);
          lg.addColorStop(0,'rgba(255,220,170,0)');lg.addColorStop(0.5,`rgba(255,225,180,${(o.flash?0.6:0.35)*gap})`);lg.addColorStop(1,'rgba(255,220,170,0)');
          g.fillStyle=lg;g.fillRect(w/2-dw*0.2,dy,dw*0.4,dh);}}
      /* ...and if it takes you, the seal comes back */
      if(t>6.6){const back=ease((t-6.6)/2.2);sigil(g,w/2,scy,sr,0.75*back,'#c02020');
        g.fillStyle=`rgba(40,0,0,${0.35*back})`;g.fillRect(0,0,w,h);}
      g.restore();
      vignette(g,w,h,0.85);
    }},
  { /* 7. TITLE */
    dur:7,
    lines:[],
    draw(g,w,h,t,o){
      g.fillStyle='#030305';g.fillRect(0,0,w,h);
      const a=ease((t-0.4)/2)*(1-ease((t-5.6)/1.3));
      const fs=Math.round(Math.min(w*0.11,h*0.15));
      g.textAlign='center';g.textBaseline='middle';
      g.font=`600 ${fs}px 'Cormorant SC',serif`;
      g.shadowColor='rgba(255,140,50,.55)';g.shadowBlur=30*a;
      g.fillStyle=`rgba(226,216,192,${a})`;g.fillText('HOLLOWMERE',w/2,h*0.45);
      g.shadowBlur=0;
      g.font=`${Math.round(fs*0.22)}px 'Cormorant SC',serif`;
      g.fillStyle=`rgba(160,150,128,${a*ease((t-1.6)/1.5)})`;
      g.fillText('THE HEART OF THE HOUSE IS HUNGRY',w/2,h*0.45+fs*0.75);
      g.textAlign='start';g.textBaseline='alphabetic';
      for(let i=0;i<8;i++)ember(g,w/2+(i-3.5)*fs*0.32,h*0.45+fs*1.25,Math.max(2,fs*0.03),a*0.8*ease((t-2-i*0.12)/0.6));
    }},
];}

/* ---------- sound ---------- */
function makeSound(ac,out,S){
  if(!ac||!out)return null;
  const bus=ac.createGain();bus.gain.value=0;bus.connect(out);
  const t0=ac.currentTime+0.05;
  bus.gain.setTargetAtTime(1,t0,0.6);
  const noise=ac.createBuffer(1,ac.sampleRate*2,ac.sampleRate);
  {const d=noise.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;}
  const live=[];
  function noiseHit(at,dur,f,q,vol,type){
    const s=ac.createBufferSource();s.buffer=noise;s.loop=true;
    const fl=ac.createBiquadFilter();fl.type=type||'lowpass';fl.frequency.value=f;fl.Q.value=q||0.7;
    const g=ac.createGain();g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(vol,at+0.03);
    g.gain.exponentialRampToValueAtTime(0.0001,at+dur);
    s.connect(fl);fl.connect(g);g.connect(bus);s.start(at);s.stop(at+dur+0.05);}
  function tone(at,dur,f0,f1,vol,type){
    const o=ac.createOscillator();o.type=type||'sine';o.frequency.setValueAtTime(f0,at);
    if(f1)o.frequency.exponentialRampToValueAtTime(f1,at+dur);
    const g=ac.createGain();g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(vol,at+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001,at+dur);
    o.connect(g);g.connect(bus);o.start(at);o.stop(at+dur+0.05);}
  /* a low drone under the whole story */
  [[55,'sawtooth',0.02],[55.35,'sawtooth',0.02],[27.5,'sine',0.06]].forEach(([f,ty,v])=>{
    const o=ac.createOscillator();o.type=ty;o.frequency.value=f;
    const lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=220;
    const g=ac.createGain();g.gain.value=v;o.connect(lp);lp.connect(g);g.connect(bus);o.start(t0);live.push(o);});
  /* rain, for the first scene */
  {const s=ac.createBufferSource();s.buffer=noise;s.loop=true;const hp=ac.createBiquadFilter();hp.type='highpass';hp.frequency.value=900;
   const g=ac.createGain();g.gain.setValueAtTime(0.0001,t0);g.gain.exponentialRampToValueAtTime(0.05,t0+1.5);
   g.gain.setValueAtTime(0.05,t0+S[1]-1);g.gain.exponentialRampToValueAtTime(0.0001,t0+S[1]+1.5);
   s.connect(hp);hp.connect(g);g.connect(bus);s.start(t0);s.stop(t0+S[1]+1.6);}
  /* thunder after each strike */
  [2.6,7.1].forEach((s,i)=>{noiseHit(t0+s+0.25+i*0.15,3.2,140,0.6,0.5);noiseHit(t0+s+0.2,0.5,900,0.5,0.12);});
  /* scene 2: slow footsteps on old boards */
  for(let i=0;i<9;i++){const at=t0+S[1]+0.8+i*0.85;noiseHit(at,0.18,380,1.2,0.14,'bandpass');tone(at,0.12,90,60,0.05);}
  /* scene 3: the Heart */
  for(let at=S[2]+0.0;at<S[3]+0.5;at+=0.95){const vol=at<S[3]-1?0.42:0.18;tone(t0+at,0.32,62,38,vol);tone(t0+at+0.22,0.3,58,36,vol*0.7);}
  tone(t0+S[2]+2.5,6,420,160,0.03,'triangle');       /* your soul, drawn down */
  /* scene 4: its breath, and a low growl as it comes closer */
  for(let i=0;i<4;i++){const at=t0+S[3]+1.2+i*2.1;noiseHit(at,1.1,260+i*30,2,0.12+i*0.03,'bandpass');}
  {const at=t0+S[3]+5;const o=ac.createOscillator();o.type='sawtooth';o.frequency.setValueAtTime(48,at);o.frequency.linearRampToValueAtTime(38,at+4.5);
   const lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=300;const g=ac.createGain();
   g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(0.16,at+2.5);g.gain.exponentialRampToValueAtTime(0.0001,at+4.8);
   const tr=ac.createOscillator(),tg=ac.createGain();tr.frequency.value=13;tg.gain.value=0.07;tr.connect(tg);tg.connect(g.gain);
   o.connect(lp);lp.connect(g);g.connect(bus);o.start(at);tr.start(at);o.stop(at+5);tr.stop(at+5);}
  /* scene 5: one chime per ember */
  const notes=[659,784,880,988,1175,988,1319,1568];
  for(let i=0;i<8;i++){const at=t0+S[4]+0.8+i*0.45+1.2;tone(at,2.2,notes[i],0,0.07);tone(at,1.4,notes[i]*2.01,0,0.02);}
  /* scene 6: embers strike the seal, it cracks, then booms back */
  noiseHit(t0+S[5]+3.2,1.4,2400,0.8,0.18,'highpass');tone(t0+S[5]+3.3,2.5,110,55,0.25);
  tone(t0+S[5]+6.6,3.5,70,30,0.4);noiseHit(t0+S[5]+6.6,2.5,120,0.5,0.35);
  /* scene 7: a cold chord under the title */
  [220,261.6,329.6,392].forEach((f,i)=>{const at=t0+S[6]+0.4;const o=ac.createOscillator();o.type='triangle';o.frequency.value=f;
    const g=ac.createGain();g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(0.035,at+2+i*0.3);g.gain.linearRampToValueAtTime(0,at+6.4);
    o.connect(g);g.connect(bus);o.start(at);o.stop(at+6.5);});
  return {t0,stop(){
    const n=ac.currentTime;bus.gain.cancelScheduledValues(n);bus.gain.setValueAtTime(bus.gain.value,n);bus.gain.linearRampToValueAtTime(0,n+0.5);
    setTimeout(()=>{live.forEach(o=>{try{o.stop();}catch(e){}});try{bus.disconnect();}catch(e){}},700);}};
}

/* ---------- the player ---------- */
let playing=null;
function play(opt){
  opt=opt||{};
  if(playing)return playing.stop;
  if(!document.getElementById('storyCss')){const st=document.createElement('style');st.id='storyCss';st.textContent=css;document.head.appendChild(st);}
  const SC=scenes(),starts=[];let total=0;SC.forEach(s=>{starts.push(total);total+=s.dur;});
  const motion=!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
  const R=[];{const r=rng(1887);for(let i=0;i<64;i++)R.push(r());}
  const o={flash:!opt.reduceFlash,motion,R};

  const ov=document.createElement('div');ov.id='storyOv';ov.setAttribute('role','dialog');ov.setAttribute('aria-label','The backstory of Hollowmere');
  ov.innerHTML='<canvas></canvas><div id="storyLine" aria-live="polite"></div><div id="storyHint">ESC TO SKIP</div>'
    +'<button id="storySkip" type="button">SKIP ›</button><div id="storyBar"></div>';
  document.body.appendChild(ov);
  const cv=ov.querySelector('canvas'),g=cv.getContext('2d'),lineEl=ov.querySelector('#storyLine'),barEl=ov.querySelector('#storyBar');
  if('ontouchstart' in window)ov.querySelector('#storyHint').textContent='HOLD TO SKIP';
  let w=0,h=0;
  function size(){const d=Math.min(2,window.devicePixelRatio||1);w=innerWidth;h=innerHeight;cv.width=Math.round(w*d);cv.height=Math.round(h*d);g.setTransform(d,0,0,d,0,0);}
  size();addEventListener('resize',size);
  requestAnimationFrame(()=>ov.classList.add('on'));

  const snd=(()=>{try{return opt.ac&&opt.ac.state!=='closed'?makeSound(opt.ac,opt.out,starts):null;}catch(e){console.warn('Story sound failed:',e);return null;}})();
  const useAudioClock=snd&&opt.ac.state==='running';
  const p0=performance.now();
  const now=()=>useAudioClock?opt.ac.currentTime-snd.t0:(performance.now()-p0)/1000;

  let curLine='',done=false,raf=0,holdT=null;
  function frame(){
    if(done)return;
    const T=now();
    if(T>=total){finish();return;}
    let i=0;while(i<SC.length-1&&T>=starts[i+1])i++;
    const sc=SC[i],t=Math.max(0,T-starts[i]);
    g.save();try{sc.draw(g,w,h,t,o);}catch(e){console.warn(e);}g.restore();
    /* fade between scenes */
    const edge=Math.min(1,t/0.9,(sc.dur-t)/0.9);
    if(edge<1){g.fillStyle=`rgba(0,0,0,${1-ease(edge)})`;g.fillRect(0,0,w,h);}
    /* narration: each line holds until the next, and clears before the scene ends */
    let ln='';sc.lines.forEach(([s,txt])=>{if(t>=s&&t<sc.dur-0.9)ln=txt;});
    if(ln!==curLine){curLine=ln;lineEl.classList.remove('on');
      clearTimeout(frame._t);frame._t=setTimeout(()=>{lineEl.textContent=curLine;if(curLine)lineEl.classList.add('on');},curLine?380:0);}
    barEl.style.width=(T/total*100).toFixed(2)+'%';
    raf=requestAnimationFrame(frame);
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

window.HMStory={play,get playing(){return !!playing;}};
})();
