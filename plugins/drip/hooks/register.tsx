// Drip: games and drips (visual effects) over Claude's window or the
// whole screen, free. The games' half goes first: it takes /drip <game> and
// the pane and passes everything else to the drips' half.
import type { Register } from 'claude-code'

import { arcade } from './arcade/hooks.tsx'
import { drips } from './drips/hooks.tsx'

export const register: Register = (on, options) => {
  arcade(on, options)
  drips(on, options)
}
