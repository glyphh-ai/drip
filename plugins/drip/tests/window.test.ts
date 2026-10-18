import { describe, expect, test } from 'claude-code/testing'

import type { HelperState, Link } from '../hooks/drips/link.ts'
import { showPage, shownText, type PageDeps } from '../hooks/drips/window.ts'
import { mcpText, value } from './fakes.ts'

function world(opts: { desktop?: boolean; refuses?: boolean; external?: boolean } = {}) {
  const state: HelperState = { version: 'v', open: 0 }
  const calls: string[] = []
  const asked: string[] = []
  const opened: string[] = []
  const link: Link = {
    state: async () => ({ ...state }),
    pageUrl: async () => 'http://127.0.0.1:4100/?k=once',
    library: async () => {},
    inbox: async () => [],
    quit: async () => {},
  }
  const tab = value<string | null>(null)
  const d: PageDeps = {
    isDesktop: async () => opts.desktop ?? true,
    mcp: async (server, tool, args) => {
      calls.push(`${server}.${tool} ${JSON.stringify(args)}`)
      if (opts.refuses && tool === 'preview_start') return mcpText('Not allowed', true)
      return tool === 'preview_start' ? mcpText('{"tabId": "t9"}') : mcpText('ok')
    },
    openExternal: async url => {
      opened.push(url)
      return opts.external ?? true
    },
    ask: text => void asked.push(text),
    link: async () => link,
    tab,
  }
  return { d, state, calls, asked, opened, tab }
}

describe('opening the Drips page', () => {
  test('in the Browser pane by preview_start, with a one-time address; its tab kept', async () => {
    const { d, calls, tab } = world()
    expect(await showPage(d)).toBe('opened')
    expect(calls).toEqual(['Claude_Browser.preview_start {"url":"http://127.0.0.1:4100/?k=once"}'])
    expect(tab.now()).toBe('t9')
  })

  test('already open: its tab brought to the front, nothing opened again', async () => {
    const { d, calls, state, tab } = world()
    state.open = 1
    await tab.set(() => 't9')
    expect(await showPage(d)).toBe('open')
    expect(calls).toEqual(['Claude_Browser.tabs_select {"tabId":"t9"}'])
  })

  test('a page closed since: its old tab closed first', async () => {
    const { d, calls, tab } = world()
    await tab.set(() => 'old')
    await showPage(d)
    expect(calls[0]).toBe('Claude_Browser.tabs_close {"tabId":"old"}')
  })

  test('where the app refuses preview_start, Claude is asked, with only the one-time address', async () => {
    const { d, asked, tab } = world({ refuses: true })
    expect(await showPage(d)).toBe('asked')
    expect(asked).toEqual(['Open this page in the browser pane (it opens once): http://127.0.0.1:4100/?k=once'])
    expect(tab.now()).toBeNull()
  })

  test("outside the desktop app: the person's own browser, or the address to open", async () => {
    const { d, opened, calls } = world({ desktop: false })
    expect(await showPage(d)).toBe('external')
    expect(opened).toEqual(['http://127.0.0.1:4100/?k=once'])
    expect(calls).toEqual([])
    await expect(showPage(world({ desktop: false, external: false }).d)).rejects.toThrow('Open this page in your browser (it opens once): http://127.0.0.1:4100/?k=once')
  })

  test('what each says', () => {
    expect(shownText('open')).toBe('Drips page ✓')
    expect(shownText('opened')).toBe('Drips page ✓')
    expect(shownText('asked')).toBe('Drips page: Claude is asked to open it')
    expect(shownText('external')).toBe('Drips page: opened in your browser')
  })
})
