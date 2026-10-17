#!/usr/bin/env node
// Checks a Glyphh Drip drip or game folder against the rules the plugin
// applies (../../hooks/content/rules.js, the very same code), so a game or
// drip that passes here shows up in /drip list.
//
//   node check.js ~/.glyphh/games/snake
//   node check.js ~/.glyphh/drips/snow
//
// A folder with game.json is a game, one with drip.json a drip. Prints what
// it found and exits 0 when it passes, 1 when it doesn't.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'

import { COVER_FILES, GLYPHH, checkDrip, checkGame } from '../../hooks/content/rules.js'

const arg = process.argv[2]
if (!arg) {
  console.error('Usage: node check.js <folder>')
  process.exit(2)
}
const dir = resolve(arg.replace(/^~(?=\/|$)/, homedir()))
if (!existsSync(dir) || !statSync(dir).isDirectory()) {
  console.error(`✗ ${dir} is not a folder.`)
  process.exit(1)
}
const opt = name => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8') : null)
const kind = existsSync(join(dir, 'drip.json')) && !existsSync(join(dir, 'game.json')) ? 'drip' : 'game'
const coverFile = COVER_FILES.find(f => existsSync(join(dir, f)))
const cover = coverFile ? { file: coverFile, base64: readFileSync(join(dir, coverFile)).toString('base64') } : null
const read = { name: basename(dir), manifest: opt(`${kind}.json`), page: opt(`${kind}.html`), icon: opt('icon.svg'), cover }
const result = kind === 'game' ? checkGame(read) : checkDrip(read)
if (!result.ok) {
  console.error(`✗ ${read.name}: ${result.why}.`)
  process.exit(1)
}
if (result.manifest.author === GLYPHH) {
  console.error(`✗ ${read.name}: its author is "${GLYPHH}", Glyphh's own: put your GitHub login in ${kind}.json (gh api user --jq .login).`)
  process.exit(1)
}
const home = join(homedir(), '.glyphh', `${kind}s`)
console.log(`✓ ${read.name}: a good ${kind}, "${result.manifest.title}".`)
if (resolve(dir, '..') !== home) console.log(`  It shows up in /drip once it is in ${home}/${read.name}.`)
