// What the games share: the close signal the overlay hears, the sound kit
// (Web Audio, made in the page) and the score post.

export const CLOSE_SIGNAL = `console.log("__drip_close__");try{if(window.parent!==window)window.parent.postMessage("__drip_close__","*")}catch(e){}`;

/** The drips' sound kit, made in the page with Web Audio (no sound files):
 *  `sfx.tone(freq, seconds, wave, volume, slideTo, delay)`, `sfx.noise(seconds,
 *  volume, filterFreq, filterTo, delay)`, `sfx.notes([[freq, seconds, delay]])`,
 *  and `sfx.toggle()` for the M key (remembered where the page may store it).
 *  At most 24 sounds at once: a chain of blasts never drowns the rest. A page
 *  whose host allows no audio stays silent, and one marked quiet
 *  (`window.__dripsQuiet`, Sounds off in /config) starts muted. */
export const GAME_SOUND = `var sfx=(function(){
var A=window.AudioContext||window.webkitAudioContext,ctx=null,out=null,muted=false,buf=null,voices=0;
try{muted=localStorage.getItem("drips.muted")==="1"}catch(e){}if(window.__dripsQuiet===true)muted=true;
function ac(){if(!A)return null;if(!ctx){try{ctx=new A();out=ctx.createGain();out.gain.value=0.35;out.connect(ctx.destination)}catch(e){A=null;return null}}if(ctx.state==="suspended")ctx.resume();return ctx}
document.addEventListener("keydown",ac,true);document.addEventListener("mousedown",ac,true);
function voice(a,src,dur,vol,delay,node){var t=a.currentTime+(delay||0),g=a.createGain();g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.001,t+dur);
  (node||src).connect(g);g.connect(out);voices++;setTimeout(function(){voices--},((delay||0)+dur)*1000+40);src.start(t);src.stop(t+dur+0.02);return t}
function tone(f,dur,type,vol,to,delay){var a=ac();if(!a||muted||voices>=24)return;var o=a.createOscillator();o.type=type||"square";
  var t=a.currentTime+(delay||0);o.frequency.setValueAtTime(f,t);if(to)o.frequency.exponentialRampToValueAtTime(to,t+dur);voice(a,o,dur,vol||0.15,delay)}
function noise(dur,vol,freq,to,delay){var a=ac();if(!a||muted||voices>=24)return;
  if(!buf){buf=a.createBuffer(1,a.sampleRate,a.sampleRate);var d=buf.getChannelData(0);for(var i=0;i<d.length;i++)d[i]=Math.random()*2-1}
  var s=a.createBufferSource(),f=a.createBiquadFilter(),t=a.currentTime+(delay||0);s.buffer=buf;s.loop=true;f.type="lowpass";
  f.frequency.setValueAtTime(freq||1200,t);if(to)f.frequency.exponentialRampToValueAtTime(to,t+dur);s.connect(f);voice(a,s,dur,vol||0.3,delay,f)}
function notes(list,type,vol){for(var i=0;i<list.length;i++)tone(list[i][0],list[i][1],type||"square",vol||0.1,0,list[i][2])}
function toggle(){muted=!muted;try{localStorage.setItem("drips.muted",muted?"1":"0")}catch(e){}return muted}
ac();
return{tone:tone,noise:noise,notes:notes,toggle:toggle,muted:function(){return muted}};
})();`

/** A game's score, posted to the overlay as it rises (`postScore(n)`); the
 *  mod keeps the top one (../scores.ts) and draws the next round with it. A
 *  host that frames the page hears it as a message and passes it over. */
export const GAME_SCORE = `function postScore(n){if(!(n>postScore.sent))return;postScore.sent=n;try{window.postMessage({__drip_score__:n},"*")}catch(e){}}postScore.sent=0;`

/** The backdrop every game plays on: Claude dimmed, still a little visible. */
export const GAME_BACKDROP = 'rgba(8,8,18,0.82)'

/** A game laid out at `w`×`h` kept fitted to its window: the overlay follows
 *  Claude's window as it is resized, so the page is scaled to the new size
 *  (centred, its shape kept) and the pointer's coordinates mapped back, so a
 *  game reads clientX and clientY as if nothing changed. The page itself sits
 *  on the backdrop, whatever background it sets. Run in the body. */
export function gameFrame(w: number, h: number): string {
  const n = (v: number) => (Number.isFinite(v) && v > 0 ? v : 1)
  return (
    `(function(){var W=${n(w)},H=${n(h)},s=1,ox=0,oy=0,b=document.body,st=document.createElement("style");` +
    `st.textContent="html{background:${GAME_BACKDROP}!important}body{background:transparent!important;position:fixed!important;left:0!important;top:0!important;width:"+W+"px!important;height:"+H+"px!important;overflow:hidden!important;transform-origin:0 0}";` +
    `(document.head||document.documentElement).appendChild(st);` +
    `function fit(){var iw=window.innerWidth,ih=window.innerHeight;if(!(iw>0&&ih>0))return;s=Math.min(iw/W,ih/H);ox=(iw-W*s)/2;oy=(ih-H*s)/2;` +
    `b.style.transform=s===1&&!ox&&!oy?"":"translate("+ox+"px,"+oy+"px) scale("+s+")"}` +
    `function map(e){if(s===1&&!ox&&!oy)return;var x=(e.clientX-ox)/s,y=(e.clientY-oy)/s;` +
    `try{Object.defineProperties(e,{clientX:{value:x},clientY:{value:y},pageX:{value:x},pageY:{value:y},x:{value:x},y:{value:y}})}catch(_){}}` +
    `["mousedown","mouseup","mousemove","click","dblclick","contextmenu","wheel","pointerdown","pointerup","pointermove"].forEach(function(t){window.addEventListener(t,map,true)});` +
    `window.addEventListener("resize",fit);fit()})();`
  )
}
