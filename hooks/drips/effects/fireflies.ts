// fireflies: a looping background drip, from the Glyphh app's drip effects
// (glyphh-ai/app, tag v2.0.2, src/shared/drips-effects.ts).
import type { Drip } from './drips.ts'
import { pick, rng, dripWrapLoop } from './shared.ts'

export function dripFireflies(w: number, h: number, opacity: number): string {
  let kf = "", dv = "";
  for (let i = 0; i < 40; i++) {
    const x = rng(w * 0.05, w * 0.95), y = rng(h * 0.1, h * 0.9);
    const dx = rng(-120, 120), dy = rng(-120, 120), dur = rng(6, 14);
    const sz = rng(3, 8), c = pick(["#25C75E", "#4fffb0", "#ffee44", "#ffe066"]);
    kf += `@keyframes ff${i}{0%{transform:translate(0,0);opacity:0}15%{opacity:${rng(0.5, 1)}}50%{transform:translate(${dx}px,${dy}px);opacity:${rng(0.3, 0.8)}}85%{opacity:${rng(0.4, 0.9)}}100%{transform:translate(0,0);opacity:0}}\n`;
    dv += `<div style="position:absolute;left:${x}px;top:${y}px;width:${sz}px;height:${sz}px;border-radius:50%;background:${c};box-shadow:0 0 ${sz*3}px ${c},0 0 ${sz*6}px ${c}44;animation:ff${i} ${dur}s ease-in-out ${rng(0, 6)}s infinite"></div>`;
  }
  return dripWrapLoop(w, h, kf, dv, opacity);
}

/** Its sounds: crickets in the dark. */
const SOUND = `every(900,function(){if(Math.random()<0.7)for(var i=0;i<3;i++)sfx.tone(4200,0.04,"square",0.012,0,i*0.07)});`

export const fireflies: Drip = { name: 'fireflies', kind: 'loop', build: dripFireflies, sound: SOUND }
