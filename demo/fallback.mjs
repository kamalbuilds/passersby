// Second identity over HTTP, used only when two emulators cannot hear each other over BLE.
// Usage: W_SESSION=<session token of the on-device wallet> node fallback.mjs
// Creates a fresh wallet X, trades a signed message for a session, then reports mutual sightings
// between X and the on-device identity so the server records the encounter on devnet.
import {
  generateKeyPair,
  getAddressFromPublicKey,
  getBase58Decoder,
  signBytes,
} from '@solana/kit'

const BASE = (process.env.API_URL ?? 'https://passersby-api.fly.dev').replace(/\/+$/, '')
const wSession = process.env.W_SESSION
if (!wSession) throw new Error('W_SESSION is not set')

async function call(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`)
  return json
}

const kp = await generateKeyPair()
const wallet = await getAddressFromPublicKey(kp.publicKey)
const message = `passersby sign-in\nwallet: ${wallet}\nissued: ${Math.floor(Date.now() / 1000)}`
const signature = getBase58Decoder().decode(await signBytes(kp.privateKey, new TextEncoder().encode(message)))
const x = await call('POST', '/session', null, { wallet, message, signature })
const xBeacon = await call('GET', '/beacon', x.sessionToken)
const wBeacon = await call('GET', '/beacon', wSession)
if (xBeacon.token === wBeacon.token) throw new Error('both identities got the same beacon token')
console.log(`second identity ${x.identity} tier ${x.tier}`)

const sighting = (token) => ({ sightings: [{ token, rssi: -58, at: Date.now() }] })
const first = await call('POST', '/sightings', x.sessionToken, sighting(wBeacon.token))
const second = await call('POST', '/sightings', wSession, sighting(xBeacon.token))
const confirmed = [...first.confirmed, ...second.confirmed]
if (confirmed.length === 0) throw new Error('server did not confirm the encounter')
console.log(JSON.stringify(confirmed[0]))
