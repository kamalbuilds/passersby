import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Tier } from './api'

export type StoredSession = {
  sessionToken: string
  identity: string
  wallet: string
  tier: Tier
  /** Unix seconds when the server issued it. Sessions live 24 h on the server. */
  issuedAt: number
}

const KEY = 'passersby.session.v1'
// Drop a stored session an hour before the server's 24 h expiry so a walk never starts on a dying token.
const MAX_AGE_SECONDS = 23 * 60 * 60

export async function loadSession(nowSeconds: number): Promise<StoredSession | null> {
  const raw = await AsyncStorage.getItem(KEY)
  if (!raw) return null
  try {
    const s = JSON.parse(raw) as Partial<StoredSession>
    if (
      typeof s.sessionToken !== 'string' ||
      typeof s.identity !== 'string' ||
      typeof s.wallet !== 'string' ||
      typeof s.issuedAt !== 'number' ||
      (s.tier !== 'seeker' && s.tier !== 'wallet')
    ) {
      await AsyncStorage.removeItem(KEY)
      return null
    }
    if (nowSeconds - s.issuedAt > MAX_AGE_SECONDS) {
      await AsyncStorage.removeItem(KEY)
      return null
    }
    return s as StoredSession
  } catch {
    await AsyncStorage.removeItem(KEY)
    return null
  }
}

export const saveSession = (s: StoredSession) => AsyncStorage.setItem(KEY, JSON.stringify(s))
export const clearSession = () => AsyncStorage.removeItem(KEY)
