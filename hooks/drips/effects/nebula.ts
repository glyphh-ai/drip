// nebula: a looping background drip, from the Glyphh app's drip effects
// (glyphh-ai/app, tag v2.0.2, src/shared/drips-effects.ts).
import type { Drip } from './drips.ts'
import { rng, dripWrapLoop } from './shared.ts'

export function dripNebula(w: number, h: number, opacity: number): string {
  let kf = "", dv = "";
  kf += `@keyframes ndrift{0%{transform:translate(0,0) rotate(0deg) scale(1)}33%{transform:translate(40px,-30px) rotate(3deg) scale(1.05)}66%{transform:translate(-30px,20px) rotate(-2deg) scale(0.95)}100%{transform:translate(0,0) rotate(0deg) scale(1)}}\n`;
  const clouds = [
    { x: "20%", y: "30%", sz: 400, c1: "#25C75E15", c2: "#00ffcc08", dur: 25 },
    { x: "60%", y: "20%", sz: 500, c1: "#8800ff12", c2: "#ff00ff06", dur: 30 },
    { x: "40%", y: "60%", sz: 450, c1: "#0088ff10", c2: "#00ffcc08", dur: 35 },
    { x: "75%", y: "50%", sz: 350, c1: "#ff440008", c2: "#ffaa0005", dur: 20 },
    { x: "15%", y: "70%", sz: 380, c1: "#25C75E10", c2: "#4fffb008", dur: 28 },
  ];
  for (let i = 0; i < clouds.length; i++) {
    const c = clouds[i]!;
    dv += `<div style="position:absolute;left:${c.x};top:${c.y};width:${c.sz}px;height:${c.sz}px;border-radius:50%;background:radial-gradient(circle,${c.c1},${c.c2},transparent 70%);filter:blur(60px);animation:ndrift ${c.dur}s ease-in-out ${i * 3}s infinite"></div>`;
  }
  for (let i = 0; i < 60; i++) {
    const x = rng(0, w), y = rng(0, h), sz = rng(1, 3);
    kf += `@keyframes ns${i}{0%,100%{opacity:${rng(0.2, 0.5)}}50%{opacity:${rng(0.6, 1)}}}\n`;
    dv += `<div style="position:absolute;left:${x}px;top:${y}px;width:${sz}px;height:${sz}px;border-radius:50%;background:#fff;animation:ns${i} ${rng(2, 6)}s ease-in-out ${rng(0, 4)}s infinite"></div>`;
  }
  return dripWrapLoop(w, h, kf, dv, opacity);
}

/** Its sounds: a deep drone and a low hush. */
const SOUND = `every(5000,function(){sfx.tone(rnd(65,90),5.5,"sine",0.07);sfx.noise(5,0.03,300,200)});`

export const nebula: Drip = { name: 'nebula', kind: 'loop', build: dripNebula, sound: SOUND }
