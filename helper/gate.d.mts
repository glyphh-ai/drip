export function sameSecret(given: unknown, secret: string): boolean
export function isLocal(req: { host?: string; origin?: string }, port: number): boolean
export function isAllowed(req: { host?: string; origin?: string; token?: unknown }, gate: { port: number; secret: string }): boolean
export function openKeys(options: { random: () => string; ttlMs?: number }): {
  issue(now: number): string
  consume(key: unknown, now: number): boolean
}
