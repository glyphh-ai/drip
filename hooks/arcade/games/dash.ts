// dash: a block runs right over Claude's window, endless, to a beat. The
// course is the same every run (a fixed seed), so it can be learned. Space,
// Up or a click jumps (held, it jumps again the moment it lands). Spikes end
// the run; blocks can be landed on, but running into one's side ends it too.
// The farther it goes, the faster it runs, the tighter the course and the
// quicker the beat. The score is the distance run, in blocks, and the top
// score stands on the course as a flag to pass.
//
// Its look is its own: Glyphh's colours, a sky that shifts as it goes, a
// block that turns half a turn in each jump.
//
// A game (./game.ts): `(w, h, best) => html`. The overlay
// takes clicks and keys for it (overlay.ts, `interactive`) and hears its score
// (GAME_SCORE). It closes itself with the drip close signal after a short end
// screen, at once on Esc, and at the overlay's cap (DASH_SAFETY_MS).

import type { Game } from './game.ts'
import { CLOSE_SIGNAL as CLOSE, GAME_SCORE, GAME_SOUND } from './shared.ts'

/** How long the end screen stays, in ms. */
export const DASH_END_MS = 2_600
/** The backstop: as long as the overlay ever stays (30 minutes). */
export const DASH_SAFETY_MS = 30 * 60_000
/** The run's speed, in blocks a second: at the start, and the most it nears. */
export const DASH_SPEED = [10, 17] as const
/** How the run ramps up with distance: two thirds of the way to its top speed
 *  and tightest course after this many blocks. */
export const DASH_RAMP_BLOCKS = 250
/** Gravity, in blocks a second squared, and how high a jump goes, in blocks:
 *  a quick, snappy jump (0.4 s in the air), the block turning half a turn in it. */
export const DASH_GRAVITY = 110
export const DASH_JUMP_BLOCKS = 2.2
/** The course's seed: every run is the same course, as far as it goes. */
export const DASH_SEED = 20261015
/** The flat run before the first obstacle (a lone spike), in blocks: past
 *  the title, about two and a half seconds in. */
export const DASH_LEAD_IN = 24

/** How far into its top speed the run is after `blocks`, from 0 towards 1. */
export function dashDifficulty(blocks: number): number {
  return blocks > 0 ? 1 - Math.exp(-blocks / DASH_RAMP_BLOCKS) : 0
}

/** The speed after `blocks`, in blocks a second. */
export function dashSpeed(blocks: number): number {
  return DASH_SPEED[0] + (DASH_SPEED[1] - DASH_SPEED[0]) * dashDifficulty(blocks)
}

/** How far one jump carries at `speed`, in blocks: what the course leaves
 *  clear after an obstacle, so a landing never falls on the next one. */
export function dashJumpReach(speed: number): number {
  const v0 = Math.sqrt(2 * DASH_GRAVITY * DASH_JUMP_BLOCKS)
  return speed * ((2 * v0) / DASH_GRAVITY)
}

export function dripDash(w: number, h: number, best = 0): string {
  const top = Number.isInteger(best) && best > 0 ? best : 0
  return `<html><head><style>
*{margin:0;padding:0}
html,body{width:${w}px;height:${h}px;overflow:hidden;background:rgba(0,0,0,0);user-select:none;-webkit-user-select:none;cursor:pointer}
canvas{position:absolute;left:0;top:0}
</style></head><body>
<canvas id="c" width="${w}" height="${h}"></canvas>
<script>
(function(){
var W=${w},H=${h},BEST=${top},ENDMS=${DASH_END_MS},S0=${DASH_SPEED[0]},S1=${DASH_SPEED[1]},RAMP=${DASH_RAMP_BLOCKS},G=${DASH_GRAVITY},JUMP=${DASH_JUMP_BLOCKS},LEAD=${DASH_LEAD_IN},SEED=${DASH_SEED};
var c=document.getElementById("c").getContext("2d");
${GAME_SOUND}
${GAME_SCORE}
var T=Math.max(20,Math.floor(H/11)),GROUND=Math.floor(H*0.74),PX=Math.floor(W*0.22),V0=Math.sqrt(2*G*JUMP),SPIN=Math.PI/(2*V0/G);
function rnd(a,b){return a+Math.random()*(b-a)}
function kOf(d){return d>0?1-Math.exp(-d/RAMP):0}
function speedAt(d){return S0+(S1-S0)*kOf(d)}
function reach(s){return s*(2*V0/G)}
// The runner: x in blocks along the course, y in blocks above the ground.
var me={x:0,y:0,vy:0,on:true,rot:0,dead:false,deadAt:0},course=[{t:"spike",x:LEAD,y:0}],built=LEAD+1+Math.ceil(reach(S0))+3,parts=[];
var stats={score:0,jumps:0,reason:""},state="play",endAt=0,closed=false,paused=false,beat=false,beatAt=-1e9,held=false,shake=0;
function close(){if(closed)return;closed=true;c.clearRect(0,0,W,H);${CLOSE}}
// The course, laid ahead in pieces; after each, room enough to land at the speed it will be run at.
// The course's own numbers: a fixed seed, so every run is the same course,
// laid as far as it is run (mulberry32).
var seed=SEED>>>0;function rand(){seed=(seed+0x6D2B79F5)>>>0;var t=seed;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}
function rr(a,b){return a+rand()*(b-a)}
function lay(){
  var s=speedAt(built),k=kOf(built),gap=Math.ceil(reach(s))+Math.round(rr(1,4)*(1-k*0.6)),r=rand(),x=built;
  if(r<0.3){var n=rand()<0.5?2:rand()<0.5?1:3;for(var i=0;i<n;i++)course.push({t:"spike",x:x+i,y:0});built=x+n+gap}
  else if(r<0.5){var bw=Math.round(rr(3,6));course.push({t:"block",x:x,y:0,w:bw,h:1});if(rand()<0.5)course.push({t:"spike",x:x+bw,y:0});built=x+bw+(rand()<0.5?1:0)+gap}
  else if(r<0.68){course.push({t:"block",x:x,y:0,w:3,h:1});course.push({t:"block",x:x+3,y:0,w:3,h:2});built=x+6+gap}
  else if(r<0.85){var rc=Math.ceil(reach(s)),pw=2*rc+3+Math.round(rr(0,2)),mid=x+rc+1;course.push({t:"block",x:x,y:0,w:pw,h:1});course.push({t:"spike",x:mid,y:1});built=x+pw+gap}
  else{var sp=Math.ceil(reach(s))+1;course.push({t:"spike",x:x,y:0});course.push({t:"spike",x:x+sp,y:0});built=x+sp+1+gap}
}
function solidBelow(x,y){var top=0;for(var i=0;i<course.length;i++){var o=course[i];if(o.t!=="block")continue;
  if(x+0.92>o.x&&x+0.08<o.x+o.w&&o.y+o.h<=y+0.05)top=Math.max(top,o.y+o.h)}return top}
function hitsSide(x,y){for(var i=0;i<course.length;i++){var o=course[i];if(o.t!=="block")continue;
  if(x+0.9>o.x&&x+0.1<o.x+o.w&&y<o.y+o.h-0.12&&y+0.9>o.y)return true}return false}
function hitsSpike(x,y){for(var i=0;i<course.length;i++){var o=course[i];if(o.t!=="spike")continue;
  if(x+0.78>o.x+0.3&&x+0.22<o.x+0.7&&y<o.y+0.62&&y+0.95>o.y)return true}return false}
function burst(x,y,n,cols,speed,life){for(var i=0;i<n;i++){var a=rnd(0,Math.PI*2),v=rnd(0.2,1)*speed;parts.push({x:x,y:y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-speed*0.3,life:rnd(0.5,1)*life,max:life,size:rnd(0.12,0.3)*T,col:cols[i%cols.length]})}}
function jump(){if(state!=="play"||paused||me.dead||!me.on)return;me.vy=V0;me.on=false;stats.jumps++;sfx.tone(380,0.09,"square",0.05,760)}
function die(why){if(me.dead)return;me.dead=true;me.deadAt=now0;stats.reason=why;shake=T*0.35;
  burst(PX+T/2,GROUND-me.y*T-T/2,34,["#25c75e","#4fffb0","#fff","#ffd60a"],T*9,1.2);sfx.noise(0.7,0.5,1800,80);sfx.tone(240,0.6,"sawtooth",0.12,50)}
function press(){held=true;jump()}
var KEYS={" ":"jump",ArrowUp:"jump",w:"jump",W:"jump",p:"pause",P:"pause",m:"mute",M:"mute"};
document.addEventListener("keydown",function(ev){
  if(ev.key==="Escape"||ev.keyCode===27){ev.preventDefault();close();return}
  var k=KEYS[ev.key];if(!k)return;ev.preventDefault();
  if(k==="jump"){if(!ev.repeat)press();return}if(ev.repeat)return;
  if(k==="mute")sfx.toggle();else if(k==="pause"&&state==="play"){paused=!paused;sfx.tone(paused?440:660,0.08,"triangle",0.06)}
});
document.addEventListener("keyup",function(ev){if(KEYS[ev.key]==="jump")held=false});
document.addEventListener("mousedown",function(ev){ev.preventDefault();press()});
document.addEventListener("mouseup",function(){held=false});
window.__dash={stats:stats,me:me,course:course,state:function(){return state},jump:jump,speed:function(){return speedAt(me.x)},best:BEST,
  world:{floor:solidBelow,side:hitsSide,spike:hitsSpike,speedAt:speedAt,G:G,V0:V0}};
// For checking the course can always be run: lay one more piece of it.
window.__dash.layMore=function(){lay()};
function pixelText(str,x,y,size,col,align){
  c.font="900 "+Math.round(size)+"px Menlo, Monaco, 'Courier New', monospace";c.textAlign=align||"left";c.textBaseline="top";
  c.fillStyle="#000";c.fillText(str,x+Math.max(2,size/8),y+Math.max(2,size/8));c.fillStyle=col;c.fillText(str,x,y);
}
function sx(x){return PX+(x-me.x)*T}
function drawSky(){var hue=(150+me.x*0.6)%360,g=c.createLinearGradient(0,0,0,GROUND);
  g.addColorStop(0,"hsla("+hue+",55%,14%,0.92)");g.addColorStop(1,"hsla("+((hue+40)%360)+",60%,24%,0.92)");c.fillStyle=g;c.fillRect(0,0,W,GROUND);
  c.fillStyle="hsla("+hue+",60%,60%,0.08)";var off=(me.x*T*0.3)%(T*3);for(var x=-off;x<W;x+=T*3)for(var y=T;y<GROUND-T;y+=T*3)c.fillRect(x+((y/T)%2)*T*1.5,y,T*1.2,T*1.2);
  c.fillStyle="#0b1a12";c.fillRect(0,GROUND,W,H-GROUND);c.fillStyle="#25c75e";c.fillRect(0,GROUND,W,Math.max(2,T*0.08));
  c.fillStyle="rgba(37,199,94,0.18)";var go=(me.x*T)%T;for(var gx=-go;gx<W;gx+=T)c.fillRect(gx,GROUND+T*0.3,Math.max(1,T*0.04),H-GROUND)}
function drawCourse(){for(var i=0;i<course.length;i++){var o=course[i],x=sx(o.x);if(x>W+T*8||x<-T*10)continue;
  if(o.t==="block"){var y=GROUND-(o.y+o.h)*T;c.fillStyle="#132a1f";c.fillRect(x,y,o.w*T,o.h*T);c.strokeStyle="#4fffb0";c.lineWidth=Math.max(2,T*0.07);c.strokeRect(x+1,y+1,o.w*T-2,o.h*T-2);
    c.fillStyle="rgba(79,255,176,0.15)";c.fillRect(x+T*0.15,y+T*0.15,o.w*T-T*0.3,T*0.12)}
  else{var by=GROUND-o.y*T;c.fillStyle="#ff6b6b";c.beginPath();c.moveTo(x+T*0.08,by);c.lineTo(x+T/2,by-T*0.92);c.lineTo(x+T*0.92,by);c.closePath();c.fill();
    c.fillStyle="#ffb3b3";c.beginPath();c.moveTo(x+T*0.5,by-T*0.92);c.lineTo(x+T*0.62,by-T*0.5);c.lineTo(x+T*0.5,by-T*0.5);c.closePath();c.fill()}}}
function drawBest(){if(BEST<=0)return;var x=sx(BEST);if(x<-T||x>W+T)return;
  for(var y=0,i=0;y<GROUND;y+=T*0.4,i++){c.fillStyle=i%2?"#111":"#fff";c.fillRect(x,y,T*0.2,T*0.4);c.fillStyle=i%2?"#fff":"#111";c.fillRect(x+T*0.2,y,T*0.2,T*0.4)}
  pixelText("BEST "+BEST,x+T*0.6,T*0.6,Math.max(12,T*0.42),"#ffd60a","left")}
function drawMe(){if(me.dead)return;var x=PX,y=GROUND-me.y*T-T;c.save();c.translate(x+T/2,y+T/2);c.rotate(me.rot);
  c.fillStyle="#25c75e";c.fillRect(-T/2,-T/2,T,T);c.fillStyle="#0e2a1b";c.fillRect(-T*0.32,-T*0.32,T*0.64,T*0.64);
  c.fillStyle="#4fffb0";c.fillRect(-T*0.18,-T*0.18,T*0.36,T*0.36);c.strokeStyle="#fff";c.lineWidth=Math.max(1,T*0.05);c.strokeRect(-T/2,-T/2,T,T);c.restore();
  if(me.on&&Math.random()<0.6)parts.push({x:x,y:GROUND-me.y*T-2,vx:-T*4,vy:-rnd(0,T*2),life:0.3,max:0.3,size:T*0.12,col:"#4fffb0"})}
function drawHud(){var size=Math.max(14,T*0.55),pad=T*0.4;
  pixelText(String(stats.score),pad,pad,size*1.5,"#fff","left");
  pixelText("BEST "+Math.max(BEST,stats.score),W-pad,pad,size*0.75,"#ffd60a","right");
  pixelText((sfx.muted()?"M SOUND ON":"M MUTES")+"   P PAUSE   ESC QUIT",W-pad,pad+size,size*0.5,"rgba(255,255,255,0.7)","right")}
function drawIntro(t){if(t>1800)return;var a=t>1400?1-(t-1400)/400:1,big=Math.max(22,T*1.1);
  c.save();c.globalAlpha=a;pixelText("DASH",W/2,H*0.22,big,"#25c75e","center");
  pixelText("SPACE, UP OR CLICK TO JUMP. HOLD TO KEEP JUMPING.",W/2,H*0.22+big*1.5,Math.max(12,big*0.38),"#fff","center");c.restore()}
function drawEnd(t){var k=Math.min(1,(t-endAt)/250),bw=Math.min(W*0.8,T*14),bh=Math.max(140,T*4.6),bx=W/2-bw/2,by=H*0.36-bh/2;
  c.save();c.globalAlpha=k;c.fillStyle="rgba(10,12,30,0.92)";c.fillRect(bx,by,bw,bh);c.strokeStyle="#25c75e";c.lineWidth=Math.max(3,T*0.1);c.strokeRect(bx,by,bw,bh);
  var big=Math.max(18,Math.min(T,bw/12));
  pixelText(stats.reason,W/2,by+bh*0.12,big,"#ff6b6b","center");
  pixelText("DISTANCE "+stats.score,W/2,by+bh*0.12+big*1.5,big,"#ffd60a","center");
  pixelText(beat?"NEW BEST!":BEST>0?"BEST "+BEST:stats.jumps+" JUMPS",W/2,by+bh*0.12+big*2.9,Math.max(12,big*0.5),beat?"#ffd60a":"#fff","center");c.restore()}
// The beat: a kick on every beat, a hat between, a bass line; quicker as the run speeds up.
var BASS=[110,110,131,98,110,147,131,98],step=0,beatNext=0;
function music(now){if(now<beatNext)return;var spb=60/(110+60*kOf(me.x))*1000/2;beatNext=now+spb;
  if(step%2===0){sfx.tone(120,0.14,"sine",0.22,45);sfx.tone(BASS[(step/2)%8],0.22,"triangle",0.08)}else sfx.noise(0.05,0.06,9000,6000);step++}
var start=performance.now(),last=start,now0=start;
while(built<LEAD+80)lay();
function frame(now){
  if(closed)return;
  var t=now-start,dt=Math.min(0.04,(now-last)/1000);last=now;now0=now;
  if(state==="play"&&!paused&&!me.dead){
    var s=speedAt(me.x);me.x+=s*dt;
    while(built<me.x+80)lay();
    while(course.length&&course[0].x+(course[0].w||1)<me.x-12)course.shift();
    var floor=solidBelow(me.x,me.y);
    if(!me.on){me.vy-=G*dt;me.y+=me.vy*dt;me.rot+=dt*SPIN;
      if(me.y<=floor){me.y=floor;me.vy=0;me.on=true;me.rot=Math.round(me.rot/(Math.PI/2))*(Math.PI/2);sfx.tone(180,0.03,"square",0.04);if(held)jump()}}
    else if(me.y>floor+0.01){me.on=false;me.vy=0}
    if(hitsSpike(me.x,me.y))die("SPIKED!");else if(hitsSide(me.x,me.y))die("CRASHED!");
    var d=Math.floor(me.x);if(d>stats.score){stats.score=d;if(d%5===0)postScore(d);
      if(BEST>0&&!beat&&d>BEST){beat=true;beatAt=now;sfx.notes([[784,0.08,0],[988,0.08,0.08],[1319,0.24,0.16]],"triangle",0.1)}}
    if(t>600)music(now);
  }
  if(state==="play"&&me.dead&&now-me.deadAt>900){state="end";endAt=t;postScore(stats.score);
    if(beat)sfx.notes([[523,0.12,0],[659,0.12,0.12],[784,0.12,0.24],[1047,0.35,0.36]]);else sfx.notes([[392,0.2,0],[330,0.2,0.2],[262,0.45,0.4]],"triangle",0.14)}
  c.clearRect(0,0,W,H);
  c.save();if(shake>0){c.translate((Math.random()-0.5)*shake,(Math.random()-0.5)*shake);shake=Math.max(0,shake-dt*T*2)}
  drawSky();drawBest();drawCourse();drawMe();
  for(var i=parts.length-1;i>=0;i--){var p=parts[i];if(!paused){p.life-=dt;p.vy+=T*20*dt;p.x+=p.vx*dt;p.y+=p.vy*dt}if(p.life<=0){parts.splice(i,1);continue}
    c.globalAlpha=Math.max(0,p.life/p.max);c.fillStyle=p.col;c.fillRect(p.x,p.y,p.size,p.size);c.globalAlpha=1}
  c.restore();
  drawHud();drawIntro(t);
  if(now-beatAt<1400){c.save();c.globalAlpha=Math.min(1,(1400-(now-beatAt))/300);pixelText("NEW BEST!",W/2,H*0.16,Math.max(20,T*0.9),"#ffd60a","center");c.restore()}
  if(paused)pixelText("PAUSED",W/2,H*0.4,Math.max(20,T),"#fff","center");
  if(state==="end"){drawEnd(t);if(t-endAt>=ENDMS){close();return}}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
</${'script'}>
</body></html>`
}

export const dash: Game = {
  name: 'dash',
  title: 'Dash',
  build: dripDash,
  safetyMs: DASH_SAFETY_MS,
}
