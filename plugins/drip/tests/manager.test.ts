import { describe, expect, test } from 'claude-code/testing'

import { BUILTIN_EFFECTS } from '../hooks/drips/effects.ts'
import { readCustoms, STORE_KEY } from '../hooks/drips/library.ts'
import { PERSISTENT_CAP_MS, PREVIEW_MAX_MS, createManager, customEffects, listText, type Host } from '../hooks/drips/manager.ts'
import { flush, memStore } from './fakes.ts'

/** A host that records what it is asked to show, and a clock the test runs. */
function world(customs: Record<string, string> = {}) {
  const store = memStore({ [STORE_KEY]: customs })
  const timers: { ms: number; fn: () => void }[] = []
  const shown: string[] = []
  const closed: string[] = []
  const reported: unknown[] = []
  const changes: string[][] = []
  const ends = new Map<string, () => void>()
  const w = { failOneShot: false, failPersistent: false, hold: null as Promise<void> | null }
  const host: Host = {
    async oneShot(effect, opacity) {
      if (w.failOneShot) throw new Error('no page')
      shown.push(`${effect}@${opacity}`)
    },
    async persistent(effect, opacity, maxMs, onClosed) {
      if (w.hold) await w.hold
      if (w.failPersistent) throw new Error('no overlay')
      shown.push(`loop ${effect}@${opacity} ${maxMs}`)
      ends.set(effect, onClosed)
      return { close: async () => void closed.push(effect) }
    },
  }
  let hostAsked = 0
  const hostOf = async () => {
    hostAsked++
    return host
  }
  const manager = createManager({
    store,
    customs: () => readCustoms(store),
    after: (ms, fn) => void timers.push({ ms, fn }),
    report: err => void reported.push(err),
    changed: () => void changes.push([...manager.running()]),
  })
  /** Fires every timer due by `ms`, in order. */
  const run = async (ms = Infinity) => {
    for (const t of timers.filter(t => t.ms <= ms).sort((a, b) => a.ms - b.ms)) {
      timers.splice(timers.indexOf(t), 1)
      t.fn()
    }
    await flush()
  }
  return { manager, store, timers, shown, closed, reported, changes, ends, w, host, hostOf, run, asked: () => hostAsked }
}

describe('/drips, as the app executes it', () => {
  test('one effect plays at once; the status says it', async () => {
    const { manager, hostOf, run, shown } = world()
    expect(await manager.execute(hostOf, 'confetti')).toBe('drip: confetti')
    await run(0)
    expect(shown).toEqual(['confetti@-1'])
  })

  test('nothing named plays fireworks', async () => {
    const { manager, hostOf, run, shown } = world()
    expect(await manager.execute(hostOf, '')).toBe('drip: fireworks')
    await run()
    expect(shown).toEqual(['fireworks@-1'])
  })

  test('a name that is no effect and no saved drip plays nothing and says so', async () => {
    const { manager, hostOf, run, shown, asked } = world()
    expect(await manager.execute(hostOf, '2 thumbs hearts thumbs')).toBe('No effect or saved drip is called thumbs. /drip list shows them.')
    await run()
    expect(shown).toEqual([])
    expect(asked()).toBe(0)
  })

  test('a hidden effect is no unknown name: timme plays', async () => {
    const { manager, hostOf, run, shown } = world()
    expect(await manager.execute(hostOf, 'timme')).toBe('drip: timme')
    await run()
    expect(shown).toEqual(['timme@-1'])
  })

  test('counted effects stagger 1500 ms apart, effect by effect, round by round', async () => {
    const { manager, hostOf, timers, run, shown } = world()
    expect(await manager.execute(hostOf, '2 hearts 0.5 stars')).toBe('drip: hearts + stars x2')
    expect(timers.map(t => t.ms)).toEqual([0, 1500, 3000, 4500])
    await run(1500)
    expect(shown).toEqual(['hearts@0.5', 'stars@0.5'])
    await run()
    expect(shown).toEqual(['hearts@0.5', 'stars@0.5', 'hearts@0.5', 'stars@0.5'])
  })

  test('a persistent effect starts at opacity 0.5 unless named, bounded to the cap; fired again it toggles off', async () => {
    const { manager, hostOf, shown, closed } = world()
    expect(await manager.execute(hostOf, '-1 aurora')).toBe('drip: aurora constant')
    expect(shown).toEqual([`loop aurora@0.5 ${PERSISTENT_CAP_MS}`])
    expect(manager.running()).toEqual(['aurora'])
    expect(await manager.execute(hostOf, '-1 aurora 0.3')).toBe('drip: aurora constant')
    expect(closed).toEqual(['aurora'])
    expect(manager.running()).toEqual([])
    await manager.execute(hostOf, '-1 0.3 aurora')
    expect(shown.at(-1)).toBe(`loop aurora@0.3 ${PERSISTENT_CAP_MS}`)
  })

  test("a preview's persistent effect is bounded to 12 s", async () => {
    const { manager, hostOf, shown } = world()
    await manager.execute(hostOf, '-1 matrix', { preview: true })
    expect(shown).toEqual([`loop matrix@0.5 ${PREVIEW_MAX_MS}`])
  })

  test('a persistent effect that ends by itself is forgotten, so the next fire starts it again', async () => {
    const { manager, hostOf, shown, ends, closed } = world()
    await manager.execute(hostOf, '-1 nebula')
    ends.get('nebula')!()
    expect(manager.running()).toEqual([])
    await manager.execute(hostOf, '-1 nebula')
    expect(shown).toHaveLength(2)
    expect(closed).toEqual([])
  })

  test('stop ends every persistent effect', async () => {
    const { manager, hostOf, closed } = world()
    await manager.execute(hostOf, '-1 aurora plasma')
    expect(await manager.execute(hostOf, 'stop')).toBe('stopped all persistent effects')
    expect(closed).toEqual(['aurora', 'plasma'])
    expect(manager.running()).toEqual([])
  })

  test('each persistent effect started or ended is told: fired again, stopped, ended by itself, failed', async () => {
    const { manager, hostOf, changes, ends, w } = world()
    await manager.execute(hostOf, '-1 aurora')
    await manager.execute(hostOf, '-1 aurora')
    await manager.execute(hostOf, '-1 plasma')
    ends.get('plasma')!()
    await manager.execute(hostOf, '-1 nebula')
    await manager.execute(hostOf, 'stop')
    w.failPersistent = true
    await manager.execute(hostOf, '-1 matrix').catch(() => undefined)
    expect(changes).toEqual([['aurora'], [], ['plasma'], [], ['nebula'], [], []])
  })

  test('list, save, delete answer without asking for a host', async () => {
    const { manager, hostOf, asked, store } = world({ party: '3 hearts' })
    expect(await manager.execute(hostOf, 'list')).toBe(`effects: ${BUILTIN_EFFECTS.join(', ')}\ncustom: party → 3 hearts`)
    expect(await manager.execute(hostOf, 'save Calm -1  aurora')).toBe('saved drip "calm" → -1 aurora')
    expect(await manager.execute(hostOf, 'delete party')).toBe('deleted drip "party"')
    expect(await manager.execute(hostOf, 'save calm')).toBe('Usage: /drip save <name> <recipe>')
    expect(await manager.execute(hostOf, 'delete')).toBe('Usage: /drip delete <name>')
    expect(asked()).toBe(0)
    expect(store.map.get(STORE_KEY)).toEqual({ calm: '-1 aurora' })
    expect(listText({})).toContain('custom: (none)')
  })

  test("a saved recipe's name alone plays its recipe; inside another recipe it adds its effects", async () => {
    const { manager, hostOf, run, shown } = world({ party: '2 hearts 0.4 stars', calm: '-1 aurora' })
    expect(await manager.execute(hostOf, 'party')).toBe('drip: hearts + stars x2')
    expect(await manager.execute(hostOf, 'Calm')).toBe('drip: aurora constant')
    expect(await manager.execute(hostOf, 'party confetti')).toBe('drip: hearts + stars + confetti')
    await run()
    expect(shown).toContain('confetti@-1')
    expect(customEffects('3 Hearts -1 0.4 stars')).toEqual(['hearts', 'stars'])
  })

  test('a staggered play that fails is reported, not thrown', async () => {
    const { manager, hostOf, run, reported, w } = world()
    w.failOneShot = true
    expect(await manager.execute(hostOf, '2 rain')).toBe('drip: rain x2')
    await run()
    expect(reported.map(String)).toEqual(['Error: no page', 'Error: no page'])
  })

  test('a persistent effect that cannot start throws and is not kept', async () => {
    const { manager, hostOf, w } = world()
    w.failPersistent = true
    await expect(manager.execute(hostOf, '-1 aurora')).rejects.toThrow('no overlay')
    expect(manager.running()).toEqual([])
  })

  test('a persistent effect toggled off while it starts is closed once it is up', async () => {
    const { manager, hostOf, w, closed } = world()
    let release = () => {}
    w.hold = new Promise(r => (release = r))
    const first = manager.execute(hostOf, '-1 aurora')
    await flush()
    expect(await manager.execute(hostOf, '-1 aurora')).toBe('drip: aurora constant')
    release()
    await first
    expect(closed).toEqual(['aurora'])
    expect(manager.running()).toEqual([])
  })
})

describe('ensure and release (the fun hooks)', () => {
  test('ensure starts an effect once and says whether it did; release ends it', async () => {
    const { manager, host, shown, closed } = world()
    expect(await manager.ensure(host, 'matrix')).toBe(true)
    expect(await manager.ensure(host, 'matrix')).toBe(false)
    expect(shown).toEqual([`loop matrix@0.5 ${PERSISTENT_CAP_MS}`])
    await manager.release('matrix')
    await manager.release('matrix')
    expect(closed).toEqual(['matrix'])
  })
})
