// The saved recipes: name → recipe, kept in the mod's store under one key.
// Names and recipes are normalised as the Glyphh app's member library does
// (dripId, dripRecordOf): a name is trimmed and lowercased, so one preset has
// one name; a recipe's whitespace is collapsed. Works on a Store, closures
// over `$.store` that ./hooks.tsx hands it.
import type { CustomDrip } from '../../types'

export const STORE_KEY = 'customs'

export type Store = {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
}

/** A preset's name: trimmed and lowercased. */
export const dripId = (name: string): string => String(name ?? '').trim().toLowerCase()

export function dripRecordOf(name: string, recipe: string): CustomDrip {
  return { name: dripId(name), recipe: String(recipe ?? '').trim().split(/\s+/).join(' ') }
}

/** The saved recipes as a map; anything in the store that is not one is passed over. */
export async function readCustoms(store: Store): Promise<Record<string, string>> {
  const kept = await store.get(STORE_KEY)
  const out: Record<string, string> = {}
  if (!kept || typeof kept !== 'object' || Array.isArray(kept)) return out
  for (const [name, recipe] of Object.entries(kept as Record<string, unknown>)) {
    if (typeof recipe === 'string' && dripId(name)) out[dripId(name)] = recipe
  }
  return out
}

export async function listCustoms(store: Store): Promise<CustomDrip[]> {
  return Object.entries(await readCustoms(store)).map(([name, recipe]) => ({ name, recipe }))
}

/** Saves a preset; says what it did, as the app's `.drip save` does. */
export async function saveCustom(store: Store, name: string, recipe: string): Promise<string> {
  const rec = dripRecordOf(name, recipe)
  if (!rec.name) return 'A drip needs a name.'
  if (!rec.recipe) return `A drip needs a recipe: /drip save ${rec.name} <recipe>`
  const customs = await readCustoms(store)
  await store.set(STORE_KEY, { ...customs, [rec.name]: rec.recipe })
  return `saved drip "${rec.name}" → ${rec.recipe}`
}

/** Deletes a preset; says what it did. */
export async function deleteCustom(store: Store, name: string): Promise<string> {
  const id = dripId(name)
  const customs = await readCustoms(store)
  if (!(id in customs)) return `no custom drip "${id}"`
  delete customs[id]
  await store.set(STORE_KEY, customs)
  return `deleted drip "${id}"`
}
