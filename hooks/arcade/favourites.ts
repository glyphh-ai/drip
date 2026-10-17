// The starred games and drips, the tray's buttons: kept in the store under
// this key across sessions; the drips' half (../drips) loads them at the start.

/** The store's key for the starred items ("game:missiles", "drip:confetti"). */
export const FAVOURITES_KEY = 'favourites'

/** What the tray starts with before anything is starred: the old quick plays. */
export const DEFAULT_FAVOURITES = ['drip:fireworks', 'drip:confetti', 'drip:hearts', 'drip:stars', 'drip:gunfight']

/** The kept list, or the default when nothing (or junk) is kept. */
export function favouritesOf(kept: unknown): string[] {
  return Array.isArray(kept) && kept.every(k => typeof k === 'string' && /^(game|drip|decide):[a-z0-9-]+$/.test(k)) ? kept : DEFAULT_FAVOURITES
}
