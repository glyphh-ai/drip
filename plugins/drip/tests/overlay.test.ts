import { describe, expect, test } from 'claude-code/testing'

import {
  OVERLAY_CAP_MS,
  OVERLAY_MIN_MS,
  binaryPath,
  clampMs,
  compileArgv,
  digestOf,
  lineSplitter,
  parseAncestors,
  parseEvent,
  parseLocated,
  parseScreen,
  playRequest,
  windowRequest,
} from '../hooks/overlay/overlay.ts'

describe("the native overlay's protocol", () => {
  test('screen: one JSON line of the screen under the pointer', () => {
    expect(parseScreen('{"x":0,"y":0,"w":3440,"h":1440}\n')).toEqual({ x: 0, y: 0, w: 3440, h: 1440 })
    expect(parseScreen('{"x":-1512,"y":200,"w":1512,"h":982}')).toEqual({ x: -1512, y: 200, w: 1512, h: 982 })
    expect(parseScreen('{"x":0,"y":0,"w":0,"h":10}')).toBeNull()
    expect(parseScreen('{"x":"0","y":0,"w":1,"h":1}')).toBeNull()
    expect(parseScreen('garbage')).toBeNull()
  })

  test('play reads one request on stdin: its frame, layer and the window it follows; its time clamped to the cap', () => {
    const frame = { x: 0, y: 0, w: 100, h: 50 }
    expect(JSON.parse(playRequest('<html></html>', frame, 8000, 'window', 79026))).toEqual({ v: 2, html: '<html></html>', frame, closeAfterMs: 8000, layer: 'window', follow: 79026, interactive: false })
    expect(JSON.parse(playRequest('', frame, 8000, 'window', null, true)).interactive).toBe(true)
    expect(JSON.parse(playRequest('', frame, 8000, 'screen', null))).toMatchObject({ layer: 'screen', follow: null })
    expect(JSON.parse(playRequest('', frame, 99 * 60_000, 'window', null)).closeAfterMs).toBe(OVERLAY_CAP_MS)
    expect(clampMs(5)).toBe(OVERLAY_MIN_MS)
    expect(clampMs(Number.NaN)).toBe(OVERLAY_CAP_MS)
    expect(clampMs(1234.6)).toBe(1235)
  })

  test('apps: the apps among its ancestors, nearest first; junk passed over', () => {
    const line = JSON.stringify({
      ancestors: [
        { pid: 48475, bundleId: 'com.anthropic.claude-code', regular: false },
        { pid: 48036, bundleId: 'com.anthropic.claudefordesktop', regular: true },
        { pid: 0, bundleId: 'x', regular: true },
        { pid: 5, bundleId: '', regular: true },
        { pid: 6, regular: true },
        null,
        { pid: 7, bundleId: 'org.example.app' },
      ],
    })
    expect(parseAncestors(line)).toEqual([
      { pid: 48475, bundleId: 'com.anthropic.claude-code', regular: false },
      { pid: 48036, bundleId: 'com.anthropic.claudefordesktop', regular: true },
      { pid: 7, bundleId: 'org.example.app', regular: false },
    ])
    expect(parseAncestors('{"ancestors":"no"}')).toEqual([])
    expect(parseAncestors('garbage')).toEqual([])
  })

  test('window: reads the target on stdin; prints the window found, or the screen under the pointer', () => {
    const target = { surface: 'desktop', bundleId: 'com.anthropic.claudefordesktop', pid: 48036, pick: 'largest' } as const
    expect(JSON.parse(windowRequest(target))).toEqual({ v: 2, target })
    expect(parseLocated('{"found":true,"id":79026,"x":799,"y":298,"w":1325,"h":1138}')).toEqual({ found: true, id: 79026, frame: { x: 799, y: 298, w: 1325, h: 1138 } })
    expect(parseLocated('{"found":false,"x":0,"y":0,"w":1440,"h":900}')).toEqual({ found: false, frame: { x: 0, y: 0, w: 1440, h: 900 } })
    expect(parseLocated('{"found":true,"x":0,"y":0,"w":1440,"h":900}')).toBeNull() // found, but no window id
    expect(parseLocated('{"x":0,"y":0,"w":1440,"h":900}')).toBeNull()
    expect(parseLocated('{"found":true,"id":1,"x":0,"y":0,"w":0,"h":900}')).toBeNull()
    expect(parseLocated('garbage')).toBeNull()
  })

  test("the overlay's events: shown with its pid, closed with why, or an error", () => {
    expect(parseEvent('{"t":"shown","pid":4242}')).toEqual({ t: 'shown', pid: 4242 })
    expect(parseEvent('{"t":"closed","why":"signal"}')).toEqual({ t: 'closed', why: 'signal' })
    for (const why of ['timeout', 'term', 'orphan']) expect(parseEvent(`{"t":"closed","why":"${why}"}`)).toEqual({ t: 'closed', why } as never)
    expect(parseEvent('{"t":"error","message":"not a play request"}')).toEqual({ t: 'error', message: 'not a play request' })
    expect(parseEvent('{"t":"score","score":120}')).toEqual({ t: 'score', score: 120 })
    for (const bad of ['-1', '1.5', '"9"', 'null']) expect(parseEvent(`{"t":"score","score":${bad}}`)).toBeNull()
    expect(parseEvent('{"t":"closed","why":"bored"}')).toBeNull()
    expect(parseEvent('{"t":"shown","pid":0}')).toBeNull()
    expect(parseEvent('{"t":"other"}')).toBeNull()
    expect(parseEvent('not json')).toBeNull()
  })

  test('lines arrive in pieces and are put back together', () => {
    const split = lineSplitter()
    expect(split('{"t":"sho')).toEqual([])
    expect(split('wn","pid":1}\n{"t":')).toEqual(['{"t":"shown","pid":1}'])
    expect(split('"closed","why":"term"}\n\n')).toEqual(['{"t":"closed","why":"term"}'])
  })

  test('the binary is kept per version of its source, built by swiftc against AppKit and WebKit', async () => {
    const digest = await digestOf('print(1)')
    expect(digest).toMatch(/^[0-9a-f]{16}$/)
    expect(await digestOf('print(2)')).not.toBe(digest)
    expect(binaryPath('/Users/t/', digest)).toBe(`/Users/t/Library/Caches/glyphh-overlay/overlay-${digest}`)
    expect(compileArgv('a.swift', 'out')).toEqual(['xcrun', '--sdk', 'macosx', 'swiftc', '-O', '-o', 'out', 'a.swift', '-framework', 'AppKit', '-framework', 'WebKit'])
  })
})
