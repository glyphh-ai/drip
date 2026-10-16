// Glyphh Drip: games and drips (visual effects) over Claude's window or the
// whole screen. The licence's hooks (the one-time unlock) go first, so they
// stand around the mod's own; then the games' half, which takes /drip <game>
// and the card and passes everything else to the drips' half.
import type { Register } from 'claude-code'

import { arcade } from './arcade/hooks.tsx'
import { drips } from './drips/hooks.tsx'
import { licensing } from './unlock/hooks.tsx'

export const register: Register = (on, options) => {
  licensing(on)
  arcade(on, options)
  drips(on, options)
}
