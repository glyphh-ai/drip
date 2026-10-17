// Games, wired to the engine: the one file of this module that holds
// `$` and the mod's state (the engine follows `$` and atoms only within the
// file whose hook received them), handing the rest closures. /drip lists the
// games and starts one in the shared native overlay (../overlay), over
// Claude's window or the whole screen as the /config row `display` says; the
// overlay takes the pointer and keys while a game is on. Each game posts its
// score as it goes, and the top one is kept for the next round to beat.
// /drip alone draws a small card whose Open drip shows the console
// (../console): every game and drip as covers, launched from there. Missiles
// and every drip are free; the other games wait for Glyphh Drip to be bought.
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
import { coverUrl, get as galleryGet, listing as galleryListing, type Entry } from '../content/gallery.ts'
import { GLYPHH, NAME } from '../content/rules.js'
import { share as galleryShare } from '../content/share.ts'
import { readCustoms } from '../drips/library.ts'
import { consoleHtml, type Item } from '../console/page.ts'
import { CAT_RATIO, CAT_SVG, LOGO_ALT, MARK_RATIO, MARK_SVG } from './brand.ts'
import { GAMES, gameDoc, gameOf } from './games/index.ts'
import type { Game } from './games/game.ts'
import { DRIP_ICONS, GAME_ICONS, GENERIC_DRIP_ICON, GENERIC_GAME_ICON } from './icons.ts'
import { scoresOf, type Store } from './scores.ts'
import { settingsOf, type Settings } from './settings.ts'

const licence = atom({ plugin: 'glyphh-drip', key: 'licence' } as const, INITIAL)
/** A drip the console asked to play: the drips' half (../drips) takes it. */
const queued = atom({ plugin: 'glyphh-drip', key: 'queued' } as const, null as { recipe: string; at: number } | null)

/** The games anyone can play, bought or not (every drip is free too). */
export const FREE_GAMES: readonly string[] = ['missiles']
/** The game and the drip each console tab features. */
export const FEATURED = { game: 'missiles', drip: 'fireworks' } as const
/** How long the console stays up untouched, in ms. */
const CONSOLE_MS = 30 * 60_000

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
async function folderDrips($: EngineInterface): Promise<{ name: string; title: string; icon: string | null; isYours: boolean; author: string; cover: string }[]> {
  const d = folderDeps($)
  const builtIn = new Set(Object.keys(ONE_SHOT_EFFECTS))
  const shipped = (await loadDrips(d, `${$.plugin.root}/drips`, builtIn, false)).drips
  const home = await $.env.get('HOME')
  const yours = home ? (await loadDrips(d, dripsDir(home), new Set([...builtIn, ...shipped.map(x => x.name)]), true)).drips : []
  return [...shipped, ...yours].map(x => ({ name: x.name, title: x.title, icon: x.icon, isYours: x.isYours, author: x.author, cover: x.cover }))
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
  return galleryGet(
    {
      fetch: url => $.http.fetch(url),
      write: (path, text) => $.fs.write(path, text),
      writeBytes: async (path, base64) => (await $.process.run(['/usr/bin/base64', '-D', '-o', path], { stdin: base64 }).catch(() => null))?.exitCode === 0,
    },
    home,
    name,
    have,
  )
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

/** What the gallery has, for the console and for a name not on this Mac; null offline. */
async function gallery($: EngineInterface) {
  return galleryListing({ fetch: url => $.http.fetch(url) })
}

/** The gallery's game or drip as the console shows it, before it's fetched. */
function galleryItem(kind: 'game' | 'drip', e: Entry, isLocked: boolean): Item {
  const cover = coverUrl(kind, e)
  return {
    kind,
    name: e.name,
    title: e.title,
    ...(e.about ? { about: e.about } : {}),
    ...(e.author ? { by: byOf(e.author) } : {}),
    ...(cover ? { cover } : { icon: kind === 'game' ? GENERIC_GAME_ICON : GENERIC_DRIP_ICON }),
    isGallery: true,
    isLocked,
    isYours: false,
  }
}

/** Fetches the gallery's `name` (a launch, or /drip <name>), then plays it:
 *  says what happened when it couldn't. */
async function getThenPlay($: EngineInterface, kind: 'game' | 'drip', name: string): Promise<string> {
  const got = await getFromGallery($, name)
  if (!got.startsWith('Got ')) return got
  if (kind === 'drip') {
    const at = await $.clock.now()
    await update($, queued, () => ({ recipe: name, at }))
    return got
  }
  const game = await findGame($, name)
  return game ? play($, game, () => void openConsole($, 'games').catch(err => $.ui.toast(`drip ✗ ${short(err)}`))) : got
}

/** Who made it, as the console says it: Glyphh's own are "Glyphh built". */
export const byOf = (author: string) => (author === GLYPHH ? 'Glyphh built' : `@${author}`)

/** A data: URI for SVG markup. */
const svgUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

/** The cover photographed for `key` ("game-missiles"), as a data: URI; null without one. */
async function coverOf($: EngineInterface, key: string): Promise<string | null> {
  const path = `${$.plugin.root}/covers/${key}.jpg`
  if (!(await $.fs.exists(path))) return null
  const { base64 } = await $.fs.read(path, { as: 'bytes' })
  return `data:image/jpeg;base64,${base64}`
}

/** Every game and drip as the console shows them. */
async function consoleItems($: EngineInterface, isBought: boolean): Promise<{ games: Item[]; drips: Item[] }> {
  const scores = scoresOf(store($))
  const games: Item[] = []
  for (const g of [...GAMES, ...(await folderGames($)).games]) {
    const best = await scores.best(g.name)
    const isYours = 'isYours' in g && g.isYours === true
    // A folder's game has its own cover; a built-in one's is in covers/.
    const cover = 'cover' in g && typeof g.cover === 'string' ? g.cover : await coverOf($, `game-${g.name}`)
    games.push({
      kind: 'game',
      name: g.name,
      title: g.title,
      ...('about' in g && typeof g.about === 'string' ? { about: g.about } : {}),
      ...(best > 0 ? { best: `Best ${best.toLocaleString('en-GB')}` } : {}),
      ...(cover ? { cover } : { icon: GAME_ICONS[g.name] ?? ('icon' in g && typeof g.icon === 'string' ? g.icon : GENERIC_GAME_ICON) }),
      by: byOf('author' in g && typeof g.author === 'string' ? g.author : GLYPHH),
      isLocked: !isBought && !FREE_GAMES.includes(g.name),
      isYours,
    })
  }
  const saved = Object.keys(await readCustoms(store($)))
  const own = await folderDrips($)
  const listed = [
    ...BUILTIN_EFFECT_LIST.map(d => ({ name: d.name, title: titleOf(d.name), icon: DRIP_ICONS[d.name] ?? GENERIC_DRIP_ICON, isYours: false, author: GLYPHH, cover: null as string | null })),
    ...own.map(d => ({ name: d.name, title: d.title, icon: d.icon ?? GENERIC_DRIP_ICON, isYours: d.isYours, author: d.author, cover: d.cover as string | null })),
    // A saved recipe is the person's, made of built-in drips: no cover, no author.
    ...saved.filter(n => !own.some(d => d.name === n)).map(name => ({ name, title: titleOf(name), icon: GENERIC_DRIP_ICON, isYours: true, author: null, cover: null as string | null })),
  ]
  const drips: Item[] = []
  for (const d of listed) {
    const cover = d.cover ?? (d.author === GLYPHH ? await coverOf($, `drip-${d.name}`) : null)
    drips.push({ kind: 'drip', name: d.name, title: d.title, ...(cover ? { cover } : { icon: d.icon }), ...(d.author ? { by: byOf(d.author) } : {}), isLocked: false, isYours: d.isYours })
  }
  // Then what the gallery has that isn't here yet, to fetch on launch.
  const index = await gallery($)
  const here = new Set([...games, ...drips].map(i => i.name))
  for (const e of index?.games ?? []) if (!here.has(e.name)) games.push(galleryItem('game', e, !isBought && !FREE_GAMES.includes(e.name)))
  for (const e of index?.drips ?? []) if (!here.has(e.name)) drips.push(galleryItem('drip', e, false))
  return { games, drips }
}

/** Shows the console over Claude, on `shown`'s tab. What it asks for is done
 *  once it has closed: a game (the console comes back when the game ends), a
 *  drip, or checkout. */
async function openConsole($: EngineInterface, shown: 'games' | 'drips'): Promise<void> {
  native ??= prepareOverlay(overlayDeps($))
  const prepared = await native
  if (!('binary' in prepared)) return $.ui.toast(prepared.missing)
  const isBought = refusal(await read($, licence)) === null
  const { games, drips } = await consoleItems($, isBought)
  const html = consoleHtml({
    games,
    drips,
    featured: FEATURED,
    isBought,
    price: PRICE,
    logo: { cat: svgUri(CAT_SVG), word: svgUri(MARK_SVG) },
    tab: shown,
    quiet: !settings.sounds,
  })
  let asked = ''
  const { show } = overlayHost(overlayDeps($), prepared.binary, placement($, prepared.binary))
  const up = await show(
    () => ({ html, closeAfterMs: CONSOLE_MS, interactive: true }),
    async ev => void (ev.t === 'ask' && (asked = ev.ask)),
  )
  void up.closed.then(() => act($, asked), () => undefined)
}

/** Does what the console asked: `launch game <name>`, `launch drip <name>` or `unlock`. */
async function act($: EngineInterface, asked: string): Promise<void> {
  const [verb, kind, name] = asked.split(' ')
  if (verb === 'unlock') return checkout($)
  if (verb !== 'launch' || !name || (kind !== 'game' && kind !== 'drip')) return
  if (kind === 'game' && (await gameRefusal($, name))) return checkout($)
  const isHere = kind === 'game' ? (await findGame($, name)) !== null : await isDripHere($, name)
  if (!isHere) {
    const said = await getThenPlay($, kind, name).catch(err => `/drip: ${short(err)}`)
    if (!said.startsWith('Got ') && !said.includes('Esc quits')) $.ui.toast(said)
    return
  }
  if (kind === 'drip') {
    const at = await $.clock.now()
    await update($, queued, () => ({ recipe: name, at }))
    return
  }
  const game = (await findGame($, name))!
  const said = await play($, game, () => void openConsole($, 'games').catch(err => $.ui.toast(`drip ✗ ${short(err)}`))).catch(err => `/drip: ${short(err)}`)
  if (!said.startsWith(game.title)) $.ui.toast(said) // the overlay could not run
}


/** What /drip unlock does, from the card's Play (a mod can't run its own
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
async function play($: EngineInterface, game: Game, ended?: () => void): Promise<string> {
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
  void shown.closed.then(ended, () => undefined)
  return `${game.title}${best > 0 ? `: your best is ${best}` : ''}. Esc quits, M mutes.`
}

export function arcade(on: On, options: PluginOptions) {
  settings = settingsOf(options)
  native = null
  target = null
  isMissedSaid = false

  // /drip alone (or /drip list): the small card, the logo and Open drip;
  // Unlock beside it until Glyphh Drip is bought.
  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    const args = e.props.args.trim().toLowerCase()
    if (e.props.command !== 'drip' || e.props.isErrored || (args !== '' && args !== 'list')) return next(e)
    const { Box, Text, Button, ...els } = $.ui.resolve(e)
    // Every surface but the terminal draws SVG: the logo; the terminal gets the word.
    const Svg = e.surface !== 'terminal' && 'Svg' in els ? els.Svg : null
    const isLocked = refusal(await read($, licence)) !== null
    return (
      <Box flexDirection="row" alignItems="center" gap={3} paddingX={3} paddingY={2} borderStyle="round" borderDimColor>
        {Svg ? (
          <Box flexDirection="row" alignItems="center" gap={2}>
            <Svg source={CAT_SVG} alt={LOGO_ALT} height={30} width={Math.round(30 * CAT_RATIO)} />
            <Svg source={MARK_SVG} alt="drip" height={22} width={Math.round(22 * MARK_RATIO)} />
          </Box>
        ) : (
          <Text bold>drip</Text>
        )}
        <Box flexGrow={1} />
        {isLocked ? <Button key="unlock" label={`Unlock · ${PRICE}`} variant="secondary" onPress={() => void checkout($)} /> : null}
        <Button key="open" label="Open drip" variant="primary" onPress={() => void openConsole($, 'games')} />
      </Box>
    )
  })

  // /drip <game> starts a game; /drip alone lists the games, then the drips
  // (the drips' half, ../drips); anything else is the drips' to play.
  on('command.run', { command: 'drip' }, async ($, e, next) => {
    const name = e.args.trim()
    const [verb, ...rest] = name.split(/\s+/)
    if (verb?.toLowerCase() === 'get') return { text: rest.length === 1 ? await getFromGallery($, rest[0]!) : 'Usage: /drip get <name>' }
    if (verb?.toLowerCase() === 'share') return { text: rest.length === 1 ? await shareToGallery($, rest[0]!) : 'Usage: /drip share <name>' }
    if (!name || name.toLowerCase() === 'list') {
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
