// Drip before 2.0.0 had another name, so it kept the person's things in other
// places: their own games and drips in another folder under their home, and
// their saved drips, starred items and best scores in another plugin store.
// Once, at the first session start of 2.0.0, what is there is brought over, so
// nobody loses anything: the person's own games and drips are copied (never
// moved: the old ones stay where they were; one fetched from the gallery is
// left, as the pane fetches it again), and the old store's saved drips,
// stars and scores are merged into this one. The store then says it is done
// (MOVED_KEY) and it never runs again.
import { FAVOURITES_KEY } from '../arcade/favourites.ts'
import { SCORES_KEY, type Store } from '../arcade/scores.ts'
import { STORE_KEY as CUSTOMS_KEY } from '../drips/library.ts'
import { MARK } from './gallery.ts'

/** The folder under the person's home that held their games and drips before 2.0.0. */
export const OLD_FOLDER = '.glyphh'
/** The start of the old store's file name, under <config>/plugins/store. */
export const OLD_STORE = 'glyphh-drip_'
/** The store's key saying the move is done. */
export const MOVED_KEY = 'movedFrom1x'

export type MovedDeps = {
  list: (path: string) => Promise<{ name: string; kind: string }[]>
  read: (path: string) => Promise<string>
  exists: (path: string) => Promise<boolean>
  /** Runs a command; its exit code, or null when it didn't run. */
  run: (argv: string[]) => Promise<number | null>
}

/** Where things are: the person's home and Claude Code's configuration folder. */
export type MovedWhere = { home: string; config: string }

type Kept = Record<string, unknown>
const isRecord = (v: unknown): v is Kept => !!v && typeof v === 'object' && !Array.isArray(v)

/** The old store files' contents, the marketplace install's last (its values win). */
async function oldStores(d: MovedDeps, config: string): Promise<Kept[]> {
  const dir = `${config}/plugins/store`
  if (!(await d.exists(dir).catch(() => false))) return []
  const files = (await d.list(dir).catch(() => []))
    .filter(e => e.kind === 'file' && e.name.startsWith(OLD_STORE) && e.name.endsWith('.json'))
    .map(e => e.name)
    .sort((a, b) => Number(!a.includes('_inline-')) - Number(!b.includes('_inline-')) || a.localeCompare(b))
  const out: Kept[] = []
  for (const f of files) {
    const v = await d.read(`${dir}/${f}`).then(t => JSON.parse(t) as unknown, () => null)
    if (isRecord(v)) out.push(v)
  }
  return out
}

/** Merges the old stores' saved drips, stars and best scores into `store`; how many of each came. */
async function moveStore(d: MovedDeps, store: Store, config: string): Promise<{ customs: number; scores: number; favourites: boolean }> {
  const olds = await oldStores(d, config)
  const now = { customs: await store.get(CUSTOMS_KEY), scores: await store.get(SCORES_KEY), favourites: await store.get(FAVOURITES_KEY) }
  const customs: Kept = {}
  const scores: Record<string, number> = {}
  let favourites: unknown = undefined
  for (const old of olds) {
    if (isRecord(old[CUSTOMS_KEY])) Object.assign(customs, old[CUSTOMS_KEY])
    if (isRecord(old[SCORES_KEY]))
      for (const [game, s] of Object.entries(old[SCORES_KEY])) if (typeof s === 'number' && s > (scores[game] ?? 0)) scores[game] = s
    if (Array.isArray(old[FAVOURITES_KEY])) favourites = old[FAVOURITES_KEY]
  }
  const nowCustoms = isRecord(now.customs) ? now.customs : {}
  const nowScores = isRecord(now.scores) ? now.scores : {}
  const newCustoms = Object.keys(customs).filter(k => !(k in nowCustoms))
  if (newCustoms.length) await store.set(CUSTOMS_KEY, { ...customs, ...nowCustoms })
  const better = Object.entries(scores).filter(([g, s]) => !(typeof nowScores[g] === 'number' && (nowScores[g] as number) >= s))
  if (better.length) await store.set(SCORES_KEY, { ...nowScores, ...Object.fromEntries(better) })
  const isFavourites = favourites !== undefined && now.favourites === undefined
  if (isFavourites) await store.set(FAVOURITES_KEY, favourites)
  return { customs: newCustoms.length, scores: better.length, favourites: isFavourites }
}

/** Copies the person's own games and drips from the old folder; the names copied. */
async function moveFolders(d: MovedDeps, home: string): Promise<string[]> {
  const copied: string[] = []
  for (const kind of ['games', 'drips']) {
    const from = `${home}/${OLD_FOLDER}/${kind}`
    const to = `${home}/.drip/${kind}`
    if (!(await d.exists(from).catch(() => false))) continue
    for (const e of await d.list(from).catch(() => [])) {
      if (e.kind !== 'dir') continue
      if (await d.exists(`${from}/${e.name}/${MARK}`).catch(() => false)) continue // the gallery's: fetched again from the pane
      if (await d.exists(`${to}/${e.name}`).catch(() => false)) continue // one here already wins
      if ((await d.run(['/bin/mkdir', '-p', to])) !== 0) continue
      if ((await d.run(['/bin/cp', '-R', `${from}/${e.name}`, `${to}/${e.name}`])) === 0) copied.push(`${kind}/${e.name}`)
    }
  }
  return copied
}

/** Brings over what Drip before 2.0.0 kept, once; what came, or null when it had already run. */
export async function moveOnce(d: MovedDeps, store: Store, where: MovedWhere): Promise<{ folders: string[]; customs: number; scores: number; favourites: boolean } | null> {
  if ((await store.get(MOVED_KEY)) === true) return null
  const folders = await moveFolders(d, where.home)
  const kept = await moveStore(d, store, where.config)
  await store.set(MOVED_KEY, true)
  return { folders, ...kept }
}
