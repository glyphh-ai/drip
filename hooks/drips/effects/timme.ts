// timme: a one-shot drip, from the Glyphh app's drip effects
// (glyphh-ai/app, tag v2.0.2, src/shared/drips-effects.ts).
import type { Drip } from './drips.ts'
import { DRIP_COLORS, DRIP_COOL, pick, rng, dripWrap } from './shared.ts'

export function dripTimme(w: number, h: number): string {
  const quote = "The only true currency in this bankrupt world is what you share with someone else when you're uncool.";
  const attribution = "— Lester Bangs";
  let kf = "", dv = "";
  kf += `@keyframes bgfade{0%{opacity:0}10%{opacity:1}85%{opacity:1}100%{opacity:0}}\n`;
  dv += `<div style="position:absolute;inset:0;background:radial-gradient(ellipse at center,#0a1a0f 0%,#000 70%);animation:bgfade 15s ease-in-out forwards;opacity:0"></div>`;
  let id = 0;
  for (let i = 0; i < 40; i++) {
    const x = rng(0, w), y = rng(0, h), delay = rng(0, 8000), dur = rng(4, 8);
    const drift = rng(-100, 100), rise = rng(-150, 150), sz = rng(2, 5);
    const c = pick(DRIP_COOL), n = `a${id++}`;
    kf += `@keyframes ${n}{0%{transform:translate(0,0);opacity:0}30%{opacity:0.6}70%{opacity:0.6}100%{transform:translate(${drift}px,${rise}px);opacity:0}}\n`;
    dv += `<div style="position:absolute;left:${x}px;top:${y}px;width:${sz}px;height:${sz}px;border-radius:50%;background:${c};box-shadow:0 0 ${sz*3}px ${c};animation:${n} ${dur}s ease-in-out ${delay}ms forwards;opacity:0"></div>`;
  }
  const words = quote.split(" ");
  let wordDivs = "";
  const startDelay = 1500, wordGap = 200;
  for (let i = 0; i < words.length; i++) {
    const d = startDelay + i * wordGap, wn = `tw${i}`;
    kf += `@keyframes ${wn}{0%{opacity:0;transform:translateY(8px)}100%{opacity:1;transform:translateY(0)}}\n`;
    wordDivs += `<span style="display:inline-block;opacity:0;animation:${wn} 0.6s ease-out ${d}ms forwards;margin-right:7px">${words[i]}</span>`;
  }
  const attrDelay = startDelay + words.length * wordGap + 800;
  kf += `@keyframes attrin{0%{opacity:0;transform:translateY(10px)}100%{opacity:0.6;transform:translateY(0)}}\n`;
  kf += `@keyframes qfade{0%{opacity:0}8%{opacity:1}82%{opacity:1}100%{opacity:0}}\n`;
  dv += `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;animation:qfade 15s ease-in-out forwards;opacity:0;z-index:2">`;
  dv += `<div style="max-width:${Math.min(w * 0.7, 600)}px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;font-size:${Math.min(24, w * 0.03)}px;font-weight:300;color:#cff5e0;line-height:1.7;letter-spacing:0.02em;text-shadow:0 0 30px #25C75E44">${wordDivs}</div>`;
  dv += `<div style="margin-top:24px;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;font-size:${Math.min(16, w * 0.02)}px;font-style:italic;color:#25C75E;letter-spacing:0.05em;animation:attrin 0.8s ease-out ${attrDelay}ms forwards;opacity:0">${attribution}</div></div>`;
  const finaleStart = 12000;
  for (let i = 0; i < 60; i++) {
    const a = Math.random() * Math.PI * 2, sp = rng(100, 350);
    const dx = Math.cos(a) * sp, dy = Math.sin(a) * sp - 100;
    const sz = rng(3, 7), c = pick(DRIP_COLORS), dur = rng(1.2, 2.0), n = `f${id++}`;
    kf += `@keyframes ${n}{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(${dx}px,${dy+80}px) scale(0.2);opacity:0}}\n`;
    dv += `<div style="position:absolute;left:${w/2}px;top:${h/2}px;width:${sz}px;height:${sz}px;border-radius:50%;background:${c};box-shadow:0 0 ${sz*2}px ${c};animation:${n} ${dur}s ease-out ${finaleStart + rng(0, 400)}ms forwards;opacity:0;z-index:3"></div>`;
  }
  return dripWrap(w, h, kf, dv, 16000);
}

/** Its sounds: a soft pad under the words. */
const SOUND = `[0,5000,10000].forEach(function(d){at(d,function(){sfx.notes([[220,4,0],[277,4,0.4],[330,4,0.8]],"sine",0.04)})});`

export const timme: Drip = { name: 'timme', kind: 'one-shot', build: dripTimme, safetyMs: 17_000, isHidden: true, sound: SOUND }
