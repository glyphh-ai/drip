import { describe, expect, test } from 'claude-code/testing'

import { OLD_NAME, withKit } from '../hooks/content/kit.ts'
import { MOVED_KEY, OLD_FOLDER, OLD_STORE, moveOnce, type MovedDeps } from '../hooks/content/moved.ts'

const HOME = '/home/t'
const CONFIG = `${HOME}/.claude`
const STORES = `${CONFIG}/plugins/store`
const OLD = `${HOME}/${OLD_FOLDER}`

/** A store in memory. */
function storeOf(kept: Record<string, unknown> = {}) {
  const v: Record<string, unknown> = { ...kept }
  return { v, get: async (k: string) => v[k], set: async (k: string, x: unknown) => void (v[k] = x) }
}

/** A file tree in memory (path → text; a folder is any prefix), and the commands run. */
function world(files: Record<string, string>) {
  const ran: string[][] = []
  const dirs = () => new Set(Object.keys(files).flatMap(p => p.split('/').slice(1, -1).map((_, i, a) => '/' + a.slice(0, i + 1).join('/'))))
  const d: MovedDeps = {
    exists: async p => p in files || dirs().has(p),
    read: async p => {
      if (!(p in files)) throw new Error('missing')
      return files[p]!
    },
    list: async p => {
      const out = new Map<string, string>()
      for (const f of Object.keys(files)) if (f.startsWith(p + '/')) {
        const rest = f.slice(p.length + 1).split('/')
        out.set(rest[0]!, rest.length > 1 ? 'dir' : 'file')
      }
      return [...out].map(([name, kind]) => ({ name, kind }))
    },
    run: async argv => {
      ran.push(argv)
      if (argv[0] === '/bin/cp') for (const f of Object.keys(files)) if (f.startsWith(argv[2]! + '/')) files[argv[3]! + f.slice(argv[2]!.length)] = files[f]!
      return 0
    },
  }
  return { d, ran, files }
}

describe('what Drip before 2.0.0 kept, brought over once', () => {
  test("the person's own games and drips are copied; the gallery's and ones already here are not", async () => {
    const w = world({
      [`${OLD}/games/snake/game.json`]: '{}',
      [`${OLD}/games/rocks/game.json`]: '{}',
      [`${OLD}/games/rocks/.gallery`]: 'x',
      [`${OLD}/drips/snow/drip.json`]: '{"old":true}',
      [`${HOME}/.drip/drips/snow/drip.json`]: '{"new":true}',
      [`${OLD}/config.json`]: '{}',
    })
    const store = storeOf()
    const moved = await moveOnce(w.d, store, { home: HOME, config: CONFIG })
    expect(moved?.folders).toEqual(['games/snake'])
    expect(w.files[`${HOME}/.drip/games/snake/game.json`]).toBe('{}')
    expect(w.files[`${HOME}/.drip/drips/snow/drip.json`]).toBe('{"new":true}')
    expect(`${HOME}/.drip/games/rocks/game.json` in w.files).toBe(false)
    expect(w.files[`${OLD}/games/snake/game.json`]).toBe('{}') // copied, never moved
    expect(store.v[MOVED_KEY]).toBe(true)
  })

  test("the old store's saved drips, stars and best scores are merged in; what's here wins", async () => {
    const w = world({
      [`${STORES}/${OLD_STORE}inline-1.json`]: JSON.stringify({ customs: { a: '3 hearts', b: 'rain' }, bestScores: { snake: 90 } }),
      [`${STORES}/${OLD_STORE}market-2.json`]: JSON.stringify({ customs: { a: 'confetti' }, bestScores: { snake: 40, rocks: 7, bricks: 5 }, favourites: ['game:snake'] }),
      [`${STORES}/other_x-3.json`]: JSON.stringify({ customs: { z: 'stars' } }),
    })
    const store = storeOf({ customs: { b: 'wave' }, bestScores: { bricks: 50 } })
    const moved = await moveOnce(w.d, store, { home: HOME, config: CONFIG })
    expect(moved).toEqual({ folders: [], customs: 1, scores: 2, favourites: true })
    expect(store.v.customs).toEqual({ a: 'confetti', b: 'wave' })
    expect(store.v.bestScores).toEqual({ bricks: 50, snake: 90, rocks: 7 })
    expect(store.v.favourites).toEqual(['game:snake'])
  })

  test('stars already kept here are left; nothing old, nothing changes; and it runs once', async () => {
    const w = world({ [`${STORES}/${OLD_STORE}m-1.json`]: JSON.stringify({ favourites: ['game:snake'] }) })
    const store = storeOf({ favourites: ['drip:rain'] })
    expect((await moveOnce(w.d, store, { home: HOME, config: CONFIG }))?.favourites).toBe(false)
    expect(store.v.favourites).toEqual(['drip:rain'])
    expect(await moveOnce(world({}).d, store, { home: HOME, config: CONFIG })).toBeNull()
    const empty = storeOf()
    expect(await moveOnce(world({}).d, empty, { home: HOME, config: CONFIG })).toEqual({ folders: [], customs: 0, scores: 0, favourites: false })
    expect(empty.v).toEqual({ [MOVED_KEY]: true })
  })

  test('a page made before 2.0.0 finds the kit by its old name too', () => {
    const html = withKit('<body></body>', { kind: 'drip', width: 10, height: 10, quiet: true })
    expect(html.indexOf(OLD_NAME)).toBeGreaterThan(html.indexOf('window.drip={'))
  })
})
