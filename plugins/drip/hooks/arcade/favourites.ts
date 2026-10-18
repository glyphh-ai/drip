// The starred games and drips, the tray's buttons: kept in the store under
// this key across sessions; the drips' half (../drips) loads them at the start.

/** The store's key for the starred items ("game:missiles", "drip:confetti"). */
export const FAVOURITES_KEY = 'favourites'

/** What the tray starts with before anything is starred: the old quick plays. */
export const DEFAULT_FAVOURITES = ['drip:fireworks', 'drip:confetti', 'drip:hearts', 'drip:stars', 'drip:powow']

/** The kept list, or the default when nothing (or junk) is kept. */
export function favouritesOf(kept: unknown): string[] {
  if (!(Array.isArray(kept) && kept.every(k => typeof k === 'string' && /^(game|drip|decide):[a-z0-9-]+$/.test(k)))) return DEFAULT_FAVOURITES
  // Renamed drips keep their stars.
  return (kept as string[]).map(k => RENAMED[k] ?? k)
}

/** Drips renamed since they could be starred: old key → new. */
const RENAMED: Record<string, string> = { 'drip:gunfight': 'drip:powow' }
