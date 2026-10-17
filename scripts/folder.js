// A game or drip folder as the rules read it (./rules.js): its JSON, page,
// icon and cover. Shared by check.js, index.js and authors.js.
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { COVER_FILES } from './rules.js'

/** @param {string} dir @param {'game' | 'drip'} kind */
export function readFolder(dir, kind) {
  const opt = name => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8') : null)
  const coverFile = COVER_FILES.find(f => existsSync(join(dir, f)))
  const cover = coverFile ? { file: coverFile, base64: readFileSync(join(dir, coverFile)).toString('base64') } : null
  return { name: basename(dir), manifest: opt(`${kind}.json`), page: opt(`${kind}.html`), icon: opt('icon.svg'), cover }
}
