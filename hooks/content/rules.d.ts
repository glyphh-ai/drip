// Types for ./rules.js, which is plain JavaScript so the skills' checker can
// run it with Node as it is.

/** cover.jpg or cover.png as read: its name and its bytes, standard base64. */
export type Cover = { file: string; base64: string }
/** A folder as read: its name, game.json or drip.json, game.html or drip.html, icon.svg and its cover (null when absent). */
export type Read = { name: string; manifest: string | null; page: string | null; icon: string | null; cover: Cover | null }
export type GameManifest = { title: string; author: string; about?: string }
export type DripManifest = { title: string; author: string; kind: 'one-shot' | 'loop' }
export type Checked<M> = { ok: true; manifest: M; page: string; icon: string | null; cover: Cover } | { ok: false; why: string }

export const NAME: RegExp
export const TITLE_MAX: number
export const ABOUT_MAX: number
export const PAGE_MAX: number
export const ICON_MAX: number
export const COVER_MAX: number
export const COVER_MIN_W: number
export const COVER_MAX_W: number
export const AUTHOR: RegExp
export const GLYPHH: string
export const COVER_FILES: string[]
export function imageSize(b: Uint8Array): { type: 'png' | 'jpeg'; w: number; h: number } | null
export function checkGame(r: Read): Checked<GameManifest>
export function checkDrip(r: Read): Checked<DripManifest>
