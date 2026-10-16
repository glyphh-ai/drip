// The optional fun hooks, each behind its /config toggle: confetti when a
// turn ends after a long run, and `-1 matrix` while Claude's tools run (on
// with the first tool, off a moment after the last, and off when the turn
// ends). A matrix the person started is theirs: this never ends it.
import type { Settings } from './settings.ts'

export const LONG_TURN_MS = 2 * 60_000
/** How long the matrix stays after the last tool, so back-to-back tools do not flicker it. */
export const MATRIX_LINGER_MS = 2_000
export const MATRIX = 'matrix'

export type FunDeps = {
  /** Whether effects may play now (the licence allows it). */
  isAllowed(): Promise<boolean>
  play(recipe: string): Promise<void>
  /** Starts the matrix unless it already runs; true when this started it. */
  ensure(effect: string): Promise<boolean>
  release(effect: string): Promise<void>
  after(ms: number, fn: () => void): { cancel(): void }
  report(err: unknown): void
}

export type TurnEnd = { durationMs: number; reason: string; isMainLoop: boolean }

export function createFun(d: FunDeps, settings: Settings) {
  let running = 0
  let owned: Promise<boolean> | null = null
  let linger: { cancel(): void } | null = null

  async function release(): Promise<void> {
    const mine = owned
    owned = null
    if (mine && (await mine.catch(() => false))) await d.release(MATRIX)
  }

  return {
    /** A tool call of the main loop starts. */
    async toolStart(): Promise<void> {
      if (!settings.matrixWhileTools) return
      running++
      linger?.cancel()
      linger = null
      if (owned) return
      owned = (async () => (await d.isAllowed()) && (await d.ensure(MATRIX)))()
      await owned.catch(d.report)
    },
    /** A tool call of the main loop ended. */
    toolEnd(): void {
      if (!settings.matrixWhileTools) return
      running = Math.max(0, running - 1)
      if (running > 0 || !owned) return
      linger?.cancel()
      linger = d.after(MATRIX_LINGER_MS, () => void release().catch(d.report))
    },
    async turnEnd(t: TurnEnd): Promise<void> {
      if (!t.isMainLoop) return
      running = 0
      linger?.cancel()
      linger = null
      await release()
      const isLong = t.reason === 'answer' && t.durationMs > LONG_TURN_MS
      if (settings.confettiAfterLongTurn && isLong && (await d.isAllowed())) await d.play('confetti')
    },
  }
}
