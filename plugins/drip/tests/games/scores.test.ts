import { describe, expect, test } from 'claude-code/testing'

import { SCORES_KEY, scoresOf } from '../../hooks/arcade/scores.ts'

function memStore(start?: unknown) {
  const kept: Record<string, unknown> = start === undefined ? {} : { [SCORES_KEY]: start }
  return { kept, store: { get: async (key: string) => kept[key], set: async (key: string, value: unknown) => void (kept[key] = value) } }
}

describe('the top scores', () => {
  test('0 before a game is first played; only a higher score is kept, per game', async () => {
    const { kept, store } = memStore()
    const scores = scoresOf(store)
    expect(await scores.best('missiles')).toBe(0)
    await scores.keep('missiles', 120)
    await scores.keep('missiles', 80)
    await scores.keep('chickn', 14)
    expect(await scores.best('missiles')).toBe(120)
    expect(await scores.best('chickn')).toBe(14)
    expect(kept[SCORES_KEY]).toEqual({ missiles: 120, chickn: 14 })
  })

  test('nothing that is not a whole score is kept or read', async () => {
    const { kept, store } = memStore({ missiles: 'lots', chickn: 7, other: -3 })
    const scores = scoresOf(store)
    expect(await scores.best('missiles')).toBe(0)
    expect(await scores.best('other')).toBe(0)
    for (const bad of [-1, 2.5, Number.NaN]) await scores.keep('chickn', bad)
    expect(kept[SCORES_KEY]).toEqual({ missiles: 'lots', chickn: 7, other: -3 })
    expect(await scoresOf(memStore([1, 2]).store).best('chickn')).toBe(0)
    expect(await scoresOf(memStore(null).store).best('chickn')).toBe(0)
  })
})
