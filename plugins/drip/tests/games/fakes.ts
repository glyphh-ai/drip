// Small helpers for the tests: process results and letting pending work run.
import type { ProcessRunResult } from 'claude-code'

export const done = (stdout = '', exitCode = 0, stderr = ''): ProcessRunResult => ({
  exitCode,
  stdout,
  stderr,
  isStdoutTruncated: false,
  isStderrTruncated: false,
})

/** Lets pending promise work run. */
export const flush = async (times = 10) => {
  for (let i = 0; i < times; i++) await Promise.resolve()
}
