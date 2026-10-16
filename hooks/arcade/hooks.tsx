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
import { loadDrips, loadGames, skippedText, type FolderDeps, type FolderGame } from '../content/folders.ts'
import { readCustoms } from '../drips/library.ts'
import { LOCKUP_RATIO, LOCKUP_SVG, LOGO_ALT } from './brand.ts'
import { GAMES, gameDoc, gameOf } from './games/index.ts'
import type { Game } from './games/game.ts'
import { GENERIC_ICON, ICONS } from './icons.ts'
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

/** The person's own games (~/.glyphh/games), read again each time they are asked for. */
async function yourGames($: EngineInterface): Promise<{ games: FolderGame[]; skipped: string }> {
  const home = await $.env.get('HOME')
  if (!home) return { games: [], skipped: '' }
  const { games, skipped } = await loadGames(folderDeps($), home, TAKEN, () => !settings.sounds)
  return { games, skipped: skippedText('game', skipped) }
}

/** The person's own drips' names and titles (~/.glyphh/drips), for the card. */
async function yourDripNames($: EngineInterface): Promise<{ name: string; title: string }[]> {
  const home = await $.env.get('HOME')
  if (!home) return []
  return (await loadDrips(folderDeps($), home, new Set(Object.keys(ONE_SHOT_EFFECTS)))).drips.map(d => ({ name: d.name, title: d.title }))
}

/** A game by any of its names: built in, else the person's own. */
async function findGame($: EngineInterface, name: string): Promise<Game | null> {
  return gameOf(name) ?? (await yourGames($)).games.find(g => g.name === name.trim().toLowerCase()) ?? null
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
  const yours = await yourGames($)
  for (const g of [...GAMES, ...yours.games]) {
    const best = await scores.best(g.name)
    const mine = 'isYours' in g ? '  ·  yours' : ''
    lines.push(`  ${g.name.padEnd(9)} ${g.title}${best > 0 ? `  ·  best ${best}` : ''}${mine}`)
  }
  if (yours.skipped) lines.push('', yours.skipped)
  // Not the refusal line: that one draws as the unlock module's card, this as the card.
  if (refusal(await read($, licence))) lines.push('', `${PRODUCT} is ${PRICE}, once: /drip unlock buys it.`)
  return lines.join('\n')
}

/** Play on the card: the game, or checkout until Games is bought. */
async function press($: EngineInterface, game: Game): Promise<void> {
  if (refusal(await read($, licence))) return checkout($)
  const said = await play($, game).catch(err => `/drip: ${short(err)}`)
  if (!said.startsWith(game.title)) $.ui.toast(said) // the overlay could not run
}

/** Play on the Drips tab: queued for the drips' half to play, or checkout
 *  until it is bought. */
async function pressDrip($: EngineInterface, name: string): Promise<void> {
  if (refusal(await read($, licence))) return checkout($)
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
    const rows = []
    let at: number
    let pages: number
    if (shown === 'games') {
      const games: (Game | FolderGame)[] = [...GAMES, ...(await yourGames($)).games]
      pages = Math.max(1, Math.ceil(games.length / PAGE_SIZE))
      at = Math.min(await read($, page), pages - 1)
      const scores = scoresOf(store($))
      for (const game of games.slice(at * PAGE_SIZE, (at + 1) * PAGE_SIZE)) {
        const best = await scores.best(game.name)
        const isYours = 'isYours' in game
        const icon = ICONS[game.name] ?? ('icon' in game && game.icon ? game.icon : GENERIC_ICON)
        rows.push(
          <Box key={game.name} flexDirection="row" alignItems="center" gap={2}>
            {Svg ? <Svg source={icon} alt="" width={18} height={18} /> : null}
            <Box flexGrow={1} flexDirection="row" gap={1}>
              <Text>{game.title}</Text>
              {isYours ? <Text dimColor>· yours</Text> : null}
            </Box>
            <Text dimColor>{best > 0 ? best.toLocaleString('en-GB') : ''}</Text>
            <Button key={`play:${game.name}`} label="Play" variant="secondary" onPress={() => void press($, game)} />
          </Box>,
        )
      }
    } else {
      const saved = Object.keys(await readCustoms(store($)))
      const own = await yourDripNames($)
      const drips = [
        ...BUILTIN_EFFECT_LIST.map(d => ({ name: d.name, title: titleOf(d.name), isYours: false })),
        ...own.map(d => ({ name: d.name, title: d.title, isYours: true })),
        ...saved.filter(n => !own.some(d => d.name === n)).map(name => ({ name, title: titleOf(name), isYours: true })),
      ]
      pages = Math.max(1, Math.ceil(drips.length / PAGE_SIZE))
      at = Math.min(await read($, dripPage), pages - 1)
      for (const drip of drips.slice(at * PAGE_SIZE, (at + 1) * PAGE_SIZE)) {
        rows.push(
          <Box key={drip.name} flexDirection="row" alignItems="center" gap={2}>
            <Box flexGrow={1} flexDirection="row" gap={1}>
              <Text>{drip.title}</Text>
              {drip.isYours ? <Text dimColor>· yours</Text> : null}
            </Box>
            <Button key={`drip:${drip.name}`} label="Play" variant="secondary" onPress={() => void pressDrip($, drip.name)} />
          </Box>,
        )
      }
    }
    const step = (p: number, by: number) => Math.max(0, Math.min(pages - 1, Math.min(p, pages - 1) + by))
    const turn = (by: number) => () => void (shown === 'games' ? update($, page, p => step(p, by)) : update($, dripPage, p => step(p, by)))
    return (
      <Box flexDirection="column" gap={1} paddingX={2} paddingY={1} borderStyle="round" borderDimColor>
        <Box flexDirection="row" alignItems="center" gap={2}>
          {Svg ? <Svg source={LOCKUP_SVG} alt={LOGO_ALT} height={16} width={Math.round(16 * LOCKUP_RATIO)} /> : <Text bold>glyphh&gt; drip</Text>}
          <Button key="tab:games" label="Games" plain dimColor={shown !== 'games'} onPress={() => void update($, tab, () => 'games' as const)} />
          <Button key="tab:drips" label="Drips" plain dimColor={shown !== 'drips'} onPress={() => void update($, tab, () => 'drips' as const)} />
        </Box>
        {rows}
        {pages > 1 ? (
          <Box flexDirection="row" justifyContent="flex-end" alignItems="center" gap={1}>
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

  // /drip <game> starts a game; /drip alone lists the games, then the drips
  // (the drips' half, ../drips); anything else is the drips' to play.
  on('command.run', { command: 'drip' }, async ($, e, next) => {
    const name = e.args.trim()
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
