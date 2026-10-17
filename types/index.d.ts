/** A saved recipe, as `/drips save <name> <recipe>` and the Drips page keep it. */
export type CustomDrip = { name: string; recipe: string }

/** Where effects play: the /config row `display`. claude-window: the native
 *  overlay over the window Claude runs in; fullscreen: the native overlay over
 *  the whole screen. */
export type Display = 'claude-window' | 'fullscreen'

/** The running Drips page helper: where it listens and its token, kept in
 *  the session's memory (never on disk) so a reload of the mod finds it again. */
export type HelperInfo = { port: number; token: string }

/** The licence as this install holds it (hooks/unlock). */
export type LicenceState = {
  /** A licence that checked out, kept in the store. */
  licence: string | null
  /** Checkout is open and the site is being asked whether it went through. */
  isWaiting: boolean
  /** What the last unlock attempt came to. */
  note: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'glyphh-drip': {
      licence: LicenceState
      helper: HelperInfo | null
      /** The Browser pane's tab showing the Drips page, kept across reloads. */
      pageTab: string | null
      /** Node, as the session start found it (it runs the page's helper). */
      node: string | null
      /** The quick-play row above the prompt is open (the drip button pressed). */
      bandOpen: boolean
      /** A drip the card asked to play, for the drips' half to take (the engine
       *  follows $ only within the file whose hook received it). */
      queued: { recipe: string; at: number } | null
      /** The Drip pane's search, its filter by type, and its page (from 0). */
      query: string
      filter: 'all' | 'game' | 'drip' | 'decide'
      page: number
      /** The starred items ("game:missiles"), the tray's buttons; kept in the store too. */
      favourites: string[]
    }
  }
}
