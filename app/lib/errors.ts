// Program error codes: Anchor numbers the PassersbyError enum from 6000 in declaration order
// (program/programs/passersby/src/lib.rs). Only the codes a wave can hit are worded for the user.
const PROGRAM_ERRORS: Record<number, string> = {
  6012: 'A wave must be at least 1 SKR.',
  6013: 'Only the two people in this encounter can wave.',
  6014: 'This encounter does not match the person you are waving at.',
}

// SPL Token program error codes.
const TOKEN_ERRORS: Record<number, string> = {
  1: 'Your wallet does not hold enough SKR for this wave.',
}

export class UserError extends Error {}

function findCustomCode(value: unknown): number | null {
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>
    if ('Custom' in v) return Number(v.Custom)
    for (const k of Object.keys(v)) {
      const found = findCustomCode(v[k])
      if (found !== null) return found
    }
  }
  return null
}

/** Turns a simulation `err` object into one sentence for the user. */
export function describeSimulationError(err: unknown): string {
  if (typeof err === 'string') {
    if (err === 'AccountNotFound') return 'Your wallet needs a little SOL on this network to pay the network fee.'
    if (err === 'InsufficientFundsForRent') return 'Your wallet needs a little more SOL to set up the receiver account.'
    return `The network rejected this wave (${err}).`
  }
  const code = findCustomCode(err)
  if (code !== null) {
    if (code >= 6000 && PROGRAM_ERRORS[code]) return PROGRAM_ERRORS[code]
    if (code < 6000 && TOKEN_ERRORS[code]) return TOKEN_ERRORS[code]
    return `The network rejected this wave (error ${code}).`
  }
  if (err && typeof err === 'object' && 'InsufficientFundsForRent' in err) {
    return 'Your wallet needs a little more SOL to set up the receiver account.'
  }
  return 'The network rejected this wave.'
}

/** Normalises wallet and network failures. Cancelling in the wallet is not an error worth shouting about. */
export function describeError(e: unknown): { message: string; cancelled: boolean } {
  const text = e instanceof Error ? e.message : String(e)
  if (/declined|reject|cancel|CancellationException|ERROR_AUTHORIZATION_FAILED/i.test(text)) {
    return { message: 'Cancelled in your wallet.', cancelled: true }
  }
  if (/found no installed wallet|no wallet|ERROR_WALLET_NOT_FOUND/i.test(text)) {
    return {
      message: 'No Solana wallet app was found on this phone. Install one that supports Mobile Wallet Adapter.',
      cancelled: false,
    }
  }
  if (e instanceof UserError) return { message: e.message, cancelled: false }
  if (/Network request failed|fetch failed|timeout/i.test(text)) {
    return { message: 'Could not reach the network. Check your connection and try again.', cancelled: false }
  }
  return { message: text, cancelled: false }
}
