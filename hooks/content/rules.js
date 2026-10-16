// The rules a game or drip folder must pass (docs/glyphh-drip.md), as pure
// functions over what was read from it. Plain JavaScript, so the plugin and
// the skills' checker (skills/*/check.js, run with Node before Claude says a
// game or drip is done) apply the very same rules.

/** A folder's name: lowercase letters, digits and hyphens. */
export const NAME = /^[a-z0-9][a-z0-9-]{0,31}$/
export const TITLE_MAX = 32
export const ABOUT_MAX = 60
/** A page's most, in characters. */
export const PAGE_MAX = 512 * 1024
export const ICON_MAX = 16 * 1024

/** What reaches the network: none of it may appear in a page. */
const NETWORK = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bEventSource\b/,
  /\bsendBeacon\b/,
  /\bimport\s*\(/,
  /\b(?:src|href|action)\s*=\s*["']?\s*(?:https?:)?\/\//i,
  /url\(\s*["']?\s*(?:https?:)?\/\//i,
  /@import\b/i,
]

/**
 * @typedef {{ name: string, manifest: string | null, page: string | null, icon: string | null }} Read
 *   A folder as read: its name, game.json or drip.json, game.html or drip.html, icon.svg (null when absent).
 * @typedef {{ title: string, about?: string }} GameManifest
 * @typedef {{ title: string, kind: 'one-shot' | 'loop' }} DripManifest
 */

/** @param {Read} r @param {string} file @returns {string | null} */
function common(r, file) {
  if (!NAME.test(r.name)) return `its folder name "${r.name}" must be lowercase letters, digits and hyphens`
  if (r.manifest === null) return `it has no ${file}.json`
  if (r.page === null) return `it has no ${file}.html`
  if (r.page.length > PAGE_MAX) return `${file}.html is over 512 KB`
  if (NETWORK.some(re => re.test(r.page))) return `${file}.html reaches the network, which isn't allowed`
  if (r.icon !== null) {
    if (r.icon.length > ICON_MAX) return 'icon.svg is over 16 KB'
    if (!/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(r.icon)) return 'icon.svg is not an SVG'
    if (/<script|\bon[a-z]+\s*=|(?:href|src)\s*=\s*["']?\s*(?:https?:)?\/\//i.test(r.icon)) return 'icon.svg has scripts or links'
  }
  return null
}

/** @param {string} text @returns {Record<string, unknown> | null} */
function parsed(text) {
  try {
    const v = JSON.parse(text)
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null
  } catch {
    return null
  }
}

/** @param {Record<string, unknown>} m @param {string} file @returns {string | null} */
function titled(m, file) {
  if (typeof m.title !== 'string' || !m.title.trim()) return `${file}.json has no title`
  if (m.title.trim().length > TITLE_MAX) return `${file}.json's title is over ${TITLE_MAX} characters`
  return null
}

/** @param {Read} r @returns {{ ok: true, manifest: GameManifest, page: string, icon: string | null } | { ok: false, why: string }} */
export function checkGame(r) {
  const why = common(r, 'game')
  if (why) return { ok: false, why }
  const m = parsed(/** @type {string} */ (r.manifest))
  if (!m) return { ok: false, why: 'game.json is not a JSON object' }
  const t = titled(m, 'game')
  if (t) return { ok: false, why: t }
  if (m.about !== undefined && (typeof m.about !== 'string' || m.about.length > ABOUT_MAX)) {
    return { ok: false, why: `game.json's about must be text of at most ${ABOUT_MAX} characters` }
  }
  const manifest = { title: String(m.title).trim(), ...(typeof m.about === 'string' && m.about.trim() ? { about: m.about.trim() } : {}) }
  return { ok: true, manifest, page: r.page, icon: r.icon }
}

/** @param {Read} r @returns {{ ok: true, manifest: DripManifest, page: string, icon: string | null } | { ok: false, why: string }} */
export function checkDrip(r) {
  const why = common(r, 'drip')
  if (why) return { ok: false, why }
  const m = parsed(/** @type {string} */ (r.manifest))
  if (!m) return { ok: false, why: 'drip.json is not a JSON object' }
  const t = titled(m, 'drip')
  if (t) return { ok: false, why: t }
  if (m.kind !== 'one-shot' && m.kind !== 'loop') return { ok: false, why: 'drip.json\'s kind must be "one-shot" or "loop"' }
  return { ok: true, manifest: { title: String(m.title).trim(), kind: m.kind }, page: /** @type {string} */ (r.page), icon: r.icon }
}
