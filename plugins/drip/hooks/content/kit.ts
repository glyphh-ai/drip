// The kit every game and drip from a folder gets (the repository's README): put
// in front of its page as `window.drip`, with a policy that blocks the
// network. It is the built-in games' own plumbing (../arcade/games/shared.ts):
// the close signal the overlay hears, the sound kit and the score post.
import { CLOSE_SIGNAL, GAME_SCORE, GAME_SOUND, gameFrame } from '../arcade/games/shared.ts'

/** What a page may load: only what it carries inline. */
export const POLICY =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:"

export type KitOptions = {
  kind: 'game' | 'drip'
  width: number
  height: number
  /** A game's top score so far. */
  best?: number
  /** A looping drip's strength, 0 to 1. */
  opacity?: number
  /** Sounds off (/config): the page starts muted. */
  quiet: boolean
}

/** Pages made before 2.0.0 call the kit by Drip's old name: it answers to it too. */
export const OLD_NAME = 'window.glyphh=window.drip;'

/** The kit's script: `window.drip`, and for a game Esc (quits), M (mutes),
 *  the backdrop and the fit to Claude's window as it is resized. */
export function kitScript(o: KitOptions): string {
  const n = (v: number) => (Number.isFinite(v) ? v : 0)
  const keys =
    o.kind === 'game'
      ? `document.addEventListener("keydown",function(e){if(e.key==="Escape"){e.preventDefault();drip.end()}else if(e.key==="m"||e.key==="M"){sfx.toggle()}},true);` + gameFrame(o.width, o.height)
      : ''
  return (
    `<script>window.__dripsQuiet=${o.quiet ? 'true' : 'false'};${GAME_SOUND}${GAME_SCORE}` +
    `window.drip={width:${n(o.width)},height:${n(o.height)},best:${n(o.best ?? 0)},opacity:${n(o.opacity ?? 1)},` +
    `score:function(v){postScore(Math.floor(Number(v)||0))},` +
    `end:function(){if(window.drip.ended)return;window.drip.ended=true;${CLOSE_SIGNAL}},` +
    `sfx:sfx,muted:function(){return sfx.muted()}};${OLD_NAME}${keys}</script>`
  )
}

/** `html` with the policy first in its head and the kit first in its body. */
export function withKit(html: string, o: KitOptions): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${POLICY}">`
  let out = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + meta) : meta + html
  out = /<body[^>]*>/i.test(out) ? out.replace(/<body[^>]*>/i, m => m + kitScript(o)) : kitScript(o) + out
  return out
}
