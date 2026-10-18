import type { On, RenderPropsOf } from 'claude-code'
import { describe, expect, mock, test, type Engine } from 'claude-code/testing'

import { OPENED, PANE, screenshotSvg } from '../../hooks/arcade/hooks.tsx'
import { DEFAULT_FAVOURITES } from '../../hooks/arcade/favourites.ts'
import { CAT_SVG, logoSvg } from '../../hooks/arcade/brand.ts'
import { BUILTIN_EFFECT_LIST } from '../../hooks/drips/effects.ts'
import { GALLERY_FILES, T0, runCommand, startSession, world, type WorldOptions } from './engine.ts'
import { jpegCover, pngCover } from '../cover.ts'

const CARD: RenderPropsOf['CommandOutput'] = { command: 'drip', args: '', text: 'Games. /drip <game> starts one:', isErrored: false } as never

/** The Drip pane, as a surface mounts it. */
const pane = (surface: 'desktop' | 'terminal' = 'desktop') => ({
  plugin: 'glyphh-drip',
  surface,
  component: 'Pane' as const,
  requestId: PANE,
  props: { title: 'Drip', isFocused: true, bodyColumns: 100, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} },
  viewport: { columns: 100, rows: 42 },
})

/** A session of the mod, under the engine's own plain row. */
async function started($: Engine, on: On, store: Record<string, unknown> = {}, options: WorldOptions = {}) {
  mock.store(on, store)
  const clock = mock.clock(on, { now: T0 })
  const w = world(on, options)
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: (e.props as { text?: string }).text ?? '' }))
  await startSession($)
  return { ...w, clock }
}

async function until(clock: { advance(ms: number): Promise<unknown> }, done: () => boolean) {
  for (let i = 0; i < 200 && !done(); i++) await clock.advance(0)
}

type Ui = { findAll(q: { type: string }): Promise<{ key: string | undefined; text?: string; props: Record<string, unknown> }[]> }
const keysOf = async (ui: Ui) => (await ui.findAll({ type: 'Button' })).map(b => b.key)
/** What the pane says: its texts, then its buttons' labels (a row's name is a button that opens its page). */
const textsOf = async (ui: Ui) => [...(await ui.findAll({ type: 'Text' })).map(t => t.text), ...(await ui.findAll({ type: 'Button' })).map(b => String(b.props.label))]
const plays = (kind: string, names: string[]) => names.map(n => `play:${kind}:${n}`)

describe('the Drip pane (/drip, /drip list)', () => {
  test('/drip and /drip list open it, and say so in one line; nothing draws inline', async ($, on) => {
    const { panes } = await started($, on, {}, { pane: true })
    expect(await runCommand($, 'drip')).toBe(OPENED)
    expect(await runCommand($, 'drip', 'list')).toBe(OPENED)
    expect(panes).toEqual([{ id: PANE, title: 'Drip', focus: true }, { id: PANE, title: 'Drip', focus: true }]) // focused: the first click presses
    const row = await $.ui.mount({ plugin: 'glyphh-drip', surface: 'desktop', component: 'CommandOutput', props: { ...CARD, text: OPENED } })
    expect(await row.findAll({ type: 'Button' })).toEqual([])
    expect(await row.find({ type: 'Text', text: OPENED })).toBeDefined()
  })

  test('where no surface places a pane: the list in words instead', async ($, on) => {
    const { panes } = await started($, on)
    expect(await runCommand($, 'drip')).toContain('Games. /drip <game> starts one:')
    expect(panes).toHaveLength(1)
  })

  test('a table, fifteen rows a page: emoji, name, line, type, a star and Play; games first, then drips', async ($, on) => {
    await started($, on, { bestScores: { blocks: 1200 } }, { pane: true })
    const ui = await $.ui.mount(pane())
    const keys = await keysOf(ui)
    expect(keys.filter(k => k?.startsWith('play:'))).toEqual([...plays('game', ['missiles', 'blocks']), ...plays('drip', BUILTIN_EFFECT_LIST.slice(0, 13).map(d => d.name))])
    expect(keys.filter(k => k?.startsWith('filter:'))).toEqual(['filter:all', 'filter:game', 'filter:drip'])
    const texts = await textsOf(ui)
    expect(texts).toEqual(expect.arrayContaining(['🚀\u00a0\u00a0\u00a0Missiles', 'Keep the missiles off the ground', 'Game', '🎆\u00a0\u00a0\u00a0Fireworks', 'Drip', '1 of 2']))
    expect(texts).not.toContain('timme')
    expect(await ui.find({ type: 'Button', key: 'fav:game:missiles' })).toBeDefined()
    await ui.press({ key: 'next' })
    expect((await keysOf(ui)).filter(k => k?.startsWith('play:'))).toEqual(plays('drip', BUILTIN_EFFECT_LIST.slice(13).map(d => d.name)))
    await ui.press({ key: 'next' }) // past the end: stays
    expect(await textsOf(ui)).toContain('2 of 2')
    await ui.press({ key: 'prev' })
    expect(await textsOf(ui)).toContain('1 of 2')
  })

  test("the logo at its top left, the cat and drip, following the app's light or dark", async ($, on) => {
    await started($, on, {}, { pane: true, theme: 'dark' }) // the /config theme doesn't pin it
    const ui = await $.ui.mount(pane())
    expect((await ui.findAll({ type: 'Svg' }))[0]!.props.source).toBe(logoSvg('auto'))
  })

  test('the logo: the text white for a dark theme, dark for a light one, else the system\'s; the mascot never changes', () => {
    expect(logoSvg('dark')).toContain('<style>.k{display:none}</style>')
    expect(logoSvg('light')).toContain('<style>.k{display:none}.w{display:none}.k{display:inline}</style>')
    expect(logoSvg('auto')).toContain('@media (prefers-color-scheme: light){.w{display:none}.k{display:inline}}')
    // The mascot is the same in every theme: only the text flips.
    for (const t of ['dark', 'light', 'auto'] as const) expect(logoSvg(t)).toContain(CAT_SVG.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, ''))
    expect(logoSvg('light')).not.toContain('[fill=')
  })

  test("a row's name opens its page: ← back to its type, the screenshot, its line, Play; back returns to the table", async ($, on) => {
    await started($, on, { bestScores: { missiles: 1200 } }, { pane: true, covers: ['game-missiles'] })
    const ui = await $.ui.mount(pane())
    await ui.press({ key: 'open:game:missiles' })
    expect(await keysOf(ui)).toEqual(['back', 'play:game:missiles', 'fav:game:missiles'])
    expect((await ui.findAll({ type: 'Button' }))[0]!.props.label).toBe('←\u00a0\u00a0Games')
    expect((await ui.findAll({ type: 'Svg' })).map(n => n.props.source)).toEqual([screenshotSvg({ type: 'jpeg', base64: 'Q09WRVI=' })])
    expect(await textsOf(ui)).toEqual(expect.arrayContaining(['🚀', 'Missiles', 'Glyphh built', 'Keep the missiles off the ground', 'Game · Best 1,200']))
    await ui.press({ key: 'fav:game:missiles' })
    expect((await ui.findAll({ type: 'Button' })).find(b => b.key === 'fav:game:missiles')!.props.label).toBe('★')
    await ui.press({ key: 'back' })
    expect(await keysOf(ui)).toContain('open:game:missiles')
    expect(await keysOf(ui)).not.toContain('back')
  })

  test("a drip's page: ← Drips; no screenshot, the emoji; Play plays it", async ($, on) => {
    const { clock, overlays } = await started($, on, {}, { pane: true })
    const ui = await $.ui.mount(pane())
    await ui.press({ key: 'open:drip:confetti' })
    expect((await ui.findAll({ type: 'Button' }))[0]!.props.label).toBe('←\u00a0\u00a0Drips')
    expect(await ui.findAll({ type: 'Svg' })).toEqual([])
    await ui.press({ key: 'play:drip:confetti' })
    for (let i = 0; i < 20 && overlays.length === 0; i++) await clock.advance(200)
    expect(overlays).toHaveLength(1)
  })

  test("a fetched game's page: Play, which plays it", async ($, on) => {
    const { clock, overlays } = await started($, on, {}, { pane: true })
    const ui = await $.ui.mount(pane())
    await ui.press({ key: 'open:game:blocks' })
    expect(await keysOf(ui)).toEqual(['back', 'play:game:blocks', 'fav:game:blocks'])
    await ui.press({ key: 'play:game:blocks' })
    await until(clock, () => overlays.length > 0)
    expect(overlays[0]!.request.html).toContain('glyphh.score(1)') // the fixture Blocks
  })

  test("a gallery game's page: its screenshot fetched from the gallery once, and Get", async ($, on) => {
    const { fetched } = await started($, on, {}, { pane: true, gallery: GALLERY_FILES })
    const ui = await $.ui.mount(pane())
    await ui.press({ key: 'filter:game' })
    await ui.press({ key: 'open:game:rocks' })
    expect(await keysOf(ui)).toEqual(['back', 'get:game:rocks', 'fav:game:rocks'])
    expect((await ui.findAll({ type: 'Svg' })).map(n => n.props.source)).toEqual([screenshotSvg({ type: 'jpeg', base64: jpegCover() })])
    await ui.press({ key: 'fav:game:rocks' })
    expect(fetched.filter(u => u.includes('/contents/games/rocks/cover.jpg'))).toHaveLength(1)
  })

  test('a screenshot too big for the pane is left out: the emoji instead', () => {
    expect(screenshotSvg({ type: 'jpeg', base64: 'A'.repeat(131_072) })).toBeNull()
    expect(screenshotSvg(null)).toBeNull()
    expect(screenshotSvg({ type: 'png', base64: 'QQ==' })).toContain('href="data:image/png;base64,QQ=="')
  })

  test('the filter keeps one type, from its first page; All brings them back', async ($, on) => {
    await started($, on, {}, { pane: true })
    const ui = await $.ui.mount(pane())
    await ui.press({ key: 'next' })
    await ui.press({ key: 'filter:game' })
    expect((await keysOf(ui)).filter(k => k?.startsWith('play:'))).toEqual(plays('game', ['missiles', 'blocks']))
    expect(await textsOf(ui)).not.toContain('1 of 1') // one page: no page turner
    await ui.press({ key: 'filter:drip' })
    expect((await keysOf(ui)).filter(k => k?.startsWith('play:'))[0]).toBe('play:drip:fireworks')
    await ui.press({ key: 'filter:all' })
    expect((await keysOf(ui)).filter(k => k?.startsWith('play:'))[0]).toBe('play:game:missiles')
  })

  test('the search finds by name, line, type or maker, every word; none says so', async ($, on) => {
    await started($, on, {}, { pane: true })
    const ui = await $.ui.mount(pane())
    await ui.input({ key: 'search', text: 'rain', kind: 'change' })
    expect((await keysOf(ui)).filter(k => k?.startsWith('play:'))).toEqual(plays('drip', ['rain', 'emoji', 'matrix'])) // "A rain of emoji" too
    await ui.input({ key: 'search', text: 'game glyphh' })
    expect((await keysOf(ui)).filter(k => k?.startsWith('play:'))).toEqual(plays('game', ['missiles', 'blocks']))
    await ui.input({ key: 'search', text: 'nothing like it' })
    expect(await textsOf(ui)).toContain('Nothing matches “nothing like it”.')
  })

  test('the star adds it to the tray above the prompt; again takes it off', async ($, on) => {
    await started($, on, {}, { pane: true })
    const trayKeys = async () => {
      const line = await $.ui.mount({ plugin: 'glyphh-drip', surface: 'desktop', component: 'SessionMode', props: { mode: 'default' } as never })
      await line.press({ key: 'drip' })
      const band = await $.ui.mount({ plugin: 'glyphh-drip', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false } as never })
      const keys = await keysOf(band)
      await band.unmount()
      await line.press({ key: 'drip' })
      await line.unmount()
      return keys
    }
    const ui = await $.ui.mount(pane())
    expect((await ui.findAll({ type: 'Button' })).find(b => b.key === 'fav:drip:fireworks')!.props.label).toBe('★') // the tray's first
    await ui.press({ key: 'fav:game:missiles' })
    expect((await ui.findAll({ type: 'Button' })).find(b => b.key === 'fav:game:missiles')!.props.label).toBe('★')
    expect(await trayKeys()).toEqual(['tray:game:missiles', ...DEFAULT_FAVOURITES.map(k => `play:${k.slice(5)}`), 'close'])
    await ui.press({ key: 'fav:drip:fireworks' })
    expect(await trayKeys()).toEqual(['tray:game:missiles', ...DEFAULT_FAVOURITES.slice(1).map(k => `play:${k.slice(5)}`), 'close'])
  })

  test('nothing stored: every game and drip shows Play; no Unlock, nothing Locked', async ($, on) => {
    const { clock, overlays } = await started($, on, {}, { pane: true })
    const ui = await $.ui.mount(pane())
    expect(await keysOf(ui)).not.toContain('unlock')
    expect(await textsOf(ui)).not.toContain('Locked')
    const buttons = await ui.findAll({ type: 'Button' })
    expect(buttons.find(b => b.key === 'play:game:missiles')!.props.label).toBe('Play')
    expect(buttons.find(b => b.key === 'play:game:blocks')!.props.label).toBe('Play')
    expect(buttons.find(b => b.key === 'play:drip:confetti')!.props.label).toBe('Play')
    await ui.press({ key: 'play:game:blocks' })
    await until(clock, () => overlays.length > 0)
    expect(overlays).toHaveLength(1)
  })

  test("Play: a game over Claude's window; a drip as a quick play does", async ($, on) => {
    const { clock, overlays } = await started($, on, {}, { pane: true })
    const ui = await $.ui.mount(pane())
    await ui.press({ key: 'play:game:missiles' })
    await until(clock, () => overlays.length > 0)
    expect(overlays[0]!.request.html).toContain('MISSILES')
    await ui.press({ key: 'play:drip:confetti' })
    for (let i = 0; i < 20 && overlays.length < 2; i++) await clock.advance(200)
    expect(overlays).toHaveLength(2)
  })

  test('one game at a time: a second is refused while one is open; drips still play over it', async ($, on) => {
    const { clock, overlays, toasts } = await started($, on, {}, { pane: true })
    const ui = await $.ui.mount(pane())
    await ui.press({ key: 'play:game:missiles' })
    await until(clock, () => overlays.length > 0)
    await ui.press({ key: 'play:game:blocks' })
    await until(clock, () => toasts.some(t => t.includes('Missiles is already open. Quit it with Esc first.')))
    expect(overlays).toHaveLength(1)
    await ui.press({ key: 'play:drip:confetti' })
    for (let i = 0; i < 20 && overlays.length < 2; i++) await clock.advance(200)
    await ui.press({ key: 'play:drip:hearts' })
    for (let i = 0; i < 20 && overlays.length < 3; i++) await clock.advance(200)
    expect(overlays).toHaveLength(3)
    overlays[0]!.end('esc')
    await clock.advance(200)
    await ui.press({ key: 'play:game:blocks' })
    for (let i = 0; i < 20 && overlays.length < 4; i++) await clock.advance(200)
    expect(overlays[3]!.request.html).toContain('glyphh.score(1)') // the fixture Blocks
  })

  test("a game the overlay can't play: the toast says why", async ($, on) => {
    const { clock, toasts } = await started($, on, {}, { noSwift: true, pane: true })
    const ui = await $.ui.mount(pane())
    await ui.press({ key: 'play:game:missiles' })
    await until(clock, () => toasts.length > 0)
    expect(toasts.join(' ')).toContain('Swift')
  })

  test("the gallery's not here yet follow, each Install with its own emoji: installed, then Play", async ($, on) => {
    const { clock, overlays, ran, toasts } = await started($, on, {}, { gallery: GALLERY_FILES, pane: true })
    const ui = await $.ui.mount(pane())
    await ui.press({ key: 'filter:game' })
    expect((await keysOf(ui)).filter(k => k?.startsWith('get:'))).toEqual(['get:game:rocks'])
    expect((await ui.findAll({ type: 'Button' })).find(b => b.key === 'get:game:rocks')!.props.label).toBe('Install')
    expect(await textsOf(ui)).toEqual(expect.arrayContaining(['☄️\u00a0\u00a0\u00a0Rocks', 'Shoot the rocks']))
    await ui.press({ key: 'get:game:rocks' })
    await until(clock, () => toasts.some(t => t.includes('Rocks is installed.')))
    expect(overlays).toEqual([]) // installed, not played
    for (let i = 0; i < 20 && !(await keysOf(ui)).includes('play:game:rocks'); i++) await clock.advance(100)
    expect((await ui.findAll({ type: 'Button' })).find(b => b.key === 'play:game:rocks')!.props.label).toBe('Play')
    await ui.press({ key: 'play:game:rocks' })
    await until(clock, () => overlays.length > 0)
    expect(overlays[0]!.request.html).toContain('window.glyphh={')
    expect(ran.some(a => a[0] === '/usr/bin/base64' && a[3]!.endsWith('/games/rocks/cover.jpg'))).toBe(true)
    await ui.unmount()
    const again = await $.ui.mount(pane())
    await again.press({ key: 'filter:game' })
    expect(await keysOf(again)).toContain('play:game:rocks') // here now
    await again.press({ key: 'filter:all' })
    await again.input({ key: 'search', text: 'snow' })
    expect((await keysOf(again)).filter(k => k?.startsWith('get:') || k?.startsWith('play:'))).toEqual(['get:drip:snow'])
    await again.press({ key: 'get:drip:snow' })
    await until(clock, () => toasts.filter(t => t.includes('is installed.')).length > 1)
    for (let i = 0; i < 20 && !(await keysOf(again)).includes('play:drip:snow'); i++) await clock.advance(100)
    await again.press({ key: 'play:drip:snow' })
    for (let i = 0; i < 20 && overlays.length < 2; i++) await clock.advance(200)
    expect(overlays).toHaveLength(2)
  })

  test("one the gallery won't give: the toast says why", async ($, on) => {
    const { clock, toasts } = await started($, on, {}, { gallery: { ...GALLERY_FILES, 'games/rocks/game.html': '<body>fetch("x")</body>' }, pane: true })
    const ui = await $.ui.mount(pane())
    await ui.press({ key: 'filter:game' })
    await ui.press({ key: 'get:game:rocks' })
    await until(clock, () => toasts.length > 0)
    expect(toasts[0]).toContain("doesn't pass the check")
  })

  test('what is here is read once, not at every draw: again on /drip, the gallery at most every five minutes', async ($, on) => {
    const { clock, fetched } = await started($, on, {}, { gallery: GALLERY_FILES, pane: true })
    const ui = await $.ui.mount(pane())
    await ui.press({ key: 'filter:game' })
    await ui.press({ key: 'filter:all' })
    await ui.unmount()
    expect(fetched.filter(u => u.endsWith('/index.json'))).toHaveLength(1)
    await runCommand($, 'drip')
    await (await $.ui.mount(pane())).unmount()
    expect(fetched.filter(u => u.endsWith('/index.json'))).toHaveLength(1) // read afresh, the gallery kept
    await clock.advance(5 * 60_000)
    await runCommand($, 'drip')
    await $.ui.mount(pane())
    expect(fetched.filter(u => u.endsWith('/index.json'))).toHaveLength(2)
  })

  test('on the terminal: the same table, a search field too', async ($, on) => {
    await started($, on, {}, { pane: true })
    const ui = await $.ui.mount(pane('terminal'))
    expect(await textsOf(ui)).toContain('🚀\u00a0\u00a0\u00a0Missiles')
    expect(await ui.find({ type: 'Input', key: 'search' })).toBeDefined()
  })
})

describe('the tray above the prompt', () => {
  const BAND = { hasSurvey: false } as never
  async function tray($: Engine, surface: 'desktop' | 'terminal' = 'desktop') {
    const line = await $.ui.mount({ plugin: 'glyphh-drip', surface, component: 'SessionMode', props: { mode: 'default' } as never })
    await line.press({ key: 'drip' })
    return $.ui.mount({ plugin: 'glyphh-drip', surface, component: 'AbovePrompt', props: BAND })
  }

  test('the starred games first, emoji and name, then the starred drips; a game plays from it', async ($, on) => {
    const { clock, overlays } = await started($, on, { favourites: ['drip:aurora', 'game:missiles', 'game:blocks', 'game:gone'] })
    const band = await tray($)
    expect(await keysOf(band)).toEqual(['tray:game:missiles', 'tray:game:blocks', 'play:aurora', 'close'])
    expect((await band.findAll({ type: 'Button' })).map(b => b.props.label).slice(0, 3)).toEqual(['🚀 Missiles', '🎮 Blocks', '🌌 aurora'])
    await band.press({ key: 'tray:game:missiles' })
    await until(clock, () => overlays.length > 0)
    expect(overlays[0]!.request.html).toContain('MISSILES')
  })

  test('no starred games: the drips\' row as it is; closed, nothing', async ($, on) => {
    await started($, on)
    const band = await tray($)
    expect(await keysOf(band)).toEqual([...DEFAULT_FAVOURITES.map(k => `play:${k.slice(5)}`), 'close'])
    await band.press({ key: 'close' })
    expect(await keysOf(band)).toEqual([])
  })
})

describe('your own games and drips (~/.glyphh)', () => {
  const PAGE = '<html><head></head><body><canvas></canvas></body></html>'
  const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h4"/></svg>'
  const OWN = {
    '/home/t/.glyphh/games/snake/game.json': JSON.stringify({ title: 'Snake', author: 'octocat' }),
    '/home/t/.glyphh/games/snake/game.html': PAGE,
    '/home/t/.glyphh/games/snake/icon.svg': ICON,
    '/home/t/.glyphh/games/snake/cover.png': pngCover(),
    '/home/t/.glyphh/games/pong/game.json': JSON.stringify({ title: 'Pong', author: 'octocat' }),
    '/home/t/.glyphh/games/pong/game.html': '<body><script>fetch("https://x.io")</script></body>',
    '/home/t/.glyphh/games/pong/cover.png': pngCover(),
    '/home/t/.glyphh/drips/snow/drip.json': JSON.stringify({ title: 'Snow', author: 'octocat', kind: 'one-shot' }),
    '/home/t/.glyphh/drips/snow/drip.html': PAGE,
    '/home/t/.glyphh/drips/snow/cover.jpg': jpegCover(),
  }

  test('in the pane after the built-in and fetched ones, with their makers and "yours"', async ($, on) => {
    await started($, on, { customs: { party: '3 hearts' } }, { own: OWN, pane: true })
    const ui = await $.ui.mount(pane())
    await ui.press({ key: 'filter:game' })
    expect((await keysOf(ui)).filter(k => k?.startsWith('play:'))).toEqual(plays('game', ['missiles', 'blocks', 'snake']))
    expect(await textsOf(ui)).toEqual(expect.arrayContaining(['🎮\u00a0\u00a0\u00a0Snake', '@octocat', 'yours']))
    await ui.input({ key: 'search', text: 'snow party' }) // no row has both
    await ui.press({ key: 'filter:drip' })
    await ui.input({ key: 'search', text: 'yours' })
    expect((await keysOf(ui)).filter(k => k?.startsWith('play:'))).toEqual(plays('drip', ['snow', 'party']))
    expect(await textsOf(ui)).toContain('3 hearts') // a saved recipe's line is its recipe
  })

  test('/drip snake plays it with the kit; one that breaks the rules is left out and said', async ($, on) => {
    const { clock, overlays } = await started($, on, {}, { own: OWN })
    expect(await runCommand($, 'drip', 'snake')).toBe('Snake. Esc quits, M mutes.')
    await until(clock, () => overlays.length > 0)
    expect(String(overlays[0]!.request.html)).toContain('window.glyphh={')
    expect(overlays[0]!.request).toMatchObject({ interactive: true })
    const listed = (await runCommand($, 'drip'))!
    expect(listed).toContain('snake     Snake  ·  yours')
    expect(listed).toContain("Left out ~/.glyphh/games/pong: game.html reaches the network, which isn't allowed.")
  })

  test('a drip of yours plays by name', async ($, on) => {
    const { clock, overlays } = await started($, on, {}, { own: OWN })
    expect(await runCommand($, 'drip', 'snow')).toBe('drip: snow')
    await until(clock, () => overlays.length > 0)
    expect(String(overlays[0]!.request.html)).toContain('window.glyphh={')
  })
})
