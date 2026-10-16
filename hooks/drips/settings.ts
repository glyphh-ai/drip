// The mod's /config rows (plugin.json `userConfig`), as `register` receives
// them: where effects play, sounds and the Drips button by the prompt (each
// on unless set off), and the two optional fun hooks (off unless set).
//
// `display` is claude-window (the default) or fullscreen: the native overlay
// over Claude's window, or over the whole screen. A claude-window stored
// before 1.1.0 (then the Drips page in the Browser pane) keeps its name and
// now plays over Claude's window. browser-pane (1.1.0) is gone since 1.2.0:
// stored, it reads as the default. Nothing is rewritten in the person's
// settings.
import type { PluginOptions } from 'claude-code'

import type { Display } from '../../types'

export type Settings = {
  display: Display
  /** Confetti when a turn that ran longer than LONG_TURN_MS ends. */
  confettiAfterLongTurn: boolean
  /** A matrix rain while Claude's tools run. */
  matrixWhileTools: boolean
  /** The Drips button in the hint line under the prompt. */
  button: boolean
  /** Effects play their sounds. */
  sounds: boolean
}

export const DEFAULT_SETTINGS: Settings = { display: 'claude-window', confettiAfterLongTurn: false, matrixWhileTools: false, button: true, sounds: true }

export const DISPLAYS: readonly Display[] = ['claude-window', 'fullscreen']

/** A stored `display` made whole: one of DISPLAYS, else the default. */
export function displayOf(value: unknown): Display {
  return DISPLAYS.find(d => d === value) ?? DEFAULT_SETTINGS.display
}

export function settingsOf(options: PluginOptions): Settings {
  return {
    display: displayOf(options.display),
    confettiAfterLongTurn: options.confetti_after_long_turn === true,
    matrixWhileTools: options.matrix_while_tools === true,
    button: options.button !== false,
    sounds: options.sounds !== false,
  }
}
