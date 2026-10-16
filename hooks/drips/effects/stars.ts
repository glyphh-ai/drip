// stars: a one-shot drip, from the Glyphh app's drip effects
// (glyphh-ai/app, tag v2.0.2, src/shared/drips-effects.ts).
import type { Drip } from './drips.ts'
import { pick, rng, dripWrap } from './shared.ts'

export function dripStars(w: number, h: number): string {
  const starEmojis = ["⭐", "✨", "🌟", "⚡"];
  let kf = "", dv = "", id = 0;
  for (let i = 0; i < 80; i++) {
    const x = rng(0, w), y = rng(h * 0.1, h * 0.95), delay = rng(0, 3000), dur = rng(2, 4);
    const drift = rng(-100, 100), rise = rng(150, 500), sz = rng(22, 52), n = `st${id++}`;
    kf += `@keyframes ${n}{0%{transform:translate(0,0) scale(0) rotate(0deg);opacity:0}20%{opacity:1;transform:translate(${drift*0.2}px,${-rise*0.2}px) scale(1.4) rotate(72deg)}50%{opacity:1;transform:translate(${drift*0.5}px,${-rise*0.5}px) scale(0.9) rotate(144deg)}75%{opacity:0.8;transform:translate(${drift*0.75}px,${-rise*0.75}px) scale(1.2) rotate(216deg)}100%{transform:translate(${drift}px,${-rise}px) scale(0.3) rotate(360deg);opacity:0}}\n`;
    dv += `<div style="position:absolute;left:${x}px;top:${y}px;font-size:${sz}px;filter:drop-shadow(0 0 12px rgba(255,215,0,0.7));animation:${n} ${dur}s ease-in-out ${delay}ms forwards;opacity:0">${pick(starEmojis)}</div>`;
  }
  return dripWrap(w, h, kf, dv, 7000);
}

/** Its sounds: twinkles, high and bright. */
const SOUND = `for(var i=0;i<24;i++)at(rnd(0,5000),function(){var f=rnd(1400,2600);sfx.tone(f,0.25,"triangle",0.05,f*1.03)});`

export const stars: Drip = { name: 'stars', kind: 'one-shot', build: dripStars, sound: SOUND }
