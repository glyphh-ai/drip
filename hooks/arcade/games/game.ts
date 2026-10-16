// A game: one file in this folder, listed once in ./index.ts. Its `build`
// makes the whole document the overlay loads: the game, drawn with the top
// score to beat, posting its own score as it goes (./shared.ts, GAME_SCORE).
// It gets harder as it goes and runs until it is lost.
export type Game = {
  name: string
  /** As people read it: "Missile Command", "Blocks". */
  title: string
  build: (w: number, h: number, best: number) => string
  /** The backstop, in ms. */
  safetyMs: number
  /** Other names it answers to (never listed). */
  aliases?: string[]
}
