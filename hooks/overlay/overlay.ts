// Copied from shared/overlay/overlay.ts by scripts/sync-shared.mjs: edit it there.
// The native overlay's command protocol (native/overlay.swift), pure.
//
//   drips-overlay screen   prints the screen under the cursor, one JSON line:
//                          {"x":0,"y":0,"w":1512,"h":982} (points, AppKit's
//                          global coordinates)
//   drips-overlay apps     prints the apps among its ancestors, nearest
//                          first: {"ancestors":[{"pid":436,"bundleId":
//                          "com.apple.Terminal","regular":true}]}
//   drips-overlay window   reads one WindowRequest on stdin and prints the
//                          target app's window, {"found":true,"id":N,"x":..,
//                          "y":..,"w":..,"h":..}, or the screen under the
//                          cursor with "found":false when it has none
//   drips-overlay play     reads one PlayRequest as JSON on stdin, opens a
//                          transparent, click-through window over its frame
//                          showing the document (layer "window": directly
//                          above the window `follow` names, following it ten
//                          times a second; layer "screen": above everything,
//                          on every Space), and prints one JSON line per
//                          event: {"t":"shown","pid":123} once on screen, then
//                          {"t":"closed","why":"signal"|"timeout"|"term"|"orphan"}
//                          as it exits, and {"t":"score","score":N} each time
//                          a game posts its score; {"t":"error","message":"..."} when it
//                          cannot. It closes on the document's __drip_close__,
//                          after closeAfterMs (clamped to OVERLAY_CAP_MS), on
//                          SIGTERM, or when its parent is gone. With
//                          "interactive":true (a game) the window takes the
//                          pointer and becomes key so the page hears clicks
//                          and Esc; otherwise it is click-through.
import type { Ancestor, Target } from './target.ts'

export const PROTOCOL_VERSION = 2
/** The overlay never stays longer than this, whatever it is asked. */
export const OVERLAY_CAP_MS = 30 * 60_000
export const OVERLAY_MIN_MS = 100

export type Screen = { x: number; y: number; w: number; h: number }
/** Where the window command found the target: its window, or (not found) the screen under the cursor. */
export type Located = { found: true; id: number; frame: Screen } | { found: false; frame: Screen }
export type Layer = 'window' | 'screen'
export type WindowRequest = { v: typeof PROTOCOL_VERSION; target: Target }
export type PlayRequest = {
  v: typeof PROTOCOL_VERSION
  html: string
  frame: Screen
  closeAfterMs: number
  layer: Layer
  follow: number | null
  /** A game: the overlay takes the pointer and keys instead of letting them through. */
  interactive: boolean
}
export type CloseReason = 'signal' | 'timeout' | 'term' | 'orphan'
export type OverlayEvent =
  | { t: 'shown'; pid: number }
  | { t: 'closed'; why: CloseReason }
  | { t: 'error'; message: string }
  | { t: 'score'; score: number }
  /** A page's ask, as it posted it ({__drip_ask__: text}): the console's "launch game blocks", "unlock". */
  | { t: 'ask'; ask: string }

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** The screen the overlay printed, if it is one. */
export function parseScreen(text: string): Screen | null {
  try {
    const s = JSON.parse(text.trim()) as Record<string, unknown>
    if (!isNum(s.x) || !isNum(s.y) || !isNum(s.w) || !isNum(s.h) || s.w <= 0 || s.h <= 0) return null
    return { x: s.x, y: s.y, w: s.w, h: s.h }
  } catch {
    return null
  }
}

export const clampMs = (ms: number) => Math.min(OVERLAY_CAP_MS, Math.max(OVERLAY_MIN_MS, Number.isFinite(ms) ? Math.round(ms) : OVERLAY_CAP_MS))

/** The window the overlay printed, or the screen it fell back to; null when it is neither. */
export function parseLocated(text: string): Located | null {
  try {
    const m = JSON.parse(text.trim()) as Record<string, unknown>
    const frame = parseScreen(JSON.stringify({ x: m.x, y: m.y, w: m.w, h: m.h }))
    if (!frame) return null
    if (m.found === true && isNum(m.id) && m.id > 0) return { found: true, id: m.id, frame }
    return m.found === false ? { found: false, frame } : null
  } catch {
    return null
  }
}

/** The apps the overlay found among its ancestors, nearest first; junk entries passed over. */
export function parseAncestors(text: string): Ancestor[] {
  try {
    const list = (JSON.parse(text.trim()) as { ancestors?: unknown }).ancestors
    if (!Array.isArray(list)) return []
    return list.flatMap((a: Record<string, unknown>) =>
      a && isNum(a.pid) && a.pid > 0 && typeof a.bundleId === 'string' && a.bundleId ? [{ pid: a.pid, bundleId: a.bundleId, regular: a.regular === true }] : [],
    )
  } catch {
    return []
  }
}

/** What `window` reads on stdin. */
export function windowRequest(target: Target): string {
  const req: WindowRequest = { v: PROTOCOL_VERSION, target }
  return JSON.stringify(req)
}

/** What `play` reads on stdin. */
export function playRequest(html: string, frame: Screen, closeAfterMs: number, layer: Layer, follow: number | null, interactive = false): string {
  const req: PlayRequest = { v: PROTOCOL_VERSION, html, frame, closeAfterMs: clampMs(closeAfterMs), layer, follow, interactive: interactive === true }
  return JSON.stringify(req)
}

const REASONS: readonly CloseReason[] = ['signal', 'timeout', 'term', 'orphan']

/** One line the overlay printed, if it is an event. */
export function parseEvent(line: string): OverlayEvent | null {
  try {
    const m = JSON.parse(line) as Record<string, unknown>
    if (m.t === 'shown' && isNum(m.pid) && m.pid > 0) return { t: 'shown', pid: m.pid }
    if (m.t === 'closed' && REASONS.includes(m.why as CloseReason)) return { t: 'closed', why: m.why as CloseReason }
    if (m.t === 'error' && typeof m.message === 'string') return { t: 'error', message: m.message }
    if (m.t === 'score' && isNum(m.score) && Number.isInteger(m.score) && m.score >= 0) return { t: 'score', score: m.score }
    if (m.t === 'ask' && typeof m.ask === 'string' && m.ask.length > 0 && m.ask.length <= 200) return { t: 'ask', ask: m.ask }
    return null
  } catch {
    return null
  }
}

/** Splits text that arrives in pieces into whole lines. */
export function lineSplitter(): (piece: string) => string[] {
  let rest = ''
  return piece => {
    const parts = (rest + piece).split('\n')
    rest = parts.pop() ?? ''
    return parts.map(l => l.trim()).filter(Boolean)
  }
}

/** Where the compiled overlay is kept: one binary per version of its source. */
export const binaryPath = (home: string, digest: string) => `${home.replace(/\/$/, '')}/Library/Caches/glyphh-overlay/overlay-${digest}`

/** Compiled through xcrun, which points swiftc at the macOS SDK: swiftc run by
 *  its own path cannot find the standard library on Command Line Tools alone. */
export const compileArgv = (source: string, out: string): string[] => [
  'xcrun',
  '--sdk',
  'macosx',
  'swiftc',
  '-O',
  '-o',
  out,
  source,
  '-framework',
  'AppKit',
  '-framework',
  'WebKit',
]

/** A short digest of a text: names the binary built from it. */
export async function digestOf(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest).slice(0, 8), b => b.toString(16).padStart(2, '0')).join('')
}
