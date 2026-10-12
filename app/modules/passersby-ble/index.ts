import { EventSubscription, requireNativeModule } from 'expo-modules-core'

export type Sighting = { token: string; rssi: number; at: number }
export type BleError = { stage: 'advertise' | 'scan'; code: number }

type Native = {
  isEnabled(): boolean
  start(tokenHex: string): void
  stop(): void
  addListener(event: 'onSighting', cb: (s: Sighting) => void): EventSubscription
  addListener(event: 'onError', cb: (e: BleError) => void): EventSubscription
}

export const PassersbyBle = requireNativeModule<Native>('PassersbyBle')
