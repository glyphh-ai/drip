// hearts: a one-shot drip, from the Glyphh app's drip effects
// (glyphh-ai/app, tag v2.0.2, src/shared/drips-effects.ts).
import type { Drip } from './drips.ts'
import { DRIP_WARM, pick, rng, dripWrap } from './shared.ts'

export function dripHearts(w: number, h: number): string {
  let kf = "", dv = "", id = 0;
  const heartEmojis = ["❤️", "🩷", "💕", "💖", "💗", "💓"];
  for (let i = 0; i < 45; i++) {
    const x = rng(w * 0.05, w * 0.95), delay = rng(0, 2000);
    const rise = rng(h * 0.4, h * 0.8), sway = rng(-120, 120), dur = rng(2, 3.5), sz = rng(24, 56);
    const n = `h${id++}`, heart = pick(heartEmojis);
    kf += `@keyframes ${n}{0%{transform:translate(0,0) scale(0.2);opacity:0}15%{opacity:1;transform:translate(${sway*0.15}px,${-rise*0.15}px) scale(1)}70%{opacity:1;transform:translate(${sway*0.7}px,${-rise*0.7}px) scale(1.3)}85%{opacity:0.8}100%{transform:translate(${sway}px,${-rise}px) scale(0.4);opacity:0}}\n`;
    dv += `<div style="position:absolute;left:${x}px;top:${h*0.8}px;font-size:${sz}px;filter:drop-shadow(0 0 8px rgba(255,50,100,0.6));animation:${n} ${dur}s ease-out ${delay}ms forwards;opacity:0">${heart}</div>`;
    for (let j = 0; j < 12; j++) {
      const a = Math.random() * Math.PI * 2, sp = rng(60, 180);
      const sdx = Math.cos(a) * sp, sdy = Math.sin(a) * sp - 40;
      const sn = `s${id++}`, sc = pick(DRIP_WARM), ssz = rng(3, 8);
      kf += `@keyframes ${sn}{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(${sdx}px,${sdy}px) scale(0.2);opacity:0}}\n`;
      dv += `<div style="position:absolute;left:${x+sway}px;top:${h*0.8-rise}px;width:${ssz}px;height:${ssz}px;border-radius:50%;background:${sc};box-shadow:0 0 ${ssz*2}px ${sc};animation:${sn} 0.9s ease-out ${delay + dur*1000 - 300}ms forwards;opacity:0"></div>`;
    }
  }
  return dripWrap(w, h, kf, dv, 5500);
}

/** Its sounds: a warm chord, soft rising pops, then sparkles. */
const SOUND = `sfx.notes([[523,0.5,0],[659,0.5,0.15],[784,0.8,0.3]],"sine",0.06);
for(var i=0;i<14;i++)at(rnd(0,2600),function(){var f=rnd(520,880);sfx.tone(f,0.22,"sine",0.09,f*1.5)});
for(var j=0;j<10;j++)at(rnd(2200,4600),function(){sfx.tone(rnd(1200,1800),0.08,"triangle",0.05)});`

export const hearts: Drip = { name: 'hearts', kind: 'one-shot', build: dripHearts, sound: SOUND }
