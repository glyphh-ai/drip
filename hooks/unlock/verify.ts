// Copied from shared/unlock/verify.ts by scripts/sync-shared.mjs: edit it there.
// A licence is base64url(JSON payload) "." base64url(Ed25519 signature over
// the first part), signed by the server. Checked here, offline, with the public
// key in ./server: no call home once a mod holds one. The mods' environment
// has crypto.subtle.digest but no importKey, so the signature is checked by
// @noble/ed25519 (./vendor), which hashes with that digest.
import { PUBLIC_KEY } from './server.ts'
import { verifyAsync } from './vendor/ed25519.ts'

export type Licence = { v: 1; mod: string; install: string; session: string; issued: string }

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export function fromB64url(text: string): Uint8Array {
  const clean = text.replace(/=+$/, '')
  if (!/^[A-Za-z0-9_-]*$/.test(clean)) throw new Error('not base64url')
  const out: number[] = []
  let bits = 0
  let acc = 0
  for (const ch of clean) {
    acc = ((acc << 6) | ALPHABET.indexOf(ch)) & 0xffffff
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((acc >> bits) & 0xff)
    }
  }
  return new Uint8Array(out)
}

/** The licence's payload when its signature holds and it is for `mod`; else null. */
export async function verify(licence: string, mod: string, publicKey = PUBLIC_KEY): Promise<Licence | null> {
  const parts = licence.trim().split('.')
  if (parts.length !== 2) return null
  try {
    const ok = await verifyAsync(fromB64url(parts[1]!), new TextEncoder().encode(parts[0]), fromB64url(publicKey))
    if (!ok) return null
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(parts[0]!))) as Partial<Licence>
    return payload.v === 1 && payload.mod === mod ? (payload as Licence) : null
  } catch {
    return null
  }
}
