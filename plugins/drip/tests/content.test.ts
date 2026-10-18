import { describe, expect, test } from 'claude-code/testing'

import { GAME_BACKDROP } from '../hooks/arcade/games/shared.ts'
import { POLICY, kitScript, withKit } from '../hooks/content/kit.ts'
import { DRIP_SAFETY_MS, GAME_SAFETY_MS, loadDrips, loadGames, skippedText, type FolderDeps } from '../hooks/content/folders.ts'
import { ABOUT_MAX, COVER_MAX, PAGE_MAX, TITLE_MAX, checkDrip, checkGame, imageSize } from '../hooks/content/rules.js'
import { COVER, jpegCover, pngCover } from './cover.ts'

const PAGE = '<!doctype html><html><head><title>t</title></head><body><canvas></canvas><script>glyphh.score(3)</script></body></html>'
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1h2"/></svg>'
const game = (over: Partial<{ name: string; manifest: string | null; page: string | null; icon: string | null; cover: { file: string; base64: string } | null }> = {}) => ({
  name: 'snake',
  manifest: JSON.stringify({ title: 'Snake', author: 'octocat', about: 'Eat, grow' }),
  page: PAGE,
  icon: null,
  cover: COVER,
  ...over,
})

/** A home of folders, as path → text (a cover's text is its base64). */
function fsOf(files: Record<string, string>): FolderDeps {
  const dirs = new Set<string>()
  for (const p of Object.keys(files)) for (let d = p.slice(0, p.lastIndexOf('/')); d; d = d.slice(0, d.lastIndexOf('/'))) dirs.add(d)
  return {
    exists: async p => p in files || dirs.has(p),
    read: async p => {
      if (!(p in files)) throw new Error(`no ${p}`)
      return files[p]!
    },
    bytes: async p => {
      if (!(p in files)) throw new Error(`no ${p}`)
      return files[p]!
    },
    list: async p => {
      const kids = new Map<string, string>()
      for (const q of [...Object.keys(files), ...dirs]) {
        if (!q.startsWith(`${p}/`)) continue
        const rest = q.slice(p.length + 1)
        const [first] = rest.split('/')
        kids.set(first!, rest.includes('/') || dirs.has(`${p}/${first}`) ? 'dir' : 'file')
      }
      return [...kids].map(([name, kind]) => ({ name, kind }))
    },
  }
}

describe('the rules a game folder must pass', () => {
  test('a good game passes, its title and about trimmed', () => {
    const c = checkGame(game({ manifest: JSON.stringify({ title: '  Snake ', author: ' octocat ', about: ' Eat ' }), icon: ICON }))
    expect(c).toEqual({ ok: true, manifest: { title: 'Snake', author: 'octocat', about: 'Eat' }, page: PAGE, icon: ICON, cover: COVER })
    expect(checkGame(game({ manifest: JSON.stringify({ title: 'Snake', author: 'glyphh' }), cover: { file: 'cover.png', base64: pngCover(1920, 1200) } })).ok).toBe(true)
  })

  test('each rule a folder can break says which', () => {
    const why = (over: Parameters<typeof game>[0]) => {
      const c = checkGame(game(over))
      return c.ok ? 'ok' : c.why
    }
    expect(why({ name: 'Snake Game' })).toBe('its folder name "Snake Game" must be lowercase letters, digits and hyphens')
    expect(why({ manifest: null })).toBe('it has no game.json')
    expect(why({ page: null })).toBe('it has no game.html')
    expect(why({ page: 'x'.repeat(PAGE_MAX + 1) })).toBe('game.html is over 512 KB')
    for (const net of ['fetch("/x")', 'new XMLHttpRequest()', 'new WebSocket(u)', '<script src="https://x.io/a.js">', "url('//x.io/a.png')", '@import "a.css"', 'import("./m.js")']) {
      expect(why({ page: `<body>${net}</body>` })).toBe("game.html reaches the network, which isn't allowed")
    }
    expect(why({ manifest: '[1]' })).toBe('game.json is not a JSON object')
    expect(why({ manifest: '{' })).toBe('game.json is not a JSON object')
    expect(why({ manifest: '{}' })).toBe('game.json has no title')
    expect(why({ manifest: JSON.stringify({ title: 'x'.repeat(TITLE_MAX + 1), author: 'octocat' }) })).toBe(`game.json's title is over ${TITLE_MAX} characters`)
    expect(why({ manifest: JSON.stringify({ title: 'A', author: 'octocat', about: 'x'.repeat(ABOUT_MAX + 1) }) })).toBe(`game.json's about must be text of at most ${ABOUT_MAX} characters`)
    expect(why({ manifest: JSON.stringify({ title: 'A' }) })).toBe("game.json has no author (the maker's GitHub login)")
    expect(why({ manifest: JSON.stringify({ title: 'A', author: 7 }) })).toBe("game.json has no author (the maker's GitHub login)")
    for (const author of ['octo cat', '-octo', 'octo--cat', 'x'.repeat(40)]) expect(why({ manifest: JSON.stringify({ title: 'A', author }) })).toBe("game.json's author must be a GitHub login")
    expect(why({ cover: null })).toBe('it has no cover.jpg or cover.png (its picture)')
    expect(why({ cover: { file: 'cover.jpg', base64: '***' } })).toBe('cover.jpg could not be read')
    expect(why({ cover: { file: 'cover.jpg', base64: 'Q' } })).toBe('cover.jpg could not be read')
    expect(why({ cover: { file: 'cover.jpg', base64: btoa('x'.repeat(COVER_MAX + 1)) } })).toBe('cover.jpg is over 300 KB')
    expect(why({ cover: { file: 'cover.jpg', base64: pngCover() } })).toBe('cover.jpg is not a JPEG')
    expect(why({ cover: { file: 'cover.png', base64: jpegCover() } })).toBe('cover.png is not a PNG')
    expect(why({ cover: { file: 'cover.jpg', base64: btoa('just text, no picture') } })).toBe('cover.jpg is not a JPEG')
    expect(why({ cover: { file: 'cover.jpg', base64: jpegCover(320, 200) } })).toBe('cover.jpg is 320×200: it must be 480 to 1920 wide (960×600 is right)')
    expect(why({ cover: { file: 'cover.jpg', base64: jpegCover(3840, 2400) } })).toBe('cover.jpg is 3840×2400: it must be 480 to 1920 wide (960×600 is right)')
    expect(why({ cover: { file: 'cover.png', base64: pngCover(960, 960) } })).toBe('cover.png is 960×960: it must be 16:10 (960×600 is right)')
    expect(why({ icon: 'not svg' })).toBe('icon.svg is not an SVG')
    expect(why({ icon: '<svg onload="x()"></svg>' })).toBe('icon.svg has scripts or links')
    expect(why({ icon: `<svg>${'x'.repeat(16 * 1024)}</svg>` })).toBe('icon.svg is over 16 KB')
  })

  test('a drip needs a kind, one-shot or loop', () => {
    const drip = (manifest: object) => checkDrip({ name: 'snow', manifest: JSON.stringify(manifest), page: PAGE, icon: null, cover: COVER })
    expect(drip({ title: 'Snow', author: 'octocat', kind: 'loop' })).toEqual({ ok: true, manifest: { title: 'Snow', author: 'octocat', kind: 'loop' }, page: PAGE, icon: null, cover: COVER })
    expect(drip({ title: 'Snow', author: 'octocat' })).toEqual({ ok: false, why: 'drip.json\'s kind must be "one-shot" or "loop"' })
    expect(drip({ title: 'Snow', kind: 'loop' })).toEqual({ ok: false, why: "drip.json has no author (the maker's GitHub login)" })
    expect(drip({ kind: 'loop' })).toEqual({ ok: false, why: 'drip.json has no title' })
    expect(checkDrip({ name: 'snow', manifest: null, page: PAGE, icon: null, cover: COVER })).toEqual({ ok: false, why: 'it has no drip.json' })
    expect(checkDrip({ name: 'snow', manifest: '"x"', page: PAGE, icon: null, cover: COVER })).toEqual({ ok: false, why: 'drip.json is not a JSON object' })
    expect(checkDrip({ name: 'snow', manifest: JSON.stringify({ title: 'Snow', author: 'o', kind: 'loop' }), page: PAGE, icon: null, cover: null })).toEqual({ ok: false, why: 'it has no cover.jpg or cover.png (its picture)' })
  })

  test('an emoji, and a drip\'s line, are optional: one emoji, one short line', () => {
    const g = (m: object) => checkGame(game({ manifest: JSON.stringify({ title: 'Snake', author: 'octocat', ...m }) }))
    expect(g({ emoji: ' 🐍 ' })).toMatchObject({ ok: true, manifest: { emoji: '🐍' } })
    expect(g({ emoji: '☄️' })).toMatchObject({ ok: true, manifest: { emoji: '☄️' } })
    for (const emoji of ['snake', '', 7, '🐍'.repeat(7)]) expect(g({ emoji })).toEqual({ ok: false, why: "game.json's emoji must be one emoji" })
    const d = (m: object) => checkDrip({ name: 'snow', manifest: JSON.stringify({ title: 'Snow', author: 'o', kind: 'loop', ...m }), page: PAGE, icon: null, cover: COVER })
    expect(d({ about: ' Flakes fall ', emoji: '❄️' })).toMatchObject({ ok: true, manifest: { about: 'Flakes fall', emoji: '❄️' } })
    expect(d({ about: 'x'.repeat(ABOUT_MAX + 1) })).toEqual({ ok: false, why: `drip.json's about must be text of at most ${ABOUT_MAX} characters` })
  })

  test("a cover's kind and size are read from its header", () => {
    const bytes = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    expect(imageSize(bytes(pngCover(1200, 750)))).toEqual({ type: 'png', w: 1200, h: 750 })
    expect(imageSize(bytes(jpegCover(960, 600)))).toEqual({ type: 'jpeg', w: 960, h: 600 })
    // Padding (0xff 0xff) before a marker is passed over; a broken segment is not a JPEG; one with no frame is none.
    expect(imageSize(Uint8Array.from([0xff, 0xd8, 0xff, 0xff, 0xc0, 0, 17, 8, 2, 88, 3, 192, 3, 0, 0, 0]))).toEqual({ type: 'jpeg', w: 960, h: 600 })
    expect(imageSize(Uint8Array.from([0xff, 0xd8, 0x00, 0xe0, 0, 4, 0, 0, 0, 0, 0, 0, 0]))).toBeNull()
    expect(imageSize(Uint8Array.from([0xff, 0xd8, 0xff, 0xc4, 0, 2, 0xff, 0xd9, 0, 0, 0, 0, 0, 0]))).toBeNull()
    expect(imageSize(Uint8Array.from([1, 2, 3]))).toBeNull()
  })
})

describe('the kit', () => {
  test('the policy goes first in the head, the kit first in the body', () => {
    const html = withKit(PAGE, { kind: 'game', width: 800, height: 600, best: 42, quiet: false })
    expect(html.indexOf(`<meta http-equiv="Content-Security-Policy" content="${POLICY}">`)).toBe(html.indexOf('<head>') + '<head>'.length)
    expect(html.indexOf('<script>window.__dripsQuiet=false;')).toBe(html.indexOf('<body>') + '<body>'.length)
    expect(html).toContain('window.glyphh={width:800,height:600,best:42,opacity:1,')
  })

  test('a page with no head or body still gets both, in front', () => {
    const html = withKit('<canvas></canvas>', { kind: 'drip', width: 10, height: 20, opacity: 0.4, quiet: true })
    expect(html.startsWith(`<script>window.__dripsQuiet=true;`)).toBe(true)
    expect(html).toContain(`<meta http-equiv="Content-Security-Policy" content="${POLICY}"><canvas></canvas>`)
    expect(html).toContain('opacity:0.4,')
  })

  test('a game gets Esc and M; a drip, which never takes keys, does not', () => {
    expect(kitScript({ kind: 'game', width: 1, height: 1, quiet: false })).toContain('e.key==="Escape"')
    expect(kitScript({ kind: 'drip', width: 1, height: 1, quiet: false })).not.toContain('e.key==="Escape"')
    expect(kitScript({ kind: 'game', width: Number.NaN, height: 1, quiet: false })).toContain('width:0,')
  })

  test("a game sits on the backdrop and is fitted to Claude's window; a drip is neither", () => {
    const game = kitScript({ kind: 'game', width: 800, height: 600, quiet: false })
    expect(game).toContain(`html{background:${GAME_BACKDROP}!important}`)
    expect(game).toContain('var W=800,H=600,')
    expect(game).toContain('window.addEventListener("resize",fit)')
    const drip = kitScript({ kind: 'drip', width: 800, height: 600, quiet: false })
    expect(drip).not.toContain(GAME_BACKDROP)
    expect(drip).not.toContain('"resize"')
  })
})

describe('the folders', () => {
  const HOME = '/home/t'
  const G = `${HOME}/.glyphh/games`
  const D = `${HOME}/.glyphh/drips`

  test('games: the good ones, in name order, with the kit; the rest left out with the reason', async () => {
    const fs = fsOf({
      [`${G}/zap/game.json`]: JSON.stringify({ title: 'Zap', author: 'octocat' }),
      [`${G}/zap/game.html`]: PAGE,
      [`${G}/zap/cover.png`]: pngCover(),
      [`${G}/snake/game.json`]: JSON.stringify({ title: 'Snake', author: 'glyphh', about: 'Eat' }),
      [`${G}/snake/game.html`]: PAGE,
      [`${G}/snake/icon.svg`]: ICON,
      [`${G}/snake/cover.jpg`]: jpegCover(),
      [`${G}/snake/cover.png`]: pngCover(),
      [`${G}/blocks/game.json`]: JSON.stringify({ title: 'Mine' }),
      [`${G}/blocks/game.html`]: PAGE,
      [`${G}/broken/game.html`]: PAGE,
      [`${G}/readme.txt`]: 'not a folder',
    })
    let quiet = false
    const { games, skipped } = await loadGames(fs, G, new Set(['blocks']), () => quiet, true)
    expect(games.map(g => [g.name, g.title, g.icon, g.safetyMs, g.isYours])).toEqual([
      ['snake', 'Snake', ICON, GAME_SAFETY_MS, true],
      ['zap', 'Zap', null, GAME_SAFETY_MS, true],
    ])
    expect(games[0]!.about).toBe('Eat')
    expect(games.map(g => g.author)).toEqual(['glyphh', 'octocat'])
    expect(games[0]!.build(640, 480, 7)).toContain('window.glyphh={width:640,height:480,best:7,')
    quiet = true
    expect(games[0]!.build(640, 480, 7)).toContain('window.__dripsQuiet=true;')
    expect(skipped).toEqual([
      { name: 'blocks', why: 'a game already has that name' },
      { name: 'broken', why: 'it has no game.json' },
    ])
    expect(skippedText('~/.glyphh/games', skipped)).toBe('Left out ~/.glyphh/games/blocks: a game already has that name.\nLeft out ~/.glyphh/games/broken: it has no game.json.')
  })

  test('drips: the same, each with its kind', async () => {
    const fs = fsOf({
      [`${D}/snow/drip.json`]: JSON.stringify({ title: 'Snow', author: 'octocat', kind: 'loop' }),
      [`${D}/snow/drip.html`]: PAGE,
      [`${D}/snow/cover.jpg`]: jpegCover(),
      [`${D}/confetti/drip.json`]: JSON.stringify({ title: 'Mine', kind: 'one-shot' }),
      [`${D}/confetti/drip.html`]: PAGE,
    })
    const { drips, skipped } = await loadDrips(fs, D, new Set(['confetti']), true)
    expect(drips.map(d => [d.name, d.title, d.kind, d.author])).toEqual([['snow', 'Snow', 'loop', 'octocat']])
    expect(drips[0]!.build(10, 20, 0.3, true)).toContain('opacity:0.3,')
    expect(skipped).toEqual([{ name: 'confetti', why: 'a drip already has that name' }])
    expect(DRIP_SAFETY_MS).toBe(15_000)
  })

  test('no folder yet, or one that cannot be listed: nothing, and nothing left out', async () => {
    expect(await loadGames(fsOf({}), G, new Set(), () => false, true)).toEqual({ games: [], skipped: [] })
    const broken: FolderDeps = { exists: async () => true, list: async () => Promise.reject(new Error('denied')), read: async () => '', bytes: async () => '' }
    expect(await loadDrips(broken, D, new Set(), true)).toEqual({ drips: [], skipped: [] })
  })
})
