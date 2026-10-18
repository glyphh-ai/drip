import { describe, expect, test } from 'claude-code/testing'

import { CLAUDE_DESKTOP, TERMINALS, selectTarget, terminalFromEnv, type Ancestor } from '../hooks/overlay/target.ts'

const app = (pid: number, bundleId: string, regular = true): Ancestor => ({ pid, bundleId, regular })
const CLAUDE = app(48036, CLAUDE_DESKTOP)
const CLI = app(48475, 'com.anthropic.claude-code', false)

describe('the window Claude runs in', () => {
  test("desktop: the Claude app's largest window, by its pid when it is an ancestor", () => {
    expect(selectTarget({ isDesktop: true, env: {}, ancestors: [CLI, CLAUDE] })).toEqual({ surface: 'desktop', bundleId: CLAUDE_DESKTOP, pid: 48036, pick: 'largest' })
    expect(selectTarget({ isDesktop: true, env: { TERM_PROGRAM: 'Apple_Terminal' }, ancestors: [] })).toEqual({ surface: 'desktop', bundleId: CLAUDE_DESKTOP, pid: null, pick: 'largest' })
  })

  test('terminal: the nearest known terminal among the ancestors, frontmost window, whatever the environment says', () => {
    const ancestors = [CLI, app(9001, 'com.microsoft.VSCode.helper', false), app(436, 'com.apple.Terminal')]
    expect(selectTarget({ isDesktop: false, env: { TERM_PROGRAM: 'ghostty' }, ancestors })).toEqual({ surface: 'terminal', bundleId: 'com.apple.Terminal', pid: 436, pick: 'frontmost' })
  })

  test('each supported terminal by bundle id', () => {
    for (const id of ['com.mitchellh.ghostty', 'com.apple.Terminal', 'com.googlecode.iterm2', 'net.kovidgoyal.kitty', 'com.github.wez.wezterm', 'com.microsoft.VSCode', 'com.todesktop.230313mzl4w4u92']) {
      expect(id in TERMINALS).toBe(true)
      expect(selectTarget({ isDesktop: false, env: {}, ancestors: [app(7, id)] })).toMatchObject({ bundleId: id, pid: 7 })
    }
  })

  test('terminal, no terminal among the ancestors (tmux, screen): the one the environment names, any of its windows', () => {
    expect(selectTarget({ isDesktop: false, env: { TERM_PROGRAM: 'tmux', __CFBundleIdentifier: 'com.mitchellh.ghostty' }, ancestors: [] })).toEqual({
      surface: 'terminal',
      bundleId: 'com.mitchellh.ghostty',
      pid: null,
      pick: 'frontmost',
    })
  })

  test('terminal, nothing known: the nearest regular app among the ancestors (a terminal not listed)', () => {
    const ancestors = [CLI, app(300, 'org.example.helper', false), app(301, 'org.example.term')]
    expect(selectTarget({ isDesktop: false, env: {}, ancestors })).toEqual({ surface: 'terminal', bundleId: 'org.example.term', pid: 301, pick: 'frontmost' })
  })

  test('nothing names a window: null (the overlay plays over the screen under the pointer)', () => {
    expect(selectTarget({ isDesktop: false, env: {}, ancestors: [CLI] })).toBeNull()
    expect(selectTarget({ isDesktop: false, env: { TERM_PROGRAM: 'tmux', TERM: 'screen-256color' }, ancestors: [] })).toBeNull()
  })
})

describe('the terminal the environment names', () => {
  test('__CFBundleIdentifier when it is a known terminal: it tells Cursor from VS Code', () => {
    expect(terminalFromEnv({ TERM_PROGRAM: 'vscode', __CFBundleIdentifier: 'com.todesktop.230313mzl4w4u92' })).toBe('com.todesktop.230313mzl4w4u92')
    expect(terminalFromEnv({ TERM_PROGRAM: 'vscode', __CFBundleIdentifier: 'com.microsoft.VSCode' })).toBe('com.microsoft.VSCode')
  })

  test('else TERM_PROGRAM', () => {
    expect(terminalFromEnv({ TERM_PROGRAM: 'Apple_Terminal' })).toBe('com.apple.Terminal')
    expect(terminalFromEnv({ TERM_PROGRAM: 'iTerm.app', __CFBundleIdentifier: 'com.example.launcher' })).toBe('com.googlecode.iterm2')
    expect(terminalFromEnv({ TERM_PROGRAM: 'ghostty' })).toBe('com.mitchellh.ghostty')
    expect(terminalFromEnv({ TERM_PROGRAM: 'WezTerm' })).toBe('com.github.wez.wezterm')
    expect(terminalFromEnv({ TERM_PROGRAM: 'vscode' })).toBe('com.microsoft.VSCode')
    expect(terminalFromEnv({ TERM_PROGRAM: 'kitty' })).toBe('net.kovidgoyal.kitty')
  })

  test("else kitty's TERM; nothing otherwise", () => {
    expect(terminalFromEnv({ TERM: 'xterm-kitty' })).toBe('net.kovidgoyal.kitty')
    expect(terminalFromEnv({ TERM: 'xterm-256color' })).toBeNull()
    expect(terminalFromEnv({ TERM_PROGRAM: 'tmux' })).toBeNull()
    expect(terminalFromEnv({})).toBeNull()
  })
})
