/* ============================================================
   monkey.js  –  Brain Blast!
   Fully articulated canvas monkey with rigged limb animation.

   Each body part has its own pivot + angle. A central rAF loop
   lerps all angles toward their targets with independent speeds,
   giving natural overlapping follow-through motion.

   PUBLIC API
   ──────────
     setMonkey(state, duration)
     showSpeech(msg, color, duration)
     monkeyState()
   ============================================================ */

(function () {

/* ── Canvas setup ───────────────────────────────────────────── */
const STAGE = document.getElementById("monkey-stage");
const oldSvg = document.getElementById("monkey-svg");
if (oldSvg) oldSvg.remove();

const CW = 300, CH = 220;
const canvas = document.createElement("canvas");
canvas.width  = CW;
canvas.height = CH;
canvas.style.cssText = [
  "display:block","margin:0 auto","position:relative","z-index:2",
  "filter:drop-shadow(0 8px 20px rgba(80,40,0,.28))"
].join(";");
STAGE.appendChild(canvas);
const ctx = canvas.getContext("2d");

/* ── Palette ────────────────────────────────────────────────── */
const C = {
  fur:"#a0522d", furDark:"#7b3f00", belly:"#deb887",
  black:"#2a1a0a", white:"#fff",
  cheek:"rgba(255,130,130,.48)",
  banana:"#ffe066", bananaDark:"#e6b800", bananaTop:"#7a5900",
  tear:"rgba(120,190,255,.8)",
  mouth:"#cc2222",
};

/* ── Math helpers ───────────────────────────────────────────── */
const lerp = (a,b,t) => a+(b-a)*t;
const PI   = Math.PI;
const sin  = Math.sin;
const cos  = Math.cos;

/* ── Rig state ──────────────────────────────────────────────── */
const R = {
  t: 0,                       // elapsed time
  state: "idle",

  // Root translation (canvas coords of hips)
  rx: 150, ry: 168,

  // Jump / squash-stretch
  jumpVY: 0, jumpY: 0,
  jumpRot: 0,           // backflip rotation in degrees (Gemini-inspired)
  shakeOffsetX: 0,      // side-shake X offset in pixels (Gemini-inspired)
  sadStartT: 0,         // timestamp when sad state began
  sqY: 1, sqX: 1,             // body scale
  sqYt: 1, sqXt: 1,

  // Head
  hOff: 0, hOfft: 0,          // extra Y offset
  hTilt: 0, hTiltt: 0,

  // Mouth 0=closed 1=wide
  mouth: 0, moutht: 0,

  // Blink 0=open 1=shut
  blink: 0, blinkNext: 3,

  // Arms (shoulder → elbow → wrist, angles in radians)
  // Left
  lUa: 1.2,  lUat: 1.2,      // upper arm angle
  lFa: -0.5, lFat: -0.5,     // forearm relative to upper
  // Right
  rUa: 2.0,  rUat: 2.0,
  rFa:  0.5, rFat:  0.5,

  // Legs (hip → knee → ankle)
  lTh: 1.35, lTht: 1.35,     // left thigh
  lSh: 0.35, lSht: 0.35,     // left shin relative
  rTh: 1.65, rTht: 1.65,
  rSh: 0.45, rSht: 0.45,

  // Tail (3-seg spring chain, each stores absolute angle)
  tail: [
    {a:-0.3, at:-0.3, spd:0.06},
    {a: 0.8, at: 0.8, spd:0.09},
    {a: 1.6, at: 1.6, spd:0.12},
  ],

  // Banana
  banana: false, bananaT: 0,

  // Happy star particles
  stars: [],
};

// limb speeds
const SPD = {
  lUa:0.11, lFa:0.13, rUa:0.11, rFa:0.13,
  lTh:0.12, lSh:0.14, rTh:0.12, rSh:0.14,
  sq:0.15, head:0.10, mouth:0.13,
};

/* ── Poses (target angles per state) ───────────────────────── */
const POSES = {
  idle:{
    lUat:1.2,  lFat:-0.5,
    rUat:2.0,  rFat: 0.5,
    lTht:1.35, lSht:0.35,
    rTht:1.65, rSht:0.45,
    tail:[-0.3, 0.7, 1.6],
    hOfft:0, hTiltt:0, moutht:0, banana:false,
  },
  happy:{
    lUat:-0.55, lFat:-0.7,     // arms raised
    rUat: PI+0.55, rFat: 0.7,
    lTht:1.05,  lSht:-0.6,     // legs tuck
    rTht:1.95,  rSht:-0.6,
    tail:[0.6, 1.5, 2.3],
    hOfft:-20, hTiltt:-0.12, moutht:0.9, banana:false,
  },
  sad:{
    lUat:1.55,  lFat:0.0,      // arms droop
    rUat:1.55,  rFat:0.0,
    lTht:1.5,   lSht:0.6,
    rTht:1.5,   rSht:0.6,
    tail:[-0.9, 0.1, 0.4],     // droopy tail
    hOfft:10, hTiltt:0.22, moutht:0, banana:false,
  },
  eating:{
    lUat:1.25, lFat:-0.4,
    rUat:0.25, rFat:-1.1,      // elbow bends to lift banana
    lTht:1.4,  lSht:0.3,
    rTht:1.6,  rSht:0.45,
    tail:[-0.2, 0.9, 1.7],
    hOfft:-4, hTiltt:-0.08, moutht:0.55, banana:true,
  },
  dizzy:{
    lUat:0.8,  lFat:1.2,
    rUat:2.2,  rFat:1.2,
    lTht:1.6,  lSht:0.8,
    rTht:1.4,  rSht:0.7,
    tail:[0.3, 1.1, 2.0],
    hOfft:5, hTiltt:0.28, moutht:0.25, banana:false,
  },
};

function applyPose(p){
  Object.assign(R,{
    lUat:p.lUat, lFat:p.lFat, rUat:p.rUat, rFat:p.rFat,
    lTht:p.lTht, lSht:p.lSht, rTht:p.rTht, rSht:p.rSht,
    hOfft:p.hOfft, hTiltt:p.hTiltt, moutht:p.moutht, banana:p.banana,
  });
  p.tail.forEach((a,i)=>{ R.tail[i].at=a; });
}

/* ── Low-level draw helpers ─────────────────────────────────── */

// Draw one limb segment; return tip [x,y]
function limb(x,y, len, ang, thick, color){
  const ex=x+cos(ang)*len, ey=y+sin(ang)*len;
  ctx.save();
  ctx.lineCap="round";
  ctx.lineWidth=thick;
  ctx.strokeStyle=color;
  ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(ex,ey); ctx.stroke();
  ctx.restore();
  return [ex,ey];
}

function hand(x,y,r,color,flip=false){
  // Palm
  ctx.beginPath(); ctx.arc(x,y,r,0,PI*2); ctx.fillStyle=color; ctx.fill();
  // 4 finger blobs
  const dirs=flip
    ? [[r*.7,-r*.7],[0,-r*.95],[r*.7,-r*.7],[r*.9,0]]
    : [[-r*.7,-r*.7],[0,-r*.95],[r*.7,-r*.7],[-r*.9,0]];
  dirs.forEach(([dx,dy])=>{
    ctx.beginPath(); ctx.arc(x+dx,y+dy,r*.44,0,PI*2); ctx.fill();
  });
}

function foot(x,y,flip){
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(flip?-1:1,1);
  // heel ball
  ctx.beginPath(); ctx.ellipse(4,0,14,8,0.15,0,PI*2);
  ctx.fillStyle=C.furDark; ctx.fill();
  // big toe
  ctx.beginPath(); ctx.arc(-6,-5,5.5,0,PI*2);
  ctx.fillStyle=C.fur; ctx.fill();
  // two toes
  [-1,1].forEach(s=>{
    ctx.beginPath(); ctx.arc(s*3+2,10,3.5,0,PI*2);
    ctx.fillStyle=C.furDark; ctx.fill();
  });
  ctx.restore();
}

function banana(x,y,rot){
  ctx.save();
  ctx.translate(x,y); ctx.rotate(rot);
  // body
  ctx.beginPath();
  ctx.moveTo(0,2);
  ctx.quadraticCurveTo(5,-14,1,-28);
  ctx.quadraticCurveTo(-5,-14,-1,2);
  ctx.closePath();
  ctx.fillStyle=C.banana; ctx.fill();
  ctx.strokeStyle=C.bananaDark; ctx.lineWidth=1.4; ctx.stroke();
  // highlight
  ctx.beginPath();
  ctx.moveTo(0,2); ctx.quadraticCurveTo(2,-13,1,-26);
  ctx.strokeStyle="rgba(255,255,255,.35)"; ctx.lineWidth=2; ctx.stroke();
  // stem
  ctx.beginPath(); ctx.ellipse(0,-28,4,4,0,0,PI*2);
  ctx.fillStyle=C.bananaTop; ctx.fill();
  ctx.restore();
}

/* ── MAIN DRAW ──────────────────────────────────────────────── */
function draw(){
  ctx.clearRect(0,0,CW,CH);
  const {t,state,rx,ry} = R;
  const rootY = ry+R.jumpY;

  // Shadow
  const sh = Math.max(0.15, 1+R.jumpY/90);
  ctx.save();
  ctx.globalAlpha=0.16*sh;
  ctx.scale(1,0.28);
  ctx.beginPath(); ctx.ellipse(rx, (CH-6)/0.28, 32*sh, 10,0,0,PI*2);
  ctx.fillStyle="#3a1a00"; ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(rx + (R.shakeOffsetX||0), rootY);
  // ── Backflip rotation (Gemini-inspired): rotate whole body during jump ──
  if(R.jumpRot && R.jumpY < -2){
    ctx.rotate((R.jumpRot * PI) / 180);
  }

  // ── TAIL ──
  {
    const [a0,a1,a2]=[R.tail[0].a,R.tail[1].a,R.tail[2].a];
    const [x1,y1]=limb(16,8,  22,a0,           9,C.fur);
    const [x2,y2]=limb(x1,y1, 18,a0+a1,        7,C.fur);
    limb(x2,y2,  14,a0+a1+a2,   5,C.fur);
  }

  // ── BODY ──
  ctx.save();
  ctx.scale(R.sqX, R.sqY);
  ctx.beginPath(); ctx.ellipse(0,8,31,34,0,0,PI*2);
  ctx.fillStyle=C.fur; ctx.fill();
  // belly
  ctx.beginPath(); ctx.ellipse(0,14,19,24,0,0,PI*2);
  ctx.fillStyle=C.belly; ctx.fill();
  ctx.restore();

  // ── LEFT LEG ──
  {
    const hx=-13,hy=20;
    const la=R.lTh, shinAng=R.lTh+R.lSh;
    const [kx,ky]=limb(hx,hy,27,la,15,C.fur);
    const [fx,fy]=limb(kx,ky,23,shinAng,12,C.fur);
    ctx.beginPath(); ctx.arc(kx,ky,7,0,PI*2); ctx.fillStyle=C.fur; ctx.fill();
    foot(fx,fy,false);
  }

  // ── RIGHT LEG ──
  {
    const hx=13,hy=20;
    const la=R.rTh, shinAng=R.rTh+R.rSh;
    const [kx,ky]=limb(hx,hy,27,la,15,C.fur);
    const [fx,fy]=limb(kx,ky,23,shinAng,12,C.fur);
    ctx.beginPath(); ctx.arc(kx,ky,7,0,PI*2); ctx.fillStyle=C.fur; ctx.fill();
    foot(fx,fy,true);
  }

  // ── LEFT ARM ──
  {
    const sx=-28,sy=-28;
    const [ex,ey]=limb(sx,sy,25,R.lUa,        15,C.fur);
    const fang=R.lUa+R.lFa;
    const [wx,wy]=limb(ex,ey,21,fang,          12,C.fur);
    ctx.beginPath(); ctx.arc(ex,ey,7,0,PI*2); ctx.fillStyle=C.fur; ctx.fill();
    hand(wx,wy,8,C.fur,false);
  }

  // ── RIGHT ARM ──
  {
    const sx=28,sy=-28;
    const [ex,ey]=limb(sx,sy,25,R.rUa,        15,C.fur);
    const fang=R.rUa+R.rFa;
    const [wx,wy]=limb(ex,ey,21,fang,          12,C.fur);
    ctx.beginPath(); ctx.arc(ex,ey,7,0,PI*2); ctx.fillStyle=C.fur; ctx.fill();
    // banana in right hand
    if(R.banana){
      const bRot = -0.5+sin(R.bananaT)*0.12;
      banana(wx,wy-2,bRot);
    }
    hand(wx,wy,8,C.fur,true);
  }

  // ── HEAD ──
  ctx.save();
  ctx.translate(0, R.hOff-50);
  ctx.rotate(R.hTilt);

  // Ears (behind head)
  [-1,1].forEach(s=>{
    ctx.beginPath(); ctx.ellipse(s*36,2,13,12,0,0,PI*2);
    ctx.fillStyle=C.fur; ctx.fill();
    ctx.beginPath(); ctx.ellipse(s*36,2,7,7,0,0,PI*2);
    ctx.fillStyle=C.belly; ctx.fill();
  });

  // Skull
  ctx.beginPath(); ctx.ellipse(0,0,38/R.sqX*R.sqY,36/R.sqY*R.sqX,0,0,PI*2);
  ctx.fillStyle=C.fur; ctx.fill();

  // Muzzle
  ctx.beginPath(); ctx.ellipse(0,10,23,17,0,0,PI*2);
  ctx.fillStyle=C.belly; ctx.fill();

  // Cheeks
  [-1,1].forEach(s=>{
    ctx.beginPath(); ctx.ellipse(s*20,11,9,6,0.2,0,PI*2);
    ctx.fillStyle=C.cheek; ctx.fill();
  });

  // ── Eyes ──
  const ey0 = state==="sad" ? -4 : -7;
  const bl  = R.blink;

  if(state==="dizzy"){
    // × × dizzy eyes
    [-1,1].forEach(s=>{
      ctx.save(); ctx.translate(s*11,ey0);
      ctx.strokeStyle=C.black; ctx.lineWidth=2.5; ctx.lineCap="round";
      [[-5,-5,5,5],[5,-5,-5,5]].forEach(([x1,y1,x2,y2])=>{
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      });
      ctx.restore();
    });
  } else if(state==="happy"){
    // ^_^ crescent eyes
    [-1,1].forEach(s=>{
      ctx.save(); ctx.translate(s*11,ey0+4);
      ctx.beginPath(); ctx.arc(0,4,7,PI+0.25,-0.25,false);
      ctx.fillStyle=C.black; ctx.fill();
      ctx.restore();
    });
  } else {
    // Normal eyes
    [-1,1].forEach(s=>{
      const ex2=s*11;
      // white sclera
      ctx.beginPath(); ctx.ellipse(ex2,ey0,7,7*(1-bl*.92),0,0,PI*2);
      ctx.fillStyle=C.white; ctx.fill();
      if(bl<0.85){
        // pupil
        ctx.beginPath(); ctx.arc(ex2+s*.8,ey0+(state==="sad"?2:1),4,0,PI*2);
        ctx.fillStyle=C.black; ctx.fill();
        // shine
        ctx.beginPath(); ctx.arc(ex2+s*.8+1.5,ey0+(state==="sad"?2:1)-1.5,1.5,0,PI*2);
        ctx.fillStyle=C.white; ctx.fill();
      }
    });
  }

  // Sad eyebrows
  if(state==="sad"){
    [-1,1].forEach(s=>{
      ctx.save(); ctx.translate(s*11,ey0);
      ctx.strokeStyle=C.black; ctx.lineWidth=2.8; ctx.lineCap="round";
      ctx.beginPath();
      ctx.moveTo(-7*s,-9); ctx.quadraticCurveTo(0,-6,7*s,-9);
      // invert for sad slant
      ctx.moveTo(-6,-10); ctx.lineTo(6,-7);
      ctx.stroke();
      ctx.restore();
    });
  }

  // Tears (sad)
  if(state==="sad"){
    [-1,1].forEach(s=>{
      const tx2=s*11-s*5;
      const tyBase=ey0+9+sin(t*2.8+(s>0?1:0))*3;
      ctx.beginPath(); ctx.ellipse(tx2,tyBase,2.5,5,0,0,PI*2);
      ctx.fillStyle=C.tear; ctx.fill();
    });
  }

  // Nose
  ctx.beginPath(); ctx.ellipse(0,7,6,4.5,0,0,PI*2);
  ctx.fillStyle=C.belly; ctx.fill();
  [-1,1].forEach(s=>{
    ctx.beginPath(); ctx.arc(s*3,8,2,0,PI*2);
    ctx.fillStyle="rgba(90,50,15,.4)"; ctx.fill();
  });

  // Mouth
  const mo=R.mouth;
  if(mo>0.08){
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0,18,10*mo+5,7*mo+2,0,0,PI);
    ctx.fillStyle=C.mouth; ctx.fill();
    if(mo>0.45){
      ctx.fillStyle=C.white;
      ctx.fillRect(-5,17,4.5,4); ctx.fillRect(1,17,4.5,4);
    }
    // lip line
    ctx.beginPath();
    ctx.moveTo(-(10*mo+5),18);
    ctx.quadraticCurveTo(0,18+7*mo,(10*mo+5),18);
    ctx.strokeStyle=C.black; ctx.lineWidth=1.5; ctx.lineCap="round"; ctx.stroke();
    ctx.restore();
  } else {
    ctx.beginPath();
    if(state==="sad"||state==="dizzy"){
      ctx.moveTo(-9,22); ctx.quadraticCurveTo(0,16,9,22);
    } else {
      ctx.moveTo(-9,18); ctx.quadraticCurveTo(0,26,9,18);
    }
    ctx.strokeStyle=C.black; ctx.lineWidth=2.5; ctx.lineCap="round"; ctx.stroke();
  }

  ctx.restore(); // head

  // ── DIZZY orbiting stars ──
  if(state==="dizzy"){
    for(let i=0;i<3;i++){
      const ang=t*3+(i*PI*2/3);
      ctx.save();
      ctx.translate(cos(ang)*52,sin(ang)*20-78);
      ctx.rotate(ang*2);
      ctx.font="bold 14px sans-serif";
      ctx.fillText("⭐",-7,6);
      ctx.restore();
    }
  }

  // ── HAPPY star particles ──
  if(state==="happy"){
    R.stars.forEach(s=>{
      ctx.save();
      ctx.globalAlpha=Math.max(0,s.alpha);
      ctx.translate(s.x,s.y-52);
      ctx.rotate(s.r);
      ctx.font=`bold ${s.size}px sans-serif`;
      ctx.fillText(s.emoji,-s.size/2,s.size/2);
      ctx.restore();
    });
  }

  ctx.restore(); // root
}

/* ── Animation loop ─────────────────────────────────────────── */
let lastTs=0;
function tick(ts){
  const dt=Math.min((ts-lastTs)/1000,0.05);
  lastTs=ts;
  R.t+=dt;
  const t=R.t, st=R.state;

  // Lerp all rig values
  R.lUa=lerp(R.lUa,R.lUat,SPD.lUa);
  R.lFa=lerp(R.lFa,R.lFat,SPD.lFa);
  R.rUa=lerp(R.rUa,R.rUat,SPD.rUa);
  R.rFa=lerp(R.rFa,R.rFat,SPD.rFa);
  R.lTh=lerp(R.lTh,R.lTht,SPD.lTh);
  R.lSh=lerp(R.lSh,R.lSht,SPD.lSh);
  R.rTh=lerp(R.rTh,R.rTht,SPD.rTh);
  R.rSh=lerp(R.rSh,R.rSht,SPD.rSh);
  R.sqY=lerp(R.sqY,R.sqYt,SPD.sq);
  R.sqX=lerp(R.sqX,R.sqXt,SPD.sq);
  R.hOff=lerp(R.hOff,R.hOfft,SPD.head);
  R.hTilt=lerp(R.hTilt,R.hTiltt,SPD.head);
  R.mouth=lerp(R.mouth,R.moutht,SPD.mouth);
  R.tail.forEach(seg=>{ seg.a=lerp(seg.a,seg.at,seg.spd); });

  // ── Per-state procedural overlays ──
  if(st==="idle"){
    // ── Adopted from Gemini: "Squash and Stretch" breathing ──
    // Body pulses with weight: tall+thin on inhale, short+wide on exhale
    const breathCycle = sin(t*1.6);            // one breath every ~3.9 s
    R.sqY = 1 + breathCycle*0.038;             // taller on inhale
    R.sqX = 1 - breathCycle*0.025;             // narrower on inhale
    R.sqYt=1; R.sqXt=1;
    // Head bobs gently with the breath
    R.hTilt = sin(t*0.9)*0.06;
    // Arms & tail sway naturally out of phase
    R.lUa+=sin(t*1.4+0.5)*0.055;
    R.rUa+=sin(t*1.4)*0.055;
    R.lFa+=sin(t*1.7+0.3)*0.045;
    R.rFa+=sin(t*1.7)*0.045;
    R.tail[2].a+=sin(t*2.2)*0.2;
    R.tail[1].a+=sin(t*1.8)*0.13;

  } else if(st==="happy"){
    // ── Adopted from Gemini: Backflip during peak of jump ──
    // R.jumpRot accumulates full 360° rotation as monkey goes up & comes down
    R.jumpVY-=560*dt;
    R.jumpY=Math.min(0,R.jumpY+R.jumpVY*dt);
    // Spin: fastest at peak (jumpVY≈0), completes 360° by landing
    R.jumpRot = (R.jumpRot||0) + dt * 520; // deg/s → full spin ≈ 0.7 s
    if(R.jumpY>=0){
      R.jumpY=0;
      R.jumpRot=0;                            // snap rotation clean on land
      if(R.jumpVY<-40){
        R.sqYt=0.7; R.sqXt=1.38;             // squash on landing
        setTimeout(()=>{R.sqYt=1;R.sqXt=1;},180);
      }
      R.jumpVY=Math.max(R.jumpVY,0);
    }
    // Arms flap while airborne
    if(R.jumpY<-8){
      R.lUa+=sin(t*8)*0.2;
      R.rUa+=sin(t*8+PI)*0.2;
      R.lFa+=cos(t*7)*0.14;
      R.rFa+=cos(t*7+PI)*0.14;
    }
    // Tail wags fast with excitement
    R.tail[1].a+=sin(t*5.5)*0.32;
    R.tail[2].a+=sin(t*6.5+0.5)*0.26;
    // Drift star particles outward
    R.stars.forEach(s=>{
      s.x+=s.vx*dt; s.y+=s.vy*dt;
      s.alpha=Math.max(0,s.alpha-0.55*dt);
    });

  } else if(st==="sad"){
    // ── Adopted from Gemini: Side-to-side "No" shake on error ──
    // First 0.5 s: rapid shake (like Gemini's monkeyShake keyframes)
    // After that: settle into droopy idle
    const shakeAge = R.t - (R.sadStartT||R.t);
    if(shakeAge < 0.55){
      // Mimic Gemini's shake: 20%→-15px, 40%→+15px, 60%→-10px, 80%→+10px
      const shakeX = sin(shakeAge * PI * 7) * 14 * (1 - shakeAge/0.55);
      R.shakeOffsetX = shakeX;
      // Slight head tilt with each shake direction
      R.hTilt = shakeX * 0.015;
    } else {
      R.shakeOffsetX = lerp(R.shakeOffsetX||0, 0, 0.15);
      R.hOff = R.hOfft + sin(t*1.4)*2.5;   // droopy bob
    }
    R.tail[2].a+=sin(t*1.0)*0.06;

  } else if(st==="eating"){
    R.bananaT+=dt*2.8;
    R.rUa+=sin(t*2.2)*0.05;
    R.rFa+=sin(t*2.2+PI)*0.07;
    R.moutht=0.55+sin(t*2.8)*0.28;
    R.tail[2].a+=sin(t*2.0)*0.13;

  } else if(st==="dizzy"){
    R.hTilt=sin(t*2.4)*0.24;
    R.lUa+=sin(t*2.1)*0.11;
    R.rUa+=sin(t*2.1+PI)*0.11;
    R.hOff=R.hOfft+sin(t*3)*3;
  }

  // ── Blink ──
  R.blinkNext-=dt;
  if(R.blinkNext<=0){
    R.blink=1;
    setTimeout(()=>{ R.blink=0; },110);
    R.blinkNext=2.2+Math.random()*3.2;
  }

  draw();
  requestAnimationFrame(tick);
}
requestAnimationFrame(ts=>{ lastTs=ts; requestAnimationFrame(tick); });

/* ── Internal state trackers ────────────────────────────────── */
let _stTimer=null, _spTimer=null, _curState="idle";

/* ── PUBLIC API ─────────────────────────────────────────────── */
window.setMonkey=function(state,duration=0){
  _curState=state;
  R.state=state;
  const pose=POSES[state]||POSES.idle;
  applyPose(pose);

  if(state==="happy"){
    R.jumpVY=-400;
    R.jumpRot=0;
    R.stars=Array.from({length:7},()=>({
      x:(Math.random()-.5)*18,
      y:(Math.random()-.5)*18,
      vx:(Math.random()-.5)*100,
      vy:-70-Math.random()*70,
      alpha:1,
      size:13+Math.random()*9,
      r:Math.random()*PI,
      emoji:["⭐","✨","🌟"][Math.floor(Math.random()*3)],
    }));
  }
  if(state==="idle"){
    R.jumpVY=0; R.jumpY=0; R.jumpRot=0;
    R.shakeOffsetX=0;
    R.sqYt=1; R.sqXt=1; R.stars=[];
  }
  if(state==="sad"){
    R.sadStartT=R.t;        // record time sad began for shake timing
    R.shakeOffsetX=0;
  }
  clearTimeout(_stTimer);
  if(duration>0) _stTimer=setTimeout(()=>window.setMonkey("idle"),duration);
};

window.showSpeech=function(msg,color="#7b3f00",dur=2000){
  const b=document.getElementById("speech");   // matches index.html id="speech"
  if(!b)return;
  b.textContent=msg; b.style.color=color;
  b.classList.add("show");
  clearTimeout(_spTimer);
  _spTimer=setTimeout(()=>b.classList.remove("show"),dur);
};

window.monkeyState=function(){ return _curState; };

/**
 * triggerMonkeyReaction(isCorrect, duration)
 * ── Gemini-inspired clean API ──
 * Convenience wrapper so game.js can call one function
 * instead of setMonkey + showSpeech separately.
 */
window.triggerMonkeyReaction=function(isCorrect, duration=1700){
  if(isCorrect){
    window.setMonkey("happy", duration);
    const cheers=["Yeahhh! 🎉","You rock! ⭐","WOW! 🚀","PERFECT! 🏆","BOOM! 💥"];
    window.showSpeech(cheers[Math.floor(Math.random()*cheers.length)],"#1a7030",duration);
  } else {
    window.setMonkey("sad", duration);
    const comfort=["Aww, it's ok! 😢","Don't give up! 💪","I believe in you! 🌟","Try again! 🐒"];
    window.showSpeech(comfort[Math.floor(Math.random()*comfort.length)],"#c02000",duration);
  }
};
window.setMonkey("idle");

})();
