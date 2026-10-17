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
/** A cover's most, in bytes, and its sizes: 16:10, 480×300 to 1920×1200. */
export const COVER_MAX = 300 * 1024
export const COVER_MIN_W = 480
export const COVER_MAX_W = 1920
/** A GitHub login: letters, digits and single hyphens, at most 39. */
export const AUTHOR = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/
/** The author Glyphh's own carry, which the console shows as "Glyphh built". */
export const GLYPHH = 'glyphh'
/** The cover files a folder may have, in the order they are looked for. */
export const COVER_FILES = ['cover.jpg', 'cover.png']

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
 * @typedef {{ file: string, base64: string }} Cover
 *   cover.jpg or cover.png as read: its name and its bytes, standard base64.
 * @typedef {{ name: string, manifest: string | null, page: string | null, icon: string | null, cover: Cover | null }} Read
 *   A folder as read: its name, game.json or drip.json, game.html or drip.html, icon.svg and its cover (null when absent).
 * @typedef {{ title: string, author: string, about?: string }} GameManifest
 * @typedef {{ title: string, author: string, kind: 'one-shot' | 'loop' }} DripManifest
 */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Standard base64 to bytes; null when it isn't base64. @param {string} text @returns {Uint8Array | null} */
function bytesOf(text) {
  const t = text.replace(/\s+/g, '').replace(/=+$/, '')
  if (/[^A-Za-z0-9+/]/.test(t) || t.length % 4 === 1) return null
  const out = new Uint8Array(Math.floor((t.length * 3) / 4))
  let at = 0
  for (let i = 0; i < t.length; i += 4) {
    const n = [0, 1, 2, 3].map(k => (i + k < t.length ? B64.indexOf(t[i + k]) : 0))
    const v = (n[0] << 18) | (n[1] << 12) | (n[2] << 6) | n[3]
    for (const [k, shift] of [[1, 16], [2, 8], [3, 0]]) if (i + k < t.length) out[at++] = (v >> shift) & 255
  }
  return out
}

/**
 * A cover's kind and size in pixels, read from its header; null when it is
 * neither a PNG nor a JPEG it can read.
 * @param {Uint8Array} b @returns {{ type: 'png' | 'jpeg', w: number, h: number } | null}
 */
export function imageSize(b) {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const w = ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0
    const h = ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0
    return { type: 'png', w, h }
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null
      const marker = b[i + 1]
      if (marker === 0xff) {
        i++
        continue
      }
      const len = (b[i + 2] << 8) | b[i + 3]
      // A start of frame (SOF0–SOF15, not DHT, JPG or DAC) holds the size.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { type: 'jpeg', h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] }
      }
      i += 2 + len
    }
  }
  return null
}

/** Why a cover won't do, or null. @param {Cover | null} c @returns {string | null} */
function coverWhy(c) {
  if (c === null) return 'it has no cover.jpg or cover.png (its card in the console)'
  const b = bytesOf(c.base64)
  if (b === null) return `${c.file} could not be read`
  if (b.length > COVER_MAX) return `${c.file} is over 300 KB`
  const size = imageSize(b)
  if (!size || size.type !== (c.file === 'cover.png' ? 'png' : 'jpeg')) return `${c.file} is not a ${c.file === 'cover.png' ? 'PNG' : 'JPEG'}`
  if (size.w < COVER_MIN_W || size.w > COVER_MAX_W) return `${c.file} is ${size.w}×${size.h}: it must be 480 to 1920 wide (960×600 is right)`
  if (Math.abs(size.w / size.h - 1.6) > 0.02) return `${c.file} is ${size.w}×${size.h}: it must be 16:10 (960×600 is right)`
  return null
}

/** Why an author won't do, or null. @param {Record<string, unknown>} m @param {string} file @returns {string | null} */
function authorWhy(m, file) {
  if (typeof m.author !== 'string' || !m.author.trim()) return `${file}.json has no author (the maker's GitHub login)`
  if (!AUTHOR.test(m.author.trim())) return `${file}.json's author must be a GitHub login`
  return null
}

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
  return coverWhy(r.cover)
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

/** @param {Read} r @returns {{ ok: true, manifest: GameManifest, page: string, icon: string | null, cover: Cover } | { ok: false, why: string }} */
export function checkGame(r) {
  const why = common(r, 'game')
  if (why) return { ok: false, why }
  const m = parsed(/** @type {string} */ (r.manifest))
  if (!m) return { ok: false, why: 'game.json is not a JSON object' }
  const t = titled(m, 'game') ?? authorWhy(m, 'game')
  if (t) return { ok: false, why: t }
  if (m.about !== undefined && (typeof m.about !== 'string' || m.about.length > ABOUT_MAX)) {
    return { ok: false, why: `game.json's about must be text of at most ${ABOUT_MAX} characters` }
  }
  const manifest = { title: String(m.title).trim(), author: String(m.author).trim(), ...(typeof m.about === 'string' && m.about.trim() ? { about: m.about.trim() } : {}) }
  return { ok: true, manifest, page: r.page, icon: r.icon, cover: /** @type {Cover} */ (r.cover) }
}

/** @param {Read} r @returns {{ ok: true, manifest: DripManifest, page: string, icon: string | null, cover: Cover } | { ok: false, why: string }} */
export function checkDrip(r) {
  const why = common(r, 'drip')
  if (why) return { ok: false, why }
  const m = parsed(/** @type {string} */ (r.manifest))
  if (!m) return { ok: false, why: 'drip.json is not a JSON object' }
  const t = titled(m, 'drip') ?? authorWhy(m, 'drip')
  if (t) return { ok: false, why: t }
  if (m.kind !== 'one-shot' && m.kind !== 'loop') return { ok: false, why: 'drip.json\'s kind must be "one-shot" or "loop"' }
  return { ok: true, manifest: { title: String(m.title).trim(), author: String(m.author).trim(), kind: m.kind }, page: /** @type {string} */ (r.page), icon: r.icon, cover: /** @type {Cover} */ (r.cover) }
}
