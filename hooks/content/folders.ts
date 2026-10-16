// The person's own games and drips: one folder each under ~/.glyphh/games and
// ~/.glyphh/drips (docs/glyphh-drip.md), read every time they are asked for,
// checked against ./rules, and made into the same shapes the built-in ones
// have. A folder that fails, or is named like a built-in one, is left out
// with the reason.
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
export type FolderGame = Game & { isYours: true; about?: string; icon: string | null }

/** A drip from a folder. */
export type FolderDrip = {
  name: string
  title: string
  kind: 'one-shot' | 'loop'
  icon: string | null
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

/** The person's games, beside `taken` (the built-in names and their other names). */
export async function loadGames(d: FolderDeps, home: string, taken: ReadonlySet<string>, quiet: () => boolean): Promise<{ games: FolderGame[]; skipped: Skipped[] }> {
  const games: FolderGame[] = []
  const skipped: Skipped[] = []
  for (const r of await readFolders(d, gamesDir(home), 'game')) {
    if (taken.has(r.name)) {
      skipped.push({ name: r.name, why: 'a built-in game has that name' })
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
      isYours: true,
      safetyMs: GAME_SAFETY_MS,
      build: (w, h, best) => withKit(page, { kind: 'game', width: w, height: h, best, quiet: quiet() }),
    })
  }
  return { games, skipped }
}

/** The person's drips, beside `taken` (the built-in drips' names). */
export async function loadDrips(d: FolderDeps, home: string, taken: ReadonlySet<string>): Promise<{ drips: FolderDrip[]; skipped: Skipped[] }> {
  const drips: FolderDrip[] = []
  const skipped: Skipped[] = []
  for (const r of await readFolders(d, dripsDir(home), 'drip')) {
    if (taken.has(r.name)) {
      skipped.push({ name: r.name, why: 'a built-in drip has that name' })
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
      build: (w, h, opacity, quiet) => withKit(page, { kind: 'drip', width: w, height: h, opacity, quiet }),
    })
  }
  return { drips, skipped }
}

/** What the listing says of the folders left out. */
export function skippedText(kind: 'game' | 'drip', skipped: Skipped[]): string {
  return skipped.map(s => `Left out ~/.glyphh/${kind}s/${s.name}: ${s.why}.`).join('\n')
}
