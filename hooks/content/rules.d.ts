// Types for ./rules.js, which is plain JavaScript so the skills' checker can
// run it with Node as it is.

/** A folder as read: its name, game.json or drip.json, game.html or drip.html, icon.svg (null when absent). */
export type Read = { name: string; manifest: string | null; page: string | null; icon: string | null }
export type GameManifest = { title: string; about?: string }
export type DripManifest = { title: string; kind: 'one-shot' | 'loop' }
export type Checked<M> = { ok: true; manifest: M; page: string; icon: string | null } | { ok: false; why: string }

export const NAME: RegExp
export const TITLE_MAX: number
export const ABOUT_MAX: number
export const PAGE_MAX: number
export const ICON_MAX: number
export function checkGame(r: Read): Checked<GameManifest>
export function checkDrip(r: Read): Checked<DripManifest>
