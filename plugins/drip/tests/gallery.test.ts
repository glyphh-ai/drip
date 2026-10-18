import { describe, expect, test } from 'claude-code/testing'

import { GALLERY, GALLERY_API, MARK, get, listing } from '../hooks/content/gallery.ts'
import { jpegCover } from './cover.ts'
import { NEEDS_GH, REPO, share, type Run } from '../hooks/content/share.ts'

const PAGE = '<html><head></head><body><canvas></canvas></body></html>'
const HOME = '/home/t'
const INDEX = JSON.stringify({
  v: 1,
  games: [{ name: 'snake', title: 'Snake', files: ['game.json', 'game.html', 'cover.jpg', 'icon.svg', '../../evil.sh'] }],
  drips: [{ name: 'snow', title: 'Snow', kind: 'one-shot', files: ['drip.json', 'drip.html', 'cover.jpg'] }],
})

const COVER = jpegCover()

/** The gallery as raw.githubusercontent.com serves it, path → text; a cover's
 *  text is its base64, which GitHub's API hands over (wrapped, as it does). */
function web(files: Record<string, string>) {
  const asked: string[] = []
  return {
    asked,
    fetch: async (url: string) => {
      asked.push(url)
      if (url.startsWith(GALLERY_API)) {
        const at = url.slice(GALLERY_API.length + 1).replace(/\?ref=main$/, '')
        if (!(at in files)) return { ok: false, status: 404, text: '' }
        return { ok: true, status: 200, text: files[at] === 'junk' ? 'junk' : JSON.stringify({ encoding: 'base64', content: files[at]!.replace(/(.{20})/g, '$1\n') }) }
      }
      const at = url.slice(GALLERY.length + 1)
      return at in files ? { ok: true, status: 200, text: files[at]! } : { ok: false, status: 404, text: '' }
    },
  }
}

describe('/drip get', () => {
  const GALLERY_FILES = {
    'index.json': INDEX,
    'games/snake/game.json': JSON.stringify({ title: 'Snake', author: 'octo' }),
    'games/snake/game.html': PAGE,
    'games/snake/cover.jpg': COVER,
    'games/snake/icon.svg': '<svg xmlns="http://www.w3.org/2000/svg"><path d="M1 1"/></svg>',
    'drips/snow/drip.json': JSON.stringify({ title: 'Snow', author: 'drip', kind: 'one-shot' }),
    'drips/snow/drip.html': PAGE,
    'drips/snow/cover.jpg': COVER,
  }

  test('a game: its files, checked, into ~/.drip/games; only the files a game may have', async () => {
    const w = web(GALLERY_FILES)
    const written: Record<string, string> = {}
    const bytes: Record<string, string> = {}
    const said = await get({ fetch: w.fetch, write: async (p, t) => void (written[p] = t), writeBytes: async (p, b) => ((bytes[p] = b), true) }, HOME, 'Snake', new Set())
    expect(said).toBe('Got Snake: /drip snake plays it.')
    expect(Object.keys(written).sort()).toEqual([`${HOME}/.drip/games/snake/${MARK}`, `${HOME}/.drip/games/snake/game.html`, `${HOME}/.drip/games/snake/game.json`, `${HOME}/.drip/games/snake/icon.svg`])
    expect(written[`${HOME}/.drip/games/snake/${MARK}`]).toBe('timmetim/drip\n') // the gallery's, not the person's
    expect(bytes).toEqual({ [`${HOME}/.drip/games/snake/cover.jpg`]: COVER })
    expect(w.asked).toContain(`${GALLERY_API}/games/snake/cover.jpg?ref=main`)
    expect(w.asked.some(u => u.includes('evil'))).toBe(false)
  })

  test('a drip goes to ~/.drip/drips', async () => {
    const written: string[] = []
    const said = await get({ fetch: web(GALLERY_FILES).fetch, write: async p => void written.push(p), writeBytes: async p => (written.push(p), true) }, HOME, 'snow', new Set())
    expect(said).toBe('Got Snow: /drip snow plays it.')
    expect(written).toEqual([`${HOME}/.drip/drips/snow/drip.json`, `${HOME}/.drip/drips/snow/drip.html`, `${HOME}/.drip/drips/snow/${MARK}`, `${HOME}/.drip/drips/snow/cover.jpg`])
  })

  test('the listing the pane shows; none when the gallery can\'t be read', async () => {
    const index = await listing({ fetch: web(GALLERY_FILES).fetch })
    expect(index?.games.map(g => g.name)).toEqual(['snake'])
    expect(await listing({ fetch: web({}).fetch })).toBeNull()
    expect(await listing({ fetch: () => Promise.reject(new Error('offline')) })).toBeNull()
  })

  test('what it says when it cannot', async () => {
    const none = async () => {}
    const at = (files: Record<string, string>) => ({ fetch: web(files).fetch, write: none, writeBytes: async () => true })
    expect(await get(at(GALLERY_FILES), HOME, 'Bad Name', new Set())).toBe('A name is lowercase letters, digits and hyphens: /drip get snake.')
    expect(await get(at(GALLERY_FILES), HOME, 'blocks', new Set(['blocks']))).toBe('blocks comes with Drip: /drip blocks plays it.')
    expect(await get(at({}), HOME, 'snake', new Set())).toBe("Couldn't reach the gallery (404). Try again in a moment.")
    expect(await get({ fetch: () => Promise.reject(new Error('offline')), write: none, writeBytes: async () => true }, HOME, 'snake', new Set())).toBe("Couldn't reach the gallery. Try again in a moment.")
    expect(await get(at({ 'index.json': 'nope' }), HOME, 'snake', new Set())).toBe("The gallery's index didn't read. Try again later.")
    expect(await get(at(GALLERY_FILES), HOME, 'pong', new Set())).toBe('No game or drip called "pong" in the gallery.')
    const { ['games/snake/icon.svg']: _icon, ...noIcon } = GALLERY_FILES
    expect(await get(at(noIcon), HOME, 'snake', new Set())).toBe("Couldn't fetch icon.svg for snake (404). Try again in a moment.")
    const { ['games/snake/cover.jpg']: _cover, ...noCover } = GALLERY_FILES
    expect(await get(at(noCover), HOME, 'snake', new Set())).toBe("Couldn't fetch cover.jpg for snake (404). Try again in a moment.")
    expect(await get(at({ ...GALLERY_FILES, 'games/snake/cover.jpg': 'junk' }), HOME, 'snake', new Set())).toBe("Couldn't fetch cover.jpg for snake (200). Try again in a moment.")
    const offline = { fetch: async (u: string) => (u.startsWith(GALLERY_API) ? Promise.reject(new Error('offline')) : web(GALLERY_FILES).fetch(u)), write: none, writeBytes: async () => true }
    expect(await get(offline, HOME, 'snake', new Set())).toBe("Couldn't fetch cover.jpg for snake. Try again in a moment.")
    const noIndexCover = { ...GALLERY_FILES, 'index.json': JSON.stringify({ v: 1, games: [{ name: 'snake', title: 'Snake', files: ['game.json', 'game.html'] }], drips: [] }) }
    expect(await get(at(noIndexCover), HOME, 'snake', new Set())).toBe("The gallery's snake doesn't pass the check (it has no cover.jpg or cover.png (its picture)), so it wasn't kept.")
    expect(await get({ ...at(GALLERY_FILES), writeBytes: async () => false }, HOME, 'snake', new Set())).toBe("Couldn't save snake's cover. Try again in a moment.")
    const bad = { ...GALLERY_FILES, 'games/snake/game.html': '<body>fetch("x")</body>' }
    expect(await get(at(bad), HOME, 'snake', new Set())).toBe("The gallery's snake doesn't pass the check (game.html reaches the network, which isn't allowed), so it wasn't kept.")
  })
})

describe('/drip share', () => {
  const OWN: Record<string, string> = {
    [`${HOME}/.drip/games/snake/game.json`]: JSON.stringify({ title: 'Snake', author: 'Octo' }),
    [`${HOME}/.drip/games/snake/game.html`]: PAGE,
    [`${HOME}/.drip/games/snake/cover.jpg`]: COVER,
  }

  /** gh as GitHub would answer, signed in as `octo`; `fail` makes one step fail. */
  function gh(fail?: string) {
    const ran: { argv: string[]; stdin?: string }[] = []
    const run: Run = async (argv, opts) => {
      ran.push({ argv, ...(opts?.stdin !== undefined ? { stdin: opts.stdin } : {}) })
      const [cmd, ...a] = argv
      const line = a.join(' ')
      const ok = (stdout = '') => ({ exitCode: 0, stdout, stderr: '' })
      const no = (stderr: string) => ({ exitCode: 1, stdout: '', stderr })
      if (fail && line.startsWith(fail)) return no(`${fail} failed`)
      if (cmd === '/usr/bin/base64') return ok(btoa(opts?.stdin ?? '') + '\n')
      if (cmd !== 'gh') return null
      if (line === '--version' || line === 'auth status') return ok()
      if (line.startsWith('api user')) return ok('octo\n')
      if (line.startsWith('repo fork') || line.startsWith('repo sync')) return ok()
      if (line.startsWith('api repos/octo/drip/git/ref/heads/main')) return ok('abc123\n')
      if (line.startsWith('api repos/octo/drip/git/refs')) return ok()
      if (line.startsWith('api repos/octo/drip/contents/') && !line.includes('-X')) return no('Not Found')
      if (line.startsWith('api -X PUT')) return ok()
      if (line.startsWith('pr create')) return ok('https://github.com/timmetim/drip/pull/7\n')
      return no(`unexpected: ${line}`)
    }
    return { ran, run }
  }
  const deps = (run: Run) => ({
    run,
    exists: async (p: string) => p in OWN,
    read: async (p: string) => OWN[p]!,
    bytes: async (p: string) => OWN[p]!,
    now: async () => 1700,
  })

  test('forks, syncs, branches, adds each file, opens the pull request, and says its link', async () => {
    const g = gh()
    expect(await share(deps(g.run), HOME, 'snake')).toBe("Shared Snake: https://github.com/timmetim/drip/pull/7. Once it's merged, anyone can /drip get snake.")
    const lines = g.ran.map(r => r.argv.join(' '))
    expect(lines).toContain(`gh repo fork ${REPO} --clone=false`)
    expect(lines).toContain(`gh repo sync octo/drip --source ${REPO} --branch main`)
    const branch = g.ran.find(r => r.argv.join(' ') === 'gh api repos/octo/drip/git/refs --input -')!
    expect(JSON.parse(branch.stdin!)).toEqual({ ref: 'refs/heads/game-snake-1700', sha: 'abc123' })
    const puts = g.ran.filter(r => r.argv.includes('PUT'))
    expect(puts.map(r => r.argv.at(-3))).toEqual(['repos/octo/drip/contents/games/snake/game.json', 'repos/octo/drip/contents/games/snake/game.html', 'repos/octo/drip/contents/games/snake/cover.jpg'])
    expect(atob(JSON.parse(puts[1]!.stdin!).content)).toBe(PAGE)
    expect(JSON.parse(puts[2]!.stdin!).content).toBe(COVER)
    expect(lines.find(l => l.startsWith('gh pr create'))).toContain(`--head octo:game-snake-1700 --base main --title Game: Snake`)
  })

  test('no gh, or not signed in: says what to install, shares nothing', async () => {
    const none: Run = async () => null
    expect(await share(deps(none), HOME, 'snake')).toBe(NEEDS_GH)
    const g = gh('auth status')
    expect(await share(deps(g.run), HOME, 'snake')).toBe(NEEDS_GH)
    expect(g.ran.some(r => r.argv.includes('fork'))).toBe(false)
  })

  test('not one of theirs, or one that fails the check: nothing runs', async () => {
    const g = gh()
    expect(await share(deps(g.run), HOME, 'pong')).toBe('No game or drip of yours called "pong" (they live in ~/.drip/games and ~/.drip/drips).')
    OWN[`${HOME}/.drip/games/snake/game.html`] = '<body>fetch("x")</body>'
    expect(await share(deps(g.run), HOME, 'snake')).toBe("snake doesn't pass the check (game.html reaches the network, which isn't allowed), so it wasn't shared.")
    OWN[`${HOME}/.drip/games/snake/game.html`] = PAGE
    OWN[`${HOME}/.drip/games/snake/game.json`] = JSON.stringify({ title: 'Snake', author: 'drip' })
    expect(await share(deps(g.run), HOME, 'snake')).toBe('snake\'s author is "drip", which is Drip\'s own: put your GitHub login in game.json.')
    expect(g.ran).toEqual([])
    OWN[`${HOME}/.drip/games/snake/game.json`] = JSON.stringify({ title: 'Snake', author: 'someone' })
    expect(await share(deps(g.run), HOME, 'snake')).toBe('snake\'s author is "someone", but you\'re signed in to GitHub as octo: only its maker shares it.')
    expect(g.ran.some(r => r.argv.includes('fork'))).toBe(false)
    OWN[`${HOME}/.drip/games/snake/game.json`] = JSON.stringify({ title: 'Snake', author: 'Octo' })
  })

  test('a step GitHub refuses is said, and nothing after it runs', async () => {
    for (const [step, said] of [
      ['repo sync', "Couldn't bring your fork octo/drip up to date: repo sync failed"],
      ['api repos/octo/drip/git/refs', "Couldn't make a branch on octo/drip: api repos/octo/drip/git/refs failed"],
      ['api -X PUT', "Couldn't add game.json to octo/drip: api -X PUT failed"],
      ['pr create', "Couldn't open the pull request: pr create failed"],
    ] as const) {
      const g = gh(step)
      expect(await share(deps(g.run), HOME, 'snake')).toBe(said)
    }
  })
})
