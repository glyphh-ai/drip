import { describe, expect, test } from 'claude-code/testing'

import { loopDoc, oneShotDoc } from '../hooks/drips/docs.ts'
import {
  BUILTIN_EFFECT_LIST,
  BUILTIN_EFFECTS,
  LOOP_EFFECTS,
  ONE_SHOT_EFFECTS,
  buildLoopHtml,
  buildOneShotHtml,
  oneShotSafetyMs,
  parseDripRecipe,
  withSound,
} from '../hooks/drips/effects.ts'
import { DRIPS } from '../hooks/drips/effects/index.ts'
import { SOUND_KIT, soundScript } from '../hooks/drips/effects/shared.ts'

describe('the recipe grammar', () => {
  test('tokens in any order: -1 persistent, 0<n<1 opacity, a whole number the count (at most 10), the rest effects', () => {
    expect(parseDripRecipe('confetti')).toEqual({ count: 1, opacity: -1, effects: ['confetti'] })
    expect(parseDripRecipe('3 hearts stars')).toEqual({ count: 3, opacity: -1, effects: ['hearts', 'stars'] })
    expect(parseDripRecipe('aurora 0.4 -1')).toEqual({ count: -1, opacity: 0.4, effects: ['aurora'] })
    expect(parseDripRecipe('50 Rain')).toEqual({ count: 10, opacity: -1, effects: ['rain'] })
  })

  test('no effect named plays fireworks', () => {
    expect(parseDripRecipe('').effects).toEqual(['fireworks'])
    expect(parseDripRecipe('  4  ')).toEqual({ count: 4, opacity: -1, effects: ['fireworks'] })
  })

  test('names are read in any case', () => {
    expect(parseDripRecipe('Hearts STARS')).toEqual({ count: 1, opacity: -1, effects: ['hearts', 'stars'] })
  })

  test('a name the resolver knows expands to its effects', () => {
    const r = parseDripRecipe('party stars', n => (n === 'party' ? ['confetti', 'hearts'] : null))
    expect(r.effects).toEqual(['confetti', 'hearts', 'stars'])
  })
})

describe('the effects', () => {
  test('the list hides timme; the catalog lists one-shots then loops', () => {
    expect(BUILTIN_EFFECTS).not.toContain('timme')
    expect(BUILTIN_EFFECTS).toContain('confetti')
    expect(BUILTIN_EFFECT_LIST.filter(e => e.kind === 'loop').map(e => e.name)).toEqual(Object.keys(LOOP_EFFECTS))
    expect(BUILTIN_EFFECT_LIST[0]).toEqual({ name: 'fireworks', kind: 'one-shot' })
    expect(BUILTIN_EFFECT_LIST.some(e => e.name === 'timme')).toBe(false)
  })

  test('every one-shot document sizes to its host and signals its close both ways', () => {
    for (const name of Object.keys(ONE_SHOT_EFFECTS)) {
      const html = buildOneShotHtml(name, 640, 480)
      expect(html).toContain('width:640px;height:480px')
      expect(html).toContain('console.log("__drip_close__")')
      expect(html).toContain('window.parent.postMessage("__drip_close__","*")')
    }
  })

  test('an unknown name plays fireworks; a loop name looped carries its opacity and never closes itself', () => {
    expect(buildOneShotHtml('nope', 10, 10)).toContain('@keyframes')
    const loop = buildLoopHtml('aurora', 100, 100, 0.3)
    expect(loop).toContain('body{opacity:0.3}')
    expect(loop).not.toContain('__drip_close__')
    expect(buildLoopHtml('confetti', 100, 100, 0.3)).toContain('__drip_close__')
  })

  test('the safety timeout: 8 s, 17 s for timme', () => {
    expect(oneShotSafetyMs('confetti')).toBe(8000)
    expect(oneShotSafetyMs('timme')).toBe(17000)
    expect(oneShotSafetyMs('aurora')).toBe(8000)
    expect(oneShotSafetyMs('nope')).toBe(8000)
  })
})

describe('documents for a host', () => {
  test('a one-shot: opacity on its body when named, its safety time', () => {
    const doc = oneShotDoc('hearts', 800, 600, 0.5)
    expect(doc.html).toContain('<body style="opacity:0.5">')
    expect(doc.closeAfterMs).toBe(8000)
    expect(doc.interactive).toBe(false)
    expect(oneShotDoc('hearts', 800, 600, -1).html).toContain('<body>\n')
  })

  test('a loop: its time bound', () => {
    const doc = loopDoc('matrix', 800, 600, 0.5, 12_000)
    expect(doc.closeAfterMs).toBe(12_000)
    expect(doc.interactive).toBe(false)
    expect(doc.html).toContain('body{opacity:0.5}')
  })
})

describe('one file per drip', () => {
  test('every drip is listed once, by its own name; the registries come from the list', () => {
    const names = DRIPS.map(d => d.name)
    expect(new Set(names).size).toBe(names.length)
    expect(Object.keys(ONE_SHOT_EFFECTS).sort()).toEqual([...names].sort())
    expect(Object.keys(LOOP_EFFECTS)).toEqual(DRIPS.filter(d => d.kind === 'loop').map(d => d.name))
    expect(BUILTIN_EFFECTS).toEqual(names.filter(n => n !== 'timme'))
    for (const game of ['missiles', 'chickn', 'blocks', 'rocks', 'dash']) expect(names).not.toContain(game)
  })
})

describe('every effect\'s sounds', () => {
  test('every drip has its own sound script', () => {
    for (const d of DRIPS) expect(typeof d.sound).toBe('string')
  })

  test('Sounds on: an effect\'s script goes in just before </body>, one-shot and loop alike; off: nothing', () => {
    for (const d of DRIPS) {
      const sound = d.sound!
      const on = d.kind === 'loop' ? loopDoc(d.name, 800, 600, 0.5, 9000, true).html : oneShotDoc(d.name, 800, 600, -1, true).html
      const off = d.kind === 'loop' ? loopDoc(d.name, 800, 600, 0.5, 9000).html : oneShotDoc(d.name, 800, 600, -1).html
      expect(on).toContain(soundScript(sound) + '</body>')
      expect(off).not.toContain('var sfx=')
    }
  })

  test('the script runs with the kit, at, every and rnd; a page without </body> or an unknown effect is left as it is', () => {
    const script = soundScript('sfx.tone(440,0.1)')
    expect(script).toContain(SOUND_KIT)
    for (const helper of ['function at(ms,f)', 'function every(ms,f)', 'function rnd(a,b)']) expect(script).toContain(helper)
    expect(withSound('<html><body>x', 'confetti', true)).toBe('<html><body>x')
    expect(withSound('<html><body>x</body></html>', 'nope', true)).toBe('<html><body>x</body></html>')
  })
})
