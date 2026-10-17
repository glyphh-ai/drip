// What makes the shared one-time unlock module (shared/unlock) this mod's: the
// only file of hooks/unlock/ that is the mod's own. The build swaps
// PAYMENT_LINK for the live one in release.json.
export const MOD = 'glyphh-drip'
/** The command the unlock answers on: /drips unlock, /drips key <licence>. */
export const COMMAND = 'drip'
/** Stripe test Payment Link in the sandbox: Glyphh Drip, $4.99, metadata mod=glyphh-drip. */
export const PAYMENT_LINK = 'https://buy.stripe.com/aFafZa5kY1hmb6TfSRc7u00'

/** The mod's name as people read it, and its price: once, per machine. */
export const PRODUCT = 'Glyphh Drip'
export const PRICE = '$4.99'

/** What the mod does, shown until it is bought. */
export const ABOUT = [
  'Glyphh Drip plays games and drips over Claude, with sound: five arcade games and twenty drips, plus the ones you make with Claude.',
  '/drip opens the card; /drip snake starts a game; /drip confetti plays a drip.',
]
