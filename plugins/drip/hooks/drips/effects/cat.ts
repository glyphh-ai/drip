// cat: a one-shot drip, from the Glyphh app's drip effects
// (glyphh-ai/app, tag v2.0.2, src/shared/drips-effects.ts).
import type { Drip } from './drips.ts'
import { CLOSE_SIGNAL, dripWrap } from './shared.ts'

export function dripCat(w: number, h: number): string {
  const cx = Math.floor(w / 2);
  const by = h - 10;
  const sz = 48;
  const half = sz / 2;
  const dur = 700;
  const kf = `
@keyframes catrise{0%{transform:translateY(${half}px);opacity:0}25%{transform:translateY(0);opacity:1}75%{transform:translateY(0);opacity:1}100%{transform:translateY(${half}px);opacity:0}}
`;
  const cat = `<canvas id="c" width="${sz}" height="${sz}" style="position:absolute;left:${cx - half}px;top:${by - sz}px;width:${sz}px;height:${sz}px;image-rendering:pixelated;animation:catrise ${dur}ms ease-in-out forwards"></canvas>`;
  const script = `<script>
var c=document.getElementById("c").getContext("2d");
function P(x,y,w,h,f){c.fillStyle=f;c.fillRect(x*2,y*2,w*2,h*2)}
var g="#555",w="#fff",pk="#f9a8d4";
P(4,0,3,3,g);P(17,0,3,3,g);P(5,3,2,2,g);P(17,3,2,2,g);
P(4,5,16,12,g);
P(5,1,1,2,pk);P(18,1,1,2,pk);
P(7,9,3,3,w);P(14,9,3,3,w);P(8,10,2,2,"#222");P(15,10,2,2,"#222");
P(11,13,2,1,pk);P(10,14,1,1,g);P(13,14,1,1,g);P(11,15,2,1,g);
P(1,11,4,1,g);P(19,11,4,1,g);P(2,13,3,1,g);P(19,13,3,1,g);
setTimeout(function(){
  c.clearRect(0,0,${sz},${sz});
  P(4,0,3,3,g);P(17,0,3,3,g);P(5,3,2,2,g);P(17,3,2,2,g);
  P(4,5,16,12,g);P(5,1,1,2,pk);P(18,1,1,2,pk);
  P(7,10,3,1,w);P(14,10,3,1,w);
  P(11,13,2,1,pk);P(10,14,1,1,g);P(13,14,1,1,g);P(11,15,2,1,g);
  P(1,11,4,1,g);P(19,11,4,1,g);P(2,13,3,1,g);P(19,13,3,1,g);
  setTimeout(function(){
    c.clearRect(0,0,${sz},${sz});
    P(4,0,3,3,g);P(17,0,3,3,g);P(5,3,2,2,g);P(17,3,2,2,g);
    P(4,5,16,12,g);P(5,1,1,2,pk);P(18,1,1,2,pk);
    P(7,9,3,3,w);P(14,9,3,3,w);P(8,10,2,2,"#222");P(15,10,2,2,"#222");
    P(11,13,2,1,pk);P(10,14,1,1,g);P(13,14,1,1,g);P(11,15,2,1,g);
    P(1,11,4,1,g);P(19,11,4,1,g);P(2,13,3,1,g);P(19,13,3,1,g);
  },80);
},320);
setTimeout(function(){${CLOSE_SIGNAL}},${dur + 100});
</${"script"}>`;
  return dripWrap(w, h, kf, cat + script, dur + 100);
}

/** Its sounds: a meow, then a purr. */
const SOUND = `at(300,function(){sfx.tone(480,0.25,"sawtooth",0.07,820)});at(550,function(){sfx.tone(820,0.45,"sawtooth",0.07,420)});
for(var i=0;i<8;i++)at(1200+i*400,function(){sfx.noise(0.3,0.08,180,120)});`

export const cat: Drip = { name: 'cat', kind: 'one-shot', build: dripCat, sound: SOUND }
