// Every drip, one file each. A new drip is a file in this folder and a line
// here; the order is the order they are listed in (one-shots, then
// the looping backgrounds).
import { aurora } from './aurora.ts'
import { bubbles } from './bubbles.ts'
import { cat } from './cat.ts'
import { confetti } from './confetti.ts'
import type { Drip } from './drips.ts'
import { emoji } from './emoji.ts'
import { fireflies } from './fireflies.ts'
import { fireworks } from './fireworks.ts'
import { powow } from './powow.ts'
import { hearts } from './hearts.ts'
import { matrix } from './matrix.ts'
import { nebula } from './nebula.ts'
import { peace } from './peace.ts'
import { plasma } from './plasma.ts'
import { rain } from './rain.ts'
import { sparkle } from './sparkle.ts'
import { spiral } from './spiral.ts'
import { starfield } from './starfield.ts'
import { stars } from './stars.ts'
import { thumbsup } from './thumbsup.ts'
import { timme } from './timme.ts'
import { wave } from './wave.ts'

export const DRIPS: readonly Drip[] = [
  fireworks, hearts, confetti, stars, rain, bubbles, sparkle, spiral, emoji,
  wave, thumbsup, peace, cat, powow, timme,
  matrix, aurora, nebula, plasma, fireflies, starfield,
]
