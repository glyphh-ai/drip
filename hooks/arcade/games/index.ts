// Every game, one file each. A new game is a file in this folder and a line
// here; the order is the order /games lists them in.
import { blocks } from './blocks.ts'
import { chickn } from './chickn.ts'
import { dash } from './dash.ts'
import type { Game } from './game.ts'
import { missiles } from './missiles.ts'
import { rocks } from './rocks.ts'

export const GAMES: readonly Game[] = [missiles, chickn, blocks, rocks, dash]

/** A game by its name or one of its other names, any case; else null. */
export function gameOf(name: string): Game | null {
  const n = name.trim().toLowerCase()
  return GAMES.find(g => g.name === n || (g.aliases ?? []).includes(n)) ?? null
}

/** A game's document for an overlay `w` by `h`: interactive, drawn with
 *  `best` to beat, its backstop its own; with Sounds off it starts muted
 *  (its M key still unmutes it). */
export function gameDoc(game: Game, w: number, h: number, best: number, sounds: boolean): { html: string; closeAfterMs: number; interactive: true } {
  const html = game.build(w, h, best)
  return {
    html: sounds ? html : html.replace(/<body[^>]*>/, m => `${m}<script>window.__dripsQuiet=true</${'script'}>`),
    closeAfterMs: game.safetyMs,
    interactive: true,
  }
}
