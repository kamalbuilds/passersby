import type { EncounterRecord } from '@/lib/api'

export type EncounterView = {
  record: EncounterRecord
  myIdentity: string
  myWallet: string
  otherIdentity: string
  otherWallet: string
}

/** Orients an on-chain Encounter around the person holding the phone. Null when they are not a party to it. */
export function viewOf(record: EncounterRecord, myIdentity: string): EncounterView | null {
  if (record.lo === myIdentity) {
    return { record, myIdentity, myWallet: record.loWallet, otherIdentity: record.hi, otherWallet: record.hiWallet }
  }
  if (record.hi === myIdentity) {
    return { record, myIdentity, myWallet: record.hiWallet, otherIdentity: record.lo, otherWallet: record.loWallet }
  }
  return null
}
