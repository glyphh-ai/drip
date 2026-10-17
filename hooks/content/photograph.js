// Photographs a game or drip folder for its cover (docs/glyphh-drip.md,
// Covers): the page played for a few seconds in headless Chrome at 960×600,
// on a background of its own colour, saved beside it as cover.jpg. Plain
// JavaScript run with Node by the skills' cover.js; macOS only (Google Chrome
// and sips).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/** Stands in for the plugin's kit while the page is photographed: no sound, nothing kept. */
const SHIM = `<script>// Headless Chrome's virtual time runs timers, not frames: frames by timer.
window.requestAnimationFrame=function(f){return setTimeout(function(){f(performance.now())},16)};window.cancelAnimationFrame=function(i){clearTimeout(i)};
window.glyphh={width:960,height:600,best:0,opacity:1,score:function(){},end:function(){},sfx:{tone:function(){},noise:function(){},notes:function(){}},muted:function(){return true}};
// Past a title screen: a key and a click, then a few more, as a player would.
[300,900,1500,2100].forEach(function(t){setTimeout(function(){['keydown','keyup'].forEach(function(k){window.dispatchEvent(new KeyboardEvent(k,{key:' ',code:'Space',keyCode:32,bubbles:true}));document.dispatchEvent(new KeyboardEvent(k,{key:' ',code:'Space',keyCode:32,bubbles:true}))});var c=document.querySelector('canvas')||document.body;['mousedown','mouseup','click'].forEach(function(k){c.dispatchEvent(new MouseEvent(k,{clientX:480,clientY:300,bubbles:true}))})},t)})</script>`

/**
 * Photographs `dir` (a folder with game.html or drip.html) into `dir/cover.jpg`.
 * `from` and `to` are the background's colours; `ms` how long it plays first.
 * Says what came of it: { ok: true, file } or { ok: false, why }.
 * @param {string} dir @param {{ from?: string, to?: string, ms?: number }} [o]
 * @returns {{ ok: true, file: string } | { ok: false, why: string }}
 */
export function photograph(dir, o = {}) {
  if (process.platform !== 'darwin') return { ok: false, why: 'photographing a cover needs macOS' }
  if (!existsSync(CHROME)) return { ok: false, why: 'photographing a cover needs Google Chrome in /Applications' }
  const pageFile = ['game.html', 'drip.html'].map(f => join(dir, f)).find(f => existsSync(f))
  if (!pageFile) return { ok: false, why: `${dir} has no game.html or drip.html` }
  const { from = '#1e1b4b', to = '#7c3aed', ms = 3000 } = o
  const paint = `<style>html{background:linear-gradient(120deg,${from},${to}) !important;min-height:100%}</style>`
  const page = readFileSync(pageFile, 'utf8')
  const lead = paint + SHIM
  const html = /<head[^>]*>/i.test(page) ? page.replace(/<head[^>]*>/i, m => m + lead) : lead + page
  const work = mkdtempSync(join(tmpdir(), 'glyphh-cover-'))
  try {
    writeFileSync(join(work, 'page.html'), html)
    // A few moments: the busiest (the largest PNG: more on screen compresses less) is kept.
    let best = null
    for (const [i, at] of [ms * 0.7, ms, ms * 1.4].map(Math.round).entries()) {
      const shot = join(work, `shot-${i}.png`)
      const r = spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--virtual-time-budget=${at}`, `--screenshot=${shot}`, '--window-size=960,600', `file://${join(work, 'page.html')}`], { encoding: 'utf8', timeout: 60_000 })
      if (r.status === 0 && existsSync(shot) && (!best || statSync(shot).size > statSync(best).size)) best = shot
    }
    if (!best) return { ok: false, why: 'Chrome made no photo' }
    const file = join(dir, 'cover.jpg')
    const j = spawnSync('/usr/bin/sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', '-z', '600', '960', best, '--out', file], { encoding: 'utf8' })
    if (j.status !== 0) return { ok: false, why: `sips could not make the JPEG: ${(j.stderr || '').trim().split('\n').pop()}` }
    const png = join(dir, 'cover.png')
    if (existsSync(png)) rmSync(png) // one cover: the new one
    return { ok: true, file }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
