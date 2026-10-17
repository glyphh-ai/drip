// Games, wired to the engine: the one file of this module that holds
// `$` and the mod's state (the engine follows `$` and atoms only within the
// file whose hook received them), handing the rest closures. /drip lists the
// games and starts one in the shared native overlay (../overlay), over
// Claude's window or the whole screen as the /config row `display` says; the
// overlay takes the pointer and keys while a game is on. Each game posts its
// score as it goes, and the top one is kept for the next round to beat.
// /drip (or /drip list) opens the Drip pane: every game and drip, here or in the
// gallery, each with who made it and Play (Get for the gallery's, fetched
// then played). Missiles and every drip are free; the other games wait for
// Glyphh Drip to be bought.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, PluginOptions } from 'claude-code'

import { ancestorsOf, eventsOf, overlayHost, prepareOverlay, type OverlayDeps, type Placement, type Prepared } from '../overlay/host.ts'
import { selectTarget, type Target, type TerminalEnv } from '../overlay/target.ts'
import { INITIAL, refusal } from '../unlock/access.ts'
import { MOD, PRICE, PRODUCT } from '../unlock/config.ts'
import { buy, type Deps } from '../unlock/flow.ts'
import { verify } from '../unlock/verify.ts'
import { BUILTIN_EFFECT_LIST, ONE_SHOT_EFFECTS } from '../drips/effects.ts'
import { dripsDir, gamesDir, loadDrips, loadGames, skippedText, type FolderDeps, type FolderGame } from '../content/folders.ts'
import { GALLERY_API, get as galleryGet, listing as galleryListing, type Entry } from '../content/gallery.ts'
import { COVER_FILES, GLYPHH, NAME } from '../content/rules.js'
import { share as galleryShare } from '../content/share.ts'
import { readCustoms } from '../drips/library.ts'
import { GAMES, gameDoc, gameOf } from './games/index.ts'
import type { Game } from './games/game.ts'
import { LOGO_ALT, LOGO_RATIO, logoSvg } from './brand.ts'
import { BUILT_IN, TYPES, emojiOf, type Kind } from './catalog.ts'
import { FAVOURITES_KEY } from './favourites.ts'
import { scoresOf, type Store } from './scores.ts'
import { settingsOf, type Settings } from './settings.ts'

const licence = atom({ plugin: 'glyphh-drip', key: 'licence' } as const, INITIAL)
/** A drip the pane asked to play: the drips' half (../drips) takes it. */
const queued = atom({ plugin: 'glyphh-drip', key: 'queued' } as const, null as { recipe: string; at: number } | null)
/** The pane's search, type filter and page (from 0). */
const query = atom({ plugin: 'glyphh-drip', key: 'query' } as const, '')
const filter = atom({ plugin: 'glyphh-drip', key: 'filter' } as const, 'all' as Kind | 'all')
const page = atom({ plugin: 'glyphh-drip', key: 'page' } as const, 0)
/** Bumped when a screenshot the pane waits for has loaded: the page redraws with it. */
const shotTick = atom({ plugin: 'glyphh-drip', key: 'shotTick' } as const, 0)
/** The item the pane shows on its own page ("game:snake"); none, the table. */
const detail = atom({ plugin: 'glyphh-drip', key: 'detail' } as const, null as string | null)
/** The starred items ("game:missiles"), the tray's buttons: kept in the store across sessions (../drips loads them). */
const favourites = atom({ plugin: 'glyphh-drip', key: 'favourites' } as const, [] as string[])
/** The tray's row is open (the drip button by the prompt). */
const bandOpen = atom({ plugin: 'glyphh-drip', key: 'bandOpen' } as const, false)

/** The pane's logo: it follows the app's own light or dark, as the app's buttons do. */
const LOGO = logoSvg('auto')

/** The Drip pane: /drip (or /drip list) opens it. */
export const PANE = 'glyphh-drip'
/** What /drip says in the conversation once the pane is open. */
export const OPENED = 'Drip is open in the side panel.'
/** How long what the gallery has is kept before it's asked again, in ms. */
const GALLERY_MS = 5 * 60_000
/** The gallery's listing as last read, for the pane's draws. */
let galleryKept: { at: number; index: Awaited<ReturnType<typeof galleryListing>> } | null = null

/** The games anyone can play, bought or not (every drip is free too). */
export const FREE_GAMES: readonly string[] = ['missiles']

/** A drip's name as the card shows it: "matrix" → "Matrix". */
const titleOf = (name: string) => name.charAt(0).toUpperCase() + name.slice(1)

/** Every built-in game's names, which the person's own games may not take. */
const TAKEN = new Set(GAMES.flatMap(g => [g.name, ...(g.aliases ?? [])]))

let settings: Settings
/** This load's pieces: the overlay's binary, built on first use, and the window Claude runs in. */
let native: Promise<Prepared> | null = null
let target: Promise<Target | null> | null = null
/** Said once per load: Claude's window not found. */
let isMissedSaid = false

const short = (err: unknown) => String(err instanceof Error ? err.message : err).replace(/^(Hooks)?Error: /, '').slice(0, 300)

function store($: EngineInterface): Store {
  return { get: key => $.store.get(key), set: (key, value) => $.store.set(key, value) }
}

function folderDeps($: EngineInterface): FolderDeps {
  return { list: p => $.fs.list(p), read: async p => String(await $.fs.read(p)), bytes: async p => (await $.fs.read(p, { as: 'bytes' })).base64, exists: p => $.fs.exists(p) }
}

/** Every game from a folder: the plugin's own (shipped, a snapshot of the
 *  gallery), then the person's (~/.glyphh/games); read again each time. */
async function folderGames($: EngineInterface): Promise<{ games: FolderGame[]; skipped: string }> {
  const d = folderDeps($)
  const shipped = await loadGames(d, `${$.plugin.root}/games`, TAKEN, () => !settings.sounds, false)
  const home = await $.env.get('HOME')
  if (!home) return { games: shipped.games, skipped: '' }
  const yours = await loadGames(d, gamesDir(home), new Set([...TAKEN, ...shipped.games.map(g => g.name)]), () => !settings.sounds, true)
  return { games: [...shipped.games, ...yours.games], skipped: skippedText('~/.glyphh/games', yours.skipped) }
}

/** Every drip from a folder, for the card: the plugin's own, then the person's. */
async function folderDrips($: EngineInterface): Promise<{ name: string; title: string; icon: string | null; isYours: boolean; author: string }[]> {
  const d = folderDeps($)
  const builtIn = new Set(Object.keys(ONE_SHOT_EFFECTS))
  const shipped = (await loadDrips(d, `${$.plugin.root}/drips`, builtIn, false)).drips
  const home = await $.env.get('HOME')
  const yours = home ? (await loadDrips(d, dripsDir(home), new Set([...builtIn, ...shipped.map(x => x.name)]), true)).drips : []
  return [...shipped, ...yours].map(x => ({ name: x.name, title: x.title, icon: x.icon, isYours: x.isYours, author: x.author }))
}

/** /drip share <name>: one of the person's own, to the gallery as a pull request. */
async function shareToGallery($: EngineInterface, name: string): Promise<string> {
  const home = await $.env.get('HOME')
  if (!home) return 'No home folder to share from.'
  return galleryShare(
    {
      run: async (argv, opts) => {
        const r = await $.process.run(argv, opts).catch(() => null)
        return r ? { exitCode: r.exitCode, stdout: String(r.stdout ?? ''), stderr: String(r.stderr ?? '') } : null
      },
      exists: p => $.fs.exists(p),
      read: async p => String(await $.fs.read(p)),
      bytes: async p => (await $.fs.read(p, { as: 'bytes' })).base64,
      now: () => $.clock.now(),
    },
    home,
    name,
  )
}

/** /drip get <name>: the gallery's game or drip, into the person's folder. */
async function getFromGallery($: EngineInterface, name: string): Promise<string> {
  const home = await $.env.get('HOME')
  if (!home) return 'No home folder to keep it in.'
  // Getting one already fetched fetches it again: the gallery's newest.
  const have = new Set([...TAKEN, ...Object.keys(ONE_SHOT_EFFECTS)])
  const said = await galleryGet(
    {
      fetch: url => $.http.fetch(url),
      write: (path, text) => $.fs.write(path, text),
      writeBytes: async (path, base64) => (await $.process.run(['/usr/bin/base64', '-D', '-o', path], { stdin: base64 }).catch(() => null))?.exitCode === 0,
    },
    home,
    name,
    have,
  )
  rowsKept = null // here now: the pane reads it afresh
  return said
}

/** A game by any of its names: built in, else the person's own. */
async function findGame($: EngineInterface, name: string): Promise<Game | null> {
  return gameOf(name) ?? (await folderGames($)).games.find(g => g.name === name.trim().toLowerCase()) ?? null
}

function overlayDeps($: EngineInterface): OverlayDeps {
  return {
    run: (argv, opts) => $.process.run(argv, opts).catch(() => null),
    spawn: (argv, input) => eventsOf($.process.spawn({ argv, input })),
    read: async path => String(await $.fs.read(path)),
    exists: path => $.fs.exists(path),
    home: () => $.env.get('HOME'),
    root: $.plugin.root,
  }
}

/** The window Claude runs in: the desktop app's, or the terminal's that hosts this session. */
async function findTarget($: EngineInterface, binary: string): Promise<Target | null> {
  const env: TerminalEnv = {
    TERM_PROGRAM: await $.env.get('TERM_PROGRAM'),
    __CFBundleIdentifier: await $.env.get('__CFBundleIdentifier'),
    TERM: await $.env.get('TERM'),
  }
  const isDesktop = (await $.session.surfaces()).includes('desktop')
  return selectTarget({ isDesktop, env, ancestors: await ancestorsOf(overlayDeps($), binary) })
}

function placement($: EngineInterface, binary: string): Placement {
  if (settings.display === 'fullscreen') return { kind: 'fullscreen' }
  return {
    kind: 'window',
    target: () => (target ??= findTarget($, binary)),
    missed: () => {
      if (!isMissedSaid) $.ui.toast("Games could not find Claude's window: games play over the screen under the pointer.")
      isMissedSaid = true
    },
  }
}

/** The list /drip answers with: each game, its other names and your best. */
async function listing($: EngineInterface): Promise<string> {
  const scores = scoresOf(store($))
  const lines = ['Games. /drip <game> starts one:']
  const yours = await folderGames($)
  for (const g of [...GAMES, ...yours.games]) {
    const best = await scores.best(g.name)
    const mine = 'isYours' in g && g.isYours ? '  ·  yours' : ''
    lines.push(`  ${g.name.padEnd(9)} ${g.title}${best > 0 ? `  ·  best ${best}` : ''}${mine}`)
  }
  if (yours.skipped) lines.push('', yours.skipped)
  // Not the refusal line: that one draws as the unlock module's card, this as the card.
  if (refusal(await read($, licence))) lines.push('', `Missiles is free; the other games are ${PRICE}, once: /drip unlock buys ${PRODUCT}.`)
  return lines.join('\n')
}

/** Why the game `name` may not be played now (not bought, and not free), or null. */
async function gameRefusal($: EngineInterface, name: string): Promise<string | null> {
  return FREE_GAMES.includes(name) ? null : refusal(await read($, licence))
}

/** /drip's own words, never a name to look for in the gallery. */
const WORDS = ['list', 'stop', 'save', 'delete', 'page', 'unlock', 'key', 'get', 'share']

/** Whether `name` plays as a drip here: built in, a folder of one, or a saved recipe. */
async function isDripHere($: EngineInterface, name: string): Promise<boolean> {
  if (name in ONE_SHOT_EFFECTS || BUILTIN_EFFECT_LIST.some(d => d.name === name)) return true
  if ((await folderDrips($)).some(d => d.name === name)) return true
  return name in (await readCustoms(store($)))
}

/** What the gallery has, for a name not on this Mac and the pane; null offline. */
async function gallery($: EngineInterface) {
  const now = await $.clock.now()
  if (galleryKept && now - galleryKept.at < GALLERY_MS) return galleryKept.index
  const index = await galleryListing({ fetch: url => $.http.fetch(url) })
  galleryKept = { at: now, index }
  return index
}

/** Who made it, as the pane says it: Glyphh's own are "Glyphh built". */
export const byOf = (author: string) => (author === GLYPHH ? 'Glyphh built' : `@${author}`)

/** One row of the pane's table. */
export type Row = {
  kind: Kind
  name: string
  title: string
  about: string
  emoji: string
  by: string | null
  best: number
  isYours: boolean
  isGallery: boolean
  isLocked: boolean
}

/** Every game and drip for the pane: here first (games, then drips), then the gallery's not fetched yet. */
async function paneRows($: EngineInterface, isBought: boolean): Promise<Row[]> {
  const scores = scoresOf(store($))
  const locked = (name: string) => !isBought && !FREE_GAMES.includes(name)
  const rows: Row[] = []
  for (const g of [...GAMES, ...(await folderGames($)).games]) {
    const f = 'isYours' in g ? (g as FolderGame) : null
    rows.push({
      kind: 'game',
      name: g.name,
      title: g.title,
      about: f?.about ?? BUILT_IN[g.name]?.about ?? '',
      emoji: emojiOf('game', g.name, f?.emoji),
      by: byOf(f ? f.author : GLYPHH),
      best: await scores.best(g.name),
      isYours: f?.isYours === true,
      isGallery: false,
      isLocked: locked(g.name),
    })
  }
  const own = await folderDrips($)
  const saved = await readCustoms(store($))
  const drip = (d: { name: string; title: string; about?: string; emoji?: string; by: string | null; isYours: boolean }): Row => ({
    kind: 'drip',
    name: d.name,
    title: d.title,
    about: d.about ?? BUILT_IN[d.name]?.about ?? '',
    emoji: emojiOf('drip', d.name, d.emoji),
    by: d.by,
    best: 0,
    isYours: d.isYours,
    isGallery: false,
    isLocked: false,
  })
  rows.push(
    ...BUILTIN_EFFECT_LIST.map(d => drip({ name: d.name, title: titleOf(d.name), by: byOf(GLYPHH), isYours: false })),
    ...own.map(d => drip({ ...d, by: byOf(d.author) })),
    // A saved recipe is the person's, made of built-in drips: its recipe is its line.
    ...Object.entries(saved)
      .filter(([n]) => !own.some(d => d.name === n))
      .map(([name, recipe]) => drip({ name, title: titleOf(name), about: recipe, by: null, isYours: true })),
  )
  const index = await gallery($)
  const here = new Set(rows.map(r => r.name))
  const fromGallery = (kind: Kind, e: Entry): Row => ({
    kind,
    name: e.name,
    title: e.title,
    about: e.about ?? '',
    emoji: emojiOf(kind, e.name, e.emoji),
    by: e.author ? byOf(e.author) : null,
    best: 0,
    isYours: false,
    isGallery: true,
    isLocked: kind === 'game' && locked(e.name),
  })
  for (const e of index?.games ?? []) if (!here.has(e.name)) rows.push(fromGallery('game', e))
  for (const e of index?.drips ?? []) if (!here.has(e.name)) rows.push(fromGallery('drip', e))
  return rows
}

/** Rows to a page of the pane's table. */
export const PAGE_ROWS = 15

/** The rows a search (every word, in the name, line, type, maker or "yours") and a filter leave, in order. */
export function shown(rows: readonly Row[], query: string, filter: Kind | 'all'): Row[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return rows.filter(r => {
    if (filter !== 'all' && r.kind !== filter) return false
    const text = `${r.title} ${r.name} ${r.about} ${TYPES[r.kind]} ${r.by ?? ''} ${r.isYours ? 'yours' : ''}`.toLowerCase()
    return words.every(w => text.includes(w))
  })
}

/** A favourite's key, as the tray and the store keep it. */
export const favKey = (kind: Kind, name: string) => `${kind}:${name}`

/** The largest picture the pane can draw: an Svg's source is at most 131072 characters. */
const SVG_MAX = 131_072

/** The pane's rows as last read, kept until a /drip command or a fetch changes what's here: a press redraws at once. */
let rowsKept: { isBought: boolean; rows: Row[] } | null = null

/** The pane's rows: kept ones, else read afresh. */
async function rowsOf($: EngineInterface, isBought: boolean): Promise<Row[]> {
  if (rowsKept?.isBought === isBought) return rowsKept.rows
  const rows = await paneRows($, isBought)
  rowsKept = { isBought, rows }
  return rows
}

/** Each page's screenshot as the pane draws it, by "kind:name": loading while it is read, null for none. */
const shots = new Map<string, string | null | 'loading'>()

/** The gallery's covers fetched this load, base64 by "kind:name": one fetch each. */
const galleryCovers = new Map<string, string | null>()

/** An item's screenshot as base64 JPEG or PNG ({ type, base64 }), from wherever it lives; null without one. */
async function coverOf($: EngineInterface, r: Row): Promise<{ type: string; base64: string } | null> {
  const read64 = async (path: string) => ((await $.fs.exists(path).catch(() => false)) ? (await $.fs.read(path, { as: 'bytes' })).base64 : null)
  const home = await $.env.get('HOME')
  if (!r.isGallery) {
    // A folder's (fetched or the person's), else a built-in one's in the plugin's covers/.
    for (const file of COVER_FILES) {
      const b = home ? await read64(`${home}/.glyphh/${r.kind}s/${r.name}/${file}`) : null
      if (b) return { type: file.endsWith('.png') ? 'png' : 'jpeg', base64: b }
    }
    const b = await read64(`${$.plugin.root}/covers/${r.kind}-${r.name}.jpg`)
    return b ? { type: 'jpeg', base64: b } : null
  }
  const key = favKey(r.kind, r.name)
  if (!galleryCovers.has(key)) {
    const index = await gallery($)
    const entry = (r.kind === 'game' ? index?.games : index?.drips)?.find(e => e.name === r.name)
    const file = COVER_FILES.find(f => entry?.files.includes(f))
    const res = file ? await $.http.fetch(`${GALLERY_API}/${r.kind}s/${r.name}/${file}?ref=main`).catch(() => null) : null
    let base64: string | null = null
    try {
      const v = res?.ok ? (JSON.parse(res.text) as { encoding?: string; content?: string }) : null
      base64 = v?.encoding === 'base64' && typeof v.content === 'string' ? v.content.replace(/\s+/g, '') : null
    } catch {
      base64 = null
    }
    galleryCovers.set(key, base64 && file ? `${file.endsWith('.png') ? 'png' : 'jpeg'}:${base64}` : null)
  }
  const kept = galleryCovers.get(key)
  return kept ? { type: kept.slice(0, kept.indexOf(':')), base64: kept.slice(kept.indexOf(':') + 1) } : null
}

/** A screenshot as an Svg the pane can draw (480×300, filled); null when there is none or it is too big. */
export function screenshotSvg(cover: { type: string; base64: string } | null): string | null {
  if (!cover) return null
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300"><image width="480" height="300" preserveAspectRatio="xMidYMid slice" href="data:image/${cover.type};base64,${cover.base64}"/></svg>`
  return svg.length <= SVG_MAX ? svg : null
}

/** The pane's search: the rows it leaves, from the first page. */
async function search($: EngineInterface, text: string): Promise<void> {
  await update($, query, () => text)
  await update($, page, () => 0)
}

/** Stars or unstars an item: the tray above the prompt shows the starred ones. */
async function toggleFavourite($: EngineInterface, key: string): Promise<void> {
  const next = await update($, favourites, list => (list.includes(key) ? list.filter(k => k !== key) : [...list, key]))
  await $.store.set(FAVOURITES_KEY, next)
}

/** Play or Get on the pane (or the tray): the game or drip, fetched first when it's the gallery's; a locked game opens checkout. */
async function press($: EngineInterface, row: Row): Promise<void> {
  if (row.isLocked) return checkout($)
  const said = row.isGallery
    ? await getThenPlay($, row.kind, row.name).catch(err => `/drip: ${short(err)}`)
    : row.kind === 'drip'
      ? await queueDrip($, row.name).then(() => 'Got')
      : await play($, (await findGame($, row.name))!).catch(err => `/drip: ${short(err)}`)
  if (!said.startsWith('Got') && !said.includes('Esc quits')) $.ui.toast(said)
}

/** A drip for the drips' half (../drips) to play. */
async function queueDrip($: EngineInterface, name: string): Promise<void> {
  const at = await $.clock.now()
  await update($, queued, () => ({ recipe: name, at }))
}

/** Fetches the gallery's `name` (/drip <name>), then plays it:
 *  says what happened when it couldn't. */
async function getThenPlay($: EngineInterface, kind: Kind, name: string): Promise<string> {
  const got = await getFromGallery($, name)
  if (!got.startsWith('Got ')) return got
  if (kind === 'drip') {
    await queueDrip($, name)
    return got
  }
  const game = await findGame($, name)
  return game ? play($, game) : got
}

/** What /drip unlock does, from the card's Unlock (a mod can't run its own
 *  command, and the engine follows $ only within this file). */
async function checkout($: EngineInterface): Promise<void> {
  const d: Deps = {
    store: { get: key => $.store.get(key), set: (key, value) => $.store.set(key, value), delete: key => $.store.delete(key) },
    state: { get: () => read($, licence), set: async fn => void (await update($, licence, fn)) },
    now: () => $.clock.now(),
    every: (ms, fn) => $.clock.every(ms, () => void fn()),
    check: async text => (await verify(text, MOD)) !== null,
    fetch: url => $.http.fetch(url),
    open: async url => (await $.process.run(['open', url]).catch(() => null))?.exitCode === 0,
    copy: async text => (await $.ui.copy({ text })).isCopied,
    toast: (text, ms) => $.ui.toast(text, ms ? { timeoutMs: ms } : undefined),
    log: text => $.ui.log(text),
  }
  await buy(d)
  if (!(await read($, licence)).licence) $.ui.toast(`Checkout for ${PRODUCT} (${PRICE}, once) is open in your browser. ${PRODUCT} unlocks on its own when you've paid.`)
}

/** Starts `game` in the overlay; resolves once it is on screen. The score it
 *  posts is kept when it beats the top one. */
async function play($: EngineInterface, game: Game): Promise<string> {
  native ??= prepareOverlay(overlayDeps($))
  const prepared = await native
  if (!('binary' in prepared)) return prepared.missing
  const scores = scoresOf(store($))
  const best = await scores.best(game.name)
  const { show } = overlayHost(overlayDeps($), prepared.binary, placement($, prepared.binary))
  const shown = await show(
    s => gameDoc(game, s.w, s.h, best, settings.sounds),
    async ev => void (ev.t === 'score' && (await scores.keep(game.name, ev.score))),
  )
  void shown.closed.catch(() => undefined)
  return `${game.title}${best > 0 ? `: your best is ${best}` : ''}. Esc quits, M mutes.`
}

export function arcade(on: On, options: PluginOptions) {
  settings = settingsOf(options)
  native = null
  target = null
  isMissedSaid = false
  galleryKept = null
  galleryCovers.clear()
  shots.clear()
  rowsKept = null

  // The Drip pane (/drip, /drip list): a search, a filter by type, and a
  // table, fifteen rows a page: emoji, name, line, type, ☆ (the tray) and Play
  // (Get for the gallery's). Unlock above it until it's bought.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, ...els } = $.ui.resolve(e)
    const Input = 'Input' in els ? els.Input : null
    // Every surface but the terminal draws SVG: the logo; the terminal gets the word.
    const Svg = e.surface !== 'terminal' && 'Svg' in els ? els.Svg : null
    const isBought = refusal(await read($, licence)) === null
    const all = await rowsOf($, isBought)
    const q = await read($, query)
    const f = await read($, filter)
    const rows = shown(all, q, f)
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_ROWS))
    const at = Math.min(await read($, page), pages - 1)
    const stars = await read($, favourites)
    // One item's page: ← back to its type, its screenshot, its line and its button.
    const opened = await read($, detail)
    const item = opened ? all.find(r => favKey(r.kind, r.name) === opened) : undefined
    if (item) {
      const key = favKey(item.kind, item.name)
      // The page draws now; its screenshot follows once read (a gallery one is fetched).
      await read($, shotTick)
      if (Svg && !shots.has(key)) {
        shots.set(key, 'loading')
        void coverOf($, item)
          .then(c => shots.set(key, screenshotSvg(c)))
          .catch(() => shots.set(key, null))
          .then(() => update($, shotTick, n => n + 1))
      }
      const shot = shots.get(key) ?? null
      const isStar = stars.includes(key)
      return (
        <Box flexDirection="column" gap={1} paddingX={1}>
          <Box key="top" flexDirection="row">
            <Button key="back" label={`←\u00a0\u00a0${TYPES[item.kind]}s`} plain onPress={() => void update($, detail, () => null)} />
          </Box>
          {shot === 'loading' ? (
            <Text key="shot" dimColor>
              Loading screenshot…
            </Text>
          ) : shot && Svg ? (
            <Svg key="shot" source={shot} alt={`${item.title}, playing`} width={480} height={300} />
          ) : (
            <Text key="shot">{item.emoji}</Text>
          )}
          <Box key="name" flexDirection="row" alignItems="center" gap={1}>
            <Text>{item.emoji}</Text>
            <Text bold>{item.title}</Text>
            {item.by ? <Text dimColor>{item.by}</Text> : null}
            {item.isYours ? <Text dimColor>yours</Text> : null}
          </Box>
          {item.about ? <Text key="about">{item.about}</Text> : null}
          <Text key="type" dimColor>
            {TYPES[item.kind]}
            {item.best > 0 ? ` · Best ${item.best.toLocaleString('en-GB')}` : ''}
          </Text>
          <Box key="act" flexDirection="row" alignItems="center" gap={1}>
            {item.isLocked ? (
              <Button key="unlock" label={`Unlock all games - ${PRICE}`} variant="primary" onPress={() => void checkout($)} />
            ) : (
              <Button key={`${item.isGallery ? 'get' : 'play'}:${key}`} label={item.isGallery ? 'Get' : 'Play'} variant="primary" onPress={() => void press($, item)} />
            )}
            <Button key={`fav:${key}`} label={isStar ? '★' : '☆'} plain dimColor={!isStar} onPress={() => void toggleFavourite($, key)} />
          </Box>
        </Box>
      )
    }
    const kinds = (Object.keys(TYPES) as Kind[]).filter(k => all.some(r => r.kind === k))
    const turn = (by: number) => () => void update($, page, p => Math.max(0, Math.min(pages - 1, Math.min(p, pages - 1) + by)))
    return (
      <Box flexDirection="column" gap={1} paddingX={1}>
        <Box key="logo" flexDirection="row" alignItems="center" gap={1}>
          {Svg ? (
            <Svg key="logo" source={LOGO} alt={LOGO_ALT} height={28} width={Math.round(28 * LOGO_RATIO)} />
          ) : (
            <Text bold>drip</Text>
          )}
        </Box>
        {isBought ? null : (
          <Box flexDirection="row" alignItems="center" gap={2}>
            <Text dimColor>Unlock all games for a one time payment of {PRICE}.</Text>
            <Button key="unlock" label={`Unlock all games - ${PRICE}`} variant="primary" onPress={() => void checkout($)} />
          </Box>
        )}
        {Input ? (
          <Input
            key="search"
            placeholder="Search games and drips"
            value={q}
            submitLabel="search"
            onInput={value => void search($, value)}
            onSubmit={value => void search($, value)}
          />
        ) : null}
        <Box flexDirection="row" gap={1}>
          {(['all', ...kinds] as const).map(k => (
            <Button
              key={`filter:${k}`}
              label={k === 'all' ? `All ${all.length}` : `${TYPES[k]}s ${all.filter(r => r.kind === k).length}`}
              plain
              dimColor={f !== k}
              onPress={() => void update($, filter, () => k).then(() => update($, page, () => 0))}
            />
          ))}
        </Box>
        <Box flexDirection="column" gap={1}>
          {rows.length === 0 ? <Text dimColor>Nothing matches “{q}”.</Text> : null}
          {rows.slice(at * PAGE_ROWS, (at + 1) * PAGE_ROWS).map(r => {
            const key = favKey(r.kind, r.name)
            const isStar = stars.includes(key)
            return (
              <Box key={key} flexDirection="row" alignItems="center" gap={2}>
                {/* The name button keeps its own room: nothing beside it is laid over it. */}
                <Box flexShrink={0}>
                  <Button key={`open:${key}`} label={`${r.emoji}\u00a0\u00a0\u00a0${r.title}`} plain onPress={() => void update($, detail, () => key)} />
                </Box>
                {r.isYours ? <Text dimColor>yours</Text> : null}
                <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
                  <Text dimColor wrap="truncate">{r.about || r.by || ''}</Text>
                </Box>
                <Box flexShrink={0}>
                  <Text dimColor>{TYPES[r.kind]}</Text>
                </Box>
                <Button key={`fav:${key}`} label={isStar ? '★' : '☆'} plain dimColor={!isStar} onPress={() => void toggleFavourite($, key)} />
                <Button
                  key={`${r.isGallery ? 'get' : 'play'}:${key}`}
                  label={r.isGallery ? 'Get' : 'Play'}
                  variant="secondary"
                  dimColor={r.isLocked}
                  onPress={() => void press($, r)}
                />
              </Box>
            )
          })}
        </Box>
        {pages > 1 ? (
          <Box flexDirection="row" alignItems="center" gap={1}>
            <Button key="prev" label="‹" plain dimColor={at === 0} onPress={turn(-1)} />
            <Text dimColor>
              {at + 1} of {pages}
            </Text>
            <Button key="next" label="›" plain dimColor={at === pages - 1} onPress={turn(1)} />
          </Box>
        ) : null}
      </Box>
    )
  })

  // The tray above the prompt: the drips' half (../drips) draws the starred
  // drips and its own buttons; the starred games go in front, played here.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const band = await next(e)
    if (e.props.hasSurvey || !(await read($, bandOpen))) return band
    const games = (await read($, favourites)).filter(k => k.startsWith('game:')).map(k => k.slice(5))
    if (games.length === 0) return band
    const { Box, Button } = $.ui.resolve(e)
    const isBought = refusal(await read($, licence)) === null
    const all = await rowsOf($, isBought)
    const tray = games.map(n => all.find(r => r.kind === 'game' && r.name === n)).filter((r): r is Row => r !== undefined)
    return (
      <Box flexDirection="row" flexWrap="wrap" gap={1}>
        {tray.map(r => (
          <Button key={`tray:game:${r.name}`} label={`${r.emoji} ${r.title}`} dimColor={r.isLocked} onPress={() => void press($, r)} />
        ))}
        {band}
      </Box>
    )
  })

  // /drip <game> starts a game; /drip alone lists the games, then the drips
  // (the drips' half, ../drips); anything else is the drips' to play.
  on('command.run', { command: 'drip' }, async ($, e, next) => {
    rowsKept = null // a /drip command may change what's here: the pane reads it afresh
    const name = e.args.trim()
    const [verb, ...rest] = name.split(/\s+/)
    if (verb?.toLowerCase() === 'get') return { text: rest.length === 1 ? await getFromGallery($, rest[0]!) : 'Usage: /drip get <name>' }
    if (verb?.toLowerCase() === 'share') return { text: rest.length === 1 ? await shareToGallery($, rest[0]!) : 'Usage: /drip share <name>' }
    if (!name || name.toLowerCase() === 'list') {
      // The pane; where no surface places one (a bare terminal), the list in words.
      const { isPlaced } = await $.ui.open({ id: PANE, title: 'Drip', focus: true })
      if (isPlaced) return { text: OPENED }
      const drips = await next({ ...e, args: 'list' })
      return { text: `${await listing($)}\n\n${drips.text ?? ''}`.trim() }
    }
    const game = await findGame($, name)
    if (!game) {
      // Not here: the gallery's, fetched and played (a game waits for it to be bought).
      const want = name.toLowerCase()
      if (!NAME.test(want) || WORDS.includes(want) || (await isDripHere($, want))) return next(e)
      const index = await gallery($)
      const kind = index?.games.some(g => g.name === want) ? 'game' : index?.drips.some(d => d.name === want) ? 'drip' : null
      if (!kind) return next(e)
      const no = kind === 'game' ? await gameRefusal($, want) : null
      if (no) return { text: no }
      return { text: await getThenPlay($, kind, want).catch(err => `/drip: ${short(err)}`) }
    }
    const no = await gameRefusal($, game.name)
    if (no) return { text: no }
    try {
      return { text: await play($, game) }
    } catch (err) {
      return { text: `/drip: ${short(err)}` }
    }
  })
}
