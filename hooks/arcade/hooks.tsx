// Games, wired to the engine: the one file of this module that holds
// `$` and the mod's state (the engine follows `$` and atoms only within the
// file whose hook received them), handing the rest closures. /drip lists the
// games and starts one in the shared native overlay (../overlay), over
// Claude's window or the whole screen as the /config row `display` says; the
// overlay takes the pointer and keys while a game is on. Each game posts its
// score as it goes, and the top one is kept for the next round to beat.
// /drip alone draws as the games card: each game with its icon, your best and
// Play, four to a page; until Games is bought, Play opens checkout instead.
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
import { get as galleryGet } from '../content/gallery.ts'
import { share as galleryShare } from '../content/share.ts'
import { readCustoms } from '../drips/library.ts'
import { LOCKUP_RATIO, LOCKUP_SVG, LOGO_ALT } from './brand.ts'
import { GAMES, gameDoc, gameOf } from './games/index.ts'
import type { Game } from './games/game.ts'
import { DRIP_ICONS, GAME_ICONS, GENERIC_DRIP_ICON, GENERIC_GAME_ICON, tiled } from './icons.ts'
import { scoresOf, type Store } from './scores.ts'
import { settingsOf, type Settings } from './settings.ts'

const licence = atom({ plugin: 'glyphh-drip', key: 'licence' } as const, INITIAL)
/** The card's tab, and its page on each tab, from 0. */
const tab = atom({ plugin: 'glyphh-drip', key: 'tab' } as const, 'games' as 'games' | 'drips')
const page = atom({ plugin: 'glyphh-drip', key: 'page' } as const, 0)
const dripPage = atom({ plugin: 'glyphh-drip', key: 'dripPage' } as const, 0)
/** A drip the card asked to play: the drips' half (../drips) takes it. */
const queued = atom({ plugin: 'glyphh-drip', key: 'queued' } as const, null as { recipe: string; at: number } | null)

/** Rows the card shows to a page. */
export const PAGE_SIZE = 4
/** How many pages the Games tab has. */
export const PAGES = Math.ceil(GAMES.length / PAGE_SIZE)

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
  return { list: p => $.fs.list(p), read: async p => String(await $.fs.read(p)), exists: p => $.fs.exists(p) }
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
async function folderDrips($: EngineInterface): Promise<{ name: string; title: string; icon: string | null; isYours: boolean }[]> {
  const d = folderDeps($)
  const builtIn = new Set(Object.keys(ONE_SHOT_EFFECTS))
  const shipped = (await loadDrips(d, `${$.plugin.root}/drips`, builtIn, false)).drips
  const home = await $.env.get('HOME')
  const yours = home ? (await loadDrips(d, dripsDir(home), new Set([...builtIn, ...shipped.map(x => x.name)]), true)).drips : []
  return [...shipped, ...yours].map(x => ({ name: x.name, title: x.title, icon: x.icon, isYours: x.isYours }))
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
  const have = new Set([...TAKEN, ...Object.keys(ONE_SHOT_EFFECTS), ...(await folderGames($)).games.filter(g => !g.isYours).map(g => g.name)])
  return galleryGet({ fetch: url => $.http.fetch(url), write: (path, text) => $.fs.write(path, text) }, home, name, have)
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
  if (refusal(await read($, licence))) lines.push('', `${PRODUCT} is ${PRICE}, once: /drip unlock buys it.`)
  return lines.join('\n')
}

/** Play on the card: the game (nothing until it is bought: Unlock is below). */
async function press($: EngineInterface, game: Game): Promise<void> {
  if (refusal(await read($, licence))) return
  const said = await play($, game).catch(err => `/drip: ${short(err)}`)
  if (!said.startsWith(game.title)) $.ui.toast(said) // the overlay could not run
}

/** Play on the Drips tab: queued for the drips' half to play (nothing until
 *  it is bought). */
async function pressDrip($: EngineInterface, name: string): Promise<void> {
  if (refusal(await read($, licence))) return
  const at = await $.clock.now()
  await update($, queued, () => ({ recipe: name, at }))
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

  // /drip alone (or /drip list): the card, Games and Drips on two tabs.
  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    const args = e.props.args.trim().toLowerCase()
    if (e.props.command !== 'drip' || e.props.isErrored || (args !== '' && args !== 'list')) return next(e)
    const { Box, Text, Button, ...els } = $.ui.resolve(e)
    // Every surface but the terminal draws SVG: the logo and the icons; the terminal gets words.
    const Svg = e.surface !== 'terminal' && 'Svg' in els ? els.Svg : null
    const shown = await read($, tab)
    // Not bought: every Play is dimmed and does nothing; Unlock below opens checkout.
    const isLocked = refusal(await read($, licence)) !== null
    const rows = []
    let at: number
    let pages: number
    if (shown === 'games') {
      const games: (Game | FolderGame)[] = [...GAMES, ...(await folderGames($)).games]
      pages = Math.max(1, Math.ceil(games.length / PAGE_SIZE))
      at = Math.min(await read($, page), pages - 1)
      const scores = scoresOf(store($))
      for (const game of games.slice(at * PAGE_SIZE, (at + 1) * PAGE_SIZE)) {
        const best = await scores.best(game.name)
        const isYours = 'isYours' in game && game.isYours
        const icon = GAME_ICONS[game.name] ?? ('icon' in game && game.icon ? tiled(game.icon) : GENERIC_GAME_ICON)
        rows.push(
          <Box key={game.name} flexDirection="row" alignItems="center" gap={3}>
            {Svg ? <Svg source={icon} alt={game.title} width={28} height={28} /> : null}
            <Box flexGrow={1} flexDirection="row" alignItems="center" gap={2}>
              <Text bold>{game.title}</Text>
              {isYours ? <Text dimColor>yours</Text> : null}
            </Box>
            <Text dimColor>{best > 0 ? `Best ${best.toLocaleString('en-GB')}` : ''}</Text>
            <Button key={`play:${game.name}`} label="Play" variant="secondary" dimColor={isLocked} onPress={() => void (isLocked || press($, game))} />
          </Box>,
        )
      }
    } else {
      const saved = Object.keys(await readCustoms(store($)))
      const own = await folderDrips($)
      const drips = [
        ...BUILTIN_EFFECT_LIST.map(d => ({ name: d.name, title: titleOf(d.name), icon: DRIP_ICONS[d.name] ?? GENERIC_DRIP_ICON, isYours: false })),
        ...own.map(d => ({ name: d.name, title: d.title, icon: d.icon ? tiled(d.icon) : GENERIC_DRIP_ICON, isYours: d.isYours })),
        ...saved.filter(n => !own.some(d => d.name === n)).map(name => ({ name, title: titleOf(name), icon: GENERIC_DRIP_ICON, isYours: true })),
      ]
      pages = Math.max(1, Math.ceil(drips.length / PAGE_SIZE))
      at = Math.min(await read($, dripPage), pages - 1)
      for (const drip of drips.slice(at * PAGE_SIZE, (at + 1) * PAGE_SIZE)) {
        rows.push(
          <Box key={drip.name} flexDirection="row" alignItems="center" gap={3}>
            {Svg ? <Svg source={drip.icon} alt={drip.title} width={28} height={28} /> : null}
            <Box flexGrow={1} flexDirection="row" alignItems="center" gap={2}>
              <Text bold>{drip.title}</Text>
              {drip.isYours ? <Text dimColor>yours</Text> : null}
            </Box>
            <Button key={`drip:${drip.name}`} label="Play" variant="secondary" dimColor={isLocked} onPress={() => void (isLocked || pressDrip($, drip.name))} />
          </Box>,
        )
      }
    }
    const step = (p: number, by: number) => Math.max(0, Math.min(pages - 1, Math.min(p, pages - 1) + by))
    const turn = (by: number) => () => void (shown === 'games' ? update($, page, p => step(p, by)) : update($, dripPage, p => step(p, by)))
    return (
      <Box flexDirection="column" paddingX={3} paddingY={2} borderStyle="round" borderDimColor>
        <Box flexDirection="row" alignItems="center" gap={3} marginBottom={2}>
          {Svg ? <Svg source={LOCKUP_SVG} alt={LOGO_ALT} height={18} width={Math.round(18 * LOCKUP_RATIO)} /> : <Text bold>glyphh&gt; drip</Text>}
          <Button key="tab:games" label="Games" plain dimColor={shown !== 'games'} onPress={() => void update($, tab, () => 'games' as const)} />
          <Button key="tab:drips" label="Drips" plain dimColor={shown !== 'drips'} onPress={() => void update($, tab, () => 'drips' as const)} />
        </Box>
        <Box flexDirection="column" gap={2}>
          {rows}
        </Box>
        {isLocked || pages > 1 ? (
          <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={1} marginTop={3}>
            {isLocked ? (
              <Box flexDirection="row" alignItems="center" gap={2}>
                <Button key="unlock" label={`Unlock ${PRODUCT}`} variant="primary" onPress={() => void checkout($)} />
                <Text dimColor>{PRICE} once</Text>
              </Box>
            ) : (
              <Box />
            )}
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
        ) : null}
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
    if (!game) return next(e)
    const no = refusal(await read($, licence))
    if (no) return { text: no }
    try {
      return { text: await play($, game) }
    } catch (err) {
      return { text: `/drip: ${short(err)}` }
    }
  })
}
