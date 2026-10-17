// /drip share <name>: one of the person's own games or drips, sent to the
// gallery (glyphh-ai/drip) as a pull request, all from the plugin. It runs
// the GitHub command-line tool, signed in as the person: their fork of the
// gallery, synced; a branch; the folder's files; the pull request. We review
// and merge it there; from then on anyone can /drip get it.
import { checkDrip, checkGame } from './rules.js'

/** The gallery's repository on GitHub. */
export const REPO = 'glyphh-ai/drip'

export type Run = (argv: string[], opts?: { stdin?: string; timeoutMs?: number }) => Promise<{ exitCode: number; stdout: string; stderr: string } | null>

export type ShareDeps = {
  run: Run
  exists: (path: string) => Promise<boolean>
  read: (path: string) => Promise<string>
  now: () => Promise<number>
}

/** What it says when the GitHub tool isn't there or isn't signed in. */
export const NEEDS_GH = 'Sharing needs the GitHub command-line tool, signed in: brew install gh, then gh auth login.'

const FILES = { game: ['game.json', 'game.html', 'icon.svg'], drip: ['drip.json', 'drip.html', 'icon.svg'] } as const

/** `gh` as the plugin finds it: on PATH, else where Homebrew puts it. */
async function ghPath(d: ShareDeps): Promise<string | null> {
  for (const gh of ['gh', '/opt/homebrew/bin/gh', '/usr/local/bin/gh']) {
    const r = await d.run([gh, '--version'])
    if (r?.exitCode === 0) return gh
  }
  return null
}

const say = (r: { stderr: string; stdout: string } | null) => (r ? (r.stderr || r.stdout).trim().split('\n')[0] ?? '' : 'it did not run')

/** Shares `name` from `home`'s folders; says what came of it, the pull request's link when it worked. */
export async function share(d: ShareDeps, home: string, name: string): Promise<string> {
  const want = name.trim().toLowerCase()
  const kind = (await d.exists(`${home}/.glyphh/games/${want}/game.json`)) ? 'game' : (await d.exists(`${home}/.glyphh/drips/${want}/drip.json`)) ? 'drip' : null
  if (!kind) return `No game or drip of yours called "${want}" (they live in ~/.glyphh/games and ~/.glyphh/drips).`
  const dir = `${home}/.glyphh/${kind}s/${want}`
  const files = new Map<string, string>()
  for (const f of FILES[kind]) if (await d.exists(`${dir}/${f}`)) files.set(f, await d.read(`${dir}/${f}`))
  const read = { name: want, manifest: files.get(`${kind}.json`) ?? null, page: files.get(`${kind}.html`) ?? null, icon: files.get('icon.svg') ?? null }
  const checked = kind === 'game' ? checkGame(read) : checkDrip(read)
  if (!checked.ok) return `${want} doesn't pass the check (${checked.why}), so it wasn't shared.`

  const gh = await ghPath(d)
  if (!gh) return NEEDS_GH
  if ((await d.run([gh, 'auth', 'status']))?.exitCode !== 0) return NEEDS_GH
  const who = await d.run([gh, 'api', 'user', '--jq', '.login'])
  const user = who?.exitCode === 0 ? who.stdout.trim() : ''
  if (!user) return `GitHub didn't say who you are: ${say(who)}`

  // Their fork, created if new and brought up to date with the gallery.
  const fork = `${user}/drip`
  await d.run([gh, 'repo', 'fork', REPO, '--clone=false'], { timeoutMs: 60_000 })
  const synced = await d.run([gh, 'repo', 'sync', fork, '--source', REPO, '--branch', 'main'], { timeoutMs: 60_000 })
  if (synced?.exitCode !== 0) return `Couldn't bring your fork ${fork} up to date: ${say(synced)}`
  const head = await d.run([gh, 'api', `repos/${fork}/git/ref/heads/main`, '--jq', '.object.sha'])
  if (head?.exitCode !== 0 || !head.stdout.trim()) return `Couldn't read your fork ${fork}: ${say(head)}`

  const branch = `${kind}-${want}-${await d.now()}`
  const made = await d.run([gh, 'api', `repos/${fork}/git/refs`, '--input', '-'], { stdin: JSON.stringify({ ref: `refs/heads/${branch}`, sha: head.stdout.trim() }) })
  if (made?.exitCode !== 0) return `Couldn't make a branch on ${fork}: ${say(made)}`

  for (const [file, text] of files) {
    const b64 = await d.run(['/usr/bin/base64'], { stdin: text })
    if (b64?.exitCode !== 0) return `Couldn't prepare ${file}: ${say(b64)}`
    const path = `${kind}s/${want}/${file}`
    const sha = await d.run([gh, 'api', `repos/${fork}/contents/${path}?ref=${branch}`, '--jq', '.sha'])
    const body = { message: `${checked.manifest.title}: ${file}`, branch, content: b64.stdout.replace(/\s+/g, ''), ...(sha?.exitCode === 0 && sha.stdout.trim() ? { sha: sha.stdout.trim() } : {}) }
    const put = await d.run([gh, 'api', '-X', 'PUT', `repos/${fork}/contents/${path}`, '--input', '-'], { stdin: JSON.stringify(body), timeoutMs: 60_000 })
    if (put?.exitCode !== 0) return `Couldn't add ${file} to ${fork}: ${say(put)}`
  }

  const what = kind === 'game' ? 'Game' : 'Drip'
  const pr = await d.run(
    [gh, 'pr', 'create', '-R', REPO, '--head', `${user}:${branch}`, '--base', 'main', '--title', `${what}: ${checked.manifest.title}`, '--body', `${what} \`${want}\`, shared from Glyphh Drip with /drip share.`],
    { timeoutMs: 60_000 },
  )
  if (pr?.exitCode !== 0) return `Couldn't open the pull request: ${say(pr)}`
  const link = pr.stdout.trim().split('\n').pop() ?? ''
  return `Shared ${checked.manifest.title}: ${link}. Once it's merged, anyone can /drip get ${want}.`
}
