// The mod's /config rows (plugin.json `userConfig`), as `register` receives
// them: where games play, and their sounds (on unless set off).
//
// `display` is claude-window (the default) or fullscreen: the native overlay
// over Claude's window, or over the whole screen.
import type { PluginOptions } from 'claude-code'

export type Display = 'claude-window' | 'fullscreen'

export type Settings = {
  display: Display
  /** Games play their sounds (each game's M key mutes it too). */
  sounds: boolean
}

export const DEFAULT_SETTINGS: Settings = { display: 'claude-window', sounds: true }

export function settingsOf(options: PluginOptions): Settings {
  return {
    display: options.display === 'fullscreen' ? 'fullscreen' : 'claude-window',
    sounds: options.sounds !== false,
  }
}
