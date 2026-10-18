// Each game's top score: game → score, kept in the mod's store under one key,
// so it outlasts the overlay, the session and updates. A game draws it as the
// mark to beat and posts its score as it goes; only a higher one is kept.
// Works on a Store, closures over `$.store` that ./hooks.tsx hands it.

export type Store = {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
}

export const SCORES_KEY = 'bestScores'

export type Scores = {
  /** The game's top score, 0 before its first round. */
  best(game: string): Promise<number>
  /** Keeps `score` when it beats the game's top score. */
  keep(game: string, score: number): Promise<void>
}

const isScore = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0

async function all(store: Store): Promise<Record<string, number>> {
  const kept = await store.get(SCORES_KEY)
  const out: Record<string, number> = {}
  if (!kept || typeof kept !== 'object' || Array.isArray(kept)) return out
  for (const [game, score] of Object.entries(kept as Record<string, unknown>)) if (isScore(score)) out[game] = score
  return out
}

export function scoresOf(store: Store): Scores {
  return {
    best: async game => (await all(store))[game] ?? 0,
    async keep(game, score) {
      if (!isScore(score)) return
      const now = await all(store)
      if (score > (now[game] ?? 0)) await store.set(SCORES_KEY, { ...now, [game]: score })
    },
  }
}
