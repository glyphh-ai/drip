import { describe, expect, test } from 'claude-code/testing'

import { LONG_TURN_MS, MATRIX_LINGER_MS, createFun } from '../hooks/drips/fun.ts'
import { DEFAULT_SETTINGS, displayOf, settingsOf, type Settings } from '../hooks/drips/settings.ts'
import { flush } from './fakes.ts'

function world(settings: Partial<Settings>, opts: { theirs?: boolean } = {}) {
  const log: string[] = []
  const timers: { ms: number; fn: () => void; cancelled: boolean }[] = []
  let running = opts.theirs ?? false
  const fun = createFun(
    {
      play: async recipe => void log.push(`play ${recipe}`),
      ensure: async effect => {
        if (running) return false
        running = true
        log.push(`start ${effect}`)
        return true
      },
      release: async effect => {
        running = false
        log.push(`stop ${effect}`)
      },
      after: (ms, fn) => {
        const t = { ms, fn, cancelled: false }
        timers.push(t)
        return { cancel: () => void (t.cancelled = true) }
      },
      report: err => void log.push(`error ${String(err)}`),
    },
    { ...DEFAULT_SETTINGS, ...settings },
  )
  const fire = async () => {
    for (const t of timers.splice(0)) if (!t.cancelled) t.fn()
    await flush()
  }
  return { fun, log, timers, fire }
}

describe('matrix while tools run', () => {
  test('on with the first tool, off a moment after the last; back-to-back tools keep it on', async () => {
    const { fun, log, timers, fire } = world({ matrixWhileTools: true })
    await fun.toolStart()
    await fun.toolStart()
    fun.toolEnd()
    expect(timers).toHaveLength(0)
    fun.toolEnd()
    expect(timers[0]!.ms).toBe(MATRIX_LINGER_MS)
    await fun.toolStart() // the next tool, inside the linger
    expect(timers[0]!.cancelled).toBe(true)
    fun.toolEnd()
    await fire()
    expect(log).toEqual(['start matrix', 'stop matrix'])
  })

  test('off when the turn ends; a matrix the person started is never ended', async () => {
    const mine = world({ matrixWhileTools: true })
    await mine.fun.toolStart()
    await mine.fun.turnEnd({ durationMs: 1000, reason: 'answer', isMainLoop: true })
    expect(mine.log).toEqual(['start matrix', 'stop matrix'])

    const theirs = world({ matrixWhileTools: true }, { theirs: true })
    await theirs.fun.toolStart()
    theirs.fun.toolEnd()
    await theirs.fire()
    await theirs.fun.turnEnd({ durationMs: 1000, reason: 'answer', isMainLoop: true })
    expect(theirs.log).toEqual([])
  })

  test('nothing when the toggle is off', async () => {
    const off = world({})
    await off.fun.toolStart()
    off.fun.toolEnd()
    expect(off.log).toEqual([])
    expect(off.timers).toEqual([])
  })
})

describe('confetti after a long turn', () => {
  test('a main-loop answer that ran past two minutes; not a short one, an interrupted one or a subagent', async () => {
    const { fun, log } = world({ confettiAfterLongTurn: true })
    await fun.turnEnd({ durationMs: LONG_TURN_MS + 1, reason: 'answer', isMainLoop: true })
    await fun.turnEnd({ durationMs: LONG_TURN_MS, reason: 'answer', isMainLoop: true })
    await fun.turnEnd({ durationMs: LONG_TURN_MS * 2, reason: 'aborted', isMainLoop: true })
    await fun.turnEnd({ durationMs: LONG_TURN_MS * 2, reason: 'answer', isMainLoop: false })
    expect(log).toEqual(['play confetti'])
  })

  test('nothing when the toggle is off', async () => {
    const off = world({})
    await off.fun.turnEnd({ durationMs: LONG_TURN_MS * 2, reason: 'answer', isMainLoop: true })
    expect(off.log).toEqual([])
  })
})

describe('the /config rows', () => {
  test('display defaults to Claude\'s window; sounds and the button are on unless set off; the fun hooks are off unless set true', () => {
    expect(settingsOf({})).toEqual(DEFAULT_SETTINGS)
    expect(DEFAULT_SETTINGS.sounds).toBe(true)
    expect(settingsOf({ display: 'fullscreen', confetti_after_long_turn: true, matrix_while_tools: true, button: false, sounds: false })).toEqual({
      display: 'fullscreen',
      confettiAfterLongTurn: true,
      matrixWhileTools: true,
      button: false,
      sounds: false,
    })
    expect(settingsOf({ sounds: 'no' }).sounds).toBe(true)
    expect(settingsOf({ display: 'sideways', confetti_after_long_turn: 'yes' })).toEqual(DEFAULT_SETTINGS)
  })

  test('display: claude-window (the default) or fullscreen; anything else, a browser-pane stored by 1.1 too, is the default', () => {
    expect(DEFAULT_SETTINGS.display).toBe('claude-window')
    for (const d of ['claude-window', 'fullscreen'] as const) expect(displayOf(d)).toBe(d)
    expect(displayOf('browser-pane')).toBe('claude-window')
    expect(displayOf(undefined)).toBe('claude-window')
    expect(displayOf('window')).toBe('claude-window')
  })

  test("a claude-window stored before 1.1.0 (then the Browser pane's page) stays claude-window: over Claude's window, now natively", () => {
    expect(settingsOf({ display: 'claude-window' }).display).toBe('claude-window')
  })
})
