import { sha256 } from '@noble/hashes/sha2.js'
import {
  AccountRole,
  address,
  getAddressEncoder,
  getU32Encoder,
  getU64Encoder,
  type Address,
  type Instruction,
} from '@solana/kit'
import { ACTIVE_CLUSTER } from '@/constants/cluster'
import { findProgramAddress } from './pda'

export const TOKEN_PROGRAM = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
export const TOKEN_2022_PROGRAM = address('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')
export const ATA_PROGRAM = address('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
export const SYSTEM_PROGRAM = address('11111111111111111111111111111111')

const utf8 = new TextEncoder()
const addr = getAddressEncoder()
const u32 = getU32Encoder()
const u64 = getU64Encoder()

/** Anchor instruction discriminator: sha256("global:<name>")[0..8]. Computed, never pasted. */
export const discriminator = (name: string): Uint8Array => sha256(utf8.encode(`global:${name}`)).slice(0, 8)

export function programId(): Address {
  const id = ACTIVE_CLUSTER.programId
  if (!id) throw new Error(`Passersby is not deployed on ${ACTIVE_CLUSTER.networkLabel}.`)
  return id
}

const bytes = (a: Address) => addr.encode(a) as Uint8Array

export function configAddress(): Address {
  return findProgramAddress(programId(), [utf8.encode('config')])[0]
}

export function profileAddress(identity: Address): Address {
  return findProgramAddress(programId(), [utf8.encode('profile'), bytes(identity)])[0]
}

/** Seeds ["encounter", lo, hi, day u32 LE]. lo and hi are the byte-wise sorted identities. */
export function encounterAddress(lo: Address, hi: Address, day: number): Address {
  return findProgramAddress(programId(), [
    utf8.encode('encounter'),
    bytes(lo),
    bytes(hi),
    u32.encode(day) as Uint8Array,
  ])[0]
}

export function ataAddress(owner: Address, mint: Address, tokenProgram: Address): Address {
  return findProgramAddress(ATA_PROGRAM, [bytes(owner), bytes(tokenProgram), bytes(mint)])[0]
}

export type WaveParams = {
  signer: Address
  receiver: Address
  receiverIdentity: Address
  lo: Address
  hi: Address
  day: number
  mint: Address
  tokenProgram: Address
  /** Base units of the SKR mint. */
  amount: bigint
}

const ro = (a: Address) => ({ address: a, role: AccountRole.READONLY })
const rw = (a: Address) => ({ address: a, role: AccountRole.WRITABLE })

/**
 * `wave(amount)`. Account order follows the Wave accounts struct in program/programs/passersby/src/lib.rs.
 * The IDL was not published when this was written, so the layout is built from that struct and
 * the Anchor discriminator rather than loaded from target/idl.
 */
export function waveInstruction(p: WaveParams): Instruction {
  const data = new Uint8Array(16)
  data.set(discriminator('wave'), 0)
  data.set(u64.encode(p.amount) as Uint8Array, 8)
  return {
    programAddress: programId(),
    accounts: [
      { address: p.signer, role: AccountRole.WRITABLE_SIGNER },
      ro(configAddress()),
      ro(encounterAddress(p.lo, p.hi, p.day)),
      ro(p.mint),
      rw(ataAddress(p.signer, p.mint, p.tokenProgram)),
      ro(p.receiver),
      rw(ataAddress(p.receiver, p.mint, p.tokenProgram)),
      rw(profileAddress(p.receiverIdentity)),
      ro(p.tokenProgram),
      ro(ATA_PROGRAM),
      ro(SYSTEM_PROGRAM),
    ],
    data,
  }
}
