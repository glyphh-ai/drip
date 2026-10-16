// Copied from shared/unlock/hooks.tsx by scripts/sync-shared.mjs: edit it there.
// The licence, wired to the engine: the one file of this module that holds
// `$` and the licence's state (the engine follows `$` and atoms only within
// the file whose hook received them). It adds `/<COMMAND> unlock` (buy it)
// and `/<COMMAND> key <licence>` (a licence from another machine) to the
// mod's command, and shows the licence in the mod's page: every second it
// sends the page's helper the licence's state in words (pageStatus, never the
// licence) when that changed, and takes what the page asked (Unlock, Cancel,
// Copy licence key). Commands it gates check `refusal()` from ./access
// themselves, reading this same state. A row of the mod's command that
// answered with that refusal draws as the locked card: the Glyphh logo, the
// row's text, and Unlock, which opens checkout as /<COMMAND> unlock does.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, Timer } from 'claude-code'

import type { HelperInfo } from '../../types'
import { INITIAL, PAGE_ACTIONS, pageStatus, refusal, type PageAction } from './access.ts'
import { COMMAND, MOD, PRICE, PRODUCT } from './config.ts'
import { accept, buy, cancel, start, type Deps } from './flow.ts'
import { LOGO_ALT, LOGO_SVG } from './logo.ts'
import { verify } from './verify.ts'

// The engine reads a state reference's plugin and key, and a hook's matcher,
// as literals, so the mod's name ('glyphh-drip', MOD in ./config) and its command
// ('drip', COMMAND) are written out here too: scripts/sync-shared.mjs
// writes them in from ./config.
const licence = atom({ plugin: 'glyphh-drip', key: 'licence' } as const, INITIAL)
/** Where the mod's page helper listens (the mod keeps it; read here only). */
const helperInfo = atom({ plugin: 'glyphh-drip', key: 'helper' } as const, null as HelperInfo | null)

/** What the page was last sent, and the timer that keeps it current. */
let sent = ''
let syncing: Timer | null = null

function deps($: EngineInterface): Deps {
  return {
    store: {
      get: key => $.store.get(key),
      set: (key, value) => $.store.set(key, value),
      delete: key => $.store.delete(key),
    },
    state: { get: () => read($, licence), set: async fn => void (await update($, licence, fn)) },
    now: () => $.clock.now(),
    every: (ms, fn) => $.clock.every(ms, () => void fn()),
    check: async text => (await verify(text, MOD)) !== null,
    fetch: url => $.http.fetch(url),
    open: async url => (await $.process.run(['open', url]).catch(() => null))?.exitCode === 0,
    copy: async text => (await $.ui.copy({ text })).isCopied,
    toast: (text, ms) => $.ui.toast(text, ms ? { timeoutMs: ms } : undefined),
    log: text => $.ui.log(text),
  }
}

/** One request to the page's helper, with its token. */
async function ask($: EngineInterface, info: HelperInfo, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await $.http.fetch(`http://127.0.0.1:${info.port}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'X-Token': info.token, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!res.ok) throw new Error(`the page's helper answered ${path} with an error`)
  return JSON.parse(res.text) as Record<string, unknown>
}

/** What the page asked of the licence. */
async function act($: EngineInterface, action: PageAction): Promise<void> {
  const d = deps($)
  if (action === 'buy') await buy(d)
  else if (action === 'cancel') await cancel(d)
  else {
    const held = (await read($, licence)).licence
    const r = held ? await $.ui.copy({ text: held }) : { isCopied: false }
    $.ui.toast(r.isCopied ? 'Licence key copied.' : 'The licence key could not be copied here.')
  }
}

/** The page's helper and the licence in step: its asks taken, its state sent when changed. */
async function sync($: EngineInterface): Promise<void> {
  const info = await read($, helperInfo)
  if (!info) {
    sent = ''
    return
  }
  const asked = ((await ask($, info, '/api/licence-inbox')).actions as unknown[] | undefined) ?? []
  for (const a of asked) if ((PAGE_ACTIONS as readonly unknown[]).includes(a)) await act($, a as PageAction)
  const status = JSON.stringify(pageStatus(await read($, licence)))
  if (status === sent) return
  await ask($, info, '/api/licence-state', { status: JSON.parse(status) })
  sent = status
}

/** The line every locked answer of the mod's command ends with. */
const LOCKED = refusal(INITIAL)!

export function licensing(on: On) {
  // Two values that between them match every session: a plugin has one
  // session.start hook without a matcher, and that one is the mod's own.
  on('session.start', { isInteractive: [true, false] }, async ($, e, next) => {
    await start(deps($))
    sent = ''
    syncing?.cancel()
    syncing = $.clock.every(1000, () => {
      sync($).catch(() => {
        sent = '' // the helper went away: a new one is sent everything
      })
    })
    return next(e)
  })

  on('command.run', { command: 'drip' }, async ($, e, next) => {
    const words = e.args.trim().split(/\s+/)
    if (words[0] === 'unlock') {
      if ((await read($, licence)).licence) return { text: `${PRODUCT} is already unlocked on this machine.` }
      await buy(deps($))
      if ((await read($, licence)).licence) return { text: `${PRODUCT} unlocked: it was already paid for on this machine.` }
      return { text: `Checkout for ${PRODUCT} (${PRICE}, once) is open in your browser. ${PRODUCT} unlocks on its own when you've paid.` }
    }
    if (words[0] !== 'key') return next(e)
    if (words.length !== 2) return { text: `Usage: /${COMMAND} key <licence>` }
    const ok = await accept(deps($), words[1]!)
    return { text: ok ? `${PRODUCT} unlocked.` : 'That licence key did not check out.' }
  })

  // The locked card: a row of the mod's command that answered locked. It
  // follows the licence, so pressing Unlock shows the wait, then unlocked.
  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    if (e.props.command !== 'drip' || e.props.isErrored || !e.props.text.includes(LOCKED)) return next(e)
    const els = $.ui.resolve(e)
    const { Box, Text, Button, Markdown } = els
    const state = await read($, licence)
    const text = e.props.text.replace(LOCKED, '').trim()
    // Every surface but the terminal draws SVG; the terminal gets the name in words.
    const logo = e.surface !== 'terminal' && 'Svg' in els ? <els.Svg source={LOGO_SVG} alt={LOGO_ALT} height={22} /> : <Text bold>{LOGO_ALT}</Text>
    const action = state.licence ? (
      <Text>✓ {PRODUCT} is unlocked on this machine.</Text>
    ) : state.isWaiting ? (
      <Box flexDirection="row" gap={2} alignItems="center">
        <Text dimColor>{state.note ?? 'Waiting for checkout…'}</Text>
        <Button key="cancel" label="Cancel" plain onPress={() => void cancel(deps($))} />
      </Box>
    ) : (
      <Box flexDirection="row" gap={2} alignItems="center">
        <Button key="unlock" label={`Unlock ${PRODUCT}`} variant="primary" onPress={() => void buy(deps($))} />
        <Text dimColor>{PRICE}, once, for this machine</Text>
      </Box>
    )
    return (
      <Box flexDirection="column" gap={1} padding={1} borderStyle="round" borderDimColor>
        {logo}
        {text ? <Markdown text={text} /> : null}
        {action}
      </Box>
    )
  })
}
