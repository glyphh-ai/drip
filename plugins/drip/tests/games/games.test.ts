import { describe, expect, test } from 'claude-code/testing'

import {
  MISSILES_BLAST_MS,
  MISSILES_BLAST_START,
  MISSILES_END_MS,
  MISSILES_RAMP_S,
  MISSILES_SAFETY_MS,
  MISSILES_SPEED_RANGE,
  MISSILES_TURRETS,
  dripMissiles,
  missilesDifficulty,
  missilesTuning,
} from '../../hooks/arcade/games/missiles.ts'
import { GAMES, gameDoc, gameOf } from '../../hooks/arcade/games/index.ts'
import { GAME_BACKDROP, GAME_SCORE, GAME_SOUND, gameFrame } from '../../hooks/arcade/games/shared.ts'

describe('the games', () => {
  test('one built in, Missiles (free); the rest are the gallery\'s', () => {
    expect(GAMES.map(g => [g.name, g.title])).toEqual([['missiles', 'Missiles']])
  })

  test('found by name or another name, any case, spaces trimmed; nothing else', () => {
    expect(gameOf('missiles')?.name).toBe('missiles')
    expect(gameOf('  Missile ')?.name).toBe('missiles')
    expect(gameOf('blocks')).toBeNull()
    expect(gameOf('confetti')).toBeNull()
    expect(gameOf('')).toBeNull()
  })

  test('a game\'s document: interactive, its own backstop, the best to beat; Sounds off starts it muted', () => {
    for (const g of GAMES) {
      const on = gameDoc(g, 800, 600, 40, true)
      expect(on).toMatchObject({ interactive: true, closeAfterMs: g.safetyMs })
      expect(on.html).toContain('BEST=40,')
      expect(on.html).toContain('width:800px;height:600px')
      expect(on.html).not.toContain('__dripsQuiet=true')
      expect(gameDoc(g, 800, 600, 0, false).html).toMatch(/<body[^>]*><script>window.__dripsQuiet=true<\/script>/)
      expect(g.safetyMs).toBe(30 * 60_000)
    }
    expect(GAME_SOUND).toContain('if(window.__dripsQuiet===true)muted=true;')
  })

  test('a bad best is none', () => {
    for (const g of GAMES) {
      expect(g.build(800, 600, -5)).toContain('BEST=0,')
      expect(g.build(800, 600, 2.5)).toContain('BEST=0,')
    }
  })
})

describe('missiles, the game', () => {
  test('it never stops getting harder: 0 at the start, towards 1, never settling', () => {
    expect(missilesDifficulty(0)).toBe(0)
    expect(missilesDifficulty(-4)).toBe(0)
    expect(Math.abs(missilesDifficulty(MISSILES_RAMP_S) - (1 - Math.exp(-1)))).toBeLessThan(1e-12)
    for (let s = 10; s < 1200; s += 60) expect(missilesDifficulty(s + 60)).toBeGreaterThan(missilesDifficulty(s))
    expect(missilesDifficulty(1e6)).toBeLessThanOrEqual(1)
    // Games to pass the time: two thirds of the way to near impossible in 80 seconds.
    expect(MISSILES_RAMP_S).toBe(80)
  })

  test('the start easy, the far end near impossible: more, faster, more at once, smaller blast, slower reloads, splits, more points', () => {
    const a = missilesTuning(0)
    const z = missilesTuning(1)
    expect(z.fallS).toBeLessThan(a.fallS / 3)
    expect(z.intervalS).toBeLessThan(a.intervalS / 3)
    expect(z.maxActive).toBeGreaterThan(a.maxActive)
    expect(z.blastR).toBeLessThan(a.blastR * 0.6)
    expect(z.reloadMs).toBeGreaterThan(a.reloadMs * 3)
    expect(z.interceptorSpeed).toBeLessThan(a.interceptorSpeed)
    expect(z.turretAim).toBeGreaterThan(a.turretAim)
    expect(missilesTuning(0.6).splitChance).toBe(0)
    expect(missilesTuning(0.7).splitChance).toBeGreaterThan(0)
    expect(missilesTuning(0.8).splitInto).toBe(1)
    expect(z.splitInto).toBe(2)
    expect(a.points).toBe(10)
    expect(z.points).toBe(100)
    expect(missilesTuning(Number.NaN)).toEqual(a)
    expect(missilesTuning(7)).toEqual(z)
  })

  test('the page ramps between the two ends it is given, launches without end, and is over only when every turret is lost', () => {
    const html = dripMissiles(1000, 700, 40)
    expect(html).toContain(`E0=${JSON.stringify(missilesTuning(0))},E1=${JSON.stringify(missilesTuning(1))};`)
    expect(html).toContain(`RAMP=${MISSILES_RAMP_S * 1000},`)
    expect(html).toContain('if(allLost){state="end";')
    expect(html).not.toMatch(/\bROUND\b/)
    expect(html).toContain(`turrets=${JSON.stringify(MISSILES_TURRETS)}`)
    expect(html).toContain(`BLASTMS=${MISSILES_BLAST_MS}`)
    expect(html).toContain(`B0=${MISSILES_BLAST_START}`)
    expect(html).toContain(`SPMIN=${MISSILES_SPEED_RANGE[0]},SPMAX=${MISSILES_SPEED_RANGE[1]}`)
    expect(html).toContain(`ENDMS=${MISSILES_END_MS};`)
  })

  test('the score: posted as it rises, the best shown to beat, a new best said', () => {
    const html = dripMissiles(1000, 700, 40)
    expect(html).toContain(GAME_SCORE)
    expect(html).toContain('stats.score+=pts;postScore(stats.score);')
    expect(html).toContain('"   BEST "+Math.max(BEST,stats.score)')
    expect(html).toContain('"NEW BEST!"')
  })

  test("the page: crosshair, Esc closes, the games' backdrop, fitted to Claude's window", () => {
    const html = dripMissiles(1000, 700)
    expect(html).toContain('cursor:crosshair')
    expect(html).toContain('ev.key==="Escape"')
    expect(html).toContain(gameFrame(1000, 700))
    expect(html).toContain(`html{background:${GAME_BACKDROP}!important}`)
  })
})

describe("the games' frame", () => {
  test('a page laid out at its size, kept to its window as that is resized', () => {
    const f = gameFrame(800, 600)
    expect(f).toContain('var W=800,H=600,')
    expect(f).toContain('s=Math.min(iw/W,ih/H)')
    expect(f).toContain('window.addEventListener("resize",fit);fit()')
    expect(f).toContain('clientX:{value:x}')
    expect(gameFrame(Number.NaN, -3)).toContain('var W=1,H=1,')
  })

  test('slightly see-through: Claude shows a little behind every game', () => {
    const alpha = Number(/rgba\(\d+,\d+,\d+,([\d.]+)\)/.exec(GAME_BACKDROP)?.[1])
    expect(alpha).toBeGreaterThan(0.6)
    expect(alpha).toBeLessThan(0.95)
  })
})

describe('the games\' sounds', () => {
  test('the games carry the sound kit, made in the page: no sound files', () => {
    for (const html of [dripMissiles(1000, 700)]) {
      expect(html).toContain(GAME_SOUND)
      expect(html).not.toMatch(/\.(mp3|wav|ogg|m4a)/)
    }
    expect(GAME_SOUND).toContain('window.AudioContext||window.webkitAudioContext')
    expect(GAME_SOUND).toContain('voices>=24')
  })

  test('M mutes and unmutes, remembered where the page may store it; the HUD says so', () => {
    expect(GAME_SOUND).toContain('localStorage.setItem("drips.muted"')
    for (const html of [dripMissiles(1000, 700)]) {
      expect(html).toContain('sfx.toggle()')
      expect(html).toContain('"M SOUND ON":"M MUTES"')
    }
  })

  test('missiles: a shot, a blast, a kill, a hit, a turret lost, an intro and an end tune', () => {
    const html = dripMissiles(1000, 700)
    expect(html).toContain('stats.fired++;sfx.tone(')
    expect(html).toContain('blast(sh.tx,sh.ty,P.blast,BLASTMS);sfx.noise(')
    expect(html).toContain('function destroy(m,i){\n  sfx.tone(')
    expect(html).toContain('"TURRET DOWN!","#4cc9f0");sfx.noise(')
    expect(html).toContain('state="end";endAt=t;endTune();')
  })
})

