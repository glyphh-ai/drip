// chickn: a pixel chicken hops lane by lane up an endless world that scrolls
// under it, over Claude's window: grass with trees in the way, roads of cars
// and trucks that whoosh past, rivers crossed on creaking logs, and rail
// lines whose light rings before a train screams through. Arrows or WASD hop
// (a click hops toward it too). A car, a train, the water or a log carrying
// the chicken off the edge ends the game; so does dawdling, once the world
// creeps past it. The score is the farthest lane reached, and the top score
// is drawn across its lane as the line to beat. The farther it goes, the
// harder it gets: faster, denser traffic, shorter logs, more trains, and a
// world that creeps faster.
//
// A game (./game.ts): `(w, h, best) => html`. The overlay
// takes clicks and keys for it (overlay.ts, `interactive`) and hears its score
// (GAME_SCORE). It closes itself with the drip close signal after a short end
// screen, at once on Esc, and at the overlay's cap (CHICKN_SAFETY_MS).

import type { Game } from './game.ts'
import { CLOSE_SIGNAL as CLOSE, GAME_SCORE, GAME_SOUND } from './shared.ts'

/** How a game ramps up with distance: a lane's difficulty is
 *  1 - e^(-lane / this), 0 at the start, approaching 1 without settling. */
export const CHICKN_RAMP_LANES = 40
/** How long the end screen stays, in ms. */
export const CHICKN_END_MS = 2_600
/** The backstop: as long as the overlay ever stays (30 minutes). */
export const CHICKN_SAFETY_MS = 30 * 60_000
/** How long one hop takes, in ms. */
export const CHICKN_HOP_MS = 130
/** The safe grass lanes the chicken starts on. */
export const CHICKN_START_LANES = 3
/** How long a rail line's bell rings before its train, in ms. */
export const CHICKN_TRAIN_WARN_MS = 1_100
/** A train's speed, in tiles a second: it flies by. */
export const CHICKN_TRAIN_SPEED = 40

/** How hard lane `lane` is, from 0 towards 1. */
export function chicknDifficulty(lane: number): number {
  return lane > 0 ? 1 - Math.exp(-lane / CHICKN_RAMP_LANES) : 0
}

export type ChicknTuning = {
  /** A car's base speed, in tiles a second; each road varies it. */
  carSpeed: number
  /** The least room between two cars, in tiles. */
  carGap: number
  /** A log's base speed, in tiles a second. */
  logSpeed: number
  /** A log's usual length, in tiles. */
  logLength: number
  /** The widest water between two logs, in tiles. */
  logGap: number
  /** Seconds between trains on a rail line, on average. */
  trainEveryS: number
  /** How fast the world creeps forward on its own, in lanes a second. */
  creep: number
  /** The share of new lanes that are roads, rivers and rail lines (the rest grass). */
  road: number
  river: number
  rail: number
}

/** How a lane plays at difficulty `k`, 0 to 1. The page reckons the same from
 *  the two ends it is given. */
export function chicknTuning(k: number): ChicknTuning {
  k = Math.min(1, Math.max(0, Number.isFinite(k) ? k : 0))
  return {
    carSpeed: +(1.6 + 4.4 * k).toFixed(3),
    carGap: +(5 - 2.6 * k).toFixed(3),
    logSpeed: +(0.8 + 1.8 * k).toFixed(3),
    logLength: +(4 - 2 * k).toFixed(3),
    logGap: +(2 + 1.5 * k).toFixed(3),
    trainEveryS: +(9 - 5 * k).toFixed(3),
    creep: +(0.12 + 0.5 * k).toFixed(3),
    road: +(0.34 + 0.14 * k).toFixed(3),
    river: +(0.16 + 0.08 * k).toFixed(3),
    rail: +(0.06 + 0.08 * k).toFixed(3),
  }
}

export function dripChickn(w: number, h: number, best = 0): string {
  const top = Number.isInteger(best) && best > 0 ? best : 0
  return `<html><head><style>
*{margin:0;padding:0}
html,body{width:${w}px;height:${h}px;overflow:hidden;background:rgba(0,0,0,0);user-select:none;-webkit-user-select:none}
canvas{position:absolute;left:0;top:0;image-rendering:pixelated}
</style></head><body>
<canvas id="c" width="${w}" height="${h}"></canvas>
<script>
(function(){
var W=${w},H=${h},BEST=${top},ENDMS=${CHICKN_END_MS},HOP=${CHICKN_HOP_MS},START=${CHICKN_START_LANES},WARN=${CHICKN_TRAIN_WARN_MS};
var RAMP=${CHICKN_RAMP_LANES},TRAINSPEED=${CHICKN_TRAIN_SPEED},E0=${JSON.stringify(chicknTuning(0))},E1=${JSON.stringify(chicknTuning(1))};
var c=document.getElementById("c").getContext("2d");
${GAME_SOUND}
${GAME_SCORE}
// How hard a lane is (chicknDifficulty), and how it plays (chicknTuning).
function kOf(lane){return lane>0?1-Math.exp(-lane/RAMP):0}
function tune(k){var o={};for(var key in E0)o[key]=E0[key]+(E1[key]-E0[key])*k;return o}
var T=Math.max(24,Math.floor(H/12)),COLS=Math.max(7,Math.floor(W/T)),OX=Math.floor((W-COLS*T)/2),ROWS=Math.ceil(H/T)+2,D=Math.max(3,Math.round(T*0.16)),PX=T/10;
var INTRO=1600,beat=false,beatAt=-1e9;
var lanes={},runType="grass",runLeft=0,safe=Math.floor(COLS/2),riverDir=1;
var player={x:Math.floor(COLS/2),row:0,face:1,hop:null,bump:0,dead:null,deadAt:0};
var stats={score:0,hops:0,reason:""};
var state="play",endAt=0,closed=false,cam=-2,shake=0,now0=0,parts=[];
var CARS=["#e74c3c","#f1c40f","#3498db","#9b59b6","#1abc9c","#e67e22","#ecf0f1"];
function rnd(a,b){return a+Math.random()*(b-a)}
function close(){if(closed)return;closed=true;c.clearRect(0,0,W,H);${CLOSE}}
// Lanes, made as the world reaches them. A run of one kind, then another.
function nextType(t,d){
  if(runLeft>0){runLeft--;return runType}
  var r=Math.random(),k;
  if(r<t.road){k="road";runLeft=Math.floor(rnd(1,4.25+2.25*d))}
  else if(r<t.road+t.river){k="river";runLeft=Math.floor(rnd(1,3.2+1.8*d))}
  else if(r<t.road+t.river+t.rail){k="rail";runLeft=1}
  else{k="grass";runLeft=Math.floor(rnd(1,3))}
  runType=k;runLeft--;return k;
}
function movers(len,gap,speed,dir,maxLen){
  var list=[],x=rnd(0,gap);
  while(x<COLS+4){var l=len+Math.floor(Math.random()*(maxLen-len+1));list.push({x:x-2,len:l,col:CARS[Math.floor(Math.random()*CARS.length)]});x+=l+gap*rnd(1,1.8)}
  return{list:list,span:Math.max(COLS+4,x),speed:speed,dir:dir};
}
function makeLane(i){
  var d=kOf(i),tn=tune(d),type=i<START?"grass":nextType(tn,d),lane={type:type,row:i};
  if(type==="grass"){
    var after=lanes[i-1]&&lanes[i-1].type==="river",p=i<START?0:after?0.08:0.2,trees=[];
    for(var x=0;x<COLS;x++)trees.push(Math.random()<p);
    // A way through: the safe column, and its step aside, stay clear.
    var was=safe;safe=Math.max(0,Math.min(COLS-1,safe+Math.floor(rnd(-1,2))));
    trees[was]=false;trees[safe]=false;if(i===0)trees[player.x]=false;
    lane.trees=trees;
  }else if(type==="road"){
    var dir=Math.random()<0.5?1:-1,big=Math.random()<0.3;
    lane.m=movers(big?2:1,tn.carGap,tn.carSpeed*rnd(0.7,1.35)*(big?0.8:1),dir,big?3:1);
  }else if(type==="river"){
    riverDir=-riverDir;
    var len=Math.round(tn.logLength);lane.m=movers(Math.max(2,len-1),tn.logGap,tn.logSpeed*rnd(0.75,1.25),riverDir,len+1);
  }else{
    lane.dir=Math.random()<0.5?1:-1;lane.train=null;lane.every=tn.trainEveryS*1000;lane.next=now0+rnd(0.3,1.2)*lane.every;
  }
  lanes[i]=lane;return lane;
}
function lane(i){return lanes[i]||makeLane(i)}
function step(m,dt){for(var j=0;j<m.list.length;j++){var o=m.list[j];o.x+=m.dir*m.speed*dt;
  if(m.dir>0&&o.x>COLS+2)o.x-=m.span;else if(m.dir<0&&o.x+o.len<-2)o.x+=m.span}}
function under(m,x){for(var j=0;j<m.list.length;j++){var o=m.list[j];if(x+0.5>=o.x&&x+0.5<=o.x+o.len)return o}return null}
function hits(m,x){for(var j=0;j<m.list.length;j++){var o=m.list[j];if(x+0.82>o.x&&x+0.18<o.x+o.len)return true}return false}
function burst(x,y,n,cols,speed,life,g){for(var i=0;i<n;i++){var a=Math.random()*Math.PI*2,v=speed*(0.3+Math.random());
  parts.push({x:x,y:y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-speed*0.5,life:life,max:life,size:PX*(1+Math.random()*1.5),col:cols[i%cols.length],g:g})}}
// Cars and trains going past the chicken: a whoosh as each one crosses its
// column, louder the nearer the lane; a train screams by, its pitch falling.
function passBy(ln){
  if(state!=="play"||player.dead)return;
  var d=Math.abs(ln.row-player.row),px=player.x+0.5;
  if(ln.type==="road"&&d<=2){for(var j=0;j<ln.m.list.length;j++){var o=ln.m.list[j],mid=o.x+o.len/2,side=mid>px?1:-1;
    if(o.side!==undefined&&o.side!==side&&Math.abs(mid-px)<3){var v=0.2/(1+d*1.5);
      sfx.noise(0.25+0.08*o.len,v,2400,500);sfx.tone(o.len>1?120:170,0.3,"sawtooth",v*0.35,o.len>1?85:120)}
    o.side=side}}
  if(ln.type==="rail"&&ln.train&&d<=4){var tr=ln.train,front=ln.dir>0?tr.x+tr.len:tr.x,fs=front>px?1:-1;
    if(tr.side!==undefined&&tr.side!==fs){var tv=0.55/(1+d*0.6);
      sfx.noise(0.9,tv,4200,160);sfx.tone(900,0.75,"sawtooth",tv*0.18,230);sfx.tone(1200,0.6,"square",tv*0.06,300)}
    tr.side=fs}
}
function sx(x){return OX+x*T}
function sy(row){return H-(row-cam+1)*T}
function die(why){
  if(player.dead)return;
  // Mid-hop, it falls where it was headed.
  if(player.hop){player.x=player.hop.tx;player.row=player.hop.tr;player.hop=null}
  player.dead=why;player.deadAt=now0;stats.reason=why;shake=T*0.4;
  var px=sx(player.x)+T/2,py=sy(player.row)+T/2;
  if(why==="SPLAT!"){sfx.noise(0.35,0.45,1600,200);sfx.tone(320,0.4,"sawtooth",0.12,60);sfx.tone(370,0.2,"square",0.06,0,0.08)}
  else if(why==="CHOO CHOO!"){sfx.noise(0.6,0.5,1200,150);sfx.tone(260,0.5,"sawtooth",0.14,50)}
  else if(why==="SPLASH!"){sfx.noise(0.8,0.4,2600,250)}
  else if(why==="SWEPT AWAY!"){sfx.noise(0.7,0.3,1800,300);sfx.tone(600,0.6,"triangle",0.1,150)}
  else{sfx.tone(2300,0.55,"sawtooth",0.07,800);sfx.tone(1900,0.4,"sawtooth",0.05,700,0.2)}
  if(why==="SPLASH!")burst(px,py,26,["#fff","#a6e3ff","#3fa9f5"],T*0.12,700,T*0.012);
  else burst(px,py,30,["#fff","#ecf0f1","#e74c3c","#f39c12"],T*0.14,800,T*0.01);
}
// A hop: one lane up or down, or one column across; blocked by trees and the edges.
function hop(dc,dr){
  if(state!=="play"||closed||player.dead)return false;
  if(player.hop){player.queued=[dc,dr];return false}
  var row=player.row+dr,from=lane(player.row),to=lane(row);
  var x=to.type==="river"?player.x+dc:Math.round(player.x)+dc;
  if(dc!==0)player.face=dc;
  if(row<Math.floor(cam)||x<-0.25||x>COLS-0.75){player.bump=now0;sfx.tone(130,0.06,"square",0.06);return false}
  if(to.type==="grass"&&to.trees[Math.round(x)]){player.bump=now0;sfx.tone(130,0.06,"square",0.06);return false}
  player.hop={fx:player.x,fr:player.row,tx:x,tr:row,t:0};
  stats.hops++;sfx.tone(dr<0?420:480,0.07,"square",0.05,dr<0?600:760);return true;
}
document.addEventListener("keydown",function(ev){
  var k=ev.key;
  if(k==="Escape"||ev.keyCode===27){ev.preventDefault();close();return}
  if(ev.repeat)return;
  if(k==="m"||k==="M"){sfx.toggle();return}
  if(k==="ArrowUp"||k==="w"||k==="W"||k===" "){ev.preventDefault();hop(0,1)}
  else if(k==="ArrowDown"||k==="s"||k==="S"){ev.preventDefault();hop(0,-1)}
  else if(k==="ArrowLeft"||k==="a"||k==="A"){ev.preventDefault();hop(-1,0)}
  else if(k==="ArrowRight"||k==="d"||k==="D"){ev.preventDefault();hop(1,0)}
});
document.addEventListener("mousedown",function(ev){
  ev.preventDefault();
  var dx=ev.clientX-(sx(player.x)+T/2),dy=(sy(player.row)+T/2)-ev.clientY;
  if(Math.abs(dy)>=Math.abs(dx))hop(0,dy>=0?1:-1);else hop(dx>0?1:-1,0);
});
window.__chickn={stats:stats,player:player,lanes:lanes,hop:hop,lane:lane,state:function(){return state},cols:COLS,best:BEST};
function pixelText(str,x,y,size,col,align){
  c.font="900 "+Math.round(size)+"px Menlo, Monaco, 'Courier New', monospace";c.textAlign=align||"left";c.textBaseline="top";
  c.fillStyle="#000";c.fillText(str,x+Math.max(2,size/8),y+Math.max(2,size/8));c.fillStyle=col;c.fillText(str,x,y);
}
// A block seen from above and a little in front: its top, and a darker face below.
function block(x,y,w,hgt,top,face){c.fillStyle=face;c.fillRect(x,y+hgt-D,w,D);c.fillStyle=top;c.fillRect(x,y,w,hgt-D)}
function drawLane(ln){
  var y=sy(ln.row);
  if(ln.type==="grass"){
    c.fillStyle=ln.row%2?"#8bd36b":"#80ca60";c.fillRect(0,y,W,T);
    c.fillStyle="#74bd55";for(var gx=(ln.row*37)%5;gx<COLS;gx+=5)c.fillRect(sx(gx)+T*0.3,y+T*0.4,PX,PX);
  }else if(ln.type==="road"){
    c.fillStyle="#4a4f5c";c.fillRect(0,y,W,T);
    var up=lanes[ln.row+1];
    if(up&&up.type==="road"){c.fillStyle="#c9ced6";for(var dx=OX%(T*2);dx<W;dx+=T*2)c.fillRect(dx,y-PX/2,T,PX)}
    else{c.fillStyle="#3d414c";c.fillRect(0,y,W,PX)}
  }else if(ln.type==="river"){
    c.fillStyle="#3fa9f5";c.fillRect(0,y,W,T);
    c.fillStyle="#7cc7fa";var off=(now0*0.02*ln.m.dir)%(T*3);
    for(var wx=-T*3+off;wx<W+T*3;wx+=T*3)c.fillRect(wx,y+T*((ln.row%3)*0.2+0.25),T*0.8,PX);
  }else{
    c.fillStyle="#7d6e63";c.fillRect(0,y,W,T);
    c.fillStyle="#5d4037";for(var tx=OX%(T/2);tx<W;tx+=T/2)c.fillRect(tx,y+T*0.15,PX*1.5,T*0.7);
    c.fillStyle="#c0c6cc";c.fillRect(0,y+T*0.28,W,PX);c.fillRect(0,y+T*0.66,W,PX);
  }
}
function drawThings(ln){
  var y=sy(ln.row);
  if(ln.type==="grass"){
    for(var x=0;x<COLS;x++)if(ln.trees[x]){
      var tx=sx(x);c.fillStyle="#6d4c2f";c.fillRect(tx+T*0.4,y+T*0.55,T*0.2,T*0.4);
      block(tx+T*0.12,y-T*0.25,T*0.76,T*0.85,"#59b64c","#2f7d2b");
      c.fillStyle="#6fcf5f";c.fillRect(tx+T*0.2,y-T*0.18,T*0.25,PX);
    }
  }else if(ln.type==="road"){
    for(var j=0;j<ln.m.list.length;j++){var o=ln.m.list[j],ox=sx(o.x),ow=o.len*T;
      c.fillStyle="#222";c.fillRect(ox+T*0.15,y+T*0.72,T*0.22,T*0.2);c.fillRect(ox+ow-T*0.37,y+T*0.72,T*0.22,T*0.2);
      block(ox+PX,y+T*0.12,ow-PX*2,T*0.68,o.col,"rgba(0,0,0,0.45)");
      c.fillStyle="rgba(0,0,0,0.25)";c.fillRect(ox+PX,y+T*0.12+T*0.68-D,ow-PX*2,D);
      c.fillStyle="#bfe3ff";var wx=ln.m.dir>0?ox+ow-T*0.5:ox+T*0.18;c.fillRect(wx,y+T*0.2,T*0.32,T*0.32);
      if(o.len>1){c.fillStyle="rgba(255,255,255,0.25)";c.fillRect(ox+T*0.2,y+T*0.2,ow-T*0.9,T*0.1)}
    }
  }else if(ln.type==="river"){
    for(var k=0;k<ln.m.list.length;k++){var g=ln.m.list[k];
      block(sx(g.x)+PX,y+T*0.15,g.len*T-PX*2,T*0.75,"#a86f43","#6b4226");
      c.fillStyle="#8d5a33";for(var r=1;r<g.len;r++)c.fillRect(sx(g.x)+r*T-PX/2,y+T*0.2,PX,T*0.5);
    }
  }else{
    var lit=ln.warn&&Math.floor(now0/150)%2===0;
    c.fillStyle="#2d3436";c.fillRect(sx(COLS-1)+T*0.7,y-T*0.4,PX*1.5,T*0.9);
    c.fillStyle=lit?"#ff3b30":"#5a1f1b";c.fillRect(sx(COLS-1)+T*0.6,y-T*0.55,T*0.35,T*0.3);
    if(ln.train){var tr=ln.train,trx=sx(tr.x);
      block(trx,y+T*0.05,tr.len*T,T*0.85,"#d63031","#8e1f20");
      c.fillStyle="#ffeaa7";for(var cx=0;cx<tr.len;cx+=1.5)c.fillRect(trx+cx*T+T*0.3,y+T*0.2,T*0.5,T*0.25);
      c.fillStyle="#2d3436";for(var cg=3;cg<tr.len;cg+=3)c.fillRect(trx+cg*T,y+T*0.05,PX,T*0.85);
    }
  }
}
// The chicken: 10 by 10 pixels, facing right, flipped to face left.
var CHICK=[
"....rr....",
"...rrr....",
"..wwwwww..",
"..wwwwewbb",
"..wwwwwwb.",
"wwwwwwww..",
"wwwwwwww..",
".wwwwwww..",
"..wwwww...",
"...o..o..."];
var CHCOL={r:"#e74c3c",w:"#ffffff",e:"#111",b:"#f39c12",o:"#e67e22"};
function drawChicken(x,y,lift,squash,flat){
  var px=PX,cx=x,cy=y-lift;
  c.fillStyle="rgba(0,0,0,0.22)";c.fillRect(x+T*0.15,y+T*0.82,T*0.7,T*0.12);
  if(flat){c.fillStyle="#fff";c.fillRect(x+T*0.05,y+T*0.6,T*0.9,T*0.25);c.fillStyle="#e74c3c";c.fillRect(x+T*0.4,y+T*0.55,T*0.2,PX);c.fillStyle="#f39c12";c.fillRect(x+T*0.85,y+T*0.66,PX*1.5,PX);return}
  var sh=1-squash;
  for(var r=0;r<10;r++)for(var k=0;k<10;k++){var ch=CHICK[r][player.face>0?k:9-k];if(ch===".")continue;
    c.fillStyle=CHCOL[ch];c.fillRect(cx+k*px,cy+T*(1-sh)+r*px*sh,px+0.5,px*sh+0.5)}
  c.fillStyle="#dfe6e9";c.fillRect(cx+(player.face>0?2:4)*px,cy+T*(1-sh)+6*px*sh,px*4,px*sh);
}
function drawHud(){
  var size=Math.max(14,T*0.55),pad=Math.max(10,T*0.4);
  pixelText(String(stats.score),pad,pad,size*1.6,"#fff","left");
  pixelText("BEST "+Math.max(BEST,stats.score),W-pad,pad,size*0.7,"#ffd60a","right");
  pixelText((sfx.muted()?"M SOUND ON":"M MUTES")+"   ESC TO QUIT",W-pad,pad+size,size*0.55,"rgba(255,255,255,0.8)","right");
}
function drawIntro(t){
  if(t>INTRO+400)return;var a=t>INTRO?1-(t-INTRO)/400:1,big=Math.max(20,T*0.9);
  c.save();c.globalAlpha=a;
  pixelText("CHICKN",W/2,H*0.3,big,"#ffd60a","center");
  pixelText("ARROWS OR WASD TO HOP. CLICK WORKS TOO. M MUTES. ESC TO QUIT.",W/2,H*0.3+big*1.6,Math.max(12,big*0.45),"#fff","center");
  c.restore();
}
function drawEnd(t){
  var k=Math.min(1,(t-endAt)/250),bw=Math.min(W*0.8,T*14),bh=Math.max(140,T*4.6),bx=W/2-bw/2,by=H*0.4-bh/2;
  c.save();c.globalAlpha=k;c.fillStyle="rgba(10,12,30,0.9)";c.fillRect(bx,by,bw,bh);c.strokeStyle="#ffd60a";c.lineWidth=Math.max(3,PX);c.strokeRect(bx,by,bw,bh);
  var big=Math.max(18,Math.min(T,bw/12));
  pixelText(stats.reason,W/2,by+bh*0.12,big,"#ff6b6b","center");
  pixelText("SCORE "+stats.score,W/2,by+bh*0.12+big*1.5,big,"#ffd60a","center");
  pixelText(beat?"NEW BEST!":BEST>0?"BEST "+BEST:"HOP FARTHER NEXT TIME.",W/2,by+bh*0.12+big*2.9,Math.max(12,big*0.5),beat?"#ffd60a":"#fff","center");
  c.restore();
}
function endTune(){
  if(beat)sfx.notes([[523,0.12,0],[659,0.12,0.12],[784,0.12,0.24],[1047,0.35,0.36]]);
  else sfx.notes([[392,0.2,0],[330,0.2,0.2],[262,0.45,0.4]],"triangle",0.14)}
// The line to beat: a chequered band across the top of the best lane.
function drawBest(){
  if(BEST<=0)return;var y=sy(BEST)-PX;if(y<-T||y>H)return;
  for(var x=0,i=0;x<W;x+=PX*2,i++){c.fillStyle=i%2?"#111":"#fff";c.fillRect(x,y,PX*2,PX);c.fillStyle=i%2?"#fff":"#111";c.fillRect(x,y+PX,PX*2,PX)}
  pixelText("BEST "+BEST,OX+PX*2,y-T*0.45,Math.max(12,T*0.35),"#ffd60a","left");
}
function drawBeat(now){
  if(now-beatAt>1400)return;var a=Math.min(1,(1400-(now-beatAt))/300);
  c.save();c.globalAlpha=a;pixelText("NEW BEST!",W/2,H*0.18,Math.max(20,T*0.8),"#ffd60a","center");c.restore();
}
var start=performance.now(),last=start;
sfx.notes([[523,0.08,0],[659,0.08,0.09],[784,0.08,0.18],[659,0.08,0.27],[784,0.2,0.36]]);
function frame(now){
  if(closed)return;
  var t=now-start,dts=Math.min(40,now-last)/1000;last=now;now0=now;
  var top=Math.ceil(cam)+ROWS;
  for(var i=Math.floor(cam)-1;i<=top;i++)lane(i);
  for(var key in lanes){var ln=lanes[key];
    if(ln.row<cam-4){delete lanes[key];continue}
    if(ln.m)step(ln.m,dts);
    if(ln.type==="rail"){
      var seen=ln.row>=cam-1&&ln.row<=cam+ROWS&&state==="play";
      if(!ln.train&&now>=ln.next-WARN)ln.warn=true;
      if(ln.warn&&seen&&now-(ln.ding||0)>=260){ln.ding=now;sfx.tone(1568,0.12,"triangle",0.06)}
      if(!ln.train&&now>=ln.next){ln.train={x:ln.dir>0?-16:COLS+2,len:14};
        if(seen){sfx.tone(311,0.7,"sawtooth",0.06);sfx.tone(392,0.7,"sawtooth",0.05);sfx.noise(1.4,0.22,500,120)}}
      if(ln.train){ln.train.x+=ln.dir*TRAINSPEED*dts;
        if((ln.dir>0&&ln.train.x>COLS+2)||(ln.dir<0&&ln.train.x+ln.train.len<-2)){ln.train=null;ln.warn=false;ln.next=now+ln.every*rnd(0.6,1.4)}}
    }
    passBy(ln);
  }
  if(state==="play"&&!player.dead){
    var h0=player.hop;
    if(h0){h0.t+=dts*1000/HOP;
      var hk=Math.min(1,h0.t);player.x=h0.fx+(h0.tx-h0.fx)*hk;
      if(hk>=0.5)player.row=h0.tr;
      if(hk>=1){player.hop=null;player.x=h0.tx;player.row=h0.tr;
        if(player.row>stats.score){stats.score=player.row;postScore(stats.score);
          if(BEST>0&&!beat&&stats.score>BEST){beat=true;beatAt=now;sfx.notes([[784,0.08,0],[988,0.08,0.08],[1319,0.24,0.16]],"triangle",0.11)}
          else if(stats.score%10===0)sfx.notes([[784,0.08,0],[1175,0.16,0.08]],"triangle",0.1)}
        var q=player.queued;player.queued=null;
        var land=lane(player.row);
        if(land.type==="river"&&!under(land.m,player.x))die("SPLASH!");
        // A log creaks under the chicken like a door on old hinges.
        else if(land.type==="river"){sfx.tone(340,0.26,"sawtooth",0.045,230);sfx.tone(250,0.22,"square",0.025,430,0.08)}
        else if(q)hop(q[0],q[1]);
      }
    }
    var here=lane(player.row);
    if(!player.dead&&here.type==="river"&&!player.hop){var lg=under(here.m,player.x);
      if(lg){player.x+=here.m.dir*here.m.speed*dts;if(player.x<-0.6||player.x>COLS-0.4)die("SWEPT AWAY!")}else die("SPLASH!")}
    if(!player.dead&&here.type==="road"&&hits(here.m,player.x))die("SPLAT!");
    if(!player.dead&&here.type==="rail"&&here.train&&player.x+0.82>here.train.x&&player.x+0.18<here.train.x+here.train.len)die("CHOO CHOO!");
    var want=player.row-3;
    if(want>cam)cam+=Math.min(want-cam,(want-cam)*dts*4+dts*0.5);
    if(t>INTRO)cam+=tune(kOf(stats.score)).creep*dts;
    if(!player.dead&&player.row<cam-0.35)die("TOO SLOW!");
  }
  if(state==="play"&&player.dead&&now-player.deadAt>900){state="end";endAt=t;endTune()}
  c.clearRect(0,0,W,H);
  c.save();if(shake>0){c.translate((Math.random()-0.5)*shake,(Math.random()-0.5)*shake);shake=Math.max(0,shake-dts*T*1.2)}
  var rows=[];for(var r=Math.floor(cam)-1;r<=top;r++)if(lanes[r])rows.push(lanes[r]);
  for(var a=0;a<rows.length;a++)drawLane(rows[a]);
  for(var b=rows.length-1;b>=0;b--){drawThings(rows[b]);
    if(rows[b].row===player.row&&!(player.dead==="SPLASH!")){
      var hp=player.hop,lift=hp?Math.sin(Math.min(1,hp.t)*Math.PI)*T*0.35:0,bump=now0-player.bump<120?0.15:0;
      var yy=hp?sy(hp.fr)+(sy(hp.tr)-sy(hp.fr))*Math.min(1,hp.t):sy(player.row);
      drawChicken(sx(player.x),yy,lift,hp?0:bump,player.dead==="SPLAT!"||player.dead==="CHOO CHOO!")}}
  drawBest();
  for(var p=parts.length-1;p>=0;p--){var pt=parts[p];pt.life-=dts*1000;if(pt.life<=0){parts.splice(p,1);continue}
    pt.x+=pt.vx;pt.y+=pt.vy;pt.vy+=pt.g;c.globalAlpha=pt.life/pt.max;c.fillStyle=pt.col;c.fillRect(pt.x,pt.y,pt.size,pt.size);c.globalAlpha=1}
  c.restore();
  drawHud();drawIntro(t);drawBeat(now);
  if(state==="end"){drawEnd(t);if(t-endAt>=ENDMS){close();return}}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
</${'script'}>
</body></html>`
}

export const chickn: Game = {
  name: 'chickn',
  title: 'Chickn',
  build: dripChickn,
  safetyMs: CHICKN_SAFETY_MS,
  aliases: ['chicken'],
}
