#!/usr/bin/env node
// A pull request's games and drips must be its opener's: every folder it adds
// or changes names them as `author` in its JSON, and an existing folder keeps
// its author. `drip` (Drip built) and changes to anyone's folder are for
// the logins in MAINTAINERS. Run by CI on pull requests:
//
//   node scripts/authors.js <opener's login> <base ref>
//
// Prints a line per folder; exits 1 when any isn't theirs.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DRIP_AUTHOR } from './rules.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [opener, base] = process.argv.slice(2)
if (!opener || !base) {
  console.error('Usage: node scripts/authors.js <login> <base ref>')
  process.exit(2)
}
const maintainers = readFileSync(join(root, 'MAINTAINERS'), 'utf8').split('\n').map(l => l.trim().toLowerCase()).filter(l => l && !l.startsWith('#'))
const isMaintainer = maintainers.includes(opener.toLowerCase())
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const changed = git('diff', '--name-only', `${base}...HEAD`).split('\n').filter(Boolean)
const folders = [...new Set(changed.map(p => p.split('/')).filter(p => (p[0] === 'games' || p[0] === 'drips') && p.length > 2).map(p => `${p[0]}/${p[1]}`))]

/** The author a folder's JSON names, now or at `ref`; null when there is none. */
function authorOf(folder, ref) {
  const file = `${folder}/${folder.startsWith('games') ? 'game' : 'drip'}.json`
  try {
    const text = ref ? git('show', `${ref}:${file}`) : existsSync(join(root, file)) ? readFileSync(join(root, file), 'utf8') : null
    const v = text === null ? null : JSON.parse(text)
    return typeof v?.author === 'string' ? v.author.trim() : null
  } catch {
    return null
  }
}

let failed = 0
for (const folder of folders) {
  const now = authorOf(folder, null)
  const was = authorOf(folder, base)
  const why =
    now === null && was === null ? null // removed, and wasn't there
    : isMaintainer ? null
    : now?.toLowerCase() === DRIP_AUTHOR || was?.toLowerCase() === DRIP_AUTHOR ? `only Drip's own publish as "${DRIP_AUTHOR}"`
    : was !== null && was.toLowerCase() !== opener.toLowerCase() ? `it is ${was}'s: only they change it`
    : now !== null && now.toLowerCase() !== opener.toLowerCase() ? `its author is "${now}", but ${opener} opened this pull request`
    : null
  if (why) {
    console.error(`✗ ${folder}: ${why}.`)
    failed++
  } else console.log(`✓ ${folder}: ${now ?? 'removed'}`)
}
process.exit(failed ? 1 : 0)
