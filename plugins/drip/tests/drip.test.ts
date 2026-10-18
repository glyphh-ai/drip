import type { On } from 'claude-code'
import { describe, expect, mock, test, type Engine } from 'claude-code/testing'

import { BUILTIN_EFFECT_LIST } from '../hooks/drips/effects.ts'
import { PERSISTENT_CAP_MS, PREVIEW_MAX_MS } from '../hooks/drips/manager.ts'
import { NODE_MISSING } from '../hooks/drips/node.ts'
import { MAC_ONLY, SWIFT_MISSING } from '../hooks/overlay/host.ts'
import { CLAUDE_DESKTOP } from '../hooks/overlay/target.ts'
import { CLAUDE_APP, CLAUDE_WINDOW, SCREEN, T0, callTool, endTurn, runCommand, startSession, world, type WorldOptions } from './engine.ts'
const MISSED = "Drips could not find Claude's window: effects play over the screen under the pointer."

/** A session of the mod on this machine. */
async function started($: Engine, on: On, store: Record<string, unknown> = {}, options: WorldOptions = {}) {
  mock.store(on, store)
  const clock = mock.clock(on, { now: T0 })
  const w = world(on, options)
  await startSession($)
  const run = (command: string, args?: string) => runCommand($, command, args)
  return { ...w, clock, run }
}

/** Moves the clock until `done` holds: what a play starts finishes in the
 *  background, and on a slow machine it takes more than one turn of it. */
async function until(clock: { advance(ms: number): Promise<unknown> }, done: () => boolean) {
  for (let i = 0; i < 200 && !done(); i++) await clock.advance(0)
}

describe("/drip over Claude's window (the default)", () => {
  test('the commands and tools are registered at the start', async ($, on) => {
    const { commands, tools } = await started($, on)
    expect(commands).toEqual(['drip'])
    expect(tools).toEqual(['play_drip', 'list_drips'])
  })

  test("in the desktop app: the overlay is built once, finds the Claude app's largest window and follows it", async ($, on) => {
    const { run, clock, ran, overlays, windowAsks, page } = await started($, on, {}, { noNode: true })
    expect(await run('drip', 'confetti')).toBe('drip: confetti')
    await until(clock, () => overlays.length > 0)
    expect(windowAsks).toEqual([{ v: 2, target: { surface: 'desktop', bundleId: CLAUDE_DESKTOP, pid: CLAUDE_APP.pid, pick: 'largest' } }])
    expect(overlays[0]!.request).toMatchObject({ v: 2, frame: CLAUDE_WINDOW.frame, layer: 'window', follow: CLAUDE_WINDOW.id, closeAfterMs: 8000 })
    expect(overlays[0]!.request.html).toContain('width:1325px;height:1138px')
    await run('drip', 'hearts')
    await until(clock, () => overlays.length > 1)
    expect(ran.filter(a => a[0] === 'xcrun' && a[1] === '--sdk')).toHaveLength(1)
    expect(ran.filter(a => a[1] === 'apps')).toHaveLength(1) // the ancestors are asked once a load
    expect(windowAsks).toHaveLength(2) // the window, each effect: it may have moved
    expect(page.starts).toBe(0) // no page, and no Node needed
  })

  test("in a terminal: the frontmost window of the terminal hosting Claude Code", async ($, on) => {
    const ghostty = { pid: 812, bundleId: 'com.mitchellh.ghostty', regular: true }
    const { run, clock, overlays, windowAsks } = await started($, on, {}, { surfaces: ['terminal'], ancestors: [ghostty] })
    await run('drip', 'stars')
    await until(clock, () => overlays.length > 0)
    expect(windowAsks).toEqual([{ v: 2, target: { surface: 'terminal', bundleId: 'com.mitchellh.ghostty', pid: 812, pick: 'frontmost' } }])
  })

  test('in a terminal under tmux: the terminal the environment names', async ($, on) => {
    const env = { TERM_PROGRAM: 'tmux', __CFBundleIdentifier: 'com.googlecode.iterm2' }
    const { run, clock, overlays, windowAsks } = await started($, on, {}, { surfaces: ['terminal'], ancestors: [], env })
    await run('drip', 'stars')
    await until(clock, () => overlays.length > 0)
    expect(windowAsks).toEqual([{ v: 2, target: { surface: 'terminal', bundleId: 'com.googlecode.iterm2', pid: null, pick: 'frontmost' } }])
  })

  test('no window found: over the screen under the pointer, said once', async ($, on) => {
    const { run, clock, overlays, toasts } = await started($, on, {}, { noWindow: true })
    await run('drip', 'confetti')
    await until(clock, () => overlays.length > 0)
    await run('drip', 'hearts')
    await until(clock, () => overlays.length > 1)
    expect(overlays[0]!.request).toMatchObject({ frame: SCREEN, layer: 'window', follow: null })
    expect(toasts).toEqual([MISSED])
  })

  test('nothing names a window (a terminal not known, no app above it): over the screen under the pointer', async ($, on) => {
    const { run, clock, overlays, windowAsks, toasts } = await started($, on, {}, { surfaces: ['terminal'], ancestors: [] })
    await run('drip', 'confetti')
    await until(clock, () => overlays.length > 0)
    expect(windowAsks).toEqual([])
    expect(overlays[0]!.request).toMatchObject({ frame: SCREEN, layer: 'window', follow: null })
    expect(toasts).toEqual([MISSED])
  })

  test('a persistent effect follows the window until fired again or stopped', async ($, on) => {
    const { run, ran, overlays } = await started($, on)
    await run('drip', '-1 aurora')
    expect(overlays[0]!.request).toMatchObject({ layer: 'window', follow: CLAUDE_WINDOW.id, closeAfterMs: PERSISTENT_CAP_MS })
    await run('drip', 'stop')
    expect(ran).toContainEqual(['/bin/kill', '-TERM', String(overlays[0]!.pid)])
  })

  test('without the Command Line Tools nothing plays: a toast says so once, the play says why', async ($, on) => {
    const { run, clock, toasts, overlays } = await started($, on, {}, { noSwift: true })
    expect(await run('drip', 'confetti')).toBe(`/drip: ${SWIFT_MISSING}`)
    expect(await run('drip', '-1 aurora')).toBe(`/drip: ${SWIFT_MISSING}`)
    expect(await callTool($, 'mcp__glyphh-drip__play_drip', { recipe: 'hearts' })).toBe(`Not played: ${SWIFT_MISSING}`)
    await clock.advance(5000)
    expect(toasts).toEqual([SWIFT_MISSING])
    expect(overlays).toEqual([])
  })

  test('not a Mac: nothing plays, said once', async ($, on) => {
    const { run, toasts, overlays } = await started($, on, {}, { notMac: true })
    expect(await run('drip', 'confetti')).toBe(`/drip: ${MAC_ONLY}`)
    expect(await run('drip', 'hearts')).toBe(`/drip: ${MAC_ONLY}`)
    expect(toasts).toEqual([MAC_ONLY])
    expect(overlays).toEqual([])
  })

  test('counted effects arrive 1500 ms apart', async ($, on) => {
    const { run, clock, overlays } = await started($, on)
    expect(await run('drip', '2 hearts stars')).toBe('drip: hearts + stars x2')
    await until(clock, () => overlays.length > 0)
    expect(overlays).toHaveLength(1)
    await clock.advance(1500)
    await until(clock, () => overlays.length > 1)
    expect(overlays).toHaveLength(2)
    await clock.advance(3000)
    await until(clock, () => overlays.length > 3)
    expect(overlays).toHaveLength(4)
  })

  test('save, list and delete keep recipes in the store and show them on the page', async ($, on) => {
    const { run, page, clock } = await started($, on)
    await run('drip', 'page')
    expect(await run('drip', 'save Party 3 hearts')).toBe('saved drip "party" → 3 hearts')
    expect(await run('drip', 'list')).toContain('custom: party → 3 hearts')
    expect(await run('drip', 'party')).toBe('drip: hearts x3')
    await until(clock, () => page.library.at(-1)?.drips?.length === 1)
    expect(page.library.at(-1)?.drips).toEqual([{ name: 'party', recipe: '3 hearts' }])
    expect(await run('drip', 'delete party')).toBe('deleted drip "party"')
    await until(clock, () => page.library.at(-1)?.drips?.length === 0)
    expect(page.library.at(-1)?.drips).toEqual([])
  })

  test('a browser-pane stored by 1.1 plays over Claude\'s window', { options: { display: 'browser-pane' } }, async ($, on) => {
    const { run, clock, overlays, mcp } = await started($, on)
    expect(await run('drip', 'confetti')).toBe('drip: confetti')
    await until(clock, () => overlays.length > 0)
    expect(overlays[0]!.request).toMatchObject({ layer: 'window', follow: CLAUDE_WINDOW.id })
    expect(mcp).toEqual([])
  })
})

describe('/drip page', () => {
  test('opens the page; open already, it is brought to the front', async ($, on) => {
    const { run, mcp } = await started($, on)
    expect(await run('drip', 'page')).toBe('Drips page ✓')
    expect(await run('drip', 'page')).toBe('Drips page ✓')
    expect(mcp).toEqual(['Claude_Browser.preview_start', 'Claude_Browser.tabs_select'])
  })

  test("outside the desktop app it opens in the person's browser", async ($, on) => {
    const { run, ran } = await started($, on, {}, { surfaces: ['terminal'] })
    expect(await run('drip', 'page')).toBe('Drips page: opened in your browser')
    expect(ran.find(a => a[0] === 'open')?.[1]).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?k=once$/)
  })

  test("the page's asks: a preview over Claude's window bounded to 12 s, a stop, a save (a rename drops the old name), a delete", async ($, on) => {
    const { run, clock, page, overlays, ran } = await started($, on, { customs: { old: 'stars' } })
    await run('drip', 'page')
    page.say({ t: 'play', recipe: '-1 matrix' })
    await clock.advance(1000)
    await until(clock, () => overlays.length > 0)
    expect(overlays[0]!.request).toMatchObject({ layer: 'window', follow: CLAUDE_WINDOW.id, closeAfterMs: PREVIEW_MAX_MS })
    page.say({ t: 'stop' })
    await clock.advance(1000)
    expect(ran).toContainEqual(['/bin/kill', '-TERM', String(overlays[0]!.pid)])
    page.say({ t: 'save', name: 'Party', recipe: '3 hearts', original: 'old' })
    await clock.advance(1000)
    expect(page.library.at(-1)?.drips).toEqual([{ name: 'party', recipe: '3 hearts' }])
    page.say({ t: 'save', name: 'x', recipe: '3' })
    page.say({ t: 'delete', name: 'party' })
    await clock.advance(1000)
    expect(page.library.at(-1)?.drips).toEqual([])
  })

  test('a reload finds the page again', async ($, on) => {
    const { run, page } = await started($, on)
    await run('drip', 'page')
    await startSession($)
    expect(page.starts).toBe(1)
  })

  test("a preview where the overlay cannot run: the toast once, nothing plays", async ($, on) => {
    const { run, clock, page, toasts, overlays } = await started($, on, {}, { noSwift: true })
    await run('drip', 'page')
    page.say({ t: 'play', recipe: 'stars' })
    await clock.advance(1000)
    page.say({ t: 'play', recipe: 'hearts' })
    await clock.advance(1000)
    expect(toasts).toEqual([SWIFT_MISSING])
    expect(overlays).toEqual([])
  })

  test('without Node there is no page: it says what to install', async ($, on) => {
    const { run } = await started($, on, {}, { noNode: true })
    expect(await run('drip', 'page')).toBe(NODE_MISSING)
  })
})

describe('fullscreen', () => {
  const FULL = { options: { display: 'fullscreen' } }

  test('builds the overlay with swiftc once, then plays each effect in its own overlay over the screen, above everything', FULL, async ($, on) => {
    const { run, clock, ran, overlays } = await started($, on)
    expect(await run('drip', 'confetti')).toBe('drip: confetti')
    await until(clock, () => overlays.length > 0)
    expect(ran.filter(a => a[0] === 'xcrun' && a[1] === '--sdk')).toHaveLength(1)
    expect(overlays).toHaveLength(1)
    expect(overlays[0]!.request).toMatchObject({ v: 2, frame: SCREEN, layer: 'screen', follow: null, closeAfterMs: 8000 })
    expect(overlays[0]!.request.html).toContain('width:1440px;height:900px')
    await run('drip', 'hearts')
    await until(clock, () => overlays.length > 1)
    expect(ran.filter(a => a[0] === 'xcrun' && a[1] === '--sdk')).toHaveLength(1)
    expect(overlays).toHaveLength(2)
  })

  test('a persistent effect stays until fired again or stopped: its overlay is sent SIGTERM', FULL, async ($, on) => {
    const { run, ran, overlays } = await started($, on)
    await run('drip', '-1 aurora')
    expect(overlays[0]!.request.closeAfterMs).toBe(PERSISTENT_CAP_MS)
    await run('drip', '-1 aurora')
    expect(ran).toContainEqual(['/bin/kill', '-TERM', String(overlays[0]!.pid)])
    expect(overlays[0]!.ended).toBe(true)
    await run('drip', '-1 plasma')
    await run('drip', 'stop')
    expect(overlays[1]!.ended).toBe(true)
  })

  test("an overlay that ends by itself is forgotten", FULL, async ($, on) => {
    const { run, clock, overlays } = await started($, on)
    await run('drip', '-1 aurora')
    overlays[0]!.end('timeout')
    await clock.advance(0)
    await run('drip', '-1 aurora')
    expect(overlays).toHaveLength(2)
  })

  test("a preview from the page plays over the whole screen too, bounded to 12 s", FULL, async ($, on) => {
    const { run, clock, page, overlays } = await started($, on)
    await run('drip', 'page')
    page.say({ t: 'play', recipe: '-1 stars' })
    await clock.advance(1000)
    await until(clock, () => overlays.length > 0)
    expect(overlays[0]!.request).toMatchObject({ layer: 'screen', closeAfterMs: PREVIEW_MAX_MS })
    expect(page.library.at(-1)?.display).toBe('fullscreen')
  })
})

describe('the tools Claude calls', () => {
  test('play_drip plays a recipe or stops; it does not save, delete or list', async ($, on) => {
    const { clock, overlays } = await started($, on)
    expect(await callTool($, 'mcp__glyphh-drip__play_drip', { recipe: 'fireworks' })).toBe('drip: fireworks')
    await until(clock, () => overlays.length > 0)
    expect(overlays).toHaveLength(1)
    expect(await callTool($, 'mcp__glyphh-drip__play_drip', { recipe: 'stop' })).toBe('stopped all persistent effects')
    expect(await callTool($, 'mcp__glyphh-drip__play_drip', { recipe: 'save x confetti' })).toBe('play_drip takes a recipe or "stop"; list_drips lists the effects.')
  })

  test("play_drip's failure is its result", async ($, on) => {
    await started($, on, {}, { notMac: true })
    expect(await callTool($, 'mcp__glyphh-drip__play_drip', { recipe: '-1 aurora' })).toBe(`Not played: ${MAC_ONLY}`)
  })

  test("list_drips lists the effects and the person's drips", async ($, on) => {
    await started($, on, { customs: { party: '3 hearts' } })
    expect(await callTool($, 'mcp__glyphh-drip__list_drips')).toBe(JSON.stringify({ effects: BUILTIN_EFFECT_LIST, yours: [], custom: [{ name: 'party', recipe: '3 hearts' }], running: [] }))
  })
})

describe('free for everyone', () => {
  test('nothing stored: every drip plays, fullscreen too, any number of saved drips, the tools work, and the games play', { options: { display: 'fullscreen' } }, async ($, on) => {
    const { run, clock, overlays } = await started($, on)
    for (const name of ['a', 'b', 'c', 'd', 'e']) expect(await run('drip', `save ${name} stars`)).toBe(`saved drip "${name}" → stars`)
    expect(await run('drip', 'confetti')).toBe('drip: confetti')
    await until(clock, () => overlays.length > 0)
    expect(overlays[0]!.request.layer).toBe('screen')
    expect(await callTool($, 'mcp__glyphh-drip__play_drip', { recipe: 'hearts' })).toBe('drip: hearts')
    expect(await callTool($, 'mcp__glyphh-drip__list_drips')).toContain('"a"')
    expect(await run('drip', 'a')).toBe('drip: stars')
    expect(await run('drip')).not.toContain('unlock')
    expect(await run('drip', 'blocks')).toBe('Blocks. Esc quits, M mutes.')
  })

  test("a page's preview plays", async ($, on) => {
    const { run, clock, page, overlays } = await started($, on)
    await run('drip', 'page')
    page.say({ t: 'play', recipe: 'stars' })
    await clock.advance(1000)
    await until(clock, () => overlays.length > 0)
    expect(overlays).toHaveLength(1)
  })
})

describe('the fun hooks', () => {
  const FUN = { options: { matrix_while_tools: true, confetti_after_long_turn: true } }

  test('off unless set: a tool call and a long turn play nothing', async ($, on) => {
    const { clock, overlays } = await started($, on)
    expect(await callTool($, 'Bash', { command: 'ls' })).toEqual({ stdout: 'ok' })
    await endTurn($, 10 * 60_000)
    await clock.advance(5000)
    expect(overlays).toEqual([])
  })

  test('a matrix while a tool runs, gone a moment after it; confetti after a turn over two minutes', FUN, async ($, on) => {
    const { overlays, clock } = await started($, on)
    expect(await callTool($, 'Bash', { command: 'ls' })).toEqual({ stdout: 'ok' })
    await until(clock, () => overlays.length > 0)
    expect(overlays[0]!.request.closeAfterMs).toBe(PERSISTENT_CAP_MS)
    await clock.advance(2000)
    await until(clock, () => overlays[0]!.ended)
    expect(overlays[0]!.ended).toBe(true)
    await endTurn($, 3 * 60_000)
    await until(clock, () => overlays.length > 1)
    expect(overlays).toHaveLength(2)
    await endTurn($, 30_000)
    await endTurn($, 3 * 60_000, { agentId: 'sub-1' })
    await clock.advance(0)
    expect(overlays).toHaveLength(2)
  })

  test("Drips's own tools and subagents' tools bring no matrix", FUN, async ($, on) => {
    const { overlays, clock } = await started($, on)
    await callTool($, 'mcp__glyphh-drip__list_drips')
    await $.tool.call({ tool: 'Bash', input: { command: 'ls' }, agentId: 'sub-1' } as never)
    await clock.advance(0)
    expect(overlays).toEqual([])
  })
})
