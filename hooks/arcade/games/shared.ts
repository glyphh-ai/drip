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
