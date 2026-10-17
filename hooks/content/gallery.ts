// The gallery: glyphh-ai/drips, every game and drip there is. `/drip get
// <name>` fetches one into the person's own folder (~/.glyphh), checked
// against the rules first (./rules.js), so it plays like one they made.
import { NAME, checkDrip, checkGame } from './rules.js'

/** Where the gallery's files are read from, raw. */
export const GALLERY = 'https://raw.githubusercontent.com/glyphh-ai/drips/main'

export type GalleryDeps = {
  fetch: (url: string) => Promise<{ ok: boolean; status: number; text: string }>
  write: (path: string, text: string) => Promise<void>
}

type Entry = { name: string; title: string; files: string[] }
type Index = { games: Entry[]; drips: Entry[] }

/** The files a gallery entry may bring, by kind. */
const FILES = { game: ['game.json', 'game.html', 'icon.svg'], drip: ['drip.json', 'drip.html', 'icon.svg'] } as const

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
  const read = { name: want, manifest: files.get(`${kind}.json`) ?? null, page: files.get(`${kind}.html`) ?? null, icon: files.get('icon.svg') ?? null }
  const checked = kind === 'game' ? checkGame(read) : checkDrip(read)
  if (!checked.ok) return `The gallery's ${want} doesn't pass the check (${checked.why}), so it wasn't kept.`
  for (const [file, text] of files) await d.write(`${home}/.glyphh/${kind}s/${want}/${file}`, text)
  return `Got ${checked.manifest.title}: /drip ${want} plays it.`
}
