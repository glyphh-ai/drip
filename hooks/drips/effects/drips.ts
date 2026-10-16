// A drip: one effect, in a file of its own under effects/, listed once in
// ./index.ts. Its `build` makes the whole document the overlay loads.

/** Plays once and closes itself with the close signal (./shared.ts). */
export type OneShotDrip = {
  name: string
  kind: 'one-shot'
  build: (w: number, h: number) => string
  /** The backstop, in ms, should its close signal never come; 8 s when absent. */
  safetyMs?: number
  /** Playable by name, never listed. */
  isHidden?: boolean
  /** Its sounds: a script run beside the document when Sounds is on
   *  (./shared.ts, soundScript). */
  sound?: string
}

/** An ambient background: keeps playing at its opacity until stopped. Played
 *  once, it is bounded at 8 s. */
export type LoopDrip = {
  name: string
  kind: 'loop'
  build: (w: number, h: number, opacity: number) => string
  /** Its sounds, as a one-shot's; `every` keeps them going while it plays. */
  sound?: string
}

export type Drip = OneShotDrip | LoopDrip
