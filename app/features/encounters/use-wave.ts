import { useCallback } from 'react'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import {
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  getBase58Decoder,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signAndSendTransactionMessageWithSigners,
  address,
} from '@solana/kit'
import { ACTIVE_CLUSTER } from '@/constants/cluster'
import { fetchMintInfo, fetchTokenBalance, waitForSignature, type ChainRpc, type MintInfo } from '@/lib/chain'
import { describeSimulationError, UserError } from '@/lib/errors'
import { formatUnits, shortAddress } from '@/lib/format'
import { waveInstruction } from '@/lib/program'
import type { EncounterView } from './encounter-view'
import { recordWave } from './wave-log'

const b58 = getBase58Decoder()
const mintCache = new Map<string, Promise<MintInfo>>()

export const WAVE_AMOUNTS = [1, 5, 10] as const
export type WaveAmount = (typeof WAVE_AMOUNTS)[number]
export type WaveStep = 'wallet' | 'checking' | 'approve' | 'confirming'

export function useWave() {
  const { account, connect, getTransactionSigner, client } = useMobileWallet()
  const rpc = client.rpc as ChainRpc

  return useCallback(
    async (view: EncounterView, skr: WaveAmount, onStep: (s: WaveStep) => void): Promise<string> => {
      onStep('wallet')
      const wallet = account ?? (await connect())
      if (wallet.address !== view.myWallet) {
        throw new UserError(
          `You passed this person with wallet ${shortAddress(view.myWallet)}. Connect that wallet to wave.`,
        )
      }

      onStep('checking')
      const mint = ACTIVE_CLUSTER.skrMint
      let info = mintCache.get(mint)
      if (!info) {
        info = fetchMintInfo(rpc, mint)
        mintCache.set(mint, info)
        info.catch(() => mintCache.delete(mint))
      }
      const { decimals, tokenProgram } = await info
      const amount = BigInt(skr) * 10n ** BigInt(decimals)
      const balance = await fetchTokenBalance(rpc, wallet.address, mint, tokenProgram)
      if (balance < amount) {
        throw new UserError(
          `This wallet holds ${formatUnits(balance, decimals)} ${ACTIVE_CLUSTER.skrLabel}. You need ${skr} to send this wave.`,
        )
      }

      const ix = waveInstruction({
        signer: wallet.address,
        receiver: address(view.otherWallet),
        receiverIdentity: address(view.otherIdentity),
        lo: address(view.record.lo),
        hi: address(view.record.hi),
        day: view.record.day,
        mint,
        tokenProgram,
        amount,
      })
      const {
        context: { slot },
        value: blockhash,
      } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send()
      const message = pipe(
        createTransactionMessage({ version: 0 }),
        (m) => appendTransactionMessageInstructions([ix], m),
        (m) => setTransactionMessageFeePayerSigner(getTransactionSigner(wallet.address, slot), m),
        (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      )
      // Simulate first so a program error reaches the user as a sentence instead of an opaque wallet failure.
      const sim = await rpc
        .simulateTransaction(getBase64EncodedWireTransaction(compileTransaction(message)), {
          encoding: 'base64',
          sigVerify: false,
          replaceRecentBlockhash: true,
          commitment: 'confirmed',
        })
        .send()
      if (sim.value.err) throw new UserError(describeSimulationError(sim.value.err))

      onStep('approve')
      const signature = b58.decode(await signAndSendTransactionMessageWithSigners(message))
      onStep('confirming')
      await waitForSignature(rpc, signature)
      recordWave(view.record.address, { amount: skr, signature })
      return signature
    },
    [account, connect, getTransactionSigner, rpc],
  )
}
