// page.js — the Drips page: the list of saved drips and the recipe editor
// (the Glyphh app's Drips section). Saving, deleting and playing are the
// mod's: the page asks (POST /api/ask) and draws what the mod sends back (GET
// /api/library); effects play over Claude's window or the whole screen.
import { buildRecipe, checkDrip, countText, dripEmojis, filterDrips, parseRecipe } from "./builder.mjs"

const T = window.DRIPS_TOKEN
history.replaceState(null, "", "/")

const $ = id => document.getElementById(id)
const el = (tag, cls, text) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, text === undefined ? {} : { textContent: text })

async function api(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "X-Token": T, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return res.json()
}
const ask = msg => api("/api/ask", msg).catch(() => {})

// ── The list ────────────────────────────────────────────────────────────────
let library = { drips: [], effects: [], display: "claude-window" }
let editing = null // the name of the drip open in the editor; "" for a new one

const PLACES = { "claude-window": "Plays over Claude's window", fullscreen: "Plays fullscreen" }

function drawList() {
  const list = $("list")
  const all = library.drips
  const shown = filterDrips(all, $("search").value)
  $("count").textContent = countText(all.length)
  $("where").textContent = PLACES[library.display] ?? ""
  list.replaceChildren()
  if (all.length === 0) {
    const empty = el("div", "empty", "No custom drips yet — ")
    empty.append(el("b", "", "+ Add"), " makes your first one.")
    return list.append(empty)
  }
  if (shown.length === 0) return list.append(el("div", "empty", `No drips matching "${$("search").value.trim()}"`))
  const table = el("div", "table")
  const head = el("div", "tr head")
  head.append(el("span", "", "Drip"), el("span", "", "Recipe"), el("span", "status", "Status"))
  table.append(head)
  for (const drip of shown) {
    const tr = el("div", "tr row")
    tr.tabIndex = 0
    const play = el("button", "btn", "Play")
    play.type = "button"
    play.onclick = ev => {
      ev.stopPropagation()
      ask({ t: "play", recipe: drip.recipe })
    }
    const status = el("span", "status")
    status.append(play)
    tr.append(el("span", "icon", dripEmojis(drip.recipe)[0] || "✨"), el("span", "name", drip.name), el("span", "recipe", drip.recipe), status)
    tr.onclick = () => openEditor(drip.name, drip.recipe)
    tr.onkeydown = ev => ev.key === "Enter" && ev.target === tr && openEditor(drip.name, drip.recipe)
    table.append(tr)
  }
  list.append(table)
}

// ── The editor ──────────────────────────────────────────────────────────────
const fields = () => ({
  mode: $("mode").value,
  count: Number($("count-input").value),
  effects: [...$("effects").querySelectorAll("select")].map(s => s.value),
})

function drawPreview() {
  $("preview").textContent = buildRecipe(fields()) || "—"
}

function drawDetail(name, recipe) {
  const stack = el("div", "stack")
  const emojis = dripEmojis(recipe)
  for (const e of (emojis.length ? emojis : ["✨"]).slice(0, 4)) stack.append(el("span", "", e))
  $("detail").replaceChildren(stack, el("div", "title", name || "New drip"))
}

function addEffectRow(value = "") {
  const row = el("div", "effect")
  const select = el("select", "field")
  select.append(Object.assign(el("option", "", "Select effect..."), { value: "" }))
  for (const name of library.effects) select.append(Object.assign(el("option", "", name), { value: name }))
  if (value && !library.effects.includes(value)) select.append(Object.assign(el("option", "", value), { value }))
  select.value = value
  select.onchange = drawPreview
  const remove = el("button", "btn danger remove")
  remove.type = "button"
  remove.setAttribute("aria-label", "Remove effect")
  remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'
  remove.onclick = () => {
    row.remove()
    drawPreview()
  }
  row.append(select, remove)
  $("effects").append(row)
  drawPreview()
}

/** The editor's error line. */
function showError(text) {
  $("error").textContent = text
  $("error").classList.toggle("hidden", !text)
}

function openEditor(name, recipe) {
  editing = name
  $("name").value = name
  $("name").classList.remove("invalid")
  $("delete").classList.toggle("hidden", !name)
  showError("")
  drawDetail(name, recipe)
  const f = parseRecipe(recipe)
  $("mode").value = f.mode
  $("count-input").value = String(f.count)
  $("count-input").classList.toggle("hidden", f.mode !== "counted")
  $("effects").replaceChildren()
  for (const e of f.effects) addEffectRow(e)
  if (f.effects.length === 0) addEffectRow()
  drawPreview()
  for (const id of ["head", "toolbar", "list"]) $(id).classList.add("hidden")
  $("editor").classList.remove("hidden")
  $("name").focus()
}

/** Leaving the editor stops what it played: a looping preview never outlives it. */
function closeEditor() {
  ask({ t: "stop" })
  editing = null
  $("editor").classList.add("hidden")
  for (const id of ["head", "toolbar", "list"]) $(id).classList.remove("hidden")
  drawList()
}

function save() {
  const f = fields()
  const checked = checkDrip({ name: $("name").value, effects: f.effects })
  $("name").classList.toggle("invalid", "error" in checked && checked.field === "name")
  if ("error" in checked) return showError(checked.error)
  ask({ t: "save", name: checked.name, recipe: buildRecipe(f), original: editing || null })
  closeEditor()
}

function confirmDelete() {
  if (!editing) return
  $("confirm-title").textContent = `Delete “${editing}”?`
  $("confirm").classList.remove("hidden")
  $("confirm-no").focus()
}

$("add").onclick = () => openEditor("", "")
$("search").oninput = drawList
$("back").onclick = closeEditor
$("cancel").onclick = closeEditor
$("save").onclick = save
$("delete").onclick = confirmDelete
$("confirm-no").onclick = () => $("confirm").classList.add("hidden")
$("confirm-yes").onclick = () => {
  $("confirm").classList.add("hidden")
  ask({ t: "delete", name: editing })
  closeEditor()
}
$("play").onclick = () => {
  const recipe = buildRecipe(fields())
  if (fields().effects.some(Boolean)) ask({ t: "play", recipe })
}
$("stop").onclick = () => ask({ t: "stop" })
$("add-effect").onclick = () => addEffectRow()
$("mode").onchange = () => {
  $("count-input").classList.toggle("hidden", $("mode").value !== "counted")
  drawPreview()
}
$("count-input").oninput = drawPreview

// ── The licence ─────────────────────────────────────────────────────────────
// The mod tells the page the licence's state in words: unlocked, or locked
// until it is bought (a one-time price, per machine). Unlock, Cancel and Copy
// licence key go back to it; the buying and checking stay in the mod, and the
// licence itself never reaches the page.
let licence = null
const licenceAsk = action => api("/api/licence", { action }).catch(() => {})
const button = (label, cls, onclick) => Object.assign(el("button", `btn ${cls}`, label), { type: "button", onclick })

function drawLicence() {
  const bar = $("licence")
  bar.replaceChildren()
  if (licence?.kind === "licensed") bar.append(el("span", "plan", "Unlocked"), button("Copy licence key", "secondary", () => licenceAsk("copy")))
  const locked = $("locked")
  const isLocked = licence?.kind === "locked"
  locked.classList.toggle("hidden", !isLocked)
  $("app").classList.toggle("hidden", isLocked)
  if (!isLocked) return locked.replaceChildren()
  const card = el("div", "card")
  card.append(el("h1", "", licence.product), ...licence.about.map(line => el("p", "", line)))
  card.append(el("p", "ended", `${licence.product} is a one-time ${licence.price} for this machine.`))
  const row = el("div", "row-buttons")
  if (licence.isWaiting) row.append(el("span", "", licence.note || "Finish checkout in your browser…"), button("Cancel", "secondary", () => licenceAsk("cancel")))
  else row.append(button(`Unlock — ${licence.price}`, "primary", () => licenceAsk("buy")))
  card.append(row)
  if (licence.note && !licence.isWaiting) card.append(el("p", "small", licence.note))
  card.append(el("p", "small", `Bought it on another machine? ${licence.command} key <licence>`))
  locked.replaceChildren(card)
}

// ── Updates from the helper ─────────────────────────────────────────────────
async function loadLibrary() {
  library = await api("/api/library")
  if (editing === null) drawList()
}

const events = new EventSource(`/events?t=${T}`)
events.onmessage = ev => {
  const m = JSON.parse(ev.data)
  if (m.t === "library") return loadLibrary()
  if (m.t === "licence") {
    licence = m.status
    return drawLicence()
  }
}
loadLibrary().catch(() => {})
api("/api/licence-state").then(r => {
  licence = r.status ?? null
  drawLicence()
}, () => {})
