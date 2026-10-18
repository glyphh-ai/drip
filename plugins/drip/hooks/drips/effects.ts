// The drip system's pure half, shared by every surface: the registries built
// from the drips (one file each, listed in ./effects/index.ts), the recipe
// grammar, and the documents the overlay loads. Ported from the Glyphh app
// (glyphh-ai/app, tag v2.0.2, src/shared/drips-effects.ts).
//
// Every document closes itself with the drip close signal (./effects/shared.ts)
// but a looping one, which plays until it is stopped.

import type { LoopDrip, OneShotDrip } from './effects/drips.ts'
import { DRIPS } from './effects/index.ts'
import { CLOSE_SIGNAL, soundScript } from './effects/shared.ts'
import { DRIP_SAFETY_MS, type FolderDrip } from '../content/folders.ts'

// ── Effect registries ───────────────────────────────────────

const loops = DRIPS.filter((d): d is LoopDrip => d.kind === "loop");
const oneShots = DRIPS.filter((d): d is OneShotDrip => d.kind === "one-shot");

export const LOOP_EFFECTS: Record<string, (w: number, h: number, opacity: number) => string> =
  Object.fromEntries(loops.map(d => [d.name, d.build]));

function wrapOneShot(builder: (w: number, h: number, opacity: number) => string): (w: number, h: number) => string {
  return (w, h) => {
    const html = builder(w, h, 0.8);
    return html.replace("</body></html>", `<script>setTimeout(function(){${CLOSE_SIGNAL}},8000)</${"script"}></body></html>`);
  };
}

/** Every drip played once: the one-shots, then the looping backgrounds
 *  bounded at 8 s. */
export const ONE_SHOT_EFFECTS: Record<string, (w: number, h: number) => string> = Object.fromEntries([
  ...oneShots.map(d => [d.name, d.build] as const),
  ...loops.map(d => [d.name, wrapOneShot(d.build)] as const),
]);

const hidden = new Set(oneShots.filter(d => d.isHidden).map(d => d.name));

/** Flat name list (compat surface: `.drip list`, agent list_drips). A hidden
 *  drip (timme, an easter egg) is playable by name, never listed. */
export const BUILTIN_EFFECTS = Object.keys(ONE_SHOT_EFFECTS).filter(k => !hidden.has(k));

// ── Builtin-effect catalog (the drips menus' surface) ───────

export interface BuiltinEffectInfo {
  name: string;
  /** 'loop' effects are ambient backgrounds (previewed as a bounded one-shot,
   *  run persistent via `-1 <name>`); 'one-shot' effects play once and end. */
  kind: "one-shot" | "loop";
}

/** Every listed effect, one-shots first then the looping
 *  backgrounds: the structured list the drips menus render. */
export const BUILTIN_EFFECT_LIST: BuiltinEffectInfo[] = [
  ...BUILTIN_EFFECTS.filter(k => !(k in LOOP_EFFECTS)).map(name => ({ name, kind: "one-shot" as const })),
  ...Object.keys(LOOP_EFFECTS).map(name => ({ name, kind: "loop" as const })),
];

// ── Recipe grammar ──────────────────────────────────────────
//
// A recipe is whitespace-separated tokens, order-free:
//   `-1`            → persistent (looping) run
//   0 < n < 1       → opacity
//   integer n ≥ 1   → repeat count (capped at 10)
//   anything else   → an effect name (custom names expand via `resolveEffect`)

export interface ParsedDripRecipe {
  /** -1 = persistent; otherwise the repeat count (1..10). */
  count: number;
  /** 0..1, or -1 when the recipe named none. */
  opacity: number;
  effects: string[];
}

/**
 * Parse a raw drip recipe. `resolveEffect` maps a name to its expansion
 * (a custom drip's effect list) or null for a plain effect name — the
 * desktop passes its customs cache; the web preview path passes nothing
 * (menu tiles already carry raw recipes).
 */
export function parseDripRecipe(raw: string, resolveEffect?: (name: string) => string[] | null): ParsedDripRecipe {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  let count = 1;
  let opacity = -1;
  const effects: string[] = [];

  for (const p of parts) {
    const n = parseFloat(p);
    if (p === "-1") { count = -1; }
    else if (!isNaN(n) && n > 0 && n < 1) { opacity = n; }
    else if (!isNaN(n) && Number.isInteger(n) && n > 0) { count = Math.min(n, 10); }
    else {
      const name = p.toLowerCase();
      const expanded = resolveEffect?.(name);
      if (expanded) effects.push(...expanded);
      else effects.push(name);
    }
  }

  if (effects.length === 0) effects.push("fireworks");
  return { count, opacity, effects };
}

// ── The person's own drips (../content/folders.ts) ──────────

/** Their drips by name, as the drips' half last read them. */
let yours: Readonly<Record<string, FolderDrip>> = {}
/** Sounds off: their drips start muted, as the built-in ones play silent. */
let isQuiet = false

/** Sets the person's own drips, read again before each play and listing. */
export function setYourDrips(drips: readonly FolderDrip[], quiet: boolean): void {
  yours = Object.fromEntries(drips.map(d => [d.name, d]))
  isQuiet = quiet
}

/** The person's own drips, as last set. */
export function yourDrips(): FolderDrip[] {
  return Object.values(yours)
}

/** A drip that plays: built in (hidden ones too) or the person's own. */
export function isKnownEffect(name: string): boolean {
  return name in ONE_SHOT_EFFECTS || name in yours
}

// ── Effect-doc assembly ─────────────────────────────────────

/** One-shot document (unknown names fall back to fireworks). */
export function buildOneShotHtml(effect: string, w: number, h: number): string {
  if (!ONE_SHOT_EFFECTS[effect] && yours[effect]) return yours[effect]!.build(w, h, 1, isQuiet);
  const builder = ONE_SHOT_EFFECTS[effect] || ONE_SHOT_EFFECTS.fireworks!;
  return builder(w, h);
}

/** Looping document; a one-shot name plays its bounded doc instead. */
export function buildLoopHtml(effect: string, w: number, h: number, opacity: number): string {
  const builder = LOOP_EFFECTS[effect];
  if (builder) return builder(w, h, opacity);
  if (!ONE_SHOT_EFFECTS[effect] && yours[effect]) return yours[effect]!.build(w, h, opacity, isQuiet);
  const oneShot = ONE_SHOT_EFFECTS[effect] || ONE_SHOT_EFFECTS.fireworks!;
  return oneShot(w, h);
}

/** A document with its effect's sounds when `isOn`: its script goes in just
 *  before </body>. */
export function withSound(html: string, effect: string, isOn: boolean): string {
  const sound = DRIPS.find(d => d.name === effect)?.sound;
  const at = html.lastIndexOf("</body>");
  if (!isOn || !sound || at < 0) return html;
  return html.slice(0, at) + soundScript(sound) + html.slice(at);
}

/** Backstop teardown for a one-shot whose close signal never arrives: the
 *  drip's own, 8 s otherwise. */
export function oneShotSafetyMs(effect: string): number {
  if (!ONE_SHOT_EFFECTS[effect] && yours[effect]) return DRIP_SAFETY_MS;
  const drip = DRIPS.find(d => d.name === effect);
  return (drip && drip.kind !== "loop" ? drip.safetyMs : undefined) ?? 8000;
}
