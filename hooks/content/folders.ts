// Games and drips from folders (docs/glyphh-drip.md): the ones the plugin
// ships (its games/ and drips/, a snapshot of glyphh-ai/drip) and the
// person's own (~/.glyphh/games, ~/.glyphh/drips), read every time they are
// asked for, checked against ./rules, and made into the same shapes the
// built-in ones have. A folder that fails, or is named like one already
// there, is left out with the reason.
import type { Game } from '../arcade/games/game.ts'
import { checkDrip, checkGame, type Read } from './rules.js'
import { withKit } from './kit.ts'

/** What a folder read needs: the engine's fs, closed over in the hooks file. */
export type FolderDeps = {
  list: (path: string) => Promise<{ name: string; kind: string }[]>
  read: (path: string) => Promise<string>
  exists: (path: string) => Promise<boolean>
}

/** A game left out, or a drip: its name and why. */
export type Skipped = { name: string; why: string }

/** A game from a folder: a built-in game's shape, plus what the card shows. */
export type FolderGame = Game & { isYours: boolean; about?: string; icon: string | null }

/** A drip from a folder. */
export type FolderDrip = {
  name: string
  title: string
  kind: 'one-shot' | 'loop'
  icon: string | null
  isYours: boolean
  /** The page with the kit, for this size; `quiet` mutes it. */
  build: (w: number, h: number, opacity: number, quiet: boolean) => string
}

/** A game's backstop, as the built-in games': 30 minutes. */
export const GAME_SAFETY_MS = 30 * 60_000
/** A one-shot drip's backstop: 15 seconds. */
export const DRIP_SAFETY_MS = 15_000

export const gamesDir = (home: string) => `${home}/.glyphh/games`
export const dripsDir = (home: string) => `${home}/.glyphh/drips`

async function readFolders(d: FolderDeps, dir: string, file: 'game' | 'drip'): Promise<Read[]> {
  if (!(await d.exists(dir).catch(() => false))) return []
  const entries = await d.list(dir).catch(() => [])
  const out: Read[] = []
  for (const e of entries.filter(x => x.kind === 'dir').sort((a, b) => a.name.localeCompare(b.name))) {
    const at = `${dir}/${e.name}`
    const opt = async (p: string) => ((await d.exists(p).catch(() => false)) ? await d.read(p).catch(() => null) : null)
    out.push({ name: e.name, manifest: await opt(`${at}/${file}.json`), page: await opt(`${at}/${file}.html`), icon: await opt(`${at}/icon.svg`) })
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
      icon: c.icon,
      isYours,
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
      icon: c.icon,
      isYours,
      build: (w, h, opacity, quiet) => withKit(page, { kind: 'drip', width: w, height: h, opacity, quiet }),
    })
  }
  return { drips, skipped }
}

/** What the listing says of the folders left out of `where` (~/.glyphh/games, say). */
export function skippedText(where: string, skipped: Skipped[]): string {
  return skipped.map(s => `Left out ${where}/${s.name}: ${s.why}.`).join('\n')
}
