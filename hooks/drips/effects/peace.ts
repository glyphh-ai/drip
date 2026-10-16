// peace: a one-shot drip, from the Glyphh app's drip effects
// (glyphh-ai/app, tag v2.0.2, src/shared/drips-effects.ts).
import type { Drip } from './drips.ts'
import { DRIP_COOL, pick, rng, dripWrap } from './shared.ts'

export function dripPeace(w: number, h: number): string {
  let kf = "", dv = "", id = 0;
  const cx = w / 2, cy = h / 2;
  const peaceSigns = ["✌️", "✌🏻", "✌🏼", "✌🏽", "✌🏾", "✌🏿"];
  const calm = ["☮️", "🕊️", "🌿"];
  // Big center peace sign — slow zen entrance
  kf += `@keyframes bigpeace{0%{transform:scale(0) rotate(-15deg);opacity:0}20%{transform:scale(2.2) rotate(0deg);opacity:1}55%{transform:scale(2) rotate(4deg);opacity:1}75%{transform:scale(2.4) rotate(-3deg);opacity:1}100%{transform:scale(3.6) rotate(0deg);opacity:0}}\n`;
  dv += `<div style="position:absolute;left:${cx}px;top:${cy}px;font-size:120px;transform-origin:center;margin-left:-60px;margin-top:-60px;animation:bigpeace 3s ease-out forwards;opacity:0;filter:drop-shadow(0 0 30px rgba(80,255,180,0.6))">✌️</div>`;
  // Ring of peace signs radiating outward
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, sp = rng(220, 480);
    const dx = Math.cos(a) * sp, dy = Math.sin(a) * sp;
    const sz = rng(34, 56), dur = rng(1.5, 2.4), n = `pp${id++}`;
    kf += `@keyframes ${n}{0%{transform:translate(0,0) scale(0) rotate(0deg);opacity:0}25%{opacity:1;transform:translate(${dx*0.2}px,${dy*0.2}px) scale(1.1) rotate(${rng(-15,15)}deg)}100%{transform:translate(${dx}px,${dy+40}px) scale(0.5) rotate(${rng(-90,90)}deg);opacity:0}}\n`;
    dv += `<div style="position:absolute;left:${cx}px;top:${cy}px;font-size:${sz}px;animation:${n} ${dur}s ease-out ${700 + i * 80}ms forwards;opacity:0">${pick(peaceSigns)}</div>`;
  }
  // Cool-palette glow particles
  for (let i = 0; i < 50; i++) {
    const a = Math.random() * Math.PI * 2, sp = rng(140, 520);
    const dx = Math.cos(a) * sp, dy = Math.sin(a) * sp;
    const sz = rng(3, 8), c = pick(DRIP_COOL);
    const dur = rng(1.2, 2.2), n = `pg${id++}`;
    kf += `@keyframes ${n}{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(${dx}px,${dy + rng(40, 120)}px) scale(0.2);opacity:0}}\n`;
    dv += `<div style="position:absolute;left:${cx}px;top:${cy}px;width:${sz}px;height:${sz}px;border-radius:50%;background:${c};box-shadow:0 0 ${sz*2}px ${c};animation:${n} ${dur}s ease-out ${rng(500, 1300)}ms forwards;opacity:0"></div>`;
  }
  // Peace signs and calm symbols rising from below
  for (let i = 0; i < 18; i++) {
    const x = rng(w * 0.05, w * 0.95), delay = rng(900, 2800), dur = rng(2.2, 3.5);
    const rise = rng(h * 0.4, h * 0.75), sway = rng(-100, 100), sz = rng(26, 48), n = `pf${id++}`;
    const sym = pick([...peaceSigns, ...calm]);
    kf += `@keyframes ${n}{0%{transform:translate(0,0) scale(0.3);opacity:0}20%{opacity:1;transform:translate(${sway*0.2}px,${-rise*0.2}px) scale(1)}100%{transform:translate(${sway}px,${-rise}px) scale(0.5);opacity:0}}\n`;
    dv += `<div style="position:absolute;left:${x}px;top:${h*0.8}px;font-size:${sz}px;filter:drop-shadow(0 0 8px rgba(80,255,180,0.5));animation:${n} ${dur}s ease-out ${delay}ms forwards;opacity:0">${sym}</div>`;
  }
  // Doves gliding sideways
  for (let i = 0; i < 4; i++) {
    const fromLeft = i % 2 === 0;
    const startX = fromLeft ? -80 : w + 80;
    const travel = fromLeft ? w + 160 : -(w + 160);
    const y = rng(h * 0.15, h * 0.55), delay = 800 + i * 600, dur = rng(3.5, 4.5);
    const n = `pd${id++}`;
    const flip = fromLeft ? "" : "scaleX(-1)";
    kf += `@keyframes ${n}{0%{transform:translate(0,0) ${flip};opacity:0}15%{opacity:1}85%{opacity:1}100%{transform:translate(${travel}px,0) ${flip};opacity:0}}\n`;
    dv += `<div style="position:absolute;top:${y}px;left:${startX}px;font-size:48px;filter:drop-shadow(0 0 10px rgba(255,255,255,0.7));animation:${n} ${dur}s linear ${delay}ms forwards;opacity:0">🕊️</div>`;
  }
  return dripWrap(w, h, kf, dv, 5500);
}

/** Its sounds: a calm chime chord, twice. */
const SOUND = `[0,2500].forEach(function(d){at(d,function(){sfx.notes([[523,1.5,0],[659,1.5,0.3],[784,1.5,0.6],[988,1.8,0.9]],"sine",0.05)})});`

export const peace: Drip = { name: 'peace', kind: 'one-shot', build: dripPeace, sound: SOUND }
