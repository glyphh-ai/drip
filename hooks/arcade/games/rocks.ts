// rocks: a ship in a field of drifting rocks over Claude's window, endless.
// Left and right turn, Up thrusts, Space fires (held, it keeps firing), Down
// jumps somewhere else. Space wraps at the edges. A shot rock breaks in two,
// and the pieces in two again, until they are dust; a saucer comes now and
// then and shoots back. A rock or a saucer's shot costs a ship; three to
// start, one more every ROCKS_EXTRA_LIFE points. Clear the field and the next
// wave comes: more rocks, faster, and from the third a saucer that aims
// better each wave. The top score is the one to beat.
//
// Its look is its own: Glyphh's colours, rocks drawn as faceted stones with a
// glowing edge, a ship with a flame.
//
// A game (./game.ts): `(w, h, best) => html`. The overlay
// takes clicks and keys for it (overlay.ts, `interactive`) and hears its score
// (GAME_SCORE). It closes itself with the drip close signal after a short end
// screen, at once on Esc, and at the overlay's cap (ROCKS_SAFETY_MS).

import type { Game } from './game.ts'
import { CLOSE_SIGNAL as CLOSE, GAME_SCORE, GAME_SOUND } from './shared.ts'

/** Ships to start with. */
export const ROCKS_LIVES = 3
/** One more ship every this many points. */
export const ROCKS_EXTRA_LIFE = 10_000
/** What a rock is worth by size (the smaller, the more), and a saucer. */
export const ROCKS_POINTS = { big: 20, mid: 50, small: 100, saucer: 200 } as const
/** How long the end screen stays, in ms. */
export const ROCKS_END_MS = 2_600
/** The backstop: as long as the overlay ever stays (30 minutes). */
export const ROCKS_SAFETY_MS = 30 * 60_000
/** The wave a saucer first comes in. */
export const ROCKS_SAUCER_WAVE = 3

export type RocksWave = {
  /** Big rocks the wave starts with. */
  count: number
  /** Their speed, as a multiple of the first wave's. */
  speed: number
  /** Seconds between saucers, on average (0: none this wave). */
  saucerEveryS: number
  /** How far off a saucer's shot may go, in radians. */
  saucerMiss: number
}

/** How wave `n` (1, 2, ...) plays: two more rocks a wave up to 14, each wave
 *  12% faster without end, a saucer from ROCKS_SAUCER_WAVE coming more often
 *  and aiming better. */
export function rocksWave(n: number): RocksWave {
  const w = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
  const saucer = w >= ROCKS_SAUCER_WAVE
  return {
    count: Math.min(14, 2 + 2 * w),
    speed: +Math.pow(1.12, w - 1).toFixed(3),
    saucerEveryS: saucer ? +Math.max(6, 18 - 2 * (w - ROCKS_SAUCER_WAVE)).toFixed(1) : 0,
    saucerMiss: saucer ? +Math.max(0.05, 0.5 - 0.06 * (w - ROCKS_SAUCER_WAVE)).toFixed(3) : 0,
  }
}

export function dripRocks(w: number, h: number, best = 0): string {
  const top = Number.isInteger(best) && best > 0 ? best : 0
  return `<html><head><style>
*{margin:0;padding:0}
html,body{width:${w}px;height:${h}px;overflow:hidden;background:rgba(4,8,16,0.55);user-select:none;-webkit-user-select:none}
canvas{position:absolute;left:0;top:0}
</style></head><body>
<canvas id="c" width="${w}" height="${h}"></canvas>
<script>
(function(){
var W=${w},H=${h},BEST=${top},LIVES=${ROCKS_LIVES},EXTRA=${ROCKS_EXTRA_LIFE},PTS=${JSON.stringify(ROCKS_POINTS)},ENDMS=${ROCKS_END_MS},SAUCERWAVE=${ROCKS_SAUCER_WAVE};
var c=document.getElementById("c").getContext("2d");
${GAME_SOUND}
${GAME_SCORE}
var K=Math.max(0.55,Math.min(1.6,Math.min(W,H)/800)),SIZES={big:46*K,mid:24*K,small:12*K},NEXT={big:"mid",mid:"small"};
var EDGES=["#25c75e","#10a37f","#48dbfb","#4fffb0"];
function rnd(a,b){return a+Math.random()*(b-a)}
function wave(n){var s=n>=SAUCERWAVE;return{count:Math.min(14,2+2*n),speed:Math.pow(1.12,n-1),saucerEvery:s?Math.max(6,18-2*(n-SAUCERWAVE))*1000:0,saucerMiss:s?Math.max(0.05,0.5-0.06*(n-SAUCERWAVE)):0}}
var ship={x:W/2,y:H/2,a:-Math.PI/2,vx:0,vy:0,alive:true,safeUntil:0,back:0},rocks=[],shots=[],enemy=[],parts=[],saucer=null;
var stats={score:0,wave:0,lives:LIVES,rocks:0,saucers:0};
var keys={},state="play",endAt=0,closed=false,paused=false,beat=false,beatAt=-1e9,shake=0,lastShot=0,jumpAt=0,nextLife=EXTRA,waveAt=0,saucerAt=0,beatNote=0,beatNext=0,thrustSound=0,waveText=-1e9;
function close(){if(closed)return;closed=true;c.clearRect(0,0,W,H);${CLOSE}}
function wrap(o){if(o.x<0)o.x+=W;else if(o.x>W)o.x-=W;if(o.y<0)o.y+=H;else if(o.y>H)o.y-=H}
function dist(a,b){var dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y);dx=Math.min(dx,W-dx);dy=Math.min(dy,H-dy);return Math.sqrt(dx*dx+dy*dy)}
function rock(size,x,y,speed){var n=10,pts=[];for(var i=0;i<n;i++)pts.push(rnd(0.72,1.15));var a=rnd(0,Math.PI*2),v=rnd(40,90)*K*speed*(size==="big"?1:size==="mid"?1.4:1.9);
  return{size:size,r:SIZES[size],x:x,y:y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,rot:rnd(0,6.3),vr:rnd(-1.2,1.2),pts:pts,edge:EDGES[Math.floor(Math.random()*EDGES.length)]}}
// A wave's rocks come in from the edges, never on top of the ship.
function startWave(){stats.wave++;var wv=wave(stats.wave);waveText=now0;
  for(var i=0;i<wv.count;i++){var x,y,tries=0;do{if(Math.random()<0.5){x=rnd(0,W);y=Math.random()<0.5?0:H}else{x=Math.random()<0.5?0:W;y=rnd(0,H)}tries++}while(dist({x:x,y:y},ship)<220*K&&tries<20);
    rocks.push(rock("big",x,y,wv.speed))}
  saucerAt=wv.saucerEvery?now0+wv.saucerEvery*rnd(0.6,1.2):0;
  if(stats.wave>1)sfx.notes([[523,0.08,0],[784,0.08,0.08],[1047,0.18,0.16]],"triangle",0.07)}
function burst(x,y,n,cols,speed,life){for(var i=0;i<n;i++){var a=rnd(0,Math.PI*2),v=rnd(0.2,1)*speed*K;parts.push({x:x,y:y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:rnd(0.5,1)*life,max:life,size:rnd(1.5,3.5)*K,col:cols[i%cols.length]})}}
function addScore(n){stats.score+=n;postScore(stats.score);
  if(stats.score>=nextLife){nextLife+=EXTRA;stats.lives++;sfx.notes([[880,0.08,0],[1175,0.08,0.09],[1760,0.2,0.18]],"square",0.06)}
  if(BEST>0&&!beat&&stats.score>BEST){beat=true;beatAt=now0;sfx.notes([[784,0.08,0],[988,0.08,0.08],[1319,0.24,0.16]],"triangle",0.1)}}
function breakRock(i){var r=rocks[i];rocks.splice(i,1);stats.rocks++;addScore(PTS[r.size]);
  burst(r.x,r.y,r.size==="big"?22:r.size==="mid"?14:8,[r.edge,"#fff","#8d99ae"],r.size==="big"?160:220,0.9);
  shake=Math.max(shake,r.size==="big"?6*K:r.size==="mid"?3*K:1.5*K);
  if(r.size==="big"){sfx.noise(0.7,0.45,900,60);sfx.tone(70,0.5,"sine",0.25,35)}else if(r.size==="mid"){sfx.noise(0.45,0.35,1600,120)}else sfx.noise(0.25,0.25,3000,300);
  var nx=NEXT[r.size];if(nx){var wv=wave(stats.wave);rocks.push(rock(nx,r.x,r.y,wv.speed));rocks.push(rock(nx,r.x,r.y,wv.speed))}}
function lose(){if(!ship.alive||now0<ship.safeUntil)return;ship.alive=false;stats.lives--;shake=10*K;
  burst(ship.x,ship.y,40,["#fff","#25c75e","#ffd60a","#ff6b6b"],260,1.4);sfx.noise(1.2,0.55,1200,50);sfx.tone(300,1,"sawtooth",0.12,40);
  if(stats.lives<=0){state="end";endAt=now0-start;
    if(beat)sfx.notes([[523,0.12,0.6],[659,0.12,0.72],[784,0.12,0.84],[1047,0.35,0.96]]);else sfx.notes([[392,0.2,0.6],[330,0.2,0.8],[262,0.45,1]],"triangle",0.14)}
  else ship.back=now0+1800}
// Back once the middle is clear of rocks, and safe for a moment.
function respawn(){for(var i=0;i<rocks.length;i++)if(dist(rocks[i],{x:W/2,y:H/2})<rocks[i].r+90*K)return;
  ship.x=W/2;ship.y=H/2;ship.vx=0;ship.vy=0;ship.a=-Math.PI/2;ship.alive=true;ship.safeUntil=now0+2200;sfx.tone(440,0.2,"triangle",0.06,880)}
function fire(){if(!ship.alive||state!=="play"||paused||now0-lastShot<160||shots.length>=7)return;lastShot=now0;
  var sp=620*K;shots.push({x:ship.x+Math.cos(ship.a)*14*K,y:ship.y+Math.sin(ship.a)*14*K,vx:Math.cos(ship.a)*sp+ship.vx,vy:Math.sin(ship.a)*sp+ship.vy,life:0.9});
  sfx.tone(1400,0.08,"square",0.04,500)}
function jump(){if(!ship.alive||state!=="play"||paused||now0-jumpAt<1000)return;jumpAt=now0;burst(ship.x,ship.y,12,["#9b6dff","#fff"],120,0.5);
  ship.x=rnd(W*0.1,W*0.9);ship.y=rnd(H*0.1,H*0.9);ship.vx*=0.3;ship.vy*=0.3;burst(ship.x,ship.y,12,["#9b6dff","#fff"],120,0.5);sfx.tone(200,0.25,"sine",0.1,1600)}
function sendSaucer(){var fromLeft=Math.random()<0.5;saucer={x:fromLeft?-20:W+20,y:rnd(H*0.15,H*0.85),vx:(fromLeft?1:-1)*rnd(90,130)*K*wave(stats.wave).speed,turnAt:now0+rnd(800,1600),fireAt:now0+900,r:16*K};
  sfx.tone(700,0.3,"square",0.03,900)}
var KEYS={ArrowLeft:"left",a:"left",A:"left",ArrowRight:"right",d:"right",D:"right",ArrowUp:"thrust",w:"thrust",W:"thrust"," ":"fire",ArrowDown:"jump",s:"jump",S:"jump",p:"pause",P:"pause",m:"mute",M:"mute"};
document.addEventListener("keydown",function(ev){
  if(ev.key==="Escape"||ev.keyCode===27){ev.preventDefault();close();return}
  var k=KEYS[ev.key];if(!k)return;ev.preventDefault();
  if(k==="fire"&&!ev.repeat)fire();
  keys[k]=true;if(ev.repeat)return;
  if(k==="mute")sfx.toggle();else if(k==="pause"&&state==="play"){paused=!paused;sfx.tone(paused?440:660,0.08,"triangle",0.06)}else if(k==="jump")jump();
});
document.addEventListener("keyup",function(ev){var k=KEYS[ev.key];if(k)keys[k]=false});
document.addEventListener("mousedown",function(ev){ev.preventDefault()});
window.__rocks={stats:stats,ship:ship,rocks:rocks,shots:shots,state:function(){return state},fire:fire,jump:jump,saucer:function(){return saucer},sendSaucer:function(){sendSaucer()},best:BEST};
function pixelText(str,x,y,size,col,align){
  c.font="900 "+Math.round(size)+"px Menlo, Monaco, 'Courier New', monospace";c.textAlign=align||"left";c.textBaseline="top";
  c.fillStyle="#000";c.fillText(str,x+Math.max(2,size/8),y+Math.max(2,size/8));c.fillStyle=col;c.fillText(str,x,y);
}
function drawRock(r){c.save();c.translate(r.x,r.y);c.rotate(r.rot);c.beginPath();
  for(var i=0;i<r.pts.length;i++){var a=i/r.pts.length*Math.PI*2,d=r.r*r.pts[i];if(i)c.lineTo(Math.cos(a)*d,Math.sin(a)*d);else c.moveTo(Math.cos(a)*d,Math.sin(a)*d)}c.closePath();
  c.fillStyle="#1b2420";c.fill();c.shadowColor=r.edge;c.shadowBlur=8*K;c.strokeStyle=r.edge;c.lineWidth=2*K;c.stroke();c.shadowBlur=0;
  c.fillStyle="rgba(255,255,255,0.06)";c.beginPath();c.moveTo(-r.r*0.4,-r.r*0.5);c.lineTo(r.r*0.2,-r.r*0.6);c.lineTo(-r.r*0.1,-r.r*0.1);c.closePath();c.fill();c.restore()}
function drawShip(x,y,a,s,flame){c.save();c.translate(x,y);c.rotate(a);c.scale(s,s);
  if(flame){c.fillStyle=Math.random()<0.5?"#ff9f43":"#ffd60a";c.beginPath();c.moveTo(-9*K,-5*K);c.lineTo(-(16+Math.random()*10)*K,0);c.lineTo(-9*K,5*K);c.closePath();c.fill()}
  c.beginPath();c.moveTo(15*K,0);c.lineTo(-10*K,-9*K);c.lineTo(-6*K,0);c.lineTo(-10*K,9*K);c.closePath();
  c.fillStyle="#0e2a1b";c.fill();c.shadowColor="#25c75e";c.shadowBlur=10*K;c.strokeStyle="#4fffb0";c.lineWidth=2*K;c.stroke();c.restore()}
function drawSaucer(s){c.save();c.translate(s.x,s.y);c.shadowColor="#9b6dff";c.shadowBlur=10*K;c.strokeStyle="#c3a6ff";c.lineWidth=2*K;c.fillStyle="#241a3a";
  c.beginPath();c.ellipse(0,0,s.r*1.3,s.r*0.5,0,0,Math.PI*2);c.fill();c.stroke();c.beginPath();c.ellipse(0,-s.r*0.35,s.r*0.6,s.r*0.45,0,Math.PI,0);c.fill();c.stroke();c.restore()}
function drawHud(){var size=Math.max(14,22*K),pad=16*K;
  pixelText(String(stats.score),pad,pad,size*1.4,"#fff","left");
  for(var i=0;i<Math.min(stats.lives,8);i++)drawShip(pad+10*K+i*22*K,pad+size*2.3,-Math.PI/2,0.7,false);
  pixelText("BEST "+Math.max(BEST,stats.score),W-pad,pad,size*0.8,"#ffd60a","right");
  pixelText("WAVE "+stats.wave,W-pad,pad+size*1.1,size*0.6,"#48dbfb","right");
  pixelText((sfx.muted()?"M SOUND ON":"M MUTES")+"   P PAUSE   ESC QUIT",W-pad,H-pad-size*0.7,size*0.55,"rgba(255,255,255,0.6)","right")}
function drawIntro(t){if(t>2200)return;var a=t>1800?1-(t-1800)/400:1,big=Math.max(22,44*K);
  c.save();c.globalAlpha=a;pixelText("ROCKS",W/2,H*0.3,big,"#25c75e","center");
  pixelText("ARROWS TURN AND THRUST. SPACE FIRES. DOWN JUMPS.",W/2,H*0.3+big*1.5,Math.max(12,big*0.38),"#fff","center");c.restore()}
function drawEnd(t){var k=Math.min(1,(t-endAt)/250),bw=Math.min(W*0.8,560*K),bh=Math.max(140,200*K),bx=W/2-bw/2,by=H*0.42-bh/2;
  c.save();c.globalAlpha=k;c.fillStyle="rgba(10,12,30,0.92)";c.fillRect(bx,by,bw,bh);c.strokeStyle="#25c75e";c.lineWidth=Math.max(3,4*K);c.strokeRect(bx,by,bw,bh);
  var big=Math.max(18,Math.min(44*K,bw/12));
  pixelText("OUT OF SHIPS",W/2,by+bh*0.12,big,"#ff6b6b","center");
  pixelText("SCORE "+stats.score,W/2,by+bh*0.12+big*1.5,big,"#ffd60a","center");
  pixelText(beat?"NEW BEST!":BEST>0?"BEST "+BEST:"WAVE "+stats.wave,W/2,by+bh*0.12+big*2.9,Math.max(12,big*0.5),beat?"#ffd60a":"#fff","center");c.restore()}
var start=performance.now(),last=start,now0=start;
sfx.notes([[196,0.12,0],[262,0.12,0.12],[392,0.25,0.24]],"triangle",0.09);
startWave();
function frame(now){
  if(closed)return;
  var t=now-start,dt=Math.min(0.05,(now-last)/1000);last=now;now0=now;
  if(state==="play"&&!paused){
    if(ship.alive){
      if(keys.left)ship.a-=4.2*dt;if(keys.right)ship.a+=4.2*dt;
      if(keys.thrust){ship.vx+=Math.cos(ship.a)*380*K*dt;ship.vy+=Math.sin(ship.a)*380*K*dt;burst(ship.x-Math.cos(ship.a)*12*K,ship.y-Math.sin(ship.a)*12*K,1,["#ff9f43","#ffd60a"],60,0.3);
        if(now>=thrustSound){thrustSound=now+90;sfx.noise(0.12,0.08,300,150)}}
      if(keys.fire)fire();
      var f=Math.pow(0.985,dt*60);ship.vx*=f;ship.vy*=f;var sp=Math.sqrt(ship.vx*ship.vx+ship.vy*ship.vy),mx=520*K;if(sp>mx){ship.vx*=mx/sp;ship.vy*=mx/sp}
      ship.x+=ship.vx*dt;ship.y+=ship.vy*dt;wrap(ship);
    }else if(stats.lives>0&&now>=ship.back)respawn();
    for(var i=0;i<rocks.length;i++){var r=rocks[i];r.x+=r.vx*dt;r.y+=r.vy*dt;r.rot+=r.vr*dt;wrap(r)}
    for(var j=shots.length-1;j>=0;j--){var s=shots[j];s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt;wrap(s);if(s.life<=0){shots.splice(j,1);continue}
      var hit=false;for(var q=rocks.length-1;q>=0;q--){if(dist(s,rocks[q])<rocks[q].r){breakRock(q);hit=true;break}}
      if(!hit&&saucer&&dist(s,saucer)<saucer.r*1.3){burst(saucer.x,saucer.y,26,["#9b6dff","#fff","#c3a6ff"],220,1);addScore(PTS.saucer);stats.saucers++;sfx.noise(0.6,0.45,2000,100);saucer=null;hit=true}
      if(hit)shots.splice(j,1)}
    for(var e=enemy.length-1;e>=0;e--){var b=enemy[e];b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;wrap(b);if(b.life<=0){enemy.splice(e,1);continue}
      if(ship.alive&&dist(b,ship)<10*K){enemy.splice(e,1);lose()}}
    if(ship.alive)for(var u=0;u<rocks.length;u++)if(dist(ship,rocks[u])<rocks[u].r+8*K){lose();break}
    var wv=wave(stats.wave);
    if(!saucer&&saucerAt&&now>=saucerAt){sendSaucer();saucerAt=now+wv.saucerEvery*rnd(0.7,1.3)}
    if(saucer){saucer.x+=saucer.vx*dt;if(now>=saucer.turnAt){saucer.turnAt=now+rnd(800,1600);saucer.vy=rnd(-1,1)*80*K}saucer.y+=(saucer.vy||0)*dt;
      if(saucer.y<0)saucer.y+=H;if(saucer.y>H)saucer.y-=H;
      if(now>=saucer.fireAt&&ship.alive){saucer.fireAt=now+1200;var aim=Math.atan2(ship.y-saucer.y,ship.x-saucer.x)+rnd(-wv.saucerMiss,wv.saucerMiss);
        enemy.push({x:saucer.x,y:saucer.y,vx:Math.cos(aim)*360*K,vy:Math.sin(aim)*360*K,life:1.4});sfx.tone(900,0.1,"sawtooth",0.04,300)}
      if(ship.alive&&dist(ship,saucer)<saucer.r+8*K){burst(saucer.x,saucer.y,26,["#9b6dff","#fff"],220,1);saucer=null;lose()}
      else if(saucer.x<-40||saucer.x>W+40)saucer=null}
    if(rocks.length===0&&!waveAt)waveAt=now+1500;
    if(waveAt&&now>=waveAt){waveAt=0;startWave()}
    // A beat under it all, quicker as the field thins and the waves go on.
    if(now>=beatNext){beatNote=1-beatNote;sfx.tone(beatNote?55:62,0.12,"sine",0.18);beatNext=now+Math.max(220,900-rocks.length*15-stats.wave*40)}
  }
  c.clearRect(0,0,W,H);
  c.save();if(shake>0){c.translate((Math.random()-0.5)*shake,(Math.random()-0.5)*shake);shake=Math.max(0,shake-dt*40*K)}
  for(var ri=0;ri<rocks.length;ri++)drawRock(rocks[ri]);
  c.fillStyle="#ffd60a";for(var si=0;si<shots.length;si++)c.fillRect(shots[si].x-2*K,shots[si].y-2*K,4*K,4*K);
  c.fillStyle="#ff6b6b";for(var ei=0;ei<enemy.length;ei++)c.fillRect(enemy[ei].x-2.5*K,enemy[ei].y-2.5*K,5*K,5*K);
  if(saucer)drawSaucer(saucer);
  if(ship.alive&&(now>=ship.safeUntil||Math.floor(now/120)%2===0))drawShip(ship.x,ship.y,ship.a,1,keys.thrust&&state==="play"&&!paused);
  for(var pi=parts.length-1;pi>=0;pi--){var p=parts[pi];if(!paused){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt}if(p.life<=0){parts.splice(pi,1);continue}
    c.globalAlpha=Math.max(0,p.life/p.max);c.fillStyle=p.col;c.fillRect(p.x,p.y,p.size,p.size);c.globalAlpha=1}
  c.restore();
  drawHud();drawIntro(t);
  if(now-waveText<1600&&stats.wave>1){c.save();c.globalAlpha=Math.min(1,(1600-(now-waveText))/400);pixelText("WAVE "+stats.wave,W/2,H*0.4,Math.max(20,40*K),"#48dbfb","center");c.restore()}
  if(now-beatAt<1400){c.save();c.globalAlpha=Math.min(1,(1400-(now-beatAt))/300);pixelText("NEW BEST!",W/2,H*0.2,Math.max(20,40*K),"#ffd60a","center");c.restore()}
  if(paused)pixelText("PAUSED",W/2,H*0.45,Math.max(20,40*K),"#fff","center");
  if(state==="end"){drawEnd(t);if(t-endAt>=ENDMS){close();return}}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
</${'script'}>
</body></html>`
}

export const rocks: Game = {
  name: 'rocks',
  title: 'Rocks',
  build: dripRocks,
  safetyMs: ROCKS_SAFETY_MS,
  aliases: ['rock'],
}
