// An effect's document for a host of a given size, as the app's overlay
// windows load it: a one-shot (its opacity, when named, set on <body>) or a
// looping background; and how long a one-shot may stay before it is closed.
// Every one lets the pointer through. With `sounds`, an effect plays its
// sounds; without, it is silent.
import { buildLoopHtml, buildOneShotHtml, oneShotSafetyMs, withSound } from './effects.ts'

export type Doc = { html: string; closeAfterMs: number; interactive: boolean }

export function oneShotDoc(effect: string, w: number, h: number, opacity: number, sounds = false): Doc {
  let html = buildOneShotHtml(effect, w, h)
  if (opacity > 0) html = html.replace('<body>', `<body style="opacity:${opacity}">`)
  html = withSound(html, effect, sounds)
  return { html, closeAfterMs: oneShotSafetyMs(effect), interactive: false }
}

export function loopDoc(effect: string, w: number, h: number, opacity: number, maxMs: number, sounds = false): Doc {
  return { html: withSound(buildLoopHtml(effect, w, h, opacity), effect, sounds), closeAfterMs: maxMs, interactive: false }
}
