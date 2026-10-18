import { describe, expect, test } from 'claude-code/testing'

import { buildRecipe, checkDrip, countText, dripEmojis, filterDrips, parseRecipe } from '../helper/builder.mjs'
import { isAllowed, isLocal, openKeys, sameSecret } from '../helper/gate.mjs'

describe("the editor's recipe builder", () => {
  test('a mode and effects make a recipe; the count is held to 2–10', () => {
    expect(buildRecipe({ mode: 'oneshot', count: 3, effects: ['confetti', '', 'stars'] })).toBe('confetti stars')
    expect(buildRecipe({ mode: 'counted', count: 4, effects: ['hearts'] })).toBe('4 hearts')
    expect(buildRecipe({ mode: 'counted', count: 40, effects: ['hearts'] })).toBe('10 hearts')
    expect(buildRecipe({ mode: 'counted', count: Number.NaN, effects: ['hearts'] })).toBe('3 hearts')
    expect(buildRecipe({ mode: 'persistent', count: 3, effects: ['aurora'] })).toBe('-1 aurora')
    expect(buildRecipe({ mode: 'oneshot', count: 3, effects: [] })).toBe('')
  })

  test('a saved recipe opens back into the fields', () => {
    expect(parseRecipe('-1 aurora matrix')).toEqual({ mode: 'persistent', count: 3, effects: ['aurora', 'matrix'] })
    expect(parseRecipe('5 hearts')).toEqual({ mode: 'counted', count: 5, effects: ['hearts'] })
    expect(parseRecipe('1 hearts')).toEqual({ mode: 'oneshot', count: 3, effects: ['1', 'hearts'] })
    expect(parseRecipe('  confetti  ')).toEqual({ mode: 'oneshot', count: 3, effects: ['confetti'] })
    expect(parseRecipe('')).toEqual({ mode: 'oneshot', count: 3, effects: [] })
  })

  test("a drip's icons: one emoji per distinct effect, numbers left out", () => {
    expect(dripEmojis('3 hearts hearts confetti 0.5 mystery')).toEqual(['❤️', '🎊', '✨'])
    expect(dripEmojis('')).toEqual([])
  })

  test('search matches a name or a recipe; the count reads naturally', () => {
    const drips = [
      { name: 'party', recipe: '3 confetti' },
      { name: 'calm', recipe: '-1 aurora' },
    ]
    expect(filterDrips(drips, 'AUR')).toEqual([drips[1]!])
    expect(filterDrips(drips, 'par')).toEqual([drips[0]!])
    expect(filterDrips(drips, '  ')).toEqual(drips)
    expect(countText(1)).toBe('1 drip')
    expect(countText(0)).toBe('0 drips')
  })

  test('Save needs at least one effect and a name, as the app says', () => {
    expect(checkDrip({ name: ' Party ', effects: ['confetti'] })).toEqual({ name: 'party' })
    expect(checkDrip({ name: 'party', effects: ['', ''] })).toEqual({ error: 'Select at least one effect.', field: null })
    expect(checkDrip({ name: '', effects: [''] })).toEqual({ error: 'Select at least one effect.', field: 'name' })
    expect(checkDrip({ name: ' ', effects: ['stars'] })).toEqual({ error: 'Please fill in all required fields.', field: 'name' })
  })
})

describe('the page server lets in only its own page', () => {
  test('the token, Host and Origin; one-time keys', () => {
    expect(sameSecret('abc', 'abc')).toBe(true)
    expect(sameSecret('abd', 'abc')).toBe(false)
    expect(isLocal({ host: '127.0.0.1:4100' }, 4100)).toBe(true)
    expect(isLocal({ host: 'localhost:4100' }, 4100)).toBe(false)
    expect(isLocal({ host: '127.0.0.1:4100', origin: 'https://evil.example' }, 4100)).toBe(false)
    expect(isAllowed({ host: '127.0.0.1:4100', token: 's' }, { port: 4100, secret: 's' })).toBe(true)
    expect(isAllowed({ host: '127.0.0.1:4100', token: 'x' }, { port: 4100, secret: 's' })).toBe(false)
    let n = 0
    const keys = openKeys({ random: () => `key${++n}`, ttlMs: 1000 })
    const k = keys.issue(0)
    expect(keys.consume(k, 10)).toBe(true)
    expect(keys.consume(k, 20)).toBe(false)
  })
})
