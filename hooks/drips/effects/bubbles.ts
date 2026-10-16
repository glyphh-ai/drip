// bubbles: a one-shot drip, from the Glyphh app's drip effects
// (glyphh-ai/app, tag v2.0.2, src/shared/drips-effects.ts).
import type { Drip } from './drips.ts'
import { DRIP_COOL, pick, rng, dripWrap } from './shared.ts'

export function dripBubbles(w: number, h: number): string {
  let kf = "", dv = "", id = 0;
  for (let i = 0; i < 50; i++) {
    const x = rng(w * 0.02, w * 0.98), delay = rng(0, 2500), dur = rng(2.5, 5);
    const sway = rng(-140, 140), rise = rng(h * 0.5, h * 0.95), sz = rng(30, 90), n = `b${id++}`;
    const c = pick(DRIP_COOL), wobble = rng(20, 50);
    kf += `@keyframes ${n}{0%{transform:translate(0,0) scale(0.2);opacity:0}10%{opacity:0.7;transform:translate(${wobble*0.3}px,${-rise*0.05}px) scale(1)}30%{transform:translate(${-wobble*0.5}px,${-rise*0.3}px) scale(1.05)}50%{transform:translate(${sway*0.4}px,${-rise*0.5}px) scale(0.95)}70%{transform:translate(${-wobble*0.3+sway*0.5}px,${-rise*0.7}px) scale(1.05)}90%{opacity:0.5;transform:translate(${sway*0.9}px,${-rise*0.9}px) scale(1.15)}100%{transform:translate(${sway}px,${-rise}px) scale(1.8);opacity:0}}\n`;
    dv += `<div style="position:absolute;left:${x}px;top:${h*0.9}px;width:${sz}px;height:${sz}px;border-radius:50%;border:2px solid ${c}88;background:radial-gradient(circle at 35% 35%,rgba(255,255,255,0.2),transparent 50%);box-shadow:inset -${sz/3}px -${sz/3}px ${sz/2}px rgba(255,255,255,0.08),0 0 ${sz}px ${c}33,0 0 ${sz*2}px ${c}11;animation:${n} ${dur}s ease-out ${delay}ms forwards;opacity:0"></div>`;
    const popDelay = delay + dur * 1000 - 200;
    for (let j = 0; j < 6; j++) {
      const pa = Math.random() * Math.PI * 2, psp = rng(20, sz);
      const pdx = Math.cos(pa) * psp, pdy = Math.sin(pa) * psp;
      const pn = `bp${id++}`, psz = rng(2, 5);
      kf += `@keyframes ${pn}{0%{transform:translate(0,0);opacity:1}100%{transform:translate(${pdx}px,${pdy}px);opacity:0}}\n`;
      dv += `<div style="position:absolute;left:${x+sway+sz/2}px;top:${h*0.9-rise}px;width:${psz}px;height:${psz}px;border-radius:50%;background:#fff;box-shadow:0 0 6px ${c};animation:${pn} 0.5s ease-out ${popDelay}ms forwards;opacity:0"></div>`;
    }
  }
  return dripWrap(w, h, kf, dv, 7500);
}

/** Its sounds: bubbly bloops. */
const SOUND = `for(var i=0;i<22;i++)at(rnd(0,4500),function(){var f=rnd(180,320);sfx.tone(f,0.18,"sine",0.12,f*3)});`

export const bubbles: Drip = { name: 'bubbles', kind: 'one-shot', build: dripBubbles, sound: SOUND }
