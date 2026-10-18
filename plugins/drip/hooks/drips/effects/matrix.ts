// matrix: a looping background drip, from the Glyphh app's drip effects
// (glyphh-ai/app, tag v2.0.2, src/shared/drips-effects.ts).
import type { Drip } from './drips.ts'
import { rng, dripWrapLoop } from './shared.ts'

export function dripMatrix(w: number, h: number, opacity: number): string {
  const cols = Math.floor(w / 18);
  let kf = "", dv = "";
  const chars = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF";
  kf += `@keyframes mfall{0%{transform:translateY(-100%)}100%{transform:translateY(${h + 200}px)}}\n`;
  kf += `@keyframes mflicker{0%,100%{opacity:0.8}50%{opacity:0.3}}\n`;
  for (let c = 0; c < cols; c++) {
    const x = c * 18 + rng(-2, 2), dur = rng(4, 12), delay = rng(0, 8), len = Math.floor(rng(8, 30));
    let colHtml = "";
    for (let r = 0; r < len; r++) {
      const ch = chars[Math.floor(Math.random() * chars.length)];
      const bright = r === 0 ? "color:#fff;text-shadow:0 0 8px #0f0,0 0 20px #0f0;" : r < 3 ? "color:#4f4;text-shadow:0 0 6px #0f0;" : `color:rgba(0,${Math.floor(rng(120, 255))},0,${rng(0.3, 0.8)});`;
      colHtml += `<div style="font-size:14px;font-family:monospace;line-height:18px;${bright}animation:mflicker ${rng(1, 3)}s ease-in-out ${rng(0, 2)}s infinite">${ch}</div>`;
    }
    dv += `<div style="position:absolute;left:${x}px;top:0;animation:mfall ${dur}s linear ${delay}s infinite">${colHtml}</div>`;
  }
  return dripWrapLoop(w, h, kf, dv, opacity);
}

/** Its sounds: quiet digital ticks. */
const SOUND = `every(140,function(){if(Math.random()<0.5)sfx.tone(rnd(900,2400),0.03,"square",0.015)});`

export const matrix: Drip = { name: 'matrix', kind: 'loop', build: dripMatrix, sound: SOUND }
