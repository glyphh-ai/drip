// The world beneath the mod at the engine's level: HOME, swiftc, the native
// overlay's processes (and the windows it finds) and the gallery, all in memory.
import type { CommandRunInput, On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { GALLERY, GALLERY_API } from '../../hooks/content/gallery.ts'
import { jpegCover } from '../cover.ts'
import { done } from './fakes.ts'

export const T0 = Date.parse('2026-10-15T09:00:00Z')
export const HOME = '/home/t'

/** A game page from the gallery, on the kit. */
export const GALLERY_PAGE = '<html><head></head><body><canvas></canvas><script>glyphh.score(1)</script></body></html>'

/** Blocks, a gallery game fetched onto this Mac (its mark says so): a gallery game the tests play. */
export const INSTALLED: Record<string, string> = {
  [`${HOME}/.glyphh/games/blocks/game.json`]: JSON.stringify({ title: 'Blocks', author: 'glyphh', about: 'Stack the falling blocks' }),
  [`${HOME}/.glyphh/games/blocks/game.html`]: GALLERY_PAGE,
  [`${HOME}/.glyphh/games/blocks/cover.jpg`]: jpegCover(),
  [`${HOME}/.glyphh/games/blocks/.gallery`]: 'glyphh-ai/drip\n',
}

/** The gallery, glyphh-ai/drip: Rocks (a game) and Snow (a drip), not fetched yet. */
export const GALLERY_FILES: Record<string, string> = {
  'index.json': JSON.stringify({
    v: 1,
    games: [
      { name: 'blocks', title: 'Blocks', author: 'glyphh', files: ['game.json', 'game.html', 'cover.jpg'] },
      { name: 'rocks', title: 'Rocks', author: 'glyphh', about: 'Shoot the rocks', emoji: '☄️', files: ['game.json', 'game.html', 'cover.jpg'] },
    ],
    drips: [{ name: 'snow', title: 'Snow', author: 'octocat', kind: 'one-shot', files: ['drip.json', 'drip.html', 'cover.jpg'] }],
  }),
  'games/rocks/game.json': JSON.stringify({ title: 'Rocks', author: 'glyphh', about: 'Shoot the rocks' }),
  'games/rocks/game.html': GALLERY_PAGE,
  'games/rocks/cover.jpg': jpegCover(),
  'drips/snow/drip.json': JSON.stringify({ title: 'Snow', author: 'octocat', kind: 'one-shot' }),
  'drips/snow/drip.html': GALLERY_PAGE,
  'drips/snow/cover.jpg': jpegCover(),
}

export type WorldOptions = {
  /** The person's own games and drips: files under HOME, path → text. */
  own?: Record<string, string>
  surfaces?: string[]
  /** No Xcode Command Line Tools: swiftc is not there. */
  noSwift?: boolean
  /** Not macOS. */
  notMac?: boolean
  /** Covers the plugin ships ("game-missiles"): each read as a tiny JPEG, "COVER" in base64. */
  covers?: string[]
  /** The /config theme ("dark", "light-daltonized"); none, the row is absent. */
  theme?: string
  /** A surface that places panes (the desktop app): true. */
  pane?: boolean
  /** Without Blocks fetched from the gallery: false. */
  installed?: boolean
  /** The gallery as GitHub serves it, path → text (a cover's, its base64); unreachable without. */
  gallery?: Record<string, string>
  /** The target app has no window on screen. */
  noWindow?: boolean
}

export const CLAUDE_WINDOW = { id: 79026, frame: { x: 799, y: 298, w: 1325, h: 1138 } }
export const SCREEN = { x: 0, y: 0, w: 1440, h: 900 }
export const CLAUDE_APP = { pid: 48036, bundleId: 'com.anthropic.claudefordesktop', regular: true }

/** One overlay process: its request, the scores it posts, and its end. */
export type FakeOverlay = {
  pid: number
  request: { v: number; html: string; frame: unknown; closeAfterMs: number; layer: string; follow: number | null; interactive: boolean }
  ended: boolean
  /** Posts a game's score: printed as a score event before it closes. */
  score(n: number): void
  end(why: string): void
}

export function world(on: On, options: WorldOptions = {}) {
  const ran: string[][] = []
  const toasts: string[] = []
  const copied: string[] = []
  const commands: string[] = []
  const files = new Set<string>()
  const overlays: FakeOverlay[] = []
  const panes: { id: string; title: string; focus?: true }[] = []
  const fetched: string[] = []
  let nextPid = 100

  on('env.get', (_$, e) => ({ value: e.name === 'HOME' ? HOME : undefined }))
  // The person's folders: Blocks fetched from the gallery, unless a test says none, then theirs.
  const own: Record<string, string> = { ...(options.installed === false ? {} : INSTALLED), ...options.own }
  const ownDirs = new Set<string>()
  for (const p of Object.keys(own)) for (let d = p.slice(0, p.lastIndexOf('/')); d.length > HOME.length; d = d.slice(0, d.lastIndexOf('/'))) ownDirs.add(d)
  const isCover = (path: string) => (options.covers ?? []).some(c => path.endsWith(`/covers/${c}.jpg`))
  // A file of the person's read as bytes (a cover): its text there is its base64.
  on('fs.read', (_$, e) => (isCover(e.path) ? { value: { base64: 'Q09WRVI=' } } : 'as' in e && e.as === 'bytes' && e.path in own ? { value: { base64: own[e.path]! } } : { value: e.path in own ? own[e.path]! : e.path.endsWith('overlay.swift') ? 'import AppKit' : `code of ${e.path}` }))
  on('fs.exists', (_$, e) => ({ value: isCover(e.path) || files.has(e.path) || e.path in own || ownDirs.has(e.path) }))
  // What the mod writes (a gallery fetch) lands among the person's files.
  on('fs.write', (_$, e) => {
    own[e.path] = e.text
    for (let d = e.path.slice(0, e.path.lastIndexOf('/')); d.length > HOME.length; d = d.slice(0, d.lastIndexOf('/'))) ownDirs.add(d)
    return { value: undefined }
  })
  on('fs.list', (_$, e) => {
    const at = String(e.path)
    const kids = new Map<string, 'file' | 'dir'>()
    for (const q of [...Object.keys(own), ...ownDirs]) {
      if (!q.startsWith(`${at}/`)) continue
      const first = q.slice(at.length + 1).split('/')[0]!
      kids.set(first, ownDirs.has(`${at}/${first}`) ? 'dir' : 'file')
    }
    return { value: [...kids].map(([name, kind]) => ({ name, kind, size: 0, mtimeMs: 0, isLink: false })) as never }
  })
  on('session.surfaces', () => ({ value: (options.surfaces ?? ['desktop']) as never }))
  on('command.register', (_$, e) => {
    commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('tool.register', (_$, e) => ({ value: { tool: `mcp__glyphh-drip__${e.name}` } as never }))
  on('process.run', (_$, e) => {
    const argv = [...e.argv]
    ran.push(argv)
    const [cmd] = argv
    // A cover fetched from the gallery, written from its base64.
    if (cmd === '/usr/bin/base64' && argv[1] === '-D') {
      own[argv[3]!] = String(e.init?.stdin ?? '')
      for (let d = argv[3]!.slice(0, argv[3]!.lastIndexOf('/')); d.length > HOME.length; d = d.slice(0, d.lastIndexOf('/'))) ownDirs.add(d)
      return { value: done('') }
    }
    if (cmd === 'uname') return { value: done(options.notMac ? 'Linux\n' : 'Darwin\n') }
    if (cmd === 'xcode-select') return { value: options.noSwift ? done('', 2, 'no developer tools') : done('/Library/Developer/CommandLineTools\n') }
    if (cmd === 'xcrun' && argv[1] === '--find') return { value: done('/usr/bin/swiftc\n') }
    if (cmd === 'xcrun' || cmd === '/bin/mkdir' || cmd === 'open') return { value: done() }
    if (cmd === '/bin/mv') {
      files.add(argv[3]!)
      return { value: done() }
    }
    if (argv[1] === 'screen') return { value: done(`${JSON.stringify(SCREEN)}\n`) }
    if (argv[1] === 'apps') return { value: done(`${JSON.stringify({ ancestors: [CLAUDE_APP] })}\n`) }
    if (argv[1] === 'window') {
      const found = options.noWindow ? { found: false, ...SCREEN } : { found: true, id: CLAUDE_WINDOW.id, ...CLAUDE_WINDOW.frame }
      return { value: done(`${JSON.stringify(found)}\n`) }
    }
    return { value: done('', 1, `unknown ${cmd}`) }
  })
  on('process.spawn', async function* (_$, e) {
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
  // A surface places the pane only when a test says one is there (the desktop app); else the list in words.
  on('config.list', () => ({ value: (options.theme ? [{ key: 'theme', label: 'Theme', kind: 'enum', value: options.theme, provider: { kind: 'engine' } }] : []) as never }))
  on('ui.open', (_$, e) => (panes.push({ id: e.id, title: String(e.title), ...(e.focus ? { focus: true } : {}) }), { value: options.pane === true ? { isPlaced: true as const } : { isPlaced: false as const, reason: 'no surface places panes' } }))
  on('http.fetch', (_$, e) => {
    fetched.push(e.url)
    const g = options.gallery
    if (g && e.url.startsWith(`${GALLERY_API}/`)) {
      const at = e.url.slice(GALLERY_API.length + 1).replace(/\?ref=main$/, '')
      return { value: at in g ? { ok: true, status: 200, headers: {}, text: JSON.stringify({ encoding: 'base64', content: g[at] }) } : { ok: false, status: 404, headers: {}, text: '' } }
    }
    if (g && e.url.startsWith(`${GALLERY}/`)) {
      const at = e.url.slice(GALLERY.length + 1)
      return { value: at in g ? { ok: true, status: 200, headers: {}, text: g[at]! } : { ok: false, status: 404, headers: {}, text: '' } }
    }
    throw new Error('connection refused')
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.copy', (_$, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  return { ran, toasts, copied, commands, files, overlays, panes, fetched }
}

export const startSession = ($: Engine) => $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })

export async function runCommand($: Engine, command: string, args = ''): Promise<string | undefined> {
  return (await $.command.run({ command, args } as CommandRunInput)).text
}
