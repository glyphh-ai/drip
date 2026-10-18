// The world beneath the mod at the engine's level: HOME, Node, the desktop
// app's Browser pane, the Drips page's helper, swiftc and the native
// overlay's processes (and the windows it finds), all in memory.
import type { CommandRunInput, On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { done, mcpText } from './fakes.ts'
import { INSTALLED } from './games/engine.ts'

export const T0 = Date.parse('2026-10-15T09:00:00Z')
export const HOME = '/home/t'

export type WorldOptions = {
  surfaces?: string[]
  noNode?: boolean
  /** No Xcode Command Line Tools: swiftc is not there. */
  noSwift?: boolean
  /** Not macOS. */
  notMac?: boolean
  /** The app refuses the mod's own calls to its Browser pane. */
  browserRefuses?: boolean
  /** The apps among the overlay's ancestors: the Claude desktop app unless a test says. */
  ancestors?: { pid: number; bundleId: string; regular: boolean }[]
  /** The environment beyond HOME. */
  env?: Record<string, string>
  /** The target app has no window on screen. */
  noWindow?: boolean
}

/** Claude's window as the overlay finds it, and the screen under the pointer. */
export const CLAUDE_WINDOW = { id: 79026, frame: { x: 799, y: 298, w: 1325, h: 1138 } }
export const SCREEN = { x: 0, y: 0, w: 1440, h: 900 }
export const CLAUDE_APP = { pid: 48036, bundleId: 'com.anthropic.claudefordesktop', regular: true }

/** One fullscreen overlay process: its request, and whether it was told to end. */
export type FakeOverlay = {
  pid: number
  request: { v: number; html: string; frame: unknown; closeAfterMs: number; layer: string; follow: number | null }
  ended: boolean
  /** Posts a game's score: printed as a score event before it closes. */
  score(n: number): void
  end(why: string): void
}

export function world(on: On, options: WorldOptions = {}) {
  const ran: string[][] = []
  const mcp: string[] = []
  /** The pages asked of the Browser pane, by URL. */
  const browsed: string[] = []
  const copied: string[] = []
  const toasts: string[] = []
  const asked: string[] = []
  const commands: string[] = []
  const tools: string[] = []
  const files = new Set<string>()
  const overlays: FakeOverlay[] = []
  /** What the overlay's window command was asked to find. */
  const windowAsks: unknown[] = []
  const page = {
    alive: null as { port: string; token: string; version: string } | null,
    open: 0,
    starts: 0,
    library: [] as { drips: { name: string; recipe: string }[]; effects: string[]; display: string }[],
    inbox: [] as object[],
    /** The page asking the mod for something. */
    say: (msg: object) => void page.inbox.push(msg),
  }
  let nextPid = 100

  on('env.get', (_$, e) => ({ value: e.name === 'HOME' ? HOME : options.env?.[e.name] }))
  // The person's folders: Blocks, fetched from the gallery.
  const own: Record<string, string> = { ...INSTALLED }
  const ownDirs = new Set<string>()
  for (const p of Object.keys(own)) for (let d = p.slice(0, p.lastIndexOf('/')); d.length > HOME.length; d = d.slice(0, d.lastIndexOf('/'))) ownDirs.add(d)
  on('fs.read', (_$, e) => {
    if (e.path in own) return { value: 'as' in e && e.as === 'bytes' ? { base64: own[e.path]! } : own[e.path]! }
    if (e.path.endsWith('/.claude-plugin/plugin.json')) return { value: '{"name":"drips","version":"1.2.3"}' }
    return { value: e.path.endsWith('overlay.swift') ? 'import AppKit' : `code of ${e.path}` }
  })
  on('fs.exists', (_$, e) => ({ value: files.has(e.path) || e.path in own || ownDirs.has(e.path) }))
  on('fs.list', (_$, e) => {
    const kids = new Map<string, 'file' | 'dir'>()
    for (const q of [...Object.keys(own), ...ownDirs]) {
      if (!q.startsWith(`${e.path}/`)) continue
      const [first] = q.slice(e.path.length + 1).split('/')
      kids.set(first!, ownDirs.has(`${e.path}/${first}`) ? 'dir' : 'file')
    }
    return { value: [...kids].map(([name, kind]) => ({ name, kind })) as never }
  })
  on('ui.open', () => ({ value: { isPlaced: false as const, reason: 'no surface places panes' } }))
  on('session.surfaces', () => ({ value: (options.surfaces ?? ['desktop']) as never }))
  on('command.register', (_$, e) => {
    commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('tool.register', (_$, e) => {
    tools.push(e.name)
    return { value: { tool: `mcp__drip__${e.name}` } as never }
  })
  on('process.run', (_$, e) => {
    const argv = [...e.argv]
    ran.push(argv)
    const [cmd] = argv
    if (argv[1] === '--version') return { value: options.noNode ? done('', 127) : done('v22.1.0\n') }
    if (cmd === '/bin/zsh') return { value: done('', 1) }
    if (cmd === 'uname') return { value: done(options.notMac ? 'Linux\n' : 'Darwin\n') }
    if (cmd === 'xcode-select') return { value: options.noSwift ? done('', 2, 'no developer tools') : done('/Library/Developer/CommandLineTools\n') }
    if (cmd === 'xcrun' && argv[1] === '--find') return { value: done('/usr/bin/swiftc\n') }
    if (cmd === 'xcrun' || cmd === '/bin/mkdir' || cmd === 'open') return { value: done() }
    if (cmd === '/bin/mv') {
      files.add(argv[3]!)
      return { value: done() }
    }
    if (cmd === '/bin/kill') {
      overlays.find(o => String(o.pid) === argv[2])?.end('term')
      return { value: done() }
    }
    if (argv[1] === 'screen') return { value: done(`${JSON.stringify(SCREEN)}\n`) }
    if (argv[1] === 'apps') return { value: done(`${JSON.stringify({ ancestors: options.ancestors ?? [CLAUDE_APP] })}\n`) }
    if (argv[1] === 'window') {
      windowAsks.push(JSON.parse(e.init?.stdin ?? '{}'))
      const found = options.noWindow ? { found: false, ...SCREEN } : { found: true, id: CLAUDE_WINDOW.id, ...CLAUDE_WINDOW.frame }
      return { value: done(`${JSON.stringify(found)}\n`) }
    }
    return { value: done('', 1, `unknown ${cmd}`) }
  })
  on('process.spawn', async function* (_$, e) {
    const argv = [...e.argv]
    if (argv[1]?.endsWith('server.mjs')) {
      page.starts++
      const env = e.env ?? {}
      page.alive = { port: env.DRIPS_PORT!, token: env.DRIPS_TOKEN!, version: env.DRIPS_VERSION! }
      return { value: { code: 0, signal: null } }
    }
    // The fullscreen overlay: on screen, then closed when it ends.
    let end: (why: string) => void = () => {}
    const ended = new Promise<string>(r => (end = r))
    const scores: number[] = []
    const o: FakeOverlay = {
      pid: nextPid++,
      request: JSON.parse(e.input ?? '{}'),
      ended: false,
      score: n => void scores.push(n),
      end: why => ((o.ended = true), end(why)),
    }
    overlays.push(o)
    yield { stream: 'stdout' as const, text: `{"t":"shown","pid":${o.pid}}\n` }
    const why = await ended
    for (const n of scores) yield { stream: 'stdout' as const, text: `{"t":"score","score":${n}}\n` }
    yield { stream: 'stdout' as const, text: `{"t":"closed","why":"${why}"}\n` }
    return { value: { code: 0, signal: null } }
  })
  on('http.fetch', (_$, e) => {
    const url = new URL(e.url)
    const ok = (body: unknown) => ({ value: { ok: true, status: 200, headers: {}, text: JSON.stringify(body) } })
    const alive = page.alive
    if (!alive || url.port !== alive.port) throw new Error('connection refused')
    if (e.init?.headers?.['X-Token'] !== alive.token) return { value: { ok: false, status: 403, headers: {}, text: 'forbidden' } }
    const body = e.init?.body ? JSON.parse(String(e.init.body)) : undefined
    switch (url.pathname) {
      case '/api/state':
        return ok({ version: alive.version, open: page.open })
      case '/api/key':
        return ok({ key: 'once' })
      case '/api/inbox':
        return ok({ messages: page.inbox.splice(0) })
      case '/api/library':
        page.library.push(body)
        return ok({})
      case '/api/quit':
        page.alive = null
        return ok({})
    }
    return { value: { ok: false, status: 404, headers: {}, text: '' } }
  })
  on('mcp.call', (_$, e) => {
    mcp.push(`${e.server}.${e.tool}`)
    if (e.tool === 'preview_start') browsed.push(String(e.args.url))
    if (options.browserRefuses && e.server === 'Claude_Browser') return { value: mcpText('Not allowed in auto mode', true) }
    if (e.tool === 'preview_start') {
      page.open = 1
      return { value: mcpText('{"tabId": "t1"}') }
    }
    return { value: mcpText('ok') }
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.copy', (_$, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })
  on('prompt.submit', (_$, e) => {
    asked.push(e.text)
    return { text: e.text }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: 'ok' } as never }))
  return { ran, mcp, browsed, copied, toasts, asked, commands, tools, files, overlays, windowAsks, page }
}

export const startSession = ($: Engine) => $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })

export async function runCommand($: Engine, command: string, args = ''): Promise<string | undefined> {
  return (await $.command.run({ command, args } as CommandRunInput)).text
}

export async function callTool($: Engine, tool: string, input: Record<string, unknown> = {}): Promise<unknown> {
  return ((await $.tool.call({ tool, input } as never)) as { result?: unknown }).result
}

export const endTurn = ($: Engine, durationMs: number, extra: Record<string, unknown> = {}) =>
  $.turn.complete({ answer: 'done', durationMs, isAborted: false, turnId: 't-1', reason: 'answer', ...extra } as never)
