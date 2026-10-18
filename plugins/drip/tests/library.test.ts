import { describe, expect, test } from 'claude-code/testing'

import { STORE_KEY, deleteCustom, dripId, dripRecordOf, listCustoms, readCustoms, saveCustom } from '../hooks/drips/library.ts'
import { memStore } from './fakes.ts'

describe('saved recipes', () => {
  test('names are trimmed and lowercased; recipes have their spaces collapsed', () => {
    expect(dripId('  Party ')).toBe('party')
    expect(dripRecordOf(' Party', '  3   hearts\tstars ')).toEqual({ name: 'party', recipe: '3 hearts stars' })
  })

  test('save, list, save again over it, delete', async () => {
    const store = memStore()
    expect(await listCustoms(store)).toEqual([])
    expect(await saveCustom(store, 'Party', '3  hearts')).toBe('saved drip "party" → 3 hearts')
    expect(await saveCustom(store, 'calm', '-1 aurora')).toBe('saved drip "calm" → -1 aurora')
    expect(await saveCustom(store, 'PARTY', 'confetti')).toBe('saved drip "party" → confetti')
    expect(await listCustoms(store)).toEqual([
      { name: 'party', recipe: 'confetti' },
      { name: 'calm', recipe: '-1 aurora' },
    ])
    expect(await deleteCustom(store, ' Calm ')).toBe('deleted drip "calm"')
    expect(await deleteCustom(store, 'calm')).toBe('no custom drip "calm"')
    expect(store.map.get(STORE_KEY)).toEqual({ party: 'confetti' })
  })

  test('a save with no name or no recipe says so and keeps nothing', async () => {
    const store = memStore()
    expect(await saveCustom(store, '  ', 'confetti')).toBe('A drip needs a name.')
    expect(await saveCustom(store, 'x', '   ')).toBe('A drip needs a recipe: /drip save x <recipe>')
    expect(store.map.size).toBe(0)
  })

  test('what is in the store that is not a recipe is passed over', async () => {
    expect(await readCustoms(memStore({ [STORE_KEY]: ['a'] }))).toEqual({})
    expect(await readCustoms(memStore({ [STORE_KEY]: 'x' }))).toEqual({})
    expect(await readCustoms(memStore({ [STORE_KEY]: { Good: 'stars', bad: 3, ' ': 'x' } }))).toEqual({ good: 'stars' })
  })
})
