import { describe, expect, test } from 'claude-code/testing'

import { findNode, type Probe } from '../hooks/drips/node.ts'

function probe(nodes: Record<string, string>, shell = '') {
  const p: Probe = {
    run: async argv => {
      if (argv[0] === '/bin/zsh') return shell ? { exitCode: 0, stdout: shell } : { exitCode: 1, stdout: '' }
      const v = nodes[argv[0]!]
      return v === undefined ? null : { exitCode: 0, stdout: v }
    },
  }
  return p
}

describe('Node for the page', () => {
  test("the session's node when it is 18 or newer", async () => {
    expect(await findNode(probe({ node: 'v22.1.0\n' }))).toBe('node')
  })

  test("else the login shell's, then Homebrew's, then /usr/local's", async () => {
    expect(await findNode(probe({ node: 'v16.0.0', '/x/bin/node': 'v20.0.0' }, '/x/bin/node\n'))).toBe('/x/bin/node')
    expect(await findNode(probe({ '/opt/homebrew/bin/node': 'v20.0.0' }))).toBe('/opt/homebrew/bin/node')
    expect(await findNode(probe({ '/usr/local/bin/node': 'v18.2.0' }))).toBe('/usr/local/bin/node')
  })

  test('none at all, or only an old one', async () => {
    expect(await findNode(probe({}))).toBeNull()
    expect(await findNode(probe({ node: 'v14.0.0' }))).toBeNull()
  })
})
