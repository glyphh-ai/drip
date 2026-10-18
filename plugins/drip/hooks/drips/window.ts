// Opening the Drips page (the saved drips and the editor), a local page in
// the desktop app's Browser pane: by Claude_Browser's preview_start; where the app refuses that call, Claude is
// asked to open it, with a one-time address only; outside the desktop app,
// in the person's own browser. Works on PageDeps, closures over `$` that
// ./hooks.tsx hands it.
import type { McpToolResult } from 'claude-code'

import type { Link } from './link.ts'

/** One state value: read it, or change it from what it is. */
export type Value<T> = { get(): Promise<T>; set(fn: (v: T) => T): Promise<void> }

export type PageDeps = {
  isDesktop(): Promise<boolean>
  mcp(server: string, tool: string, args: Record<string, unknown>): Promise<McpToolResult>
  /** Opens an address in the person's default browser; false when it could not. */
  openExternal(url: string): Promise<boolean>
  /** Asks Claude, as a prompt of its own once the command in progress is done. */
  ask(text: string): void
  /** The running helper, started when it is not. */
  link(): Promise<Link>
  /** The Browser pane's tab that shows the page. */
  tab: Value<string | null>
}

export type Shown = 'open' | 'opened' | 'asked' | 'external'

const textOf = (r: McpToolResult) => r.content.map(b => b.text ?? '').join('\n')

async function browser(d: PageDeps, tool: string, args: Record<string, unknown>): Promise<string> {
  const r = await d.mcp('Claude_Browser', tool, args)
  if (r.isError) throw new Error(textOf(r) || `${tool} failed`)
  return textOf(r)
}

/** The page on screen: already open (its tab brought to the front), opened, or asked for. */
export async function showPage(d: PageDeps): Promise<Shown> {
  const link = await d.link()
  const desktop = await d.isDesktop()
  const known = await d.tab.get()
  if ((await link.state()).open > 0) {
    if (desktop && known) await d.mcp('Claude_Browser', 'tabs_select', { tabId: known }).catch(() => undefined)
    return 'open'
  }
  const url = await link.pageUrl()
  if (!desktop) {
    if (await d.openExternal(url)) return 'external'
    throw new Error(`Open this page in your browser (it opens once): ${url}`)
  }
  if (known) await d.mcp('Claude_Browser', 'tabs_close', { tabId: known }).catch(() => undefined)
  try {
    const text = await browser(d, 'preview_start', { url })
    const tab = /"tabId":\s*"([^"]+)"/.exec(text)?.[1] ?? null
    await d.tab.set(() => tab)
    return 'opened'
  } catch {
    await d.tab.set(() => null)
    d.ask(`Open this page in the browser pane (it opens once): ${url}`)
    return 'asked'
  }
}

export function shownText(how: Shown): string {
  if (how === 'asked') return 'Drips page: Claude is asked to open it'
  if (how === 'external') return 'Drips page: opened in your browser'
  return 'Drips page ✓'
}
