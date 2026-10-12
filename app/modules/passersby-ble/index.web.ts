import type { EventSubscription } from 'expo-modules-core'
import type { BleError, Sighting } from './index'

// Web has no Bluetooth LE advertiser or scanner: the module reports Bluetooth as off, so the app draws
// its dark-street state instead of crashing on a missing native module.
const none: EventSubscription = { remove() {} }

export const PassersbyBle = {
  isEnabled: (): boolean => false,
  start(_tokenHex: string): void {},
  stop(): void {},
  addListener(_event: 'onSighting' | 'onError', _cb: (e: Sighting & BleError) => void): EventSubscription {
    return none
  },
}
