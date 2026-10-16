// server.mjs — the Drips page's helper: one local web page, the Drips list
// and editor, in the desktop app's Browser pane. Effects play over Claude's
// window or the whole screen (the mod's native overlay), never in the page.
//
// Started by the mod, detached (DRIPS_DETACH=1: it starts itself again in a
// session of its own and the first copy exits), so it outlives the mod's
// reloads; the mod finds it again by the port and token it chose
// (DRIPS_PORT, DRIPS_TOKEN, kept in the session's memory) and its code's
// version (DRIPS_VERSION, in GET /api/state). It leaves when asked (POST
// /api/quit) or when the mod has not asked for the page's messages for 30
// seconds.
//
// The mod sends the saved drips (POST /api/library) and the licence's state in
// words (POST /api/licence-state: a trial and its days, unlocked, or the trial
// over; never the licence); the page leaves its asks (POST /api/ask: play,
// stop, save, delete; POST /api/licence: buy, cancel, copy) for the mod to
// collect (GET /api/inbox,
// GET /api/licence-inbox). Everything reaches the page on one event stream
// (GET /events).
//
// Locked to this machine and this page (./gate.mjs): it listens on 127.0.0.1
// only, on a random port; every request carries the session's random token
// (?t= or X-Token); Host must be 127.0.0.1:<port> and any Origin this page's;
// the page may not be framed. The page is opened with a one-time key (POST
// /api/key) and receives the token inside its HTML. Its static code (the
// script and style files) is served to any local request: it holds nothing.

import { spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { openSync, readFileSync } from "node:fs"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { isAllowed, isLocal, openKeys } from "./gate.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))

if (process.env.DRIPS_DETACH === "1") {
  const log = openSync(join(tmpdir(), "dripss-helper.log"), "a")
  spawn(process.execPath, [fileURLToPath(import.meta.url)], {
    detached: true,
    stdio: ["ignore", "ignore", log],
    env: { ...process.env, DRIPS_DETACH: "" },
  }).unref()
  process.exit(0)
}

const MANAGED = Boolean(process.env.DRIPS_TOKEN)
const TOKEN = process.env.DRIPS_TOKEN || randomBytes(24).toString("hex")
const VERSION = process.env.DRIPS_VERSION || ""
const KEYS = openKeys({ random: () => randomBytes(24).toString("hex") })
const ASSETS = {
  "/page.js": "text/javascript",
  "/builder.mjs": "text/javascript",
  "/page.css": "text/css",
}
const DISPLAYS = ["claude-window", "fullscreen"]
const ASKS = ["play", "stop", "save", "delete"]
const isLicenceAction = a => ["buy", "cancel", "copy"].includes(a)

const SECURITY = {
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
}

const inbox = []
const licenceAsks = []
let heardFrom = Date.now()
let library = { drips: [], effects: [], display: "claude-window" }
let licenceState = null
const events = new Set()

/** A message for the mod: kept for GET /api/inbox, and printed when run by hand. */
const say = msg => {
  if (MANAGED) inbox.push(msg)
  else process.stdout.write(JSON.stringify(msg) + "\n")
}

function emit(msg) {
  const line = `data: ${JSON.stringify(msg)}\n\n`
  for (const res of events) res.write(line)
}

const readBody = req => new Promise(resolve => {
  let body = ""
  req.on("data", c => { body += c; if (body.length > 8e6) req.destroy() })
  req.on("end", () => { try { resolve(JSON.parse(body || "null")) } catch { resolve(null) } })
})

const json = (res, value, status = 200) => {
  res.writeHead(status, { ...SECURITY, "Content-Type": "application/json" })
  res.end(JSON.stringify(value))
}

let port = 0
const allowed = (req, url) =>
  isAllowed({ host: req.headers.host, origin: req.headers.origin, token: url.searchParams.get("t") ?? req.headers["x-token"] }, { port, secret: TOKEN })
const local = req => isLocal({ host: req.headers.host, origin: req.headers.origin }, port)

/** The page, opened by a one-time key; the token goes inside it. */
function page(req, url, res) {
  if (!local(req) || !KEYS.consume(url.searchParams.get("k"), Date.now())) {
    res.writeHead(403, { ...SECURITY, "Content-Type": "text/html; charset=utf-8" })
    res.end("<!doctype html><meta charset=utf-8><title>Drips</title><p style=\"font:13px -apple-system,sans-serif;padding:24px\">This Drips page has been opened already. Run <b>/drips</b> in Claude to open it again.</p>")
    return
  }
  res.writeHead(200, { ...SECURITY, "Content-Type": "text/html; charset=utf-8" })
  res.end(readFileSync(join(HERE, "page.html"), "utf8").replace("__DRIPS_TOKEN__", TOKEN))
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`)
  if (req.method === "GET" && url.pathname === "/" && url.searchParams.has("k")) return page(req, url, res)
  if (req.method === "GET" && ASSETS[url.pathname] && local(req)) {
    res.writeHead(200, { ...SECURITY, "Content-Type": `${ASSETS[url.pathname]}; charset=utf-8` })
    res.end(readFileSync(join(HERE, url.pathname.slice(1))))
    return
  }
  if (!allowed(req, url)) {
    res.writeHead(403, SECURITY)
    res.end("forbidden")
    return
  }
  const route = `${req.method} ${url.pathname}`
  try {
    if (route === "POST /api/key") {
      json(res, { key: KEYS.issue(Date.now()) })
    } else if (route === "GET /api/state") {
      json(res, { version: VERSION, open: events.size })
    } else if (route === "GET /api/inbox") {
      heardFrom = Date.now()
      json(res, { messages: inbox.splice(0) })
    } else if (route === "POST /api/library") {
      const body = await readBody(req)
      if (Array.isArray(body?.drips) && Array.isArray(body?.effects)) {
        library = { drips: body.drips, effects: body.effects, display: DISPLAYS.includes(body.display) ? body.display : "claude-window" }
        emit({ t: "library" })
      }
      json(res, {})
    } else if (route === "GET /api/library") {
      json(res, library)
    } else if (route === "POST /api/ask") {
      const body = await readBody(req)
      if (!ASKS.includes(body?.t)) return json(res, { error: "unknown ask" }, 400)
      say(body)
      json(res, {})
    } else if (route === "POST /api/licence-state") {
      const body = await readBody(req)
      licenceState = body?.status ?? null
      emit({ t: "licence", status: licenceState })
      json(res, {})
    } else if (route === "GET /api/licence-state") {
      json(res, { status: licenceState })
    } else if (route === "POST /api/licence") {
      const body = await readBody(req)
      if (!isLicenceAction(body?.action)) return json(res, { error: "unknown action" }, 400)
      licenceAsks.push(body.action)
      json(res, {})
    } else if (route === "GET /api/licence-inbox") {
      json(res, { actions: licenceAsks.splice(0) })
    } else if (route === "POST /api/quit") {
      json(res, {})
      shutdown(0)
    } else if (route === "GET /events") {
      res.writeHead(200, { ...SECURITY, "Content-Type": "text/event-stream", Connection: "keep-alive" })
      res.write(": hello\n\n")
      events.add(res)
      req.on("close", () => events.delete(res))
    } else {
      res.writeHead(404, SECURITY)
      res.end("not found")
    }
  } catch (err) {
    json(res, { error: String(err?.message ?? err) }, 500)
  }
})

let done = false
function shutdown(code = 0) {
  if (done) return
  done = true
  try { server.close() } catch {}
  setTimeout(() => process.exit(code), 200)
}
for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(sig, () => shutdown(0))
if (MANAGED) setInterval(() => { if (Date.now() - heardFrom > 30_000) shutdown(0) }, 5000).unref()
else {
  const parent = process.ppid
  setInterval(() => { if (process.ppid !== parent) shutdown(0) }, 2000).unref()
}

server.on("error", () => shutdown(1)) // the port is taken: the mod tries another
server.listen(Number(process.env.DRIPS_PORT) || 0, "127.0.0.1", () => {
  port = server.address().port
  if (!MANAGED) process.stdout.write(JSON.stringify({ t: "ready", port, token: TOKEN }) + "\n")
})
