import { useSyncExternalStore } from 'react'

export type WaveRecord = { amount: number; signature: string }

// Waves sent during this app run, keyed by Encounter account. The chain is the record of the transfer;
// this only lets a card say "Waved 5 SKR" until the app is closed.
const log = new Map<string, WaveRecord>()
const listeners = new Set<() => void>()
let snapshot: ReadonlyMap<string, WaveRecord> = new Map()

export function recordWave(encounter: string, rec: WaveRecord) {
  log.set(encounter, rec)
  snapshot = new Map(log)
  listeners.forEach((l) => l())
}

export function useWaveLog(): ReadonlyMap<string, WaveRecord> {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => snapshot,
  )
}
