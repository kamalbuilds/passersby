import { ed25519 } from '@noble/curves/ed25519.js'
import { getAddressEncoder, getBase58Decoder, type Address } from '@solana/kit'

const b58 = getBase58Decoder()
const addrBytes = getAddressEncoder()

export function signInMessage(wallet: Address, issuedSeconds: number): string {
  return `passersby sign-in\nwallet: ${wallet}\nissued: ${issuedSeconds}`
}

/**
 * A wallet's signMessages result is the message with the 64-byte signature appended.
 * Some wallets return only the signature, so both shapes are accepted.
 */
export function extractSignature(signed: Uint8Array, message: Uint8Array): Uint8Array {
  if (signed.length === 64) return signed
  if (signed.length === message.length + 64) return signed.slice(message.length)
  throw new Error('The wallet returned an unexpected signed message.')
}

export function verifyWalletSignature(wallet: Address, message: Uint8Array, signature: Uint8Array): boolean {
  return ed25519.verify(signature, message, Uint8Array.from(addrBytes.encode(wallet)))
}

export const signatureToBase58 = (signature: Uint8Array): string => b58.decode(signature)
