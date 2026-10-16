// wave: a one-shot drip, from the Glyphh app's drip effects
// (glyphh-ai/app, tag v2.0.2, src/shared/drips-effects.ts).
import type { Drip } from './drips.ts'
import { DRIP_RAINBOW, pick, dripWrap } from './shared.ts'

export function dripWave(w: number, h: number): string {
  let kf = "", dv = "", id = 0;
  const cx = w / 2, cy = h / 2, maxR = Math.max(w, h) * 0.55;
  const origins = [{ x: cx, y: cy, d: 0 }, { x: w * 0.25, y: h * 0.4, d: 800 }, { x: w * 0.75, y: h * 0.6, d: 1600 }];
  for (const o of origins) {
    for (let i = 0; i < 6; i++) {
      const delay = o.d + i * 200, n = `w${id++}`, c = pick(DRIP_RAINBOW);
      kf += `@keyframes ${n}{0%{width:0;height:0;margin-left:0;margin-top:0;opacity:0.9;border-width:4px}50%{opacity:0.5}100%{width:${maxR*2}px;height:${maxR*2}px;margin-left:${-maxR}px;margin-top:${-maxR}px;opacity:0;border-width:1px}}\n`;
      dv += `<div style="position:absolute;left:${o.x}px;top:${o.y}px;border-radius:50%;border:4px solid ${c};box-shadow:0 0 20px ${c}66,0 0 40px ${c}22;animation:${n} 2.5s ease-out ${delay}ms forwards;opacity:0"></div>`;
    }
  }
  return dripWrap(w, h, kf, dv, 5500);
}

/** Its sounds: a wave rolling in and out, with a rainbow of notes. */
const SOUND = `sfx.noise(1.6,0.25,300,3500);at(1600,function(){sfx.noise(1.6,0.2,3500,300)});
[523,587,659,784,880,1047,1175,1319].forEach(function(f,i){at(300+i*160,function(){sfx.tone(f,0.2,"sine",0.05)})});`

export const wave: Drip = { name: 'wave', kind: 'one-shot', build: dripWave, sound: SOUND }
