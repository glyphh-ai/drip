import type { On, RenderPropsOf } from 'claude-code'
import { describe, expect, mock, test, type Engine } from 'claude-code/testing'

import { DEFAULT_FAVOURITES } from '../hooks/arcade/favourites.ts'

const QUICK = DEFAULT_FAVOURITES.map(k => k.slice(5))
import { SWIFT_MISSING } from '../hooks/overlay/host.ts'
import { CLAUDE_WINDOW, T0, startSession, world, type WorldOptions } from './engine.ts'

const HINT: RenderPropsOf['PromptHint'] = { isDraft: false, isWorking: false, hint: '? for shortcuts' }
const BAND: RenderPropsOf['AbovePrompt'] = { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 19 } } as never
const MODES: RenderPropsOf['SessionMode'] = { modes: ['focus'] }
const SURFACES = ['terminal', 'desktop'] as const

/** The engine line the button sits beside: the hint under the prompt on the terminal, the footer's mode labels on the desktop. */
const mountLine = ($: Engine, surface: (typeof SURFACES)[number]) =>
  surface === 'desktop'
    ? $.ui.mount({ plugin: 'glyphh-drip', surface, component: 'SessionMode', props: MODES })
    : $.ui.mount({ plugin: 'glyphh-drip', surface, component: 'PromptHint', props: HINT })

/** A session of the mod on this machine. */
async function started($: Engine, on: On, store: Record<string, unknown> = {}, options: WorldOptions = {}) {
  mock.store(on, store)
  const clock = mock.clock(on, { now: T0 })
  const w = world(on, options)
  // The engine's own drawing beneath the plugins: its hint line, its mode labels, and an empty band.
  on('ui.render', ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    if (e.component === 'PromptHint') return Text({ dimColor: true, children: (e.props as { hint: string }).hint })
    if (e.component === 'SessionMode') return Text({ dimColor: true, children: (e.props as { modes: string[] }).modes.join(' & ') })
    return Box({})
  })
  await startSession($)
  return { ...w, clock }
}

async function until(clock: { advance(ms: number): Promise<unknown> }, done: () => boolean) {
  for (let i = 0; i < 200 && !done(); i++) await clock.advance(0)
}

const keysOf = async (ui: { findAll(q: { type: string }): Promise<{ key: string | undefined }[]> }) => (await ui.findAll({ type: 'Button' })).map(b => b.key)

describe('the Drips button by the prompt', () => {
  for (const surface of SURFACES) {
    test(`on ${surface}: one button beside the engine's line; the row above is closed`, async ($, on) => {
      await started($, on)
      const hint = await mountLine($, surface)
      expect(await keysOf(hint)).toEqual(['drip'])
      expect((await hint.find({ key: 'drip' }))?.text).toBe('💧 drip')
      expect(await hint.find({ type: 'Text', text: surface === 'desktop' ? 'focus' : '? for shortcuts' })).toBeDefined()
      const band = await $.ui.mount({ plugin: 'glyphh-drip', surface, component: 'AbovePrompt', props: BAND })
      expect(await keysOf(band)).toEqual([])
    })

    test(`on ${surface}: pressed, the tray opens above the prompt with the starred drips (a saved one too, once starred); ✕ closes it`, async ($, on) => {
      await started($, on, { customs: { party: '3 hearts' }, favourites: [...DEFAULT_FAVOURITES, 'drip:party', 'drip:nope'] })
      const hint = await mountLine($, surface)
      const band = await $.ui.mount({ plugin: 'glyphh-drip', surface, component: 'AbovePrompt', props: BAND })
      await hint.press({ key: 'drip' })
      expect(await keysOf(band)).toEqual([...QUICK.map(e => `play:${e}`), 'play:party', 'close'])
      expect((await band.findAll({ type: 'Button' }))[0]!.props.label).toBe('🎆 fireworks')
      await band.press({ key: 'close' })
      expect(await keysOf(band)).toEqual([])
      await hint.press({ key: 'drip' })
      await hint.press({ key: 'drip' })
      expect(await keysOf(band)).toEqual([])
    })
  }

  test("one button per surface: the desktop draws none in a hint line, the terminal none in its footer", async ($, on) => {
    await started($, on)
    const desktopHint = await $.ui.mount({ plugin: 'glyphh-drip', surface: 'desktop', component: 'PromptHint', props: HINT })
    expect(await keysOf(desktopHint)).toEqual([])
    const terminalModes = await $.ui.mount({ plugin: 'glyphh-drip', surface: 'terminal', component: 'SessionMode', props: MODES })
    expect(await keysOf(terminalModes)).toEqual([])
  })

  test("a quick play goes the way /drip does: over Claude's window", async ($, on) => {
    const { clock, overlays } = await started($, on, { customs: { party: '-1 aurora' } })
    const hint = await mountLine($, 'terminal')
    const band = await $.ui.mount({ plugin: 'glyphh-drip', surface: 'terminal', component: 'AbovePrompt', props: BAND })
    await hint.press({ key: 'drip' })
    await band.press({ key: 'play:fireworks' })
    await until(clock, () => overlays.length > 0)
    expect(overlays[0]!.request).toMatchObject({ layer: 'window', follow: CLAUDE_WINDOW.id })
  })

  test('a quick play lets the pointer through: effects never take clicks; no game among them', async ($, on) => {
    const { clock, overlays } = await started($, on)
    const hint = await mountLine($, 'desktop')
    const band = await $.ui.mount({ plugin: 'glyphh-drip', surface: 'desktop', component: 'AbovePrompt', props: BAND })
    await hint.press({ key: 'drip' })
    expect(QUICK).toEqual(['fireworks', 'confetti', 'hearts', 'stars', 'powow'])
    await band.press({ key: 'play:powow' })
    await until(clock, () => overlays.length > 0)
    expect(overlays[0]!.request).toMatchObject({ layer: 'window', interactive: false })
  })

  test('Stop shows while a saved persistent drip plays, and ends it', async ($, on) => {
    const { clock, overlays, ran } = await started($, on, { customs: { party: '-1 aurora' }, favourites: ['drip:party'] })
    const hint = await mountLine($, 'desktop')
    const band = await $.ui.mount({ plugin: 'glyphh-drip', surface: 'desktop', component: 'AbovePrompt', props: BAND })
    await hint.press({ key: 'drip' })
    expect(await keysOf(band)).not.toContain('stop')
    await band.press({ key: 'play:party' })
    await until(clock, () => overlays.length > 0)
    expect(await keysOf(band)).toContain('stop')
    await band.press({ key: 'stop' })
    expect(ran).toContainEqual(['/bin/kill', '-TERM', String(overlays[0]!.pid)])
    expect(await keysOf(band)).not.toContain('stop')
  })

  test('where the overlay cannot run, a play says why once and plays nothing', async ($, on) => {
    const { toasts, overlays } = await started($, on, {}, { noSwift: true })
    const hint = await mountLine($, 'terminal')
    const band = await $.ui.mount({ plugin: 'glyphh-drip', surface: 'terminal', component: 'AbovePrompt', props: BAND })
    await hint.press({ key: 'drip' })
    await band.press({ key: 'play:confetti' })
    await band.press({ key: 'play:hearts' })
    expect(toasts).toEqual([SWIFT_MISSING])
    expect(overlays).toEqual([])
  })

  test('nothing stored: the row plays drips, with no Unlock', async ($, on) => {
    const { overlays, clock } = await started($, on)
    const hint = await mountLine($, 'desktop')
    const band = await $.ui.mount({ plugin: 'glyphh-drip', surface: 'desktop', component: 'AbovePrompt', props: BAND })
    await hint.press({ key: 'drip' })
    expect(await keysOf(band)).not.toContain('unlock')
    await band.press({ key: 'play:confetti' })
    await until(clock, () => overlays.length > 0)
  })

  test('a survey holds the band: the row yields to it', async ($, on) => {
    await started($, on)
    const hint = await mountLine($, 'terminal')
    await hint.press({ key: 'drip' })
    const band = await $.ui.mount({ plugin: 'glyphh-drip', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, hasSurvey: true } })
    expect(await keysOf(band)).toEqual([])
  })

  test('hidden by its /config toggle: no button, no row', { options: { button: false } }, async ($, on) => {
    await started($, on)
    const hint = await mountLine($, 'terminal')
    expect(await keysOf(hint)).toEqual([])
    expect(await keysOf(await mountLine($, 'desktop'))).toEqual([])
    const band = await $.ui.mount({ plugin: 'glyphh-drip', surface: 'terminal', component: 'AbovePrompt', props: BAND })
    expect(await keysOf(band)).toEqual([])
  })
})
