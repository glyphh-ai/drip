import type { On } from 'claude-code'
import { describe, expect, mock, test, type Engine } from 'claude-code/testing'

import { SWIFT_MISSING } from '../../hooks/overlay/host.ts'
import { CLAUDE_DESKTOP } from '../../hooks/overlay/target.ts'
import { DEFAULT_SETTINGS, settingsOf } from '../../hooks/arcade/settings.ts'
import { CLAUDE_APP, CLAUDE_WINDOW, GALLERY_FILES, HOME, SCREEN, T0, runCommand, startSession, world, type WorldOptions } from './engine.ts'

/** A session of the mod on this machine. */
async function started($: Engine, on: On, store: Record<string, unknown> = {}, options: WorldOptions = {}) {
  mock.store(on, store)
  const clock = mock.clock(on, { now: T0 })
  const w = world(on, options)
  await startSession($)
  const run = (args = '') => runCommand($, 'drip', args)
  return { ...w, clock, run }
}

async function until(clock: { advance(ms: number): Promise<unknown> }, done: () => boolean) {
  for (let i = 0; i < 200 && !done(); i++) await clock.advance(0)
}

describe('/games', () => {
  test('registered at the start', async ($, on) => {
    const { commands } = await started($, on)
    expect(commands).toEqual(['drip'])
  })

  test('alone, it lists every game with its title and your best', async ($, on) => {
    const { run } = await started($, on, { bestScores: { blocks: 1200 } })
    const text = (await run())!
    expect(text.split('\n')[0]).toBe('Games. /drip <game> starts one:')
    // Missiles, built in, then Blocks, fetched from the gallery.
    expect(text).toContain('  missiles  Missiles\n  blocks    Blocks  ·  best 1200')
    expect(text).not.toContain('Missiles  ·  best')
    expect(text).not.toContain('yours')
    expect(text).not.toContain('unlock')
    expect(await run('list')).toBe(text)
    expect(await run('LIST')).toBe(text)
  })

  test('every game plays for everyone: Blocks as well as Missiles, with nothing stored', async ($, on) => {
    const { run, clock, overlays } = await started($, on)
    expect(await run('blocks')).toBe('Blocks. Esc quits, M mutes.')
    expect(overlays).toHaveLength(1)
    overlays[0]!.end('esc')
    await until(clock, () => false)
    expect(await run('missiles')).toBe('Missiles. Esc quits, M mutes.')
  })

  test('an unknown game is said', async ($, on) => {
    const { run } = await started($, on)
    expect(await run('pong')).toBe('No effect or saved drip is called pong. /drip list shows them.')
  })

  test("a game plays over Claude's window, takes the pointer, is drawn with your best, and keeps a better score", async ($, on) => {
    const { run, clock, overlays } = await started($, on, { bestScores: { missiles: 1200, blocks: 40 } })
    expect(await run('Missiles')).toBe('Missiles: your best is 1200. Esc quits, M mutes.')
    expect(overlays[0]!.request).toMatchObject({ layer: 'window', follow: CLAUDE_WINDOW.id, interactive: true, closeAfterMs: 30 * 60_000 })
    expect(overlays[0]!.request.html).toContain('BEST=1200,')
    expect(overlays[0]!.request.html).toContain('width:1325px;height:1138px')
    expect(overlays[0]!.request.html).not.toContain('__dripsQuiet=true')
    overlays[0]!.score(900)
    overlays[0]!.score(1500)
    overlays[0]!.end('signal')
    await until(clock, () => false)
    expect(await run('missile')).toBe('Missiles: your best is 1500. Esc quits, M mutes.')
    expect(overlays[1]!.request.html).toContain('BEST=1500,')
    expect(await run('blocks')).toBe('Missiles is already open. Quit it with Esc first.') // one game at a time
    overlays[1]!.end('esc')
    await until(clock, () => false)
    // A game from the gallery runs on the kit, sized and drawn with its best the same way.
    expect(await run('blocks')).toBe('Blocks: your best is 40. Esc quits, M mutes.')
    expect(overlays[2]!.request.html).toContain('window.drip={width:1325,height:1138,best:40,')
  })

  test('fullscreen: over the whole screen', { options: { display: 'fullscreen' } }, async ($, on) => {
    const { run, overlays } = await started($, on)
    await run('blocks')
    expect(overlays[0]!.request).toMatchObject({ frame: SCREEN, layer: 'screen', follow: null, interactive: true })
  })

  test('Sounds off: the game starts muted', { options: { sounds: false } }, async ($, on) => {
    const { run, clock, overlays } = await started($, on)
    await run('missiles')
    expect(overlays[0]!.request.html).toContain('<script>window.__dripsQuiet=true</script>')
    overlays[0]!.end('esc')
    await until(clock, () => false)
    await run('blocks')
    expect(overlays[1]!.request.html).toContain('window.__dripsQuiet=true;')
  })

  test("no window found: over the screen under the pointer, said once", async ($, on) => {
    const { run, overlays, toasts } = await started($, on, {}, { noWindow: true })
    await run('missiles')
    await run('missiles')
    expect(overlays[0]!.request).toMatchObject({ frame: SCREEN, layer: 'window', follow: null })
    expect(toasts).toEqual(["Games could not find Claude's window: games play over the screen under the pointer."])
  })

  test('the overlay is built once a load and finds the Claude app', async ($, on) => {
    const { run, ran } = await started($, on)
    await run('missiles')
    await run('blocks')
    expect(ran.filter(a => a[0] === 'xcrun' && a[1] === '--sdk')).toHaveLength(1)
    expect(ran.filter(a => a[1] === 'apps')).toHaveLength(1)
    expect(CLAUDE_APP.bundleId).toBe(CLAUDE_DESKTOP)
  })

  test('without the Command Line Tools no game plays, and it says why', async ($, on) => {
    const { run, overlays } = await started($, on, {}, { noSwift: true })
    expect(await run('blocks')).toBe(SWIFT_MISSING)
    expect(overlays).toEqual([])
  })
})

describe('the /config rows', () => {
  test("Claude's window and sounds unless set otherwise", () => {
    expect(settingsOf({})).toEqual(DEFAULT_SETTINGS)
    expect(DEFAULT_SETTINGS).toEqual({ display: 'claude-window', sounds: true })
    expect(settingsOf({ display: 'fullscreen', sounds: false })).toEqual({ display: 'fullscreen', sounds: false })
    expect(settingsOf({ display: 'sideways', sounds: 'no' })).toEqual(DEFAULT_SETTINGS)
  })
})

describe('/drip <name> for one of the gallery\'s', () => {
  test('a game not here yet: fetched, marked the gallery\'s, then played', async ($, on) => {
    const { run, overlays, ran } = await started($, on, {}, { gallery: GALLERY_FILES })
    expect(await run('rocks')).toBe('Rocks. Esc quits, M mutes.')
    expect(overlays[0]!.request.html).toContain('window.drip={')
    expect(ran.some(a => a[0] === '/usr/bin/base64' && a[3] === `${HOME}/.drip/games/rocks/cover.jpg`)).toBe(true)
    // Here now: the list shows it, not as the person's own.
    expect(await run()).toContain('  rocks     Rocks\n')
    expect(await run()).not.toContain('yours')
  })

  test('a drip: fetched and played', async ($, on) => {
    const { run, clock, overlays } = await started($, on, {}, { gallery: GALLERY_FILES })
    expect(await run('snow')).toBe('Got Snow: /drip snow plays it.')
    for (let i = 0; i < 20 && overlays.length === 0; i++) await clock.advance(200)
    expect(overlays.length).toBe(1)
  })

  test("what isn't in the gallery is the drips' to answer; /drip's own words never look", async ($, on) => {
    const { run, ran } = await started($, on, {}, { gallery: GALLERY_FILES })
    expect(await run('pong')).toBe('No effect or saved drip is called pong. /drip list shows them.')
    expect(await run('stop')).toBe('stopped all persistent effects')
    expect(ran.some(a => a[0] === '/usr/bin/base64')).toBe(false)
  })

  test("the gallery out of reach: a name not here is the drips' to answer", async ($, on) => {
    const { run } = await started($, on)
    expect(await run('rocks')).toBe('No effect or saved drip is called rocks. /drip list shows them.')
  })

  test('a fetch that fails says why', async ($, on) => {
    const { run } = await started($, on, {}, { gallery: { ...GALLERY_FILES, 'games/rocks/game.html': '<body>fetch("x")</body>' } })
    expect(await run('rocks')).toBe("The gallery's rocks doesn't pass the check (game.html reaches the network, which isn't allowed), so it wasn't kept.")
  })
})
