// What the Drip pane and the tray say of each built-in game and drip: its
// emoji and one short line. A folder's own come from its JSON (`emoji`,
// `about`); one without an emoji takes its type's.

/** The types the pane filters by, as it names them. */
export const TYPES = { game: 'Game', drip: 'Drip', decide: 'Decide' } as const
export type Kind = keyof typeof TYPES

/** A type's emoji, for an item without its own. */
export const KIND_EMOJI: Record<Kind, string> = { game: '🎮', drip: '✨', decide: '🎲' }

/** The built-in ones: emoji and line. */
export const BUILT_IN: Record<string, { emoji: string; about: string }> = {
  missiles: { emoji: '🚀', about: 'Keep the missiles off the ground' },
  fireworks: { emoji: '🎆', about: 'Rockets burst over Claude' },
  hearts: { emoji: '💖', about: 'Hearts float up the window' },
  confetti: { emoji: '🎊', about: 'A burst of confetti' },
  stars: { emoji: '⭐', about: 'Stars twinkle and fall' },
  rain: { emoji: '🌧️', about: 'A shower over the window' },
  bubbles: { emoji: '🫧', about: 'Bubbles rise and pop' },
  sparkle: { emoji: '✨', about: 'Sparkles glint and fade' },
  spiral: { emoji: '🌀', about: 'A spinning spiral of light' },
  emoji: { emoji: '😀', about: 'A rain of emoji' },
  wave: { emoji: '🌊', about: 'A wave rolls across' },
  thumbsup: { emoji: '👍', about: 'A big thumbs up' },
  peace: { emoji: '✌️', about: 'Peace signs drift by' },
  cat: { emoji: '🐱', about: 'A cat strolls across' },
  gunfight: { emoji: '🤠', about: 'A showdown at high noon' },
  matrix: { emoji: '💻', about: 'Green code rains down' },
  aurora: { emoji: '🌌', about: 'Northern lights, kept on' },
  nebula: { emoji: '🪐', about: 'A drifting nebula, kept on' },
  plasma: { emoji: '🔮', about: 'Slow plasma colours, kept on' },
  fireflies: { emoji: '💫', about: 'Fireflies wander, kept on' },
  starfield: { emoji: '🌠', about: 'Flying through stars, kept on' },
}

/** An item's emoji: its own, the built-in one's, else its type's. */
export function emojiOf(kind: Kind, name: string, own?: string | null): string {
  return own || BUILT_IN[name]?.emoji || KIND_EMOJI[kind]
}
