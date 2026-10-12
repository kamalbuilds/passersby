import { type Address, type Rpc, type Signature, type SolanaRpcApi } from '@solana/kit'
import { ataAddress, TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from './program'

export type ChainRpc = Rpc<SolanaRpcApi>

const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export type MintInfo = { tokenProgram: Address; decimals: number }

export async function fetchMintInfo(rpc: ChainRpc, mint: Address): Promise<MintInfo> {
  const { value } = await rpc.getAccountInfo(mint, { encoding: 'base64', commitment: 'confirmed' }).send()
  if (!value) throw new Error(`The SKR mint ${mint} does not exist on this network.`)
  const owner = value.owner
  if (owner !== TOKEN_PROGRAM && owner !== TOKEN_2022_PROGRAM) throw new Error(`${mint} is not a token mint.`)
  const data = fromBase64(value.data[0])
  // SPL Mint layout: mint_authority COption<Pubkey> (36), supply u64 (8), decimals u8 at byte 44.
  return { tokenProgram: owner, decimals: data[44] }
}

/** Balance of the owner's associated token account in base units, 0n when the account does not exist. */
export async function fetchTokenBalance(
  rpc: ChainRpc,
  owner: Address,
  mint: Address,
  tokenProgram: Address,
): Promise<bigint> {
  const ata = ataAddress(owner, mint, tokenProgram)
  const { value } = await rpc.getAccountInfo(ata, { encoding: 'base64', commitment: 'confirmed' }).send()
  if (!value) return 0n
  const data = fromBase64(value.data[0])
  // SPL Token account layout: mint (32), owner (32), amount u64 LE at byte 64.
  return new DataView(data.buffer, data.byteOffset).getBigUint64(64, true)
}

export async function waitForSignature(
  rpc: ChainRpc,
  signature: Signature | string,
  timeoutMs = 60_000,
): Promise<void> {
  const sig = signature as Signature
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { value } = await rpc.getSignatureStatuses([sig]).send()
    const s = value[0]
    if (s?.err)
      throw new Error(
        `The transaction failed on chain: ${JSON.stringify(s.err, (_, v) => (typeof v === 'bigint' ? v.toString() : v))}`,
      )
    if (s && (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized')) return
    await new Promise((r) => setTimeout(r, 1200))
  }
  throw new Error('The wave was sent but has not confirmed yet. Check your wallet activity before sending it again.')
}
