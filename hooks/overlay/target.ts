// Copied from shared/overlay/target.ts by scripts/sync-shared.mjs: edit it there.
// The window effects play over when `display` is claude-window: the window
// Claude is running in. In the desktop app, the Claude app's own window; in a
// terminal, the window of the terminal app that hosts Claude Code. Pure: the
// apps among the process's ancestors (the native overlay's `apps`), a few
// environment variables and the surface decide it.

/** An app among the overlay's ancestors, nearest first. */
export type Ancestor = { pid: number; bundleId: string; regular: boolean }

/** What the native overlay looks for: the app's windows (by pid, and every
 *  instance of the bundle), the frontmost of them or the largest. */
export type Target = { surface: 'desktop' | 'terminal'; bundleId: string; pid: number | null; pick: 'largest' | 'frontmost' }

/** The environment variables that name the terminal app. */
export type TerminalEnv = { TERM_PROGRAM?: string; __CFBundleIdentifier?: string; TERM?: string }

/** The Claude desktop app (/Applications/Claude.app). */
export const CLAUDE_DESKTOP = 'com.anthropic.claudefordesktop'

/** The terminal apps known by bundle id, with their names. VS Code's family
 *  hosts Claude Code in its integrated terminal (and its extension). */
export const TERMINALS: Readonly<Record<string, string>> = {
  'com.mitchellh.ghostty': 'Ghostty',
  'com.apple.Terminal': 'Terminal',
  'com.googlecode.iterm2': 'iTerm2',
  'net.kovidgoyal.kitty': 'kitty',
  'com.github.wez.wezterm': 'WezTerm',
  'com.microsoft.VSCode': 'VS Code',
  'com.microsoft.VSCodeInsiders': 'VS Code Insiders',
  'com.todesktop.230313mzl4w4u92': 'Cursor',
  'com.vscodium': 'VSCodium',
  'com.exafunction.windsurf': 'Windsurf',
  'dev.warp.Warp-Stable': 'Warp',
  'org.alacritty': 'Alacritty',
}

/** TERM_PROGRAM's values for the terminals that set it. `vscode` is VS Code's
 *  whole family: __CFBundleIdentifier tells which. */
const TERM_PROGRAMS: Readonly<Record<string, string>> = {
  Apple_Terminal: 'com.apple.Terminal',
  'iTerm.app': 'com.googlecode.iterm2',
  ghostty: 'com.mitchellh.ghostty',
  WezTerm: 'com.github.wez.wezterm',
  kitty: 'net.kovidgoyal.kitty',
  vscode: 'com.microsoft.VSCode',
  WarpTerminal: 'dev.warp.Warp-Stable',
}

const isTerminal = (id: string | undefined): id is string => !!id && id in TERMINALS

/** The terminal app the environment names: __CFBundleIdentifier when it is a
 *  known terminal (it tells VS Code from Cursor), else TERM_PROGRAM, else
 *  kitty's TERM. */
export function terminalFromEnv(env: TerminalEnv): string | null {
  if (isTerminal(env.__CFBundleIdentifier)) return env.__CFBundleIdentifier
  const named = env.TERM_PROGRAM ? TERM_PROGRAMS[env.TERM_PROGRAM] : undefined
  if (named) return named
  return env.TERM === 'xterm-kitty' ? 'net.kovidgoyal.kitty' : null
}

export type TargetInput = { isDesktop: boolean; env: TerminalEnv; ancestors: readonly Ancestor[] }

/**
 * The window to play over, or null when nothing names one (the overlay then
 * plays over the screen under the pointer).
 *
 * - Desktop: the Claude app, its largest window (the main window, not a
 *   panel), its pid when it is an ancestor.
 * - Terminal, the frontmost window of, in order: the nearest known terminal
 *   among the ancestors (exact: its pid); the terminal the environment names
 *   (under tmux or screen the ancestors end at the multiplexer's server); the
 *   nearest regular app among the ancestors (a terminal not listed here).
 */
export function selectTarget({ isDesktop, env, ancestors }: TargetInput): Target | null {
  const pidOf = (bundleId: string) => ancestors.find(a => a.bundleId === bundleId)?.pid ?? null
  if (isDesktop) return { surface: 'desktop', bundleId: CLAUDE_DESKTOP, pid: pidOf(CLAUDE_DESKTOP), pick: 'largest' }
  const terminal = (bundleId: string, pid: number | null): Target => ({ surface: 'terminal', bundleId, pid, pick: 'frontmost' })
  const known = ancestors.find(a => isTerminal(a.bundleId))
  if (known) return terminal(known.bundleId, known.pid)
  const named = terminalFromEnv(env)
  if (named) return terminal(named, null)
  const app = ancestors.find(a => a.regular)
  return app ? terminal(app.bundleId, app.pid) : null
}
