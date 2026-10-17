#!/usr/bin/env node
// Checks game and drip folders against the rules Glyphh Drip applies
// (./rules.js, the plugin's own code).
//
//   node scripts/check.js games/snake drips/snow   one or more folders
//   node scripts/check.js --all                    every folder in games/ and drips/
//
// Prints a line per folder; exits 1 when any fails.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkDrip, checkGame } from './rules.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const folders = args.includes('--all')
  ? ['games', 'drips'].flatMap(kind => (existsSync(join(root, kind)) ? readdirSync(join(root, kind)).map(n => join(root, kind, n)) : []))
  : args.map(a => resolve(a))
if (!folders.length) {
  console.error('Usage: node scripts/check.js <folder...> | --all')
  process.exit(2)
}
let failed = 0
for (const dir of folders) {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) continue
  const kind = existsSync(join(dir, 'drip.json')) && !existsSync(join(dir, 'game.json')) ? 'drip' : 'game'
  const opt = name => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8') : null)
  const read = { name: basename(dir), manifest: opt(`${kind}.json`), page: opt(`${kind}.html`), icon: opt('icon.svg') }
  const r = kind === 'game' ? checkGame(read) : checkDrip(read)
  if (r.ok) console.log(`✓ ${kind}s/${read.name}: "${r.manifest.title}"`)
  else {
    console.error(`✗ ${kind}s/${read.name}: ${r.why}.`)
    failed++
  }
}
process.exit(failed ? 1 : 0)
