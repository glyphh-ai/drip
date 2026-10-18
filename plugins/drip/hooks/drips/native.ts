// Effects in the shared native overlay (../overlay/host.ts): a one-shot shown
// once, closing itself; a persistent one ended with SIGTERM. Works on
// NativeDeps, closures over `$` that ./hooks.tsx hands it.
import { overlayHost, type OverlayDeps, type Placement } from '../overlay/host.ts'
import { loopDoc, oneShotDoc } from './docs.ts'
import type { Closer, Host } from './manager.ts'

export type NativeDeps = OverlayDeps & {
  /** Whether effects play their sounds now. */
  sounds(): boolean
}

export function nativeHost(d: NativeDeps, binary: string, place: Placement): Host {
  const { show } = overlayHost(d, binary, place)
  return {
    async oneShot(effect, opacity) {
      const shown = await show(s => oneShotDoc(effect, s.w, s.h, opacity, d.sounds()))
      void shown.closed.catch(() => undefined)
    },
    async persistent(effect, opacity, maxMs, onClosed): Promise<Closer> {
      const shown = await show(s => loopDoc(effect, s.w, s.h, opacity, maxMs, d.sounds()))
      let isClosed = false
      const ended = () => {
        isClosed = true
        onClosed()
      }
      void shown.closed.then(ended, ended)
      return {
        close: async () => {
          if (!isClosed) await d.run(['/bin/kill', '-TERM', String(shown.pid)])
        },
      }
    },
  }
}
