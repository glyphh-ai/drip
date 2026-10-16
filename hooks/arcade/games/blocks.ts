// blocks: falling blocks over Claude's window. Pieces of four squares fall
// into a well 12 wide; fill a row across and it clears. Left and right move
// (held, they slide), Up or X turns, Z turns back, Down drops faster, Space
// drops at once, C holds a piece for later, P pauses. A piece that cannot
// come in ends the game. The more rows cleared, the faster they fall, without
// end; clearing several at once, and dropping, scores more, and every row
// is worth more the faster it goes. A cleared row bursts into shards, and a
// piece landing shakes the well, harder the faster it came. The top score is
// the one to beat.
//
// Its look is its own: a 12-wide well, Glyphh's colours, tiles drawn as
// glyphs, and a mark on the floor where a piece will land.
//
// A game (./game.ts): `(w, h, best) => html`. The overlay
// takes clicks and keys for it (overlay.ts, `interactive`) and hears its score
// (GAME_SCORE). It closes itself with the drip close signal after a short end
// screen, at once on Esc, and at the overlay's cap (BLOCKS_SAFETY_MS).

import type { Game } from './game.ts'
import { CLOSE_SIGNAL as CLOSE, GAME_SCORE, GAME_SOUND } from './shared.ts'

/** The well: columns across, rows down. */
export const BLOCKS_COLS = 12
export const BLOCKS_ROWS = 20
/** How long the end screen stays, in ms. */
export const BLOCKS_END_MS = 2_600
/** The backstop: as long as the overlay ever stays (30 minutes). */
export const BLOCKS_SAFETY_MS = 30 * 60_000
/** A held Left or Right: the wait before it slides, then the time per step, in ms. */
export const BLOCKS_SLIDE_MS = [170, 50] as const
/** Down held: a row every this many ms (the first at once). */
export const BLOCKS_SOFT_MS = 40
/** The most a landing shakes the well, as a share of a tile (a cleared row
 *  may shake it a little more). A landing shakes it by 0.035 tiles times the
 *  square root of how fast it came, in rows a second: a piece at the opening
 *  speed barely moves it, a hard drop from the top hits the cap. */
export const BLOCKS_SHAKE_MAX = 0.22
/** How long a piece may rest on the stack before it locks, in ms. */
export const BLOCKS_LOCK_MS = 450

/** The pieces, each as its cells in a 4 by 4 box (turned by the page). */
export const BLOCKS_PIECES: Record<string, readonly (readonly [number, number])[]> = {
  I: [[0, 1], [1, 1], [2, 1], [3, 1]],
  O: [[1, 0], [2, 0], [1, 1], [2, 1]],
  T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]],
}

/** Glyphh's colours, one per piece: greens, teals and a warm accent. */
export const BLOCKS_COLOURS: Record<string, string> = {
  I: '#25c75e', O: '#f5c542', T: '#9b6dff', S: '#10a37f', Z: '#ff6b6b', J: '#48dbfb', L: '#ff9f43',
}

/** How fast pieces fall: a row every BLOCKS_FALL_MS at the start, each ten
 *  rows cleared taking it to BLOCKS_SPEEDUP of what it was, never under 45 ms. */
export const BLOCKS_FALL_MS = 800
export const BLOCKS_SPEEDUP = 0.82

/** How long a piece takes to fall one row after `lines` rows are cleared, in ms. */
export function blocksFallMs(lines: number): number {
  const n = Number.isFinite(lines) && lines > 0 ? lines : 0
  return Math.max(45, Math.round(BLOCKS_FALL_MS * Math.pow(BLOCKS_SPEEDUP, n / 10)))
}

/** What clearing `rows` at once is worth after `lines` rows: 100, 300, 500 or
 *  800, times one more for every ten rows cleared before. */
export function blocksLineScore(rows: number, lines: number): number {
  const base = [0, 100, 300, 500, 800][Math.max(0, Math.min(4, Math.floor(rows)))]!
  return base * (1 + Math.floor((Number.isFinite(lines) && lines > 0 ? lines : 0) / 10))
}

export function dripBlocks(w: number, h: number, best = 0): string {
  const top = Number.isInteger(best) && best > 0 ? best : 0
  return `<html><head><style>
*{margin:0;padding:0}
html,body{width:${w}px;height:${h}px;overflow:hidden;background:rgba(6,10,18,0.45);user-select:none;-webkit-user-select:none}
canvas{position:absolute;left:0;top:0}
</style></head><body>
<canvas id="c" width="${w}" height="${h}"></canvas>
<script>
(function(){
var W=${w},H=${h},BEST=${top},COLS=${BLOCKS_COLS},ROWS=${BLOCKS_ROWS},ENDMS=${BLOCKS_END_MS},LOCK=${BLOCKS_LOCK_MS};
var SLIDE0=${BLOCKS_SLIDE_MS[0]},SLIDE=${BLOCKS_SLIDE_MS[1]},SOFT=${BLOCKS_SOFT_MS},SHAKE=${BLOCKS_SHAKE_MAX},FALL0=${BLOCKS_FALL_MS},SPEEDUP=${BLOCKS_SPEEDUP};
var PIECES=${JSON.stringify(BLOCKS_PIECES)},COLOURS=${JSON.stringify(BLOCKS_COLOURS)};
var c=document.getElementById("c").getContext("2d");
${GAME_SOUND}
${GAME_SCORE}
var CELL=Math.max(12,Math.floor(Math.min(H*0.86/ROWS,W*0.5/COLS))),BW=COLS*CELL,BH=ROWS*CELL,BX=Math.floor((W-BW)/2),BY=Math.floor((H-BH)/2);
var grid=[];for(var r=0;r<ROWS;r++){grid.push([]);for(var k=0;k<COLS;k++)grid[r].push(null)}
var stats={score:0,lines:0,pieces:0};
var state="play",endAt=0,closed=false,paused=false,beat=false,beatAt=-1e9,flash=[],flashAt=-1e9,shake=0,parts=[];
function rnd(a,b){return a+Math.random()*(b-a)}
// A piece hitting the stack shakes the well: harder the faster it came, never much.
function impact(rowsPerS){shake=Math.max(shake,CELL*Math.min(SHAKE,0.035*Math.sqrt(rowsPerS)))}
// A cleared row bursts: shards in its tiles' colours fly out and fall, with sparks.
function explode(rows){for(var i=0;i<rows.length;i++){var y=BY+(rows[i].r+0.5)*CELL;for(var k=0;k<COLS;k++){var kind=rows[i].cells[k];if(!kind)continue;
  var x=BX+(k+0.5)*CELL,out=(k-COLS/2+0.5)/COLS;
  for(var j=0;j<5;j++)parts.push({x:x+rnd(-0.3,0.3)*CELL,y:y+rnd(-0.3,0.3)*CELL,vx:(rnd(-0.5,0.5)+out*1.6)*CELL*14,vy:-rnd(0.1,0.55)*CELL*26,g:CELL*80,
    life:rnd(600,1100),max:1100,size:CELL*rnd(0.14,0.34),col:COLOURS[kind],rot:rnd(0,6.3),vr:rnd(-12,12)});
  parts.push({x:x,y:y,vx:rnd(-1,1)*CELL*20,vy:rnd(-1,0.3)*CELL*20,g:0,life:rnd(250,450),max:450,size:CELL*0.12,col:"#fff",rot:0,vr:0})}}}
function drawParts(dt){for(var i=parts.length-1;i>=0;i--){var p=parts[i];p.life-=dt*1000;if(p.life<=0){parts.splice(i,1);continue}
  p.vy+=p.g*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.rot+=p.vr*dt;
  c.save();c.globalAlpha=Math.max(0,Math.min(1,p.life/p.max*1.5));c.translate(p.x,p.y);c.rotate(p.rot);c.fillStyle=p.col;c.fillRect(-p.size/2,-p.size/2,p.size,p.size);c.restore()}}
var bag=[],queue=[],held=null,canHold=true,cur=null,fallAt=0,restAt=0,slide={dir:0,next:0},soft=false;
function fallMs(){return Math.max(45,Math.round(FALL0*Math.pow(SPEEDUP,stats.lines/10)))}
function lineScore(n){return [0,100,300,500,800][n]*(1+Math.floor(stats.lines/10))}
function close(){if(closed)return;closed=true;c.clearRect(0,0,W,H);${CLOSE}}
// Seven pieces to a bag, shuffled: never a long wait for the one you need.
function draw(){if(!bag.length){bag=Object.keys(PIECES);for(var i=bag.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),t=bag[i];bag[i]=bag[j];bag[j]=t}}return bag.pop()}
while(queue.length<3)queue.push(draw());
function cellsOf(p){var out=[],base=PIECES[p.kind];for(var i=0;i<4;i++){var x=base[i][0],y=base[i][1],n=p.kind==="O"?0:p.rot%4;
  for(var t=0;t<n;t++){var nx=(p.kind==="I"?3:2)-y;y=x;x=nx}out.push([p.x+x,p.y+y])}return out}
function fits(p){var cs=cellsOf(p);for(var i=0;i<4;i++){var x=cs[i][0],y=cs[i][1];if(x<0||x>=COLS||y>=ROWS)return false;if(y>=0&&grid[y][x])return false}return true}
function spawn(kind){cur={kind:kind,rot:0,x:Math.floor(COLS/2)-2,y:-1};restAt=0;fallAt=now0+fallMs();canHold=true;stats.pieces++;
  if(!fits(cur)){cur.y=-2;if(!fits(cur))over()}}
function next(){spawn(queue.shift());queue.push(draw())}
function over(){if(state!=="play")return;state="end";endAt=tNow;shake=CELL*0.6;
  if(beat)sfx.notes([[523,0.12,0],[659,0.12,0.12],[784,0.12,0.24],[1047,0.35,0.36]]);
  else{sfx.noise(0.6,0.35,900,80);sfx.notes([[392,0.2,0.1],[330,0.2,0.3],[262,0.5,0.5]],"triangle",0.14)}}
function move(dx){if(!cur||state!=="play"||paused)return false;var p={kind:cur.kind,rot:cur.rot,x:cur.x+dx,y:cur.y};if(!fits(p))return false;cur=p;restAt=0;sfx.tone(320,0.03,"square",0.03);return true}
// A turn tries in place, then a step aside, then a step up, so a piece by a wall still turns.
function turn(dir){if(!cur||state!=="play"||paused)return;var kicks=[[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1]];
  for(var i=0;i<kicks.length;i++){var p={kind:cur.kind,rot:(cur.rot+dir+4)%4,x:cur.x+kicks[i][0],y:cur.y+kicks[i][1]};if(fits(p)){cur=p;restAt=0;sfx.tone(dir>0?620:540,0.05,"triangle",0.05,dir>0?820:420);return}}
  sfx.tone(140,0.05,"square",0.04)}
function down(){var p={kind:cur.kind,rot:cur.rot,x:cur.x,y:cur.y+1};if(fits(p)){cur=p;return true}return false}
function drop(){if(!cur||state!=="play"||paused)return;var n=0;while(down())n++;stats.score+=n*2;postScore(stats.score);sfx.tone(160,0.12,"sine",0.25,60);sfx.noise(0.12,0.2,800,200);impact(60+6*n);lock()}
function hold(){if(!cur||!canHold||state!=="play"||paused)return;var k=cur.kind;if(held){spawn(held)}else next();held=k;canHold=false;sfx.noise(0.18,0.12,2500,600)}
function lock(){
  var cs=cellsOf(cur),above=false;for(var i=0;i<4;i++){if(cs[i][1]<0){above=true;continue}grid[cs[i][1]][cs[i][0]]=cur.kind}
  sfx.tone(240,0.05,"square",0.05);
  if(above){cur=null;over();return}
  var full=[];for(var r=0;r<ROWS;r++){var f=true;for(var k=0;k<COLS;k++)if(!grid[r][k]){f=false;break}if(f)full.push(r)}
  if(full.length){var before=Math.floor(stats.lines/10);
    explode(full.map(function(r){return{r:r,cells:grid[r].slice()}}));shake=Math.max(shake,CELL*Math.min(SHAKE+0.08,0.08+0.05*full.length));
    sfx.noise(0.5,0.4,1400,80);sfx.tone(110,0.4,"sine",0.25,45);stats.score+=lineScore(full.length);stats.lines+=full.length;postScore(stats.score);
    flash=full.slice();flashAt=now0;
    for(var j=0;j<full.length;j++){grid.splice(full[j],1);var row=[];for(var q=0;q<COLS;q++)row.push(null);grid.unshift(row)}
    if(full.length>=4){sfx.notes([[523,0.08,0],[659,0.08,0.07],[784,0.08,0.14],[1047,0.08,0.21],[1319,0.3,0.28]],"square",0.07);sfx.noise(0.6,0.25,6000,800)}
    else{sfx.noise(0.25+0.1*full.length,0.22,5000,700);sfx.tone(600,0.15+0.05*full.length,"triangle",0.07,600+300*full.length)}
    if(Math.floor(stats.lines/10)>before)sfx.notes([[784,0.1,0.35],[988,0.1,0.45],[1175,0.25,0.55]],"triangle",0.08);
    if(BEST>0&&!beat&&stats.score>BEST){beat=true;beatAt=now0;sfx.notes([[784,0.08,0.6],[988,0.08,0.68],[1319,0.24,0.76]],"triangle",0.1)}}
  next();
}
// Down: a row at once, then one every 40 ms while it is held.
function fast(){soft=true;if(!cur||state!=="play"||paused)return;if(down()){stats.score+=1;postScore(stats.score);restAt=0;sfx.tone(260,0.02,"square",0.02)}else if(!restAt){restAt=performance.now();impact(1000/SOFT)}fallAt=performance.now()+SOFT}
function landing(){var p={kind:cur.kind,rot:cur.rot,x:cur.x,y:cur.y};while(true){var q={kind:p.kind,rot:p.rot,x:p.x,y:p.y+1};if(!fits(q))return p;p=q}}
var KEYS={ArrowLeft:"left",a:"left",A:"left",ArrowRight:"right",d:"right",D:"right",ArrowUp:"turn",x:"turn",X:"turn",w:"turn",W:"turn",z:"back",Z:"back",ArrowDown:"soft",s:"soft",S:"soft"," ":"drop",c:"hold",C:"hold",Shift:"hold",p:"pause",P:"pause",m:"mute",M:"mute"};
document.addEventListener("keydown",function(ev){
  if(ev.key==="Escape"||ev.keyCode===27){ev.preventDefault();close();return}
  var a=KEYS[ev.key];if(!a)return;ev.preventDefault();if(ev.repeat)return;
  if(a==="mute"){sfx.toggle();return}
  if(a==="pause"){if(state==="play"){paused=!paused;sfx.tone(paused?440:660,0.08,"triangle",0.06)}return}
  if(a==="left"||a==="right"){var d=a==="left"?-1:1;move(d);slide={dir:d,next:now0+SLIDE0};return}
  if(a==="turn")turn(1);else if(a==="back")turn(-1);else if(a==="soft")fast();else if(a==="drop")drop();else if(a==="hold")hold();
});
document.addEventListener("keyup",function(ev){var a=KEYS[ev.key];
  if((a==="left"&&slide.dir<0)||(a==="right"&&slide.dir>0))slide={dir:0,next:0};if(a==="soft")soft=false});
document.addEventListener("mousedown",function(ev){ev.preventDefault()});
window.__blocks={stats:stats,grid:grid,state:function(){return state},current:function(){return cur},move:move,turn:turn,drop:drop,hold:hold,best:BEST,cols:COLS,rows:ROWS};
function pixelText(str,x,y,size,col,align){
  c.font="900 "+Math.round(size)+"px Menlo, Monaco, 'Courier New', monospace";c.textAlign=align||"left";c.textBaseline="top";
  c.fillStyle="#000";c.fillText(str,x+Math.max(2,size/8),y+Math.max(2,size/8));c.fillStyle=col;c.fillText(str,x,y);
}
// A tile drawn as a glyph: a rounded square, a lighter top edge, a dot of light.
function tile(x,y,s,col,alpha){
  c.save();c.globalAlpha=alpha===undefined?1:alpha;var r=Math.max(2,s*0.22),g=Math.max(1,Math.round(s*0.08));
  c.fillStyle=col;c.beginPath();c.moveTo(x+g+r,y+g);c.arcTo(x+s-g,y+g,x+s-g,y+s-g,r);c.arcTo(x+s-g,y+s-g,x+g,y+s-g,r);c.arcTo(x+g,y+s-g,x+g,y+g,r);c.arcTo(x+g,y+g,x+s-g,y+g,r);c.fill();
  c.fillStyle="rgba(255,255,255,0.28)";c.fillRect(x+g+r*0.6,y+g+1,s-2*g-r*1.2,Math.max(1,s*0.1));
  c.fillStyle="rgba(0,0,0,0.22)";c.fillRect(x+g+r*0.6,y+s-g-Math.max(1,s*0.1)-1,s-2*g-r*1.2,Math.max(1,s*0.1));
  c.fillStyle="rgba(255,255,255,0.55)";c.fillRect(x+s*0.3,y+s*0.3,Math.max(1,s*0.12),Math.max(1,s*0.12));
  c.restore();
}
function mini(kind,x,y,s){if(!kind)return;var base=PIECES[kind];for(var i=0;i<4;i++)tile(x+base[i][0]*s,y+base[i][1]*s,s,COLOURS[kind])}
function drawWell(){
  c.fillStyle="rgba(10,14,24,0.92)";c.fillRect(BX-CELL*0.25,BY-CELL*0.25,BW+CELL*0.5,BH+CELL*0.5);
  c.strokeStyle="#25c75e";c.lineWidth=Math.max(2,CELL*0.08);c.strokeRect(BX-CELL*0.25,BY-CELL*0.25,BW+CELL*0.5,BH+CELL*0.5);
  c.fillStyle="rgba(37,199,94,0.06)";for(var r=0;r<ROWS;r++)for(var k=0;k<COLS;k++)if((r+k)%2===0)c.fillRect(BX+k*CELL,BY+r*CELL,CELL,CELL);
  for(var r2=0;r2<ROWS;r2++)for(var k2=0;k2<COLS;k2++)if(grid[r2][k2])tile(BX+k2*CELL,BY+r2*CELL,CELL,COLOURS[grid[r2][k2]]);
  if(now0-flashAt<220){c.fillStyle="rgba(255,255,255,"+(0.6*(1-(now0-flashAt)/220))+")";c.fillRect(BX,BY,BW,BH)}
  if(cur&&state==="play"){
    // Where it will land: a bright mark on the floor of each column it fills.
    var l=cellsOf(landing()),cs=cellsOf(cur);
    for(var i=0;i<4;i++){var lx=BX+l[i][0]*CELL,ly=BY+l[i][1]*CELL;if(l[i][1]<0)continue;c.fillStyle=COLOURS[cur.kind];c.globalAlpha=0.5;c.fillRect(lx+CELL*0.2,ly+CELL*0.8,CELL*0.6,Math.max(2,CELL*0.1));c.globalAlpha=1}
    for(var j=0;j<4;j++)if(cs[j][1]>=0)tile(BX+cs[j][0]*CELL,BY+cs[j][1]*CELL,CELL,COLOURS[cur.kind]);
  }
}
function drawSide(){
  var s=Math.max(8,Math.floor(CELL*0.6)),rx=BX+BW+CELL*1.2,lx=BX-CELL*1.2-s*4,size=Math.max(12,CELL*0.55);
  pixelText("NEXT",rx,BY,size,"#25c75e","left");for(var i=0;i<queue.length;i++)mini(queue[i],rx,BY+size*1.6+i*s*3,s);
  pixelText("HOLD",lx,BY,size,"#25c75e","left");mini(held,lx,BY+size*1.6,s);
  var y=BY+size*1.6+s*10;
  pixelText("SCORE",rx,y,size*0.8,"rgba(255,255,255,0.7)","left");pixelText(String(stats.score),rx,y+size,size*1.2,"#fff","left");
  pixelText("BEST",rx,y+size*2.8,size*0.8,"rgba(255,255,255,0.7)","left");pixelText(String(Math.max(BEST,stats.score)),rx,y+size*3.8,size*1.2,"#ffd60a","left");
  pixelText("ROWS",rx,y+size*5.6,size*0.8,"rgba(255,255,255,0.7)","left");pixelText(String(stats.lines),rx,y+size*6.6,size*1.2,"#48dbfb","left");
  // The keys, right-aligned to stop short of the well.
  var kx=BX-CELL*0.9;
  pixelText(sfx.muted()?"M SOUND ON":"M MUTES",kx,BY+BH-size*3.6,size*0.6,"rgba(255,255,255,0.6)","right");
  pixelText("P PAUSE",kx,BY+BH-size*2.4,size*0.6,"rgba(255,255,255,0.6)","right");
  pixelText("ESC QUIT",kx,BY+BH-size*1.2,size*0.6,"rgba(255,255,255,0.6)","right");
}
function drawIntro(t){
  if(t>1800)return;var a=t>1400?1-(t-1400)/400:1,big=Math.max(20,CELL*1.2);
  c.save();c.globalAlpha=a;c.fillStyle="rgba(10,12,30,0.85)";c.fillRect(BX,BY+BH*0.3,BW,big*3.4);
  pixelText("BLOCKS",W/2,BY+BH*0.3+big*0.4,big,"#25c75e","center");
  pixelText("ARROWS MOVE AND TURN. SPACE DROPS. C HOLDS.",W/2,BY+BH*0.3+big*1.9,Math.max(10,big*0.36),"#fff","center");
  c.restore();
}
function drawEnd(t){
  var k=Math.min(1,(t-endAt)/250),bw=Math.min(W*0.8,CELL*16),bh=Math.max(140,CELL*6),bx=W/2-bw/2,by=H*0.42-bh/2;
  c.save();c.globalAlpha=k;c.fillStyle="rgba(10,12,30,0.92)";c.fillRect(bx,by,bw,bh);c.strokeStyle="#25c75e";c.lineWidth=Math.max(3,CELL*0.12);c.strokeRect(bx,by,bw,bh);
  var big=Math.max(18,Math.min(CELL*1.3,bw/12));
  pixelText("STACKED OUT",W/2,by+bh*0.12,big,"#ff6b6b","center");
  pixelText("SCORE "+stats.score,W/2,by+bh*0.12+big*1.5,big,"#ffd60a","center");
  pixelText(beat?"NEW BEST!":BEST>0?"BEST "+BEST:stats.lines+" ROWS CLEARED",W/2,by+bh*0.12+big*2.9,Math.max(12,big*0.5),beat?"#ffd60a":"#fff","center");
  c.restore();
}
function drawPaused(){var big=Math.max(20,CELL*1.2);c.fillStyle="rgba(10,12,30,0.75)";c.fillRect(BX,BY,BW,BH);pixelText("PAUSED",W/2,BY+BH*0.45,big,"#fff","center")}
function drawBeat(now){if(now-beatAt>1400)return;var a=Math.min(1,(1400-(now-beatAt))/300);c.save();c.globalAlpha=a;pixelText("NEW BEST!",W/2,BY-CELL*1.6,Math.max(18,CELL),"#ffd60a","center");c.restore()}
var start=performance.now(),now0=start,tNow=0;
sfx.notes([[262,0.1,0],[330,0.1,0.1],[392,0.1,0.2],[523,0.22,0.3]],"triangle",0.08);
next();
function frame(now){
  if(closed)return;
  var t=now-start,dt=Math.min(0.05,(now-now0)/1000);now0=now;tNow=t;
  if(state==="play"&&!paused&&cur){
    if(slide.dir&&now>=slide.next){move(slide.dir);slide.next=now+SLIDE}
    var every=soft?Math.min(SOFT,fallMs()):fallMs();
    if(now>=fallAt){fallAt=now+every;if(down()){if(soft){stats.score+=1;postScore(stats.score)}restAt=0}else if(!restAt){restAt=now;impact(1000/every)}}
    if(restAt&&now-restAt>=LOCK){var p={kind:cur.kind,rot:cur.rot,x:cur.x,y:cur.y+1};if(fits(p))restAt=0;else lock()}
  }
  c.clearRect(0,0,W,H);
  c.save();if(shake>0){c.translate((Math.random()-0.5)*shake,(Math.random()-0.5)*shake);shake=Math.max(0,shake-CELL*0.05)}
  drawWell();c.restore();drawParts(dt);
  drawSide();drawIntro(t);drawBeat(now);
  if(paused)drawPaused();
  if(state==="end"){drawEnd(t);if(t-endAt>=ENDMS){close();return}}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
</${'script'}>
</body></html>`
}

export const blocks: Game = {
  name: 'blocks',
  title: 'Blocks',
  build: dripBlocks,
  safetyMs: BLOCKS_SAFETY_MS,
  aliases: ['block'],
}
