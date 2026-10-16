// builder.mjs — the Drips editor's recipe builder, pure (no DOM, no Node), so
// the mod's tests load it as the page does. The Glyphh app's Drips section
// (src/renderer/help/drips.ts at v2.0.2): a mode (one-shot, counted 2–10,
// persistent) and a list of effects make a recipe; a saved recipe opens back
// into the same shape.

export const COUNT_MIN = 2
export const COUNT_MAX = 10
export const COUNT_DEFAULT = 3

/** A representative emoji per built-in effect: a drip's icon. */
export const EFFECT_EMOJI = {
  fireworks: "🎆", hearts: "❤️", confetti: "🎊", stars: "⭐", rain: "🌧️",
  bubbles: "🫧", sparkle: "✨", spiral: "🌀", emoji: "😀", wave: "👋",
  thumbsup: "👍", peace: "✌️", cat: "🐱", matrix: "🟩", aurora: "🌌",
  nebula: "🌌", plasma: "🔮", fireflies: "✨", starfield: "🌟",
}

const clampCount = n => Math.min(COUNT_MAX, Math.max(COUNT_MIN, Number.isInteger(n) ? n : COUNT_DEFAULT))

/** The recipe the editor's fields make. */
export function buildRecipe({ mode, count, effects }) {
  const parts = []
  if (mode === "persistent") parts.push("-1")
  else if (mode === "counted") parts.push(String(clampCount(Number(count))))
  for (const e of effects) if (e) parts.push(e)
  return parts.join(" ")
}

/** A saved recipe as the editor's fields: `-1` first is persistent, a whole
 *  number above 1 first is counted; the rest are effects. */
export function parseRecipe(recipe) {
  const tokens = String(recipe ?? "").trim().split(/\s+/).filter(Boolean)
  let mode = "oneshot"
  let count = COUNT_DEFAULT
  let i = 0
  if (tokens[0] === "-1") {
    mode = "persistent"
    i = 1
  } else if (/^\d+$/.test(tokens[0] ?? "") && parseInt(tokens[0], 10) > 1) {
    mode = "counted"
    count = clampCount(parseInt(tokens[0], 10))
    i = 1
  }
  return { mode, count, effects: tokens.slice(i) }
}

/** The distinct effect emojis in a recipe, numbers left out. */
export function dripEmojis(recipe) {
  const seen = new Set()
  const out = []
  for (const t of String(recipe ?? "").trim().split(/\s+/)) {
    if (!t || !Number.isNaN(Number(t)) || seen.has(t)) continue
    seen.add(t)
    out.push(EFFECT_EMOJI[t] || "✨")
  }
  return out
}

/** The drips whose name or recipe holds the query. */
export function filterDrips(drips, query) {
  const q = String(query ?? "").trim().toLowerCase()
  return q ? drips.filter(d => d.name.toLowerCase().includes(q) || d.recipe.toLowerCase().includes(q)) : drips
}

export const countText = n => `${n} drip${n === 1 ? "" : "s"}`

/** What Save checks: a name and at least one effect. The name as it is kept. */
export function checkDrip({ name, effects }) {
  const kept = String(name ?? "").trim().toLowerCase()
  if (!effects.some(Boolean)) return { error: "Select at least one effect.", field: kept ? null : "name" }
  if (!kept) return { error: "Please fill in all required fields.", field: "name" }
  return { name: kept }
}
