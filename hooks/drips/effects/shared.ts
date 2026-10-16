// What the drips share (from the Glyphh app's drip effects, glyphh-ai/app,
// tag v2.0.2, src/shared/drips-effects.ts): the close signal, the palettes,
// the random helpers and the two document wrappers.
//
// Close protocol: a one-shot doc signals completion by BOTH
// `console.log("__drip_close__")` (the overlay listens on console messages)
// AND `parent.postMessage("__drip_close__", "*")` (a host that frames the doc
// listens on window "message"; top-level, parent === window, so the
// postMessage is a harmless self-send).

// ── Close signal (see header) ───────────────────────────────

export const CLOSE_SIGNAL = `console.log("__drip_close__");try{if(window.parent!==window)window.parent.postMessage("__drip_close__","*")}catch(e){}`;

// ── Color palettes ──────────────────────────────────────────

export const DRIP_COLORS = ["#25C75E", "#1ae052", "#10a37f", "#00ffcc", "#4fffb0", "#fff", "#cff5e0", "#88ffbb", "#33ff99", "#a0ffd0"];
export const DRIP_WARM = ["#ff4444", "#ff1493", "#ff6b6b", "#ff9ff3", "#feca57", "#ff9f43", "#ee5a24", "#f368e0", "#ff4757", "#ff69b4"];
export const DRIP_COOL = ["#25C75E", "#00ffcc", "#48dbfb", "#0abde3", "#a0ffd0", "#fff", "#54a0ff", "#c8d6e5"];
export const DRIP_RAINBOW = ["#ff0000", "#ff8800", "#ffff00", "#00ff00", "#00ffff", "#0088ff", "#8800ff", "#ff00ff"];
export const DRIP_FIREWORK = ["#ff4444", "#ffaa00", "#ffee44", "#44ff44", "#44ffff", "#ff44ff", "#ff6600", "#ffffff", "#ff69b4", "#44aaff", "#ffd700", "#ff1493"];

export function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]!; }
export function rng(min: number, max: number): number { return min + Math.random() * (max - min); }

// ── HTML wrappers ───────────────────────────────────────────

export function dripWrap(w: number, h: number, keyframes: string, divs: string, dur: number): string {
  return `<html><head><style>
*{margin:0;padding:0}
html,body{width:${w}px;height:${h}px;overflow:hidden;background:rgba(0,0,0,0)}
${keyframes}
</style></head><body>
${divs}
<script>setTimeout(function(){${CLOSE_SIGNAL}},${dur})</${"script"}>
</body></html>`;
}

export function dripWrapLoop(w: number, h: number, keyframes: string, divs: string, opacity: number): string {
  return `<html><head><style>
*{margin:0;padding:0}
html,body{width:${w}px;height:${h}px;overflow:hidden;background:rgba(0,0,0,0)}
body{opacity:${opacity}}
${keyframes}
</style></head><body>
${divs}
</body></html>`;
}

// ── Sounds ──────────────────────────────────────────────────

/** The drips' sound kit, made in the page with Web Audio (no sound files):
 *  `sfx.tone(freq, seconds, wave, volume, slideTo, delay)`, `sfx.noise(seconds,
 *  volume, filterFreq, filterTo, delay)`, `sfx.notes([[freq, seconds, delay]])`,
 *  and `sfx.toggle()`. At most 24 sounds at once: a burst of them never drowns
 *  the rest. A page whose host allows no audio stays silent. */
export const SOUND_KIT = `var sfx=(function(){
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

/** What an effect's own sound script (`Drip.sound`) runs with: the sound kit,
 *  `at(ms, fn)` to play something that far in, `every(ms, fn)` now and then
 *  again and again (a looping background), and `rnd(a, b)`. */
export function soundScript(sound: string): string {
  return `<script>${SOUND_KIT}
(function(){function at(ms,f){setTimeout(f,ms)}function every(ms,f){f();setInterval(f,ms)}function rnd(a,b){return a+Math.random()*(b-a)}
${sound}
})();</${"script"}>`
}
