// What `/drip`, the play_drip tool and the Drips page's Play do: the Glyphh
// app's DripManager.execute (src/main/drips-manager.ts at v2.0.2), on a Host
// that shows effects (Claude's window or the full screen). Counted effects
// stagger 1500 ms apart; a persistent (`-1`) effect fired again toggles off;
// a preview's persistent effect is bounded to 12 s; any other persistent
// effect to PERSISTENT_CAP_MS, so nothing runs forever.
import { BUILTIN_EFFECTS, isKnownEffect, parseDripRecipe, yourDrips } from './effects.ts'
import { deleteCustom, saveCustom, type Store } from './library.ts'

export const STAGGER_MS = 1500
/** How long a preview's persistent effect may hold the screen. */
export const PREVIEW_MAX_MS = 12_000
/** How long any persistent effect may hold the screen. */
export const PERSISTENT_CAP_MS = 30 * 60_000
/** A persistent effect's opacity when its recipe names none. */
export const PERSISTENT_OPACITY = 0.5

/** Ends a persistent effect a host started. */
export type Closer = { close(): Promise<void> }

/** Where effects show. */
export type Host = {
  /** Plays one effect once; `opacity` is -1 when the recipe named none. */
  oneShot(effect: string, opacity: number): Promise<void>
  /** Starts a looping effect for at most `maxMs`; `onClosed` runs when it ends by itself. */
  persistent(effect: string, opacity: number, maxMs: number, onClosed: () => void): Promise<Closer>
}

export type ManagerDeps = {
  store: Store
  /** The saved recipes, name → recipe. */
  customs(): Promise<Record<string, string>>
  /** Runs `fn` after `ms`. */
  after(ms: number, fn: () => void): void
  /** A staggered play that failed after the command had answered. */
  report(err: unknown): void
  /** The persistent effects on screen changed (one started or ended). */
  changed?(): void
}

export type ExecuteOptions = { preview?: boolean }

/** A persistent effect on screen, or on its way there. */
type Slot = { closer: Closer | null; isCancelled: boolean }

export type Manager = ReturnType<typeof createManager>

/** The effects a saved recipe adds when named inside another: its names, no numbers. */
export function customEffects(recipe: string): string[] {
  return recipe
    .trim()
    .split(/\s+/)
    .filter(p => p && Number.isNaN(parseFloat(p)))
    .map(p => p.toLowerCase())
}

/** What a recipe naming no effect and no saved drip is told; nothing plays. */
export function unknownText(names: string[]): string {
  return `No effect or saved drip is called ${names.join(', ')}. /drip list shows them.`
}

export function listText(customs: Record<string, string>): string {
  const entries = Object.entries(customs)
  const custom = entries.length ? entries.map(([name, recipe]) => `${name} → ${recipe}`).join(', ') : '(none)'
  const own = yourDrips().map(d => d.name)
  return `effects: ${BUILTIN_EFFECTS.join(', ')}${own.length ? `\nyours: ${own.join(', ')}` : ''}\ncustom: ${custom}`
}

export function createManager(d: ManagerDeps) {
  const persistent = new Map<string, Slot>()

  async function closeSlot(slot: Slot): Promise<void> {
    slot.isCancelled = true
    d.changed?.()
    await slot.closer?.close()
  }

  /** Starts `effect` looping, or ends it when it is already on (the app's toggle). */
  async function firePersistent(host: Host, effect: string, opacity: number, maxMs: number): Promise<void> {
    const existing = persistent.get(effect)
    if (existing) {
      persistent.delete(effect)
      await closeSlot(existing)
      return
    }
    await start(host, effect, opacity, maxMs)
  }

  async function start(host: Host, effect: string, opacity: number, maxMs: number): Promise<void> {
    const slot: Slot = { closer: null, isCancelled: false }
    persistent.set(effect, slot)
    const forget = () => {
      if (persistent.get(effect) !== slot) return
      persistent.delete(effect)
      d.changed?.()
    }
    try {
      slot.closer = await host.persistent(effect, opacity, maxMs, forget)
    } catch (err) {
      forget()
      throw err
    }
    d.changed?.()
    if (slot.isCancelled) await slot.closer.close() // toggled off while it started
  }

  async function executeRaw(hostOf: () => Promise<Host>, raw: string, customs: Record<string, string>, maxMs: number): Promise<string> {
    const { count, opacity, effects } = parseDripRecipe(raw, name => (customs[name] ? customEffects(customs[name]!) : null))
    const unknown = [...new Set(effects.filter(effect => !isKnownEffect(effect)))]
    if (unknown.length) return unknownText(unknown)
    const host = await hostOf()
    let slot = 0
    const play = (effect: string, op: number) => {
      d.after(slot++ * STAGGER_MS, () => void host.oneShot(effect, op).catch(d.report))
    }
    if (count === -1) {
      const op = opacity > 0 ? opacity : PERSISTENT_OPACITY
      for (const effect of effects) await firePersistent(host, effect, op, maxMs)
      return `drip: ${effects.join(' + ')} constant`
    }
    const op = opacity > 0 ? opacity : -1
    for (let i = 0; i < count; i++) for (const effect of effects) play(effect, op)
    return `drip: ${count > 1 ? `${effects.join(' + ')} x${count}` : effects.join(' + ')}`
  }

  /** Ends every persistent effect. */
  async function stopAll(): Promise<void> {
    const slots = [...persistent.values()]
    persistent.clear()
    for (const slot of slots) await closeSlot(slot)
  }

  return {
    /** One `/drip` line: a recipe, a saved recipe's name, or list, save, delete, stop.
     *  `hostOf` is asked for the host only when something is to play. */
    async execute(hostOf: () => Promise<Host>, line: string, opts: ExecuteOptions = {}): Promise<string> {
      const args = line.trim().split(/\s+/).filter(Boolean)
      const maxMs = opts.preview ? PREVIEW_MAX_MS : PERSISTENT_CAP_MS
      const sub = args[0]?.toLowerCase() ?? ''
      if (sub === 'save') {
        if (args.length < 3) return 'Usage: /drip save <name> <recipe>'
        return saveCustom(d.store, args[1]!, args.slice(2).join(' '))
      }
      if (sub === 'delete') return args[1] ? deleteCustom(d.store, args[1]) : 'Usage: /drip delete <name>'
      if (sub === 'list') return listText(await d.customs())
      if (sub === 'stop') {
        await stopAll()
        return 'stopped all persistent effects'
      }
      const customs = await d.customs()
      const saved = args.length === 1 ? customs[sub] : undefined
      return executeRaw(hostOf, saved ?? args.join(' '), customs, maxMs)
    },

    stopAll,

    /** Starts `effect` looping unless it already is; true when this call started it. */
    async ensure(host: Host, effect: string, opacity = PERSISTENT_OPACITY): Promise<boolean> {
      if (persistent.has(effect)) return false
      await start(host, effect, opacity, PERSISTENT_CAP_MS)
      return true
    },

    /** Ends `effect` if it is looping. */
    async release(effect: string): Promise<void> {
      const slot = persistent.get(effect)
      if (!slot) return
      persistent.delete(effect)
      await closeSlot(slot)
    },

    /** The persistent effects on screen now. */
    running(): string[] {
      return [...persistent.keys()]
    },
  }
}
