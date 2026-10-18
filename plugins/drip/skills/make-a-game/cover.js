#!/usr/bin/env node
// Photographs a Glyphh Drip game for its cover: played for a few seconds in
// headless Chrome at 960×600 on a background of its own colour, saved beside it
// as cover.jpg (the plugin's ../../hooks/content/photograph.js). Look at the
// photo after: it should show the game mid-play.
//
//   node cover.js ~/.glyphh/games/<name> [from-colour] [to-colour] [ms]
//   node cover.js ~/.glyphh/games/snow '#0b1030' '#312e81' 4000
import { homedir } from 'node:os'
import { resolve } from 'node:path'

import { photograph } from '../../hooks/content/photograph.js'

const [arg, from, to, ms] = process.argv.slice(2)
if (!arg) {
  console.error('Usage: node cover.js <folder> [from-colour] [to-colour] [ms]')
  process.exit(2)
}
const r = photograph(resolve(arg.replace(/^~(?=\/|$)/, homedir())), { ...(from ? { from } : {}), ...(to ? { to } : {}), ...(ms ? { ms: Number(ms) } : {}) })
if (!r.ok) {
  console.error(`✗ ${r.why}.`)
  process.exit(1)
}
console.log(`✓ ${r.file}`)
