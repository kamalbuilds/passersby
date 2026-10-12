import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { address, AccountRole, getProgramDerivedAddress, getAddressEncoder, type Address } from '@solana/kit'
import { ACTIVE_CLUSTER } from '@/constants/cluster'
import { formatUnits, liveStreak, relativeTime } from './format'
import { glyphCells } from './identicon'
import { ataAddress, discriminator, encounterAddress, profileAddress, waveInstruction, configAddress } from './program'
import { extractSignature } from './sign-in'

// The program lane publishes its IDL here. The tests read it so the app cannot drift from the program.
const IDL = JSON.parse(readFileSync(resolve(process.cwd(), '../program/target/idl/passersby.json'), 'utf8')) as {
  address: string
  instructions: {
    name: string
    discriminator: number[]
    accounts: { name: string; writable?: boolean; signer?: boolean }[]
  }[]
  errors: { code: number; name: string }[]
}
const WAVE = IDL.instructions.find((i) => i.name === 'wave')!
const enc = getAddressEncoder()
const utf8 = new TextEncoder()

const lo = address('11111111111111111111111111111112')
const hi = address('4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T')
const loWallet = address('9zSRzo8Fm1NQ8xAk2EV4Jeqtk5eaUBwvy4YbJmpQBfAX')
const hiWallet = address('2bgD83ZSF8vehRfEadp5iPW1YGhnMpQDQPD5jZLzCccW')
const TOKEN = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')

const pda = async (program: Address, seeds: Uint8Array[]) =>
  (await getProgramDerivedAddress({ programAddress: program, seeds }))[0]

const ix = () =>
  waveInstruction({
    signer: loWallet,
    receiver: hiWallet,
    receiverIdentity: hi,
    lo,
    hi,
    day: 20_000,
    mint: ACTIVE_CLUSTER.skrMint,
    tokenProgram: TOKEN,
    amount: 5_000_000n,
  })

test('app program id is the id in the IDL', () => {
  assert.equal(ACTIVE_CLUSTER.programId, IDL.address)
})

test('wave discriminator equals the IDL discriminator', () => {
  assert.deepEqual([...discriminator('wave')], WAVE.discriminator)
})

test('wave data is discriminator then amount u64 LE', () => {
  const data = ix().data as Uint8Array
  assert.equal(data.length, 16)
  assert.deepEqual([...data.slice(0, 8)], WAVE.discriminator)
  assert.equal(new DataView(data.buffer, data.byteOffset + 8).getBigUint64(0, true), 5_000_000n)
})

test('wave accounts follow the IDL order with matching signer and writable flags', () => {
  const accounts = ix().accounts!
  assert.equal(accounts.length, WAVE.accounts.length)
  WAVE.accounts.forEach((want, i) => {
    const role = accounts[i].role
    const isSigner = role === AccountRole.WRITABLE_SIGNER || role === AccountRole.READONLY_SIGNER
    const isWritable = role === AccountRole.WRITABLE || role === AccountRole.WRITABLE_SIGNER
    assert.equal(isSigner, !!want.signer, `${want.name} signer`)
    assert.equal(isWritable, !!want.writable, `${want.name} writable`)
  })
})

test('derived addresses match kit PDA derivation for the IDL seeds', async () => {
  const program = ACTIVE_CLUSTER.programId!
  const accounts = ix().accounts!
  const day = new Uint8Array(4)
  new DataView(day.buffer).setUint32(0, 20_000, true)
  assert.equal(accounts[1].address, await pda(program, [utf8.encode('config')]))
  assert.equal(
    accounts[2].address,
    await pda(program, [utf8.encode('encounter'), enc.encode(lo) as Uint8Array, enc.encode(hi) as Uint8Array, day]),
  )
  const mint = ACTIVE_CLUSTER.skrMint
  const ataProgram = address('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
  const ataOf = (owner: Address) =>
    pda(ataProgram, [enc.encode(owner) as Uint8Array, enc.encode(TOKEN) as Uint8Array, enc.encode(mint) as Uint8Array])
  assert.equal(accounts[4].address, await ataOf(loWallet))
  assert.equal(accounts[6].address, await ataOf(hiWallet))
  assert.equal(accounts[7].address, await pda(program, [utf8.encode('profile'), enc.encode(hi) as Uint8Array]))
  assert.equal(accounts[5].address, hiWallet)
  assert.equal(accounts[3].address, mint)
  assert.equal(configAddress(), accounts[1].address)
  assert.equal(profileAddress(hi), accounts[7].address)
  assert.equal(encounterAddress(lo, hi, 20_000), accounts[2].address)
  assert.equal(ataAddress(hiWallet, mint, TOKEN), accounts[6].address)
})

test('program error codes the app words are the IDL codes of the same names', () => {
  const byName = Object.fromEntries(IDL.errors.map((e) => [e.name, e.code]))
  assert.equal(byName.InvalidAmount, 6012)
  assert.equal(byName.NotParticipant, 6013)
  assert.equal(byName.WrongReceiver, 6014)
})

test('extractSignature accepts message+signature and bare signature, rejects anything else', () => {
  const msg = utf8.encode('passersby sign-in')
  const sig = new Uint8Array(64).fill(7)
  assert.deepEqual(extractSignature(new Uint8Array([...msg, ...sig]), msg), sig)
  assert.deepEqual(extractSignature(sig, msg), sig)
  assert.throws(() => extractSignature(new Uint8Array(10), msg))
})

test('formatting helpers', () => {
  assert.equal(formatUnits(5_000_000n, 6), '5')
  assert.equal(formatUnits(1_500_000n, 6), '1.5')
  assert.equal(formatUnits(0n, 6), '0')
  assert.equal(liveStreak(4, 100, 101), 4)
  assert.equal(liveStreak(4, 100, 102), 0)
  const now = 1_800_000_000_000
  assert.equal(relativeTime(now / 1000 - 10, now), 'just now')
  assert.equal(relativeTime(now / 1000 - 600, now), '10 min ago')
  assert.equal(relativeTime(now / 1000 - 86_400 * 1.2, now), 'yesterday')
})

test('glyph is deterministic, mirrored, and differs between people', () => {
  const a = glyphCells(hi)
  assert.deepEqual(a, glyphCells(hi))
  for (const row of a) assert.deepEqual(row.slice(0, 2), [row[4], row[3]])
  assert.notDeepEqual(a, glyphCells(lo))
})
