// Games and drips from folders (docs/glyphh-drip.md): the ones the plugin
// ships (its games/ and drips/, a snapshot of glyphh-ai/drip) and the
// person's own (~/.glyphh/games, ~/.glyphh/drips), read every time they are
// asked for, checked against ./rules, and made into the same shapes the
// built-in ones have. A folder that fails, or is named like one already
// there, is left out with the reason.
import type { Game } from '../arcade/games/game.ts'
import { COVER_FILES, checkDrip, checkGame, type Cover, type Read } from './rules.js'
import { MARK } from './gallery.ts'
import { withKit } from './kit.ts'

/** What a folder read needs: the engine's fs, closed over in the hooks file. */
export type FolderDeps = {
  list: (path: string) => Promise<{ name: string; kind: string }[]>
  read: (path: string) => Promise<string>
  /** A file's bytes, standard base64 (a cover). */
  bytes: (path: string) => Promise<string>
  exists: (path: string) => Promise<boolean>
}

/** A game left out, or a drip: its name and why. */
export type Skipped = { name: string; why: string }

/** A game from a folder: a built-in game's shape, plus what the card shows. */
export type FolderGame = Game & { isYours: boolean; about?: string; emoji?: string; icon: string | null; author: string }

/** A drip from a folder. */
export type FolderDrip = {
  name: string
  title: string
  kind: 'one-shot' | 'loop'
  icon: string | null
  isYours: boolean
  /** Who made it: a GitHub login, or `glyphh`. */
  author: string
  about?: string
  emoji?: string
  /** The page with the kit, for this size; `quiet` mutes it. */
  build: (w: number, h: number, opacity: number, quiet: boolean) => string
}

/** A game's backstop, as the built-in games': 30 minutes. */
export const GAME_SAFETY_MS = 30 * 60_000
/** A one-shot drip's backstop: 15 seconds. */
export const DRIP_SAFETY_MS = 15_000

export const gamesDir = (home: string) => `${home}/.glyphh/games`
export const dripsDir = (home: string) => `${home}/.glyphh/drips`

/** A folder as read, and whether the gallery put it there (`get`'s mark). */
type Found = Read & { isGallery: boolean }

async function readFolders(d: FolderDeps, dir: string, file: 'game' | 'drip'): Promise<Found[]> {
  if (!(await d.exists(dir).catch(() => false))) return []
  const entries = await d.list(dir).catch(() => [])
  const out: Found[] = []
  for (const e of entries.filter(x => x.kind === 'dir').sort((a, b) => a.name.localeCompare(b.name))) {
    const at = `${dir}/${e.name}`
    const opt = async (p: string) => ((await d.exists(p).catch(() => false)) ? await d.read(p).catch(() => null) : null)
    let cover: Cover | null = null
    for (const f of COVER_FILES) {
      if (cover || !(await d.exists(`${at}/${f}`).catch(() => false))) continue
      const base64 = await d.bytes(`${at}/${f}`).catch(() => null)
      if (base64 !== null) cover = { file: f, base64 }
    }
    out.push({ name: e.name, manifest: await opt(`${at}/${file}.json`), page: await opt(`${at}/${file}.html`), icon: await opt(`${at}/icon.svg`), cover, isGallery: await d.exists(`${at}/${MARK}`).catch(() => false) })
  }
  return out
}

/** The games in `dir`, beside `taken` (names already in use); `isYours` marks the person's own. */
export async function loadGames(d: FolderDeps, dir: string, taken: ReadonlySet<string>, quiet: () => boolean, isYours: boolean): Promise<{ games: FolderGame[]; skipped: Skipped[] }> {
  const games: FolderGame[] = []
  const skipped: Skipped[] = []
  for (const r of await readFolders(d, dir, 'game')) {
    if (taken.has(r.name)) {
      skipped.push({ name: r.name, why: 'a game already has that name' })
      continue
    }
    const c = checkGame(r)
    if (!c.ok) {
      skipped.push({ name: r.name, why: c.why })
      continue
    }
    const page = c.page
    games.push({
      name: r.name,
      title: c.manifest.title,
      ...(c.manifest.about ? { about: c.manifest.about } : {}),
      ...(c.manifest.emoji ? { emoji: c.manifest.emoji } : {}),
      icon: c.icon,
      isYours: isYours && !r.isGallery,
      author: c.manifest.author,
      safetyMs: GAME_SAFETY_MS,
      build: (w, h, best) => withKit(page, { kind: 'game', width: w, height: h, best, quiet: quiet() }),
    })
  }
  return { games, skipped }
}

/** The drips in `dir`, beside `taken` (names already in use); `isYours` marks the person's own. */
export async function loadDrips(d: FolderDeps, dir: string, taken: ReadonlySet<string>, isYours: boolean): Promise<{ drips: FolderDrip[]; skipped: Skipped[] }> {
  const drips: FolderDrip[] = []
  const skipped: Skipped[] = []
  for (const r of await readFolders(d, dir, 'drip')) {
    if (taken.has(r.name)) {
      skipped.push({ name: r.name, why: 'a drip already has that name' })
      continue
    }
    const c = checkDrip(r)
    if (!c.ok) {
      skipped.push({ name: r.name, why: c.why })
      continue
    }
    const page = c.page
    const kind = c.manifest.kind
    drips.push({
      name: r.name,
      title: c.manifest.title,
      kind,
      ...(c.manifest.about ? { about: c.manifest.about } : {}),
      ...(c.manifest.emoji ? { emoji: c.manifest.emoji } : {}),
      icon: c.icon,
      isYours: isYours && !r.isGallery,
      author: c.manifest.author,
      build: (w, h, opacity, quiet) => withKit(page, { kind: 'drip', width: w, height: h, opacity, quiet }),
    })
  }
  return { drips, skipped }
}

/** What the listing says of the folders left out of `where` (~/.glyphh/games, say). */
export function skippedText(where: string, skipped: Skipped[]): string {
  return skipped.map(s => `Left out ${where}/${s.name}: ${s.why}.`).join('\n')
}
