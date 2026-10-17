#!/usr/bin/env node
// Writes index.json: every game and drip that passes the check, with what
// the Gallery shows. Run by CI on main; never edited by hand.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkDrip, checkGame } from './rules.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const list = kind => {
  const dir = join(root, `${kind}s`)
  if (!existsSync(dir)) return []
  return readdirSync(dir).sort().flatMap(name => {
    const at = join(dir, name)
    const opt = f => (existsSync(join(at, f)) ? readFileSync(join(at, f), 'utf8') : null)
    const read = { name, manifest: opt(`${kind}.json`), page: opt(`${kind}.html`), icon: opt('icon.svg') }
    const r = kind === 'game' ? checkGame(read) : checkDrip(read)
    if (!r.ok) return []
    return [{ name, ...r.manifest, files: [`${kind}.json`, `${kind}.html`, ...(read.icon !== null ? ['icon.svg'] : [])] }]
  })
}
writeFileSync(join(root, 'index.json'), JSON.stringify({ v: 1, games: list('game'), drips: list('drip') }, null, 2) + '\n')
console.log('index.json written')
