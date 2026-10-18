// Node.js 18 or newer runs the Drips page's helper: found at the session
// start, as Workspaces finds it.

export type Probe = {
  /** A command's output, or null when it could not run. */
  run(argv: readonly string[]): Promise<{ exitCode: number; stdout: string } | null>
}

async function isNode18(p: Probe, node: string): Promise<boolean> {
  const r = await p.run([node, '--version'])
  const major = Number(/^v(\d+)\./.exec(r?.stdout.trim() ?? '')?.[1])
  return r?.exitCode === 0 && major >= 18
}

/** Node on the session's PATH, else the login shell's, else Homebrew's or /usr/local's. */
export async function findNode(p: Probe): Promise<string | null> {
  if (await isNode18(p, 'node')) return 'node'
  const shell = await p.run(['/bin/zsh', '-lc', 'command -v node'])
  const found = shell?.exitCode === 0 ? (shell.stdout.trim().split('\n').pop() ?? '') : ''
  for (const node of [found, '/opt/homebrew/bin/node', '/usr/local/bin/node']) {
    if (node.startsWith('/') && (await isNode18(p, node))) return node
  }
  return null
}

export const NODE_MISSING = "The Drips page needs Node.js 18 or newer (https://nodejs.org). Install it, then start a new session."
