// Copied from shared/overlay/host.ts by scripts/sync-shared.mjs: edit it there.
// The native overlay (./overlay.swift), shared by every Glyphh mod that draws
// over Claude: over Claude's window (the window Claude is running in,
// followed as it moves) or over the whole screen. It is compiled with swiftc
// the first time it is needed and kept in ~/Library/Caches/glyphh-overlay,
// one binary per version of its source, so every mod uses the same one. Each
// document is one overlay process. Works on OverlayDeps, closures over `$`
// that the mod's hooks hand it.
import {
  binaryPath,
  compileArgv,
  digestOf,
  lineSplitter,
  parseAncestors,
  parseEvent,
  parseLocated,
  parseScreen,
  playRequest,
  windowRequest,
  type Layer,
  type OverlayEvent,
  type Screen,
} from './overlay.ts'
import type { Ancestor, Target } from './target.ts'

export type RunResult = { exitCode: number; stdout: string; stderr: string }
export type RunOptions = { timeoutMs?: number; stdin?: string }

export type OverlayDeps = {
  /** A command's result, or null when it could not start. */
  run(argv: readonly string[], opts?: RunOptions): Promise<RunResult | null>
  /** Starts `argv` with `input` on stdin: the overlay's events, in order, until it exits. */
  spawn(argv: readonly string[], input: string): AsyncIterable<OverlayEvent>
  read(path: string): Promise<string>
  exists(path: string): Promise<boolean>
  home(): Promise<string | undefined>
  /** The mod's folder. */
  root: string
}

/** One document for the overlay: its page, how long it may stay, and whether
 *  it takes the pointer and keys (a game) or lets them through. */
export type Doc = { html: string; closeAfterMs: number; interactive: boolean }

export const SWIFT_MISSING = "Glyphh's overlay needs Swift: install the Xcode Command Line Tools (xcode-select --install)."
export const MAC_ONLY = "Glyphh's overlay needs macOS."
const BUILD_MS = 5 * 60_000
const ASK_MS = 10_000

export type Prepared = { binary: string } | { missing: string }

const firstLine = (text: string) => text.trim().split('\n')[0]?.slice(0, 160) ?? ''

/** The overlay's events from a spawned child's output pieces. */
export async function* eventsOf(chunks: AsyncIterable<{ stream: string; text: string }>): AsyncGenerator<OverlayEvent> {
  const split = lineSplitter()
  for await (const chunk of chunks) {
    if (chunk.stream !== 'stdout') continue
    for (const line of split(chunk.text)) {
      const ev = parseEvent(line)
      if (ev) yield ev
    }
  }
}

/** The overlay binary for this copy of the mod: the one built before, or built now. */
export async function prepareOverlay(d: OverlayDeps): Promise<Prepared> {
  if ((await d.run(['uname', '-s']))?.stdout.trim() !== 'Darwin') return { missing: MAC_ONLY }
  const home = await d.home()
  if (!home) return { missing: "Glyphh's overlay needs HOME to be set." }
  const source = `${d.root}/hooks/overlay/overlay.swift`
  const binary = binaryPath(home, await digestOf(await d.read(source)))
  if (await d.exists(binary)) return { binary }
  if ((await d.run(['xcode-select', '-p']))?.exitCode !== 0) return { missing: SWIFT_MISSING }
  const found = await d.run(['xcrun', '--find', 'swiftc'])
  const swiftc = found?.exitCode === 0 ? found.stdout.trim() : ''
  if (!swiftc) return { missing: SWIFT_MISSING }
  await d.run(['/bin/mkdir', '-p', binary.slice(0, binary.lastIndexOf('/'))])
  const building = `${binary}.building`
  const built = await d.run(compileArgv(source, building), { timeoutMs: BUILD_MS })
  if (built?.exitCode !== 0) return { missing: `Glyphh's overlay did not build: ${firstLine(built?.stderr ?? 'swiftc did not run')}` }
  const moved = await d.run(['/bin/mv', '-f', building, binary])
  if (moved?.exitCode !== 0) return { missing: `Glyphh's overlay could not be kept: ${firstLine(moved?.stderr ?? '')}` }
  return { binary }
}

/** The apps among the overlay's ancestors: the ones hosting this session. */
export async function ancestorsOf(d: OverlayDeps, binary: string): Promise<Ancestor[]> {
  const r = await d.run([binary, 'apps'], { timeoutMs: ASK_MS })
  return r?.exitCode === 0 ? parseAncestors(r.stdout) : []
}

/** Where an overlay goes: over the whole screen, or over the window `target`
 *  names (`missed` is told when there is no such window, and the effect plays
 *  over the screen under the pointer instead). */
export type Placement = { kind: 'fullscreen' } | { kind: 'window'; target(): Promise<Target | null>; missed(): void }

type Spot = { frame: Screen; layer: Layer; follow: number | null }
/** An overlay on screen: its process, and when it has gone. */
export type Shown = { pid: number; closed: Promise<void> }
/** What the overlay says while it is up (a game's score). */
export type Heard = (ev: OverlayEvent) => Promise<void>

/** Shows documents in overlays where `place` says. */
export function overlayHost(d: OverlayDeps, binary: string, place: Placement): { show(doc: (s: Screen) => Doc, heard?: Heard): Promise<Shown> } {
  async function screen(): Promise<Screen> {
    const r = await d.run([binary, 'screen'], { timeoutMs: ASK_MS })
    const s = r?.exitCode === 0 ? parseScreen(r.stdout) : null
    if (!s) throw new Error("Glyphh's overlay could not find the screen.")
    return s
  }

  async function spot(): Promise<Spot> {
    if (place.kind === 'fullscreen') return { frame: await screen(), layer: 'screen', follow: null }
    const target = await place.target()
    if (target) {
      const r = await d.run([binary, 'window'], { timeoutMs: ASK_MS, stdin: windowRequest(target) })
      const located = r?.exitCode === 0 ? parseLocated(r.stdout) : null
      if (located?.found) return { frame: located.frame, layer: 'window', follow: located.id }
      if (located) {
        place.missed()
        return { frame: located.frame, layer: 'window', follow: null }
      }
    }
    place.missed()
    return { frame: await screen(), layer: 'window', follow: null }
  }

  /** Opens one overlay; resolves once it is on screen. */
  async function show(doc: (s: Screen) => Doc, heard?: Heard): Promise<Shown> {
    const s = await spot()
    const { html, closeAfterMs, interactive } = doc(s.frame)
    const events = d.spawn([binary, 'play'], playRequest(html, s.frame, closeAfterMs, s.layer, s.follow, interactive))[Symbol.asyncIterator]()
    const first = await events.next()
    if (first.done || first.value.t !== 'shown') {
      const said = !first.done && first.value.t === 'error' ? `: ${first.value.message}` : ''
      throw new Error(`Glyphh's overlay did not open${said}`)
    }
    const closed = (async () => {
      // Read to the end (the child has exited), hearing what it says on the way.
      for (let ev = await events.next(); !ev.done; ev = await events.next()) await heard?.(ev.value)
    })()
    return { pid: first.value.pid, closed }
  }

  return { show }
}
