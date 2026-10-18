// plasma: a looping background drip, from the Glyphh app's drip effects
// (glyphh-ai/app, tag v2.0.2, src/shared/drips-effects.ts).
import type { Drip } from './drips.ts'
import { dripWrapLoop } from './shared.ts'

export function dripPlasma(w: number, h: number, opacity: number): string {
  let kf = "", dv = "";
  kf += `@keyframes pmove1{0%{transform:translate(0,0)}25%{transform:translate(${w*0.15}px,${h*0.1}px)}50%{transform:translate(${-w*0.1}px,${h*0.2}px)}75%{transform:translate(${w*0.2}px,${-h*0.1}px)}100%{transform:translate(0,0)}}\n`;
  kf += `@keyframes pmove2{0%{transform:translate(0,0)}33%{transform:translate(${-w*0.12}px,${-h*0.15}px)}66%{transform:translate(${w*0.18}px,${h*0.08}px)}100%{transform:translate(0,0)}}\n`;
  kf += `@keyframes pmove3{0%{transform:translate(0,0)}50%{transform:translate(${w*0.1}px,${-h*0.12}px)}100%{transform:translate(0,0)}}\n`;
  const blobs = [
    { x: "30%", y: "30%", sz: Math.min(w, h) * 0.5, c: "#25C75E20", anim: "pmove1", dur: 15 },
    { x: "60%", y: "50%", sz: Math.min(w, h) * 0.45, c: "#0088ff18", anim: "pmove2", dur: 20 },
    { x: "45%", y: "25%", sz: Math.min(w, h) * 0.55, c: "#8800ff15", anim: "pmove3", dur: 18 },
    { x: "20%", y: "65%", sz: Math.min(w, h) * 0.4, c: "#ff008818", anim: "pmove1", dur: 22 },
    { x: "70%", y: "30%", sz: Math.min(w, h) * 0.35, c: "#ffaa0012", anim: "pmove2", dur: 16 },
  ];
  for (const b of blobs) {
    dv += `<div style="position:absolute;left:${b.x};top:${b.y};width:${b.sz}px;height:${b.sz}px;border-radius:50%;background:radial-gradient(circle,${b.c},transparent 70%);filter:blur(50px);animation:${b.anim} ${b.dur}s ease-in-out infinite;mix-blend-mode:screen"></div>`;
  }
  return dripWrapLoop(w, h, kf, dv, opacity);
}

/** Its sounds: a gentle warble. */
const SOUND = `every(1800,function(){sfx.tone(rnd(300,500),2,"triangle",0.025,rnd(300,500))});`

export const plasma: Drip = { name: 'plasma', kind: 'loop', build: dripPlasma, sound: SOUND }
