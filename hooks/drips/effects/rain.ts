// rain: a one-shot drip, from the Glyphh app's drip effects
// (glyphh-ai/app, tag v2.0.2, src/shared/drips-effects.ts).
import type { Drip } from './drips.ts'
import { DRIP_COOL, pick, rng, dripWrap } from './shared.ts'

export function dripRain(w: number, h: number): string {
  let kf = "", dv = "", id = 0;
  for (let i = 0; i < 120; i++) {
    const x = rng(0, w), delay = rng(0, 3000), dur = rng(0.6, 1.8);
    const n = `r${id++}`, c = pick(DRIP_COOL), sz = rng(2, 6), streak = rng(25, 70);
    kf += `@keyframes ${n}{0%{transform:translateY(0);opacity:0.9}100%{transform:translateY(${h+30}px);opacity:0}}\n`;
    dv += `<div style="position:absolute;left:${x}px;top:-${streak}px;width:${sz}px;height:${streak}px;background:linear-gradient(${c},${c}88,transparent);border-radius:${sz}px;box-shadow:0 0 ${sz*2}px ${c}44;animation:${n} ${dur}s linear ${delay}ms forwards;opacity:0"></div>`;
    if (i < 40) {
      const sn = `rs${id++}`, splashDelay = delay + dur * 1000 - 100;
      kf += `@keyframes ${sn}{0%{transform:scaleX(0.3) scaleY(1);opacity:0.8}100%{transform:scaleX(2.5) scaleY(0);opacity:0}}\n`;
      dv += `<div style="position:absolute;left:${x-4}px;top:${h-4}px;width:8px;height:4px;border-radius:50%;background:${c};box-shadow:0 0 8px ${c};animation:${sn} 0.4s ease-out ${splashDelay}ms forwards;opacity:0"></div>`;
    }
  }
  return dripWrap(w, h, kf, dv, 5000);
}

/** Its sounds: a shower, and drops landing. */
const SOUND = `sfx.noise(5.5,0.12,1800,900);
for(var i=0;i<30;i++)at(rnd(0,5000),function(){sfx.tone(rnd(1800,3200),0.04,"sine",0.05,rnd(600,900))});`

export const rain: Drip = { name: 'rain', kind: 'one-shot', build: dripRain, sound: SOUND }
