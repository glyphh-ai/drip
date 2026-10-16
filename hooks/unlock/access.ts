// Copied from shared/unlock/access.ts by scripts/sync-shared.mjs: edit it there.
// What the licence allows now: unlocked, or locked until it is bought. A
// mod is a one-time purchase per install: no trial, no subscription.
import type { LicenceState } from '../../types'
import { ABOUT, COMMAND, PRICE, PRODUCT } from './config.ts'

export type Access = { kind: 'licensed' } | { kind: 'locked' }

export const INITIAL: LicenceState = { licence: null, isWaiting: false, note: null }

export function access(state: LicenceState): Access {
  return state.licence ? { kind: 'licensed' } : { kind: 'locked' }
}

/** The line a gated command answers with until the mod is bought; null once it is. */
export function refusal(state: LicenceState): string | null {
  return access(state).kind === 'locked' ? `${PRODUCT} is a one-time ${PRICE}. Run /${COMMAND} unlock to buy it.` : null
}

/** What a page shows of the licence: its state in words, never the licence. */
export type PageStatus = {
  kind: Access['kind']
  isWaiting: boolean
  note: string | null
  product: string
  price: string
  about: readonly string[]
  command: string
}

export function pageStatus(state: LicenceState): PageStatus {
  return {
    kind: access(state).kind,
    isWaiting: state.isWaiting,
    note: state.note,
    product: PRODUCT,
    price: PRICE,
    about: ABOUT,
    command: `/${COMMAND}`,
  }
}

/** What a page may ask of the licence. */
export const PAGE_ACTIONS = ['buy', 'cancel', 'copy'] as const
export type PageAction = (typeof PAGE_ACTIONS)[number]
