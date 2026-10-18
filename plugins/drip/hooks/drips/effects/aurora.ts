// aurora: a looping background drip, from the Glyphh app's drip effects
// (glyphh-ai/app, tag v2.0.2, src/shared/drips-effects.ts).
import type { Drip } from './drips.ts'
import { dripWrapLoop } from './shared.ts'

export function dripAurora(w: number, h: number, opacity: number): string {
  let kf = "", dv = "";
  kf += `@keyframes ashift1{0%{transform:translateX(0) scaleY(1)}25%{transform:translateX(60px) scaleY(1.2)}50%{transform:translateX(-40px) scaleY(0.8)}75%{transform:translateX(80px) scaleY(1.1)}100%{transform:translateX(0) scaleY(1)}}\n`;
  kf += `@keyframes ashift2{0%{transform:translateX(0) scaleY(1)}33%{transform:translateX(-70px) scaleY(1.3)}66%{transform:translateX(50px) scaleY(0.9)}100%{transform:translateX(0) scaleY(1)}}\n`;
  kf += `@keyframes apulse{0%,100%{opacity:0.4}50%{opacity:0.7}}\n`;
  const bands = [
    { colors: "#00ff8855,#00ffcc33,transparent", top: "5%", h: "35%", dur: 12, anim: "ashift1" },
    { colors: "#25C75E44,#4fffb044,transparent", top: "10%", h: "30%", dur: 16, anim: "ashift2" },
    { colors: "#0088ff33,#00ffcc22,transparent", top: "2%", h: "40%", dur: 20, anim: "ashift1" },
    { colors: "#8800ff22,#ff00ff11,transparent", top: "8%", h: "25%", dur: 14, anim: "ashift2" },
  ];
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i]!;
    dv += `<div style="position:absolute;left:-100px;right:-100px;top:${b.top};height:${b.h};background:linear-gradient(180deg,${b.colors});filter:blur(40px);animation:${b.anim} ${b.dur}s ease-in-out infinite,apulse ${b.dur * 0.7}s ease-in-out ${i * 2}s infinite;border-radius:50%"></div>`;
  }
  return dripWrapLoop(w, h, kf, dv, opacity);
}

/** Its sounds: a slow, soft pad. */
const SOUND = `every(4000,function(){var f=rnd(196,262);sfx.tone(f,4.5,"sine",0.04);sfx.tone(f*1.5,4.5,"sine",0.025)});`

export const aurora: Drip = { name: 'aurora', kind: 'loop', build: dripAurora, sound: SOUND }
