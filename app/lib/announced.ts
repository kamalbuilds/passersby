import AsyncStorage from '@react-native-async-storage/async-storage'

// Encounter accounts this phone has already celebrated. The server replays a confirmed pair on every
// batch for as long as both phones stay in range, and again after a restart, so without this the
// haptic would fire for the same person all afternoon.
const KEY = (identity: string) => `passersby.announced.v1.${identity}`
const MAX = 300

export async function loadAnnounced(identity: string): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(KEY(identity))
  if (!raw) return new Set()
  try {
    const list = JSON.parse(raw) as unknown
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

export async function saveAnnounced(identity: string, set: Set<string>): Promise<void> {
  await AsyncStorage.setItem(KEY(identity), JSON.stringify([...set].slice(-MAX)))
}
