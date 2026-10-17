#!/usr/bin/env node
// Writes index.json: every game and drip that passes the check, with what
// the Gallery shows. Run by CI on main; never edited by hand.
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkDrip, checkGame } from './rules.js'
import { readFolder } from './folder.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const list = kind => {
  const dir = join(root, `${kind}s`)
  if (!existsSync(dir)) return []
  return readdirSync(dir).sort().flatMap(name => {
    const at = join(dir, name)
    const read = readFolder(at, kind)
    const r = kind === 'game' ? checkGame(read) : checkDrip(read)
    if (!r.ok) return []
    return [{ name, ...r.manifest, files: [`${kind}.json`, `${kind}.html`, r.cover.file, ...(read.icon !== null ? ['icon.svg'] : [])] }]
  })
}
writeFileSync(join(root, 'index.json'), JSON.stringify({ v: 1, games: list('game'), drips: list('drip') }, null, 2) + '\n')
console.log('index.json written')
