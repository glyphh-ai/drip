// sparkle: a one-shot drip, from the Glyphh app's drip effects
// (glyphh-ai/app, tag v2.0.2, src/shared/drips-effects.ts).
import type { Drip } from './drips.ts'
import { pick, rng, dripWrap } from './shared.ts'

export function dripSparkle(w: number, h: number): string {
  const sparkEmojis = ["✨", "🌟", "⭐", "⚡"];
  let kf = "", dv = "", id = 0;
  for (let wave = 0; wave < 3; wave++) {
    const waveDelay = wave * 1200;
    for (let i = 0; i < 40; i++) {
      const x = rng(0, w), y = rng(0, h), delay = waveDelay + rng(0, 800), dur = rng(0.4, 1.0);
      const sz = rng(20, 50), n = `sp${id++}`;
      kf += `@keyframes ${n}{0%{transform:scale(0) rotate(0deg);opacity:0}40%{transform:scale(1.5) rotate(90deg);opacity:1}60%{transform:scale(1.2) rotate(135deg);opacity:1}100%{transform:scale(0) rotate(360deg);opacity:0}}\n`;
      dv += `<div style="position:absolute;left:${x}px;top:${y}px;font-size:${sz}px;filter:drop-shadow(0 0 8px rgba(255,215,0,0.5));animation:${n} ${dur}s ease-in-out ${delay}ms forwards;opacity:0">${pick(sparkEmojis)}</div>`;
    }
  }
  return dripWrap(w, h, kf, dv, 5500);
}

/** Its sounds: glints and a rising run. */
const SOUND = `for(var i=0;i<30;i++)at(rnd(0,4000),function(){sfx.tone(rnd(2000,4200),0.12,"triangle",0.04)});
sfx.notes([[1047,0.1,0],[1319,0.1,0.08],[1568,0.1,0.16],[2093,0.3,0.24]],"triangle",0.05);`

export const sparkle: Drip = { name: 'sparkle', kind: 'one-shot', build: dripSparkle, sound: SOUND }
