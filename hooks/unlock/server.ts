// Copied from shared/unlock/server.ts by scripts/sync-shared.mjs: edit it there.
// The Glyphh server a one-time licence is fetched from once paid, and the
// key it signs licences with (the same as the account module's). Dev values:
// scripts/build.mjs swaps in the live ones from release.json.
export const SERVER = 'http://localhost:8080'
export const PUBLIC_KEY = 'LBZCuL7YrfirHogb_N5Iai0lQDaig-3VP8watWltwf0'

/** How often the server is asked during checkout, and for how long. */
export const POLL_MS = 3_000
export const WAIT_MS = 10 * 60_000
