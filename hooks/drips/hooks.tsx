// Drips, wired to the engine: the one file of this module that holds `$` and
// the mod's state (the engine follows `$` and atoms only within the file
// whose hook received them), handing the rest closures. It runs the Drips
// page's helper (helper/server.mjs), detached so it outlives the mod's
// reloads, and the native overlay (native/overlay.swift), one process per
// effect, over Claude's window or the whole screen. Where effects play is the
// /config row `display`. The Drips button sits in the hint line under the
// prompt; pressed, a row of quick plays opens above the prompt.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, PluginOptions, RenderChildren, Timer } from 'claude-code'

import type { HelperInfo } from '../../types'
import { BUILTIN_EFFECT_LIST, BUILTIN_EFFECTS, ONE_SHOT_EFFECTS, setYourDrips, yourDrips } from './effects.ts'
import { dripsDir, loadDrips } from '../content/folders.ts'
import { createFun } from './fun.ts'
import { deleteCustom, dripId, listCustoms, readCustoms, saveCustom, type Store } from './library.ts'
import { HELPER_FILES, linkTo, versionOf, type Link, type PageMessage } from './link.ts'
import { createManager, customEffects, type Host, type Manager } from './manager.ts'
import { ancestorsOf, eventsOf, prepareOverlay, type Placement, type Prepared } from '../overlay/host.ts'
import { selectTarget, type Target, type TerminalEnv } from '../overlay/target.ts'
import { nativeHost, type NativeDeps } from './native.ts'
import { findNode, NODE_MISSING } from './node.ts'
import { settingsOf, type Settings } from './settings.ts'
import { showPage, shownText, type PageDeps } from './window.ts'

const helperInfo = atom({ plugin: 'glyphh-drip', key: 'helper' } as const, null as HelperInfo | null)
const pageTab = atom({ plugin: 'glyphh-drip', key: 'pageTab' } as const, null as string | null)
const nodePath = atom({ plugin: 'glyphh-drip', key: 'node' } as const, null as string | null)
const bandOpen = atom({ plugin: 'glyphh-drip', key: 'bandOpen' } as const, false)
/** A drip the card asked to play (../arcade queues it): taken within a beat. */
const queued = atom({ plugin: 'glyphh-drip', key: 'queued' } as const, null as { recipe: string; at: number } | null)
/** How often the drips' half looks for a drip the card queued, in ms. */
export const QUEUE_MS = 150

/** The effects the row above the prompt offers first, before the saved drips. */
export const QUICK_EFFECTS = ['fireworks', 'confetti', 'hearts', 'stars', 'gunfight']

const TOOL_PREFIX = 'mcp__glyphh-drip__'
const NOT_A_RECIPE = ['save', 'delete', 'list']

/** This load's pieces: made at the session's start (a reload makes them again). */
type Mod = {
  manager: Manager
  /** The native overlay's binary, built on first use. */
  native: Promise<Prepared> | null
  /** The window Claude runs in, found on first use. */
  target: Promise<Target | null> | null
  fun: ReturnType<typeof createFun>
}
let settings: Settings
let mod: Mod | null = null
/** The helper this load talks to, and the timer that collects the page's messages. */
let helper: Link | null = null
let collecting: Timer | null = null
let starting: Promise<Link> | null = null
/** Each is said once per load: the overlay unavailable, Claude's window not found. */
let isUnavailableSaid = false
let isMissedSaid = false

/** The overlay cannot run here: said once by a toast, never again by report. */
class Unavailable extends Error {}

const short = (err: unknown) => String(err instanceof Error ? err.message : err).replace(/^(Hooks)?Error: /, '').slice(0, 300)

function store($: EngineInterface): Store {
  return { get: key => $.store.get(key), set: (key, value) => $.store.set(key, value) }
}

function pageDeps($: EngineInterface): PageDeps {
  return {
    isDesktop: async () => (await $.session.surfaces()).includes('desktop'),
    mcp: (server, tool, args) => $.mcp.call(server, tool, args),
    openExternal: async url => (await $.process.run(['open', url]).catch(() => null))?.exitCode === 0,
    // A prompt submitted from inside a command would wait on the command
    // itself: it goes once the command has returned.
    ask: text =>
      void $.clock.after(0, () => {
        $.prompt.submit({ text }).catch(() => $.ui.toast('The Browser pane is not available: allow mcp__Claude_Browser__preview_start'))
      }),
    link: () => startHelper($),
    tab: { get: () => read($, pageTab), set: async fn => void (await update($, pageTab, fn)) },
  }
}

/** `quiet`: the overlay plays no sound whatever the setting (the matrix while
 *  tools run, which would otherwise sound through every long run). */
function nativeDeps($: EngineInterface, quiet = false): NativeDeps {
  return {
    run: (argv, opts) => $.process.run(argv, opts).catch(() => null),
    spawn: (argv, input) => eventsOf($.process.spawn({ argv, input })),
    read: async path => String(await $.fs.read(path)),
    exists: path => $.fs.exists(path),
    home: () => $.env.get('HOME'),
    root: $.plugin.root,
    sounds: () => !quiet && settings.sounds,
  }
}

function build($: EngineInterface): Mod {
  const report = (err: unknown) => void (err instanceof Unavailable || $.ui.toast(`Drips: ${short(err)}`))
  const manager = createManager({
    store: store($),
    customs: () => readCustoms(store($)),
    after: (ms, fn) => void $.clock.after(ms, fn),
    report,
    changed: () => $.ui.invalidate('ui.render'), // the row's Stop comes and goes
  })
  const m: Mod = { manager, native: null, target: null, fun: null as never }
  m.fun = createFun(
    {
      isAllowed: async () => !(await refused($)),
      play: async recipe => void (await manager.execute(() => hostOf($, m), recipe)),
      ensure: async effect => manager.ensure(await hostOf($, m, true), effect),
      release: effect => manager.release(effect),
      after: (ms, fn) => $.clock.after(ms, fn),
      report,
    },
    settings,
  )
  return m
}

const modOf = ($: EngineInterface) => (mod ??= build($))

/** The window Claude runs in: the desktop app's, or the terminal's that
 *  hosts this session (its ancestors, as the overlay sees them, and the
 *  environment). */
async function findTarget($: EngineInterface, binary: string): Promise<Target | null> {
  const env: TerminalEnv = {
    TERM_PROGRAM: await $.env.get('TERM_PROGRAM'),
    __CFBundleIdentifier: await $.env.get('__CFBundleIdentifier'),
    TERM: await $.env.get('TERM'),
  }
  const isDesktop = (await $.session.surfaces()).includes('desktop')
  return selectTarget({ isDesktop, env, ancestors: await ancestorsOf(nativeDeps($), binary) })
}

function placement($: EngineInterface, m: Mod, binary: string, display: 'claude-window' | 'fullscreen'): Placement {
  if (display === 'fullscreen') return { kind: 'fullscreen' }
  return {
    kind: 'window',
    target: () => (m.target ??= findTarget($, binary)),
    missed: () => {
      if (!isMissedSaid) $.ui.toast("Drips could not find Claude's window: effects play over the screen under the pointer.")
      isMissedSaid = true
    },
  }
}

/** Where effects play now: the setting's host, the native overlay. Where the
 *  overlay cannot run here (not a Mac, no Command Line Tools), nothing plays:
 *  a toast says why, once, and the play answers with the same reason. */
async function hostOf($: EngineInterface, m: Mod, quiet = false): Promise<Host> {
  const display = settings.display
  m.native ??= prepareOverlay(nativeDeps($))
  const prepared = await m.native
  if ('binary' in prepared) return nativeHost(nativeDeps($, quiet), prepared.binary, placement($, m, prepared.binary, display))
  if (!isUnavailableSaid) $.ui.toast(prepared.missing)
  isUnavailableSaid = true
  throw new Unavailable(prepared.missing)
}

/** The engine's own line with the Drips button after it; pressed, it opens or closes the row above the prompt. */
async function withButton($: EngineInterface, e: Parameters<EngineInterface['ui']['resolve']>[0], line: RenderChildren) {
  const { Box, Button } = $.ui.resolve(e)
  const isOpen = await read($, bandOpen)
  return (
    <Box flexDirection="row" gap={2}>
      {line}
      <Button key="drip" label="drip" plain dimColor={!isOpen} onPress={() => update($, bandOpen, v => !v)} />
    </Box>
  )
}

/** Why drips may not play now, or null: never, as every drip is free. */
async function refused(_$: EngineInterface): Promise<string | null> {
  return null
}

// ── The Drips page's helper ─────────────────────────────────────────────────

const linkOf = ($: EngineInterface, info: HelperInfo) => linkTo((url, init) => $.http.fetch(url, init), info.port, info.token)

async function helperVersion($: EngineInterface): Promise<string> {
  const texts = []
  for (const f of HELPER_FILES) texts.push(String(await $.fs.read(`${$.plugin.root}/helper/${f}`).catch(() => '')))
  return versionOf(texts)
}

/** The page's saved recipes and effects, sent to the helper. */
async function pushLibrary($: EngineInterface): Promise<void> {
  $.ui.invalidate('ui.render') // the row above the prompt lists them too
  await helper?.library({ drips: await listCustoms(store($)), effects: BUILTIN_EFFECTS, display: settings.display })
}

/** What the page asked: a preview played, everything stopped, a recipe saved or deleted. */
async function onPage($: EngineInterface, m: PageMessage): Promise<void> {
  const { manager } = modOf($)
  if (m.t === 'stop') return manager.stopAll()
  if (m.t === 'play') {
    const no = await refused($)
    if (no) return $.ui.toast(no)
    await manager.execute(() => hostOf($, modOf($)), m.recipe, { preview: true })
    return
  }
  if (m.t === 'save') {
    if (!dripId(m.name) || customEffects(m.recipe).length === 0) return $.ui.toast('Drips: a drip needs a name and at least one effect.')
    if (m.original && dripId(m.original) !== dripId(m.name)) await deleteCustom(store($), m.original)
    await saveCustom(store($), m.name, m.recipe)
  } else await deleteCustom(store($), m.name)
  await pushLibrary($)
}

/** Talks to a running helper: the page's messages collected every second,
 *  which keeps it alive; one that stopped answering is let go. */
async function attach($: EngineInterface, link: Link): Promise<Link> {
  helper = link
  collecting?.cancel()
  collecting = $.clock.every(1000, () => {
    link
      .inbox()
      .then(async messages => {
        for (const m of messages) await onPage($, m).catch(err => void (err instanceof Unavailable || $.ui.toast(`Drips: ${short(err)}`)))
      })
      .catch(async () => {
        if (helper !== link) return
        collecting?.cancel()
        helper = null
        await update($, helperInfo, () => null)
      })
  })
  await pushLibrary($)
  return link
}

/** The helper kept from before this load: found again when its code is this
 *  copy's; told to leave when it is not. */
async function reattach($: EngineInterface, version: string): Promise<Link | null> {
  const kept = await read($, helperInfo)
  if (!kept) return null
  const link = linkOf($, kept)
  const running = await link.state().then(s => s.version, () => null)
  if (running === version) return attach($, link)
  if (running !== null) await link.quit().catch(() => undefined)
  collecting?.cancel()
  helper = null
  await update($, helperInfo, () => null)
  return null
}

const randomHex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('')

/** The page's helper: the one running, or a new one started detached on a
 *  port and with a token chosen here; up when it answers. */
function startHelper($: EngineInterface): Promise<Link> {
  if (helper) return Promise.resolve(helper)
  starting ??= (async () => {
    const version = await helperVersion($)
    const kept = await reattach($, version)
    if (kept) return kept
    const node = await read($, nodePath)
    if (!node) throw new Error(NODE_MISSING)
    for (let attempt = 0; attempt < 2; attempt++) {
      const info: HelperInfo = { port: 20000 + (crypto.getRandomValues(new Uint16Array(1))[0]! % 40000), token: randomHex(24) }
      const launch = $.process.spawn({
        argv: [node, `${$.plugin.root}/helper/server.mjs`],
        env: { DRIPS_DETACH: '1', DRIPS_PORT: String(info.port), DRIPS_TOKEN: info.token, DRIPS_VERSION: version },
      })
      for await (const _ of launch); // the launcher starts the helper in its own session and exits
      const link = linkOf($, info)
      for (let i = 0; i < 20; i++) {
        if ((await link.state().then(s => s.version, () => null)) === version) {
          await update($, helperInfo, () => info)
          return attach($, link)
        }
        await $.clock.sleep(100)
      }
    }
    throw new Error('the Drips page did not start')
  })().finally(() => {
    starting = null
  })
  return starting
}

// ── The Drips button and its row ────────────────────────────────────────────

/** A play from the row or the card: the gate first, then the same path as /drip. */
async function bandPlay($: EngineInterface, recipe: string): Promise<void> {
  const no = await refused($)
  if (no) return $.ui.toast(no)
  await readYours($).catch(() => undefined)
  const m = modOf($)
  await m.manager.execute(() => hostOf($, m), recipe).catch(err => void (err instanceof Unavailable || $.ui.toast(`Drips: ${short(err)}`)))
}


/** Reads the folder drips again (the plugin's shipped ones, then ~/.glyphh/drips): before each play and listing. */
async function readYours($: EngineInterface): Promise<void> {
  const d = {
    list: (p: string) => $.fs.list(p),
    read: async (p: string) => String(await $.fs.read(p)),
    bytes: async (p: string) => (await $.fs.read(p, { as: 'bytes' })).base64,
    exists: (p: string) => $.fs.exists(p),
  }
  const builtIn = new Set(Object.keys(ONE_SHOT_EFFECTS))
  const shipped = (await loadDrips(d, `${$.plugin.root}/drips`, builtIn, false)).drips
  const home = await $.env.get('HOME')
  const yours = home ? (await loadDrips(d, dripsDir(home), new Set([...builtIn, ...shipped.map(x => x.name)]), true)).drips : []
  setYourDrips([...shipped, ...yours], !settings.sounds)
}

/** Plays the drip the card queued, if any: the same path as a quick play. */
async function takeQueued($: EngineInterface): Promise<void> {
  const q = await read($, queued)
  if (!q) return
  await update($, queued, () => null)
  await bandPlay($, q.recipe)
}

// ── Hooks ───────────────────────────────────────────────────────────────────

async function registerAll($: EngineInterface): Promise<void> {
  await $.command.register({
    name: 'drip',
    description: 'Glyphh Drip: /drip opens Drip, the console of games and drips; /drip snake starts a game; /drip confetti, /drip 3 hearts stars, /drip -1 aurora play drips; get <name> fetches a game or drip from the gallery, share <name> sends one of yours there; stop, save <name> <recipe>, delete <name>; page opens your saved drips and the editor; unlock buys the games (Missiles and every drip are free); key <licence> unlocks it with a licence from another machine',
    argumentHint: '<game> | <recipe> | get <name> | share <name> | stop | save <name> <recipe> | delete <name> | page | unlock | key <licence>',
    immediate: true,
  })
  await $.tool.register({
    name: 'play_drip',
    description:
      'Play a visual effect over Claude for the person: a recipe such as "confetti", "3 hearts stars", "0.6 fireworks", ' +
      '"-1 aurora" (persistent: plays until fired again or "stop"), a saved drip\'s name, or "stop". list_drips lists the effects.',
    inputSchema: { type: 'object', properties: { recipe: { type: 'string', description: 'The drip recipe' } }, required: ['recipe'] },
  })
  await $.tool.register({
    name: 'list_drips',
    description: "List the visual effects play_drip can play, and the person's saved drips.",
    inputSchema: { type: 'object', properties: {} },
  })
}

export function drips(on: On, options: PluginOptions) {
  settings = settingsOf(options)
  mod = null
  helper = null
  isUnavailableSaid = false
  isMissedSaid = false

  on('session.start', async ($, e, next) => {
    mod = build($)
    await update($, nodePath, () => null)
    const node = await findNode({ run: argv => $.process.run(argv).catch(() => null) })
    await update($, nodePath, () => node)
    await reattach($, await helperVersion($)).catch(() => null) // a reload keeps the page up
    await registerAll($)
    $.clock.every(QUEUE_MS, () => void takeQueued($).catch(err => $.ui.toast(`drip ✗ ${short(err)}`)))
    return next(e)
  })

  on('command.run', { command: 'drip' }, async ($, e) => {
    // What the games' half (../arcade) passes on: `list` (or nothing) lists, anything else is a recipe or a name to play.
    const line = e.args.trim() || 'list'
    const sub = line.split(/\s+/)[0]?.toLowerCase() ?? ''
    if (sub === 'page') {
      if (!(await read($, nodePath))) return { text: NODE_MISSING }
      return { text: await showPage(pageDeps($)).then(shownText, err => `The Drip page ✗ ${short(err)}`) }
    }
    if (!['list', 'save', 'delete', 'stop'].includes(sub)) {
      const no = await refused($)
      if (no) return { text: no }
    }
    try {
      await readYours($).catch(() => undefined)
      const m = modOf($)
      const text = await m.manager.execute(() => hostOf($, m), line)
      if (sub === 'save' || sub === 'delete') await pushLibrary($).catch(() => undefined)
      return { text }
    } catch (err) {
      return { text: `/drip: ${short(err)}` }
    }
  })

  on('tool.call', { tool: 'mcp__glyphh-drip__play_drip' }, async ($, e) => {
    const no = await refused($)
    if (no) return { result: `Not played: ${no}` }
    const recipe = String((e.input as { recipe?: unknown } | undefined)?.recipe ?? '').trim()
    if (NOT_A_RECIPE.includes(recipe.split(/\s+/)[0]?.toLowerCase() ?? '')) return { result: 'play_drip takes a recipe or "stop"; list_drips lists the effects.' }
    try {
      await readYours($).catch(() => undefined)
      const m = modOf($)
      return { result: String(await m.manager.execute(() => hostOf($, m), recipe)) }
    } catch (err) {
      return { result: `Not played: ${short(err)}` }
    }
  })

  on('tool.call', { tool: 'mcp__glyphh-drip__list_drips' }, async ($, e) => {
    const no = await refused($)
    if (no) return { result: `Not played: ${no}` }
    await readYours($).catch(() => undefined)
    const own = yourDrips().map(d => ({ name: d.name, kind: d.kind, title: d.title }))
    return { result: JSON.stringify({ effects: BUILTIN_EFFECT_LIST, yours: own, custom: await listCustoms(store($)), running: modOf($).manager.running() }) }
  })

  // The Drips button, beside the engine's own line: on the terminal the hint
  // under the prompt; on the desktop, which draws no hint line of the engine's,
  // the mode labels in the prompt's footer.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const line = await next(e)
    if (!settings.button || e.surface === 'desktop') return line
    return withButton($, e, line)
  })
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const line = await next(e)
    if (!settings.button || e.surface !== 'desktop') return line
    return withButton($, e, line)
  })

  // Its row above the prompt: quick plays, the saved drips, Stop while
  // something persistent plays, ✕; once the trial is over, Unlock.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!settings.button || e.props.hasSurvey || !(await read($, bandOpen))) return next(e)
    const { Box, Button } = $.ui.resolve(e)
    const close = <Button key="close" label="✕" plain role="dismiss" onPress={() => update($, bandOpen, () => false)} />
    const saved = await listCustoms(store($))
    const isPlaying = modOf($).manager.running().length > 0
    return (
      <Box flexDirection="row" flexWrap="wrap" gap={1}>
        {QUICK_EFFECTS.map(effect => (
          <Button key={`play:${effect}`} label={effect} onPress={() => bandPlay($, effect)} />
        ))}
        {saved.map(d => (
          <Button key={`drip:${d.name}`} label={d.name} variant="secondary" onPress={() => bandPlay($, d.name)} />
        ))}
        {isPlaying ? [<Button key="stop" label="■ Stop" onPress={() => modOf($).manager.stopAll()} />] : []}
        {close}
      </Box>
    )
  })

  // The fun hooks: each does nothing unless its /config toggle is on.
  on('tool.call', async ($, e, next) => {
    if (!settings.matrixWhileTools || e.agentId || String(e.tool).startsWith(TOOL_PREFIX)) return next(e)
    const { fun } = modOf($)
    void fun.toolStart()
    try {
      return await next(e)
    } finally {
      fun.toolEnd()
    }
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    void modOf($)
      .fun.turnEnd({ durationMs: e.durationMs, reason: e.reason, isMainLoop: !e.agentId })
      .catch(err => void (err instanceof Unavailable || $.ui.toast(`Drips: ${short(err)}`)))
    return next(e)
  })
}
