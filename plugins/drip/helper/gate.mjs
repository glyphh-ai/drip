// gate.mjs — who may talk to the layout page's server. Pure: no Node imports,
// so the mod's tests load it as the server does.
//
// Every request carries the session's secret token (?t= or X-Token); Host must
// be 127.0.0.1:<port> (no DNS-rebinding name) and any Origin the page's own.
// The page itself is opened with a one-time key instead, so the address the
// mod hands the browser pane (or a prompt) opens the page once and is then
// worth nothing.

/** Whether `given` is `secret`, compared in constant time for its length. */
export function sameSecret(given, secret) {
  if (typeof given !== "string" || typeof secret !== "string" || given.length !== secret.length) return false
  let diff = 0
  for (let i = 0; i < secret.length; i++) diff |= given.charCodeAt(i) ^ secret.charCodeAt(i)
  return diff === 0
}

/** Whether a request's Host and Origin are this server's own. */
export function isLocal({ host, origin }, port) {
  if (host !== `127.0.0.1:${port}`) return false
  return !origin || origin === `http://127.0.0.1:${port}`
}

/** A request may pass: local, and carrying the token. */
export function isAllowed(req, { port, secret }) {
  return isLocal(req, port) && sameSecret(req.token, secret)
}

/** One-time keys that open the page: each works once, within `ttlMs`. */
export function openKeys({ random, ttlMs = 10 * 60_000 }) {
  const keys = new Map() // key → expires at
  return {
    issue(now) {
      for (const [k, at] of keys) if (at <= now) keys.delete(k)
      const key = random()
      keys.set(key, now + ttlMs)
      return key
    },
    consume(key, now) {
      if (typeof key !== "string") return false
      for (const [k, at] of keys) {
        if (sameSecret(key, k)) {
          keys.delete(k)
          return at > now
        }
      }
      return false
    },
  }
}
