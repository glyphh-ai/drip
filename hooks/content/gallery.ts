// The gallery: glyphh-ai/drip, every game and drip there is but Missiles and
// the drips built in. The Drip pane lists it (`listing`); `/drip get <name>`,
// Get on the pane, or /drip <name>, fetches one into the person's folder
// (~/.glyphh), checked against the rules first (./rules.js), and marks it as
// the gallery's (MARK), not theirs.
import { COVER_FILES, NAME, checkDrip, checkGame, type Cover } from './rules.js'

/** Where the gallery's files are read from, raw. */
export const GALLERY = 'https://raw.githubusercontent.com/glyphh-ai/drip/main'
/** Where its covers are read from: GitHub's API hands a file's bytes over as base64. */
export const GALLERY_API = 'https://api.github.com/repos/glyphh-ai/drip/contents'

export type GalleryDeps = {
  fetch: (url: string) => Promise<{ ok: boolean; status: number; text: string }>
  write: (path: string, text: string) => Promise<void>
  /** Writes bytes given as base64 (a cover); false when it couldn't. */
  writeBytes: (path: string, base64: string) => Promise<boolean>
}

/** One game or drip as index.json lists it. */
export type Entry = { name: string; title: string; author?: string; about?: string; files: string[] }
type Index = { games: Entry[]; drips: Entry[] }

/** The file `get` leaves in a folder it fetched: it is the gallery's, not the person's. */
export const MARK = '.gallery'

/** What the gallery has; null when it can't be read (offline, or not public). */
export async function listing(d: Pick<GalleryDeps, 'fetch'>): Promise<Index | null> {
  const res = await d.fetch(`${GALLERY}/index.json`).catch(() => null)
  return res?.ok ? parseIndex(res.text) : null
}

/** The files a gallery entry may bring, by kind. */
const FILES = { game: ['game.json', 'game.html', 'icon.svg'], drip: ['drip.json', 'drip.html', 'icon.svg'] } as const

/** A cover's base64 from GitHub's contents API; null when the answer isn't one. */
function coverOf(text: string): string | null {
  try {
    const v = JSON.parse(text) as { encoding?: unknown; content?: unknown }
    return v.encoding === 'base64' && typeof v.content === 'string' ? v.content.replace(/\s+/g, '') : null
  } catch {
    return null
  }
}

function parseIndex(text: string): Index | null {
  try {
    const v: unknown = JSON.parse(text)
    if (!v || typeof v !== 'object') return null
    const { games, drips } = v as Record<string, unknown>
    const ok = (xs: unknown): xs is Entry[] =>
      Array.isArray(xs) && xs.every(x => x && typeof x === 'object' && typeof (x as Entry).name === 'string' && Array.isArray((x as Entry).files))
    return ok(games) && ok(drips) ? { games, drips } : null
  } catch {
    return null
  }
}

/** Fetches `name` from the gallery into `home`'s folders; says what came of it. */
export async function get(d: GalleryDeps, home: string, name: string, builtIn: ReadonlySet<string>): Promise<string> {
  const want = name.trim().toLowerCase()
  if (!NAME.test(want)) return `A name is lowercase letters, digits and hyphens: /drip get snake.`
  if (builtIn.has(want)) return `${want} comes with Glyphh Drip: /drip ${want} plays it.`
  const res = await d.fetch(`${GALLERY}/index.json`).catch(() => null)
  if (!res?.ok) return `Couldn't reach the gallery${res ? ` (${res.status})` : ''}. Try again in a moment.`
  const index = parseIndex(res.text)
  if (!index) return "The gallery's index didn't read. Try again later."
  const game = index.games.find(e => e.name === want)
  const drip = game ? undefined : index.drips.find(e => e.name === want)
  const entry = game ?? drip
  if (!entry) return `No game or drip called "${want}" in the gallery.`
  const kind = game ? 'game' : 'drip'
  const files = new Map<string, string>()
  for (const file of entry.files) {
    if (!(FILES[kind] as readonly string[]).includes(file)) continue
    const r = await d.fetch(`${GALLERY}/${kind}s/${want}/${file}`).catch(() => null)
    if (!r?.ok) return `Couldn't fetch ${file} for ${want}${r ? ` (${r.status})` : ''}. Try again in a moment.`
    files.set(file, r.text)
  }
  let cover: Cover | null = null
  const coverFile = COVER_FILES.find(f => entry.files.includes(f))
  if (coverFile) {
    const r = await d.fetch(`${GALLERY_API}/${kind}s/${want}/${coverFile}?ref=main`).catch(() => null)
    const base64 = r?.ok ? coverOf(r.text) : null
    if (base64 === null) return `Couldn't fetch ${coverFile} for ${want}${r ? ` (${r.status})` : ''}. Try again in a moment.`
    cover = { file: coverFile, base64 }
  }
  const read = { name: want, manifest: files.get(`${kind}.json`) ?? null, page: files.get(`${kind}.html`) ?? null, icon: files.get('icon.svg') ?? null, cover }
  const checked = kind === 'game' ? checkGame(read) : checkDrip(read)
  if (!checked.ok) return `The gallery's ${want} doesn't pass the check (${checked.why}), so it wasn't kept.`
  for (const [file, text] of files) await d.write(`${home}/.glyphh/${kind}s/${want}/${file}`, text)
  await d.write(`${home}/.glyphh/${kind}s/${want}/${MARK}`, 'glyphh-ai/drip\n')
  if (!(await d.writeBytes(`${home}/.glyphh/${kind}s/${want}/${checked.cover.file}`, checked.cover.base64))) return `Couldn't save ${want}'s cover. Try again in a moment.`
  return `Got ${checked.manifest.title}: /drip ${want} plays it.`
}
