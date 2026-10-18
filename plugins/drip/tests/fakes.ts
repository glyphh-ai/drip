// Worlds in memory for the tests: state Values, a store, process results.
import type { McpToolResult, ProcessRunResult } from 'claude-code'

import type { Store } from '../hooks/drips/library.ts'
import type { Value } from '../hooks/drips/window.ts'

export function value<T>(initial: T): Value<T> & { now(): T } {
  let v = initial
  return {
    get: async () => v,
    set: async fn => {
      v = fn(v)
    },
    now: () => v,
  }
}

export function memStore(entries: Record<string, unknown> = {}): Store & { map: Map<string, unknown> } {
  const map = new Map<string, unknown>(Object.entries(entries))
  return { map, get: async k => map.get(k), set: async (k, v) => void map.set(k, v) }
}

export const done = (stdout = '', exitCode = 0, stderr = ''): ProcessRunResult => ({
  exitCode,
  stdout,
  stderr,
  isStdoutTruncated: false,
  isStderrTruncated: false,
})

export const mcpText = (text: string, isError = false): McpToolResult => ({ content: [{ type: 'text', text }], isError })

/** Lets pending promise work run. */
export const flush = async (times = 10) => {
  for (let i = 0; i < times; i++) await Promise.resolve()
}
