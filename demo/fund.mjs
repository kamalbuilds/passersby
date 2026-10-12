// Usage: CI_FUNDER_KEYPAIR='[...64 bytes...]' node fund.mjs <walletA> [walletB]
// Sends 0.05 SOL to each wallet and 20 SKR (devnet) to wallet A, creating its token account.
// Reads the funder key from the environment only and prints public data only.
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  getAddressEncoder,
  getBase64EncodedWireTransaction,
  getProgramDerivedAddress,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from '@solana/kit'

const RPC = process.env.DEVNET_RPC_URL ?? 'https://api.devnet.solana.com'
const MINT = address('3BySLyP6nGFKDfFdfcsuT4ZmcndDsnsiLsHMCToT5i5V')
const SYSTEM = address('11111111111111111111111111111111')
const TOKEN = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
const TOKEN_2022 = address('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')
const ATA_PROGRAM = address('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
const SOL_EACH = 50_000_000n
const SKR_TO_A = 20n

const [walletA, walletB] = process.argv.slice(2).map(address)
if (!walletA) throw new Error('usage: node fund.mjs <walletA> [walletB]')
const raw = process.env.CI_FUNDER_KEYPAIR
if (!raw) throw new Error('CI_FUNDER_KEYPAIR is not set')

const rpc = createSolanaRpc(RPC)
const funder = await createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(raw)))
const enc = getAddressEncoder()

const mintInfo = (await rpc.getAccountInfo(MINT, { encoding: 'base64' }).send()).value
if (!mintInfo) throw new Error('SKR mint missing on devnet')
const tokenProgram = mintInfo.owner
if (tokenProgram !== TOKEN && tokenProgram !== TOKEN_2022) throw new Error(`mint owner ${mintInfo.owner} is not a token program`)
const decimals = Buffer.from(mintInfo.data[0], 'base64')[44]

const ata = async (owner) =>
  (await getProgramDerivedAddress({ programAddress: ATA_PROGRAM, seeds: [enc.encode(owner), enc.encode(tokenProgram), enc.encode(MINT)] }))[0]
const u64 = (n) => {
  const b = Buffer.alloc(8)
  b.writeBigUInt64LE(n)
  return b
}
const W = AccountRole.WRITABLE
const R = AccountRole.READONLY

const funderAta = await ata(funder.address)
const ataA = await ata(walletA)
const amount = SKR_TO_A * 10n ** BigInt(decimals)

const solTransfer = (to) => ({
  programAddress: SYSTEM,
  accounts: [
    { address: funder.address, role: AccountRole.WRITABLE_SIGNER, signer: funder },
    { address: to, role: W },
  ],
  data: Buffer.concat([Buffer.from([2, 0, 0, 0]), u64(SOL_EACH)]),
})
const instructions = [
  solTransfer(walletA),
  ...(walletB ? [solTransfer(walletB)] : []),
  {
    programAddress: ATA_PROGRAM,
    accounts: [
      { address: funder.address, role: AccountRole.WRITABLE_SIGNER, signer: funder },
      { address: ataA, role: W },
      { address: walletA, role: R },
      { address: MINT, role: R },
      { address: SYSTEM, role: R },
      { address: tokenProgram, role: R },
    ],
    data: Buffer.from([1]),
  },
  {
    programAddress: tokenProgram,
    accounts: [
      { address: funderAta, role: W },
      { address: MINT, role: R },
      { address: ataA, role: W },
      { address: funder.address, role: AccountRole.READONLY_SIGNER, signer: funder },
    ],
    data: Buffer.concat([Buffer.from([12]), u64(amount), Buffer.from([decimals])]),
  },
]

const tokenBalance = async (acct) => {
  const r = await rpc.getTokenAccountBalance(acct, { commitment: 'confirmed' }).send().catch(() => null)
  return r ? BigInt(r.value.amount) : 0n
}
const sol = async (a) => (await rpc.getBalance(a, { commitment: 'confirmed' }).send()).value

console.log(`funder ${funder.address} sol ${Number(await sol(funder.address)) / 1e9} skr ${Number(await tokenBalance(funderAta)) / 10 ** decimals}`)

let signature
for (let attempt = 1; attempt <= 4 && !signature; attempt++) {
  try {
    const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send()
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(funder, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) => appendTransactionMessageInstructions(instructions, m),
    )
    const signed = await signTransactionMessageWithSigners(message)
    const sig = await rpc.sendTransaction(getBase64EncodedWireTransaction(signed), { encoding: 'base64', preflightCommitment: 'confirmed' }).send()
    const deadline = Date.now() + 60_000
    for (;;) {
      const st = (await rpc.getSignatureStatuses([sig]).send()).value[0]
      if (st?.err) throw new Error(`transaction failed: ${JSON.stringify(st.err, (_, v) => (typeof v === 'bigint' ? String(v) : v))}`)
      if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) break
      if (Date.now() > deadline) throw new Error('confirmation timeout')
      await new Promise((r) => setTimeout(r, 1500))
    }
    signature = sig
  } catch (e) {
    console.error(`attempt ${attempt} failed: ${e.message}`)
    if (attempt === 4) throw e
    await new Promise((r) => setTimeout(r, 3000))
  }
}

const post = { solA: await sol(walletA), solB: walletB ? await sol(walletB) : SOL_EACH, skrA: await tokenBalance(ataA) }
console.log(`funding tx ${signature}`)
console.log(`A ${walletA} sol ${Number(post.solA) / 1e9} skr ${Number(post.skrA) / 10 ** decimals}`)
if (walletB) console.log(`B ${walletB} sol ${Number(post.solB) / 1e9}`)
if (post.solA < SOL_EACH || post.solB < SOL_EACH || post.skrA < amount) throw new Error('post-condition failed: balances below the funded amounts')
