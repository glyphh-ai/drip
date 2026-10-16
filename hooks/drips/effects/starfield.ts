// starfield: a looping background drip, from the Glyphh app's drip effects
// (glyphh-ai/app, tag v2.0.2, src/shared/drips-effects.ts).
import type { Drip } from './drips.ts'
import { rng, dripWrapLoop } from './shared.ts'

export function dripStarfield(w: number, h: number, opacity: number): string {
  let kf = "", dv = "";
  const cx = w / 2, cy = h / 2;
  for (let i = 0; i < 100; i++) {
    const a = Math.random() * Math.PI * 2, maxDist = Math.max(w, h) * 0.8;
    const endX = Math.cos(a) * maxDist, endY = Math.sin(a) * maxDist;
    const dur = rng(2, 6), delay = rng(0, 4), sz = rng(1, 3);
    kf += `@keyframes sf${i}{0%{transform:translate(0,0) scaleX(1);opacity:0}10%{opacity:0.8}80%{opacity:1}100%{transform:translate(${endX}px,${endY}px) scaleX(${rng(3, 8)});opacity:0}}\n`;
    dv += `<div style="position:absolute;left:${cx}px;top:${cy}px;width:${sz}px;height:${sz}px;border-radius:50%;background:#fff;box-shadow:0 0 ${sz*2}px #fff;animation:sf${i} ${dur}s linear ${delay}s infinite"></div>`;
  }
  return dripWrapLoop(w, h, kf, dv, opacity);
}

/** Its sounds: a soft whoosh of stars going by. */
const SOUND = `every(3000,function(){sfx.noise(3,0.05,600,1400)});`

export const starfield: Drip = { name: 'starfield', kind: 'loop', build: dripStarfield, sound: SOUND }
