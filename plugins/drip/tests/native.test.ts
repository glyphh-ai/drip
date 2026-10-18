import { describe, expect, test } from 'claude-code/testing'

import { nativeHost, type NativeDeps } from '../hooks/drips/native.ts'
import { MAC_ONLY, SWIFT_MISSING, ancestorsOf, eventsOf, prepareOverlay, type Placement, type RunResult } from '../hooks/overlay/host.ts'
import { binaryPath, digestOf, type OverlayEvent } from '../hooks/overlay/overlay.ts'
import type { Target } from '../hooks/overlay/target.ts'
import { flush } from './fakes.ts'

const SOURCE = 'import AppKit'
const ok = (stdout = ''): RunResult => ({ exitCode: 0, stdout, stderr: '' })
const bad = (stderr = ''): RunResult => ({ exitCode: 1, stdout: '', stderr })

/** An overlay process the test drives: its events pushed as the test says. */
function child() {
  const queue: (OverlayEvent | null)[] = []
  let wake: (() => void) | null = null
  const push = (ev: OverlayEvent | null) => {
    queue.push(ev)
    wake?.()
  }
  async function* events(): AsyncGenerator<OverlayEvent> {
    for (;;) {
      while (queue.length === 0) await new Promise<void>(r => (wake = r))
      const ev = queue.shift()!
      if (ev === null) return
      yield ev
    }
  }
  return { push, events }
}

function world(opts: { platform?: string; built?: boolean; xcode?: boolean; swiftc?: boolean; compiles?: boolean; home?: string } = {}) {
  const ran: string[][] = []
  const spawned: { argv: readonly string[]; input: string }[] = []
  const children: ReturnType<typeof child>[] = []
  const files = new Set<string>()
  const w = {
    screen: '{"x":0,"y":0,"w":1000,"h":500}',
    screenFails: false,
    window: '{"found":true,"id":79026,"x":799,"y":298,"w":1325,"h":1138}',
    windowFails: false,
    apps: '{"ancestors":[{"pid":48036,"bundleId":"com.anthropic.claudefordesktop","regular":true}]}',
    appsFail: false,
    sounds: true,
  }
  const stdins: (string | undefined)[] = []
  const d: NativeDeps = {
    run: async (argv, runOpts) => {
      ran.push([...argv])
      stdins.push(runOpts?.stdin)
      const [cmd] = argv
      if (cmd === 'uname') return ok(`${opts.platform ?? 'Darwin'}\n`)
      if (cmd === 'xcode-select') return opts.xcode === false ? bad('no developer tools') : ok('/Library/Developer/CommandLineTools\n')
      if (cmd === 'xcrun' && argv[1] === '--find') return opts.swiftc === false ? bad() : ok('/usr/bin/swiftc\n')
      if (cmd === 'xcrun') return opts.compiles === false ? bad('error: no such module WebKit\nmore') : ok()
      if (cmd === '/bin/mkdir' || cmd === '/bin/kill') return ok()
      if (cmd === '/bin/mv') {
        files.add(argv[3]!)
        return ok()
      }
      if (argv[1] === 'screen') return w.screenFails ? bad() : ok(w.screen)
      if (argv[1] === 'window') return w.windowFails ? bad() : ok(w.window)
      if (argv[1] === 'apps') return w.appsFail ? bad() : ok(w.apps)
      return null
    },
    spawn: (argv, input) => {
      spawned.push({ argv, input })
      const c = child()
      children.push(c)
      return c.events()
    },
    read: async () => SOURCE,
    exists: async path => files.has(path),
    home: async () => opts.home ?? '/Users/t',
    root: '/mods/drips',
    sounds: () => w.sounds,
  }
  return { d, ran, stdins, spawned, children, files, w }
}

describe('preparing the overlay', () => {
  test('built once with swiftc into the cache, then found there', async () => {
    const { d, ran, files } = world()
    const bin = binaryPath('/Users/t', await digestOf(SOURCE))
    expect(await prepareOverlay(d)).toEqual({ binary: bin })
    expect(ran).toContainEqual(['xcrun', '--sdk', 'macosx', 'swiftc', '-O', '-o', `${bin}.building`, '/mods/drips/hooks/overlay/overlay.swift', '-framework', 'AppKit', '-framework', 'WebKit'])
    expect(ran).toContainEqual(['/bin/mkdir', '-p', '/Users/t/Library/Caches/drip-overlay'])
    expect(files.has(bin)).toBe(true)
    ran.length = 0
    expect(await prepareOverlay(d)).toEqual({ binary: bin })
    expect(ran.some(a => a[0] === 'xcrun' && a[1] === '--sdk')).toBe(false)
  })

  test('not on a Mac, without the developer tools or swiftc, or when it does not build: what is missing', async () => {
    expect(await prepareOverlay(world({ platform: 'Linux' }).d)).toEqual({ missing: MAC_ONLY })
    const noTools = world({ xcode: false })
    expect(await prepareOverlay(noTools.d)).toEqual({ missing: SWIFT_MISSING })
    expect(noTools.ran.some(a => a[0] === 'xcrun')).toBe(false) // never the shim that offers an install
    expect(await prepareOverlay(world({ swiftc: false }).d)).toEqual({ missing: SWIFT_MISSING })
    expect(await prepareOverlay(world({ compiles: false }).d)).toEqual({ missing: "Drip's overlay did not build: error: no such module WebKit" })
    expect(await prepareOverlay(world({ home: '' }).d)).toEqual({ missing: "Drip's overlay needs HOME to be set." })
  })
})

const FULL: Placement = { kind: 'fullscreen' }
const TARGET: Target = { surface: 'desktop', bundleId: 'com.anthropic.claudefordesktop', pid: 48036, pick: 'largest' }

describe('the fullscreen host', () => {
  test('a one-shot: the screen under the pointer, then one overlay sized to it, above everything', async () => {
    const { d, spawned, children } = world()
    const host = nativeHost(d, '/bin/ov', FULL)
    const played = host.oneShot('confetti', 0.5)
    await flush()
    children[0]!.push({ t: 'shown', pid: 77 })
    await played
    expect(spawned[0]!.argv).toEqual(['/bin/ov', 'play'])
    const req = JSON.parse(spawned[0]!.input)
    expect(req).toMatchObject({ v: 2, frame: { x: 0, y: 0, w: 1000, h: 500 }, closeAfterMs: 8000, layer: 'screen', follow: null, interactive: false })
    expect(req.html).toContain('width:1000px;height:500px')
    expect(req.html).toContain('<body style="opacity:0.5">')
    children[0]!.push({ t: 'closed', why: 'signal' })
    children[0]!.push(null)
  })

  test('a persistent effect: its bound sent, ended by SIGTERM to its pid, told when it ends by itself', async () => {
    const { d, spawned, children, ran } = world()
    const host = nativeHost(d, '/bin/ov', FULL)
    let ended = 0
    const starting = host.persistent('aurora', 0.5, 60_000, () => ended++)
    await flush()
    children[0]!.push({ t: 'shown', pid: 4242 })
    const closer = await starting
    expect(JSON.parse(spawned[0]!.input)).toMatchObject({ closeAfterMs: 60_000, interactive: false })
    await closer.close()
    expect(ran).toContainEqual(['/bin/kill', '-TERM', '4242'])
    children[0]!.push({ t: 'closed', why: 'term' })
    children[0]!.push(null)
    await flush()
    expect(ended).toBe(1)
    ran.length = 0
    await closer.close() // gone already: no signal to a pid that may be another's now
    expect(ran).toEqual([])
  })

  test('an overlay that cannot open says why; a screen it cannot find is an error', async () => {
    const { d, children, w } = world()
    const host = nativeHost(d, '/bin/ov', FULL)
    const played = host.oneShot('hearts', -1)
    await flush()
    children[0]!.push({ t: 'error', message: 'not a play request' })
    await expect(played).rejects.toThrow("Drip's overlay did not open: not a play request")
    const silent = host.persistent('aurora', 0.5, 1000, () => {})
    await flush()
    children[1]!.push(null)
    await expect(silent).rejects.toThrow("Drip's overlay did not open")
    w.screenFails = true
    await expect(host.oneShot('hearts', -1)).rejects.toThrow('could not find the screen')
  })

  test("events from the child's output: stdout lines only, junk passed over", async () => {
    async function* chunks() {
      yield { stream: 'stderr', text: '{"t":"shown","pid":9}\n' }
      yield { stream: 'stdout', text: 'warning: something\n{"t":"shown",' }
      yield { stream: 'stdout', text: '"pid":9}\n{"t":"closed","why":"timeout"}\n' }
    }
    const got: OverlayEvent[] = []
    for await (const ev of eventsOf(chunks())) got.push(ev)
    expect(got).toEqual([
      { t: 'shown', pid: 9 },
      { t: 'closed', why: 'timeout' },
    ])
  })
})

describe("the host over Claude's window", () => {
  function placed(target: Target | null) {
    let missed = 0
    let asked = 0
    const place: Placement = {
      kind: 'window',
      target: async () => (asked++, target),
      missed: () => void missed++,
    }
    return { place, missed: () => missed, asked: () => asked }
  }

  async function playOnce(host: ReturnType<typeof nativeHost>, children: ReturnType<typeof world>['children']) {
    const played = host.oneShot('confetti', -1)
    await flush(30)
    children.at(-1)!.push({ t: 'shown', pid: 5 })
    await played
  }

  test('the target window found: the overlay over its frame, following it, the document sized to it', async () => {
    const { d, spawned, children, stdins, ran } = world()
    const p = placed(TARGET)
    await playOnce(nativeHost(d, '/bin/ov', p.place), children)
    expect(ran).toContainEqual(['/bin/ov', 'window'])
    expect(JSON.parse(stdins[ran.findIndex(a => a[1] === 'window')]!)).toEqual({ v: 2, target: TARGET })
    const req = JSON.parse(spawned[0]!.input)
    expect(req).toMatchObject({ v: 2, frame: { x: 799, y: 298, w: 1325, h: 1138 }, layer: 'window', follow: 79026 })
    expect(req.html).toContain('width:1325px;height:1138px')
    expect(p.missed()).toBe(0)
  })

  test('no such window: over the screen the overlay fell back to, not following; missed is told', async () => {
    const { d, spawned, children, w } = world()
    w.window = '{"found":false,"x":0,"y":0,"w":1440,"h":900}'
    const p = placed(TARGET)
    await playOnce(nativeHost(d, '/bin/ov', p.place), children)
    expect(JSON.parse(spawned[0]!.input)).toMatchObject({ frame: { x: 0, y: 0, w: 1440, h: 900 }, layer: 'window', follow: null })
    expect(p.missed()).toBe(1)
  })

  test('no target, or the window command failing: over the screen under the pointer; missed is told', async () => {
    for (const setup of [(_w: ReturnType<typeof world>['w']) => null as Target | null, (w: ReturnType<typeof world>['w']) => ((w.windowFails = true), TARGET)]) {
      const { d, spawned, children, w, ran } = world()
      const p = placed(setup(w))
      await playOnce(nativeHost(d, '/bin/ov', p.place), children)
      expect(JSON.parse(spawned[0]!.input)).toMatchObject({ frame: { x: 0, y: 0, w: 1000, h: 500 }, layer: 'window', follow: null })
      expect(ran).toContainEqual(['/bin/ov', 'screen'])
      expect(p.missed()).toBe(1)
    }
  })

  test("the apps among the overlay's ancestors; none when it cannot say", async () => {
    const { d, w } = world()
    expect(await ancestorsOf(d, '/bin/ov')).toEqual([{ pid: 48036, bundleId: 'com.anthropic.claudefordesktop', regular: true }])
    w.appsFail = true
    expect(await ancestorsOf(d, '/bin/ov')).toEqual([])
  })
})
