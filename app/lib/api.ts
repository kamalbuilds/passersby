import { API_URL } from '@/constants/api'

export type Tier = 'seeker' | 'wallet'

export type Peer = { identity: string; wallet: string; tier: Tier }

export type SessionResponse = { sessionToken: string; identity: string; tier: Tier }
export type Beacon = { token: string; epoch: number; expiresAt: number }
export type SightingInput = { token: string; rssi: number; at: number }

export type EncounterRecord = {
  address: string
  lo: string
  hi: string
  loWallet: string
  hiWallet: string
  day: number
  verified: boolean
  firstSeen: number
}

export type ProfileRecord = {
  address: string
  identity: string
  wallet: string
  tier: Tier
  encounters: number
  verifiedEncounters: number
  streak: number
  lastDay: number
  wavesReceived: number
}

export type Confirmation = { signature: string | null; encounter: EncounterRecord; other: Peer }
export type EncountersResponse = { encounters: EncounterRecord[]; profile: ProfileRecord | null }

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code)
  }
  get unauthorized() {
    return this.status === 401
  }
}

const API_MESSAGES: Record<string, string> = {
  bad_signature: 'Your wallet signature could not be verified. Try again.',
  message_expired: 'Your phone clock is off by more than five minutes. Fix the time and try again.',
  rpc_unavailable: 'Passersby could not check your Seeker token right now. Try again in a minute.',
  malformed_message: 'The sign-in message was rejected. Update the app and try again.',
  wallet_mismatch: 'The sign-in message was rejected. Update the app and try again.',
  bad_request: 'The request was rejected. Update the app and try again.',
  unauthorized: 'Your session ended. Sign in again.',
}

export function describeApiError(e: unknown): string {
  if (e instanceof ApiError) return API_MESSAGES[e.code] ?? `The Passersby server returned an error (${e.code}).`
  return e instanceof Error ? e.message : String(e)
}

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers, ...rest } = init
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    })
  } catch {
    throw new Error('Network request failed')
  }
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  if (!res.ok) {
    const code =
      body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `http_${res.status}`
    throw new ApiError(res.status, code)
  }
  return body as T
}

const isString = (v: unknown): v is string => typeof v === 'string'
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object'

export async function createSession(wallet: string, message: string, signature: string): Promise<SessionResponse> {
  const r = await request<unknown>('/session', { method: 'POST', body: JSON.stringify({ wallet, message, signature }) })
  if (
    !isRecord(r) ||
    !isString(r.sessionToken) ||
    !isString(r.identity) ||
    (r.tier !== 'seeker' && r.tier !== 'wallet')
  ) {
    throw new Error('The Passersby server returned an unexpected sign-in response.')
  }
  return { sessionToken: r.sessionToken, identity: r.identity, tier: r.tier }
}

export async function fetchBeacon(token: string): Promise<Beacon> {
  const r = await request<unknown>('/beacon', { token })
  if (
    !isRecord(r) ||
    !isString(r.token) ||
    !/^[0-9a-f]{32}$/i.test(r.token) ||
    typeof r.epoch !== 'number' ||
    typeof r.expiresAt !== 'number'
  ) {
    throw new Error('The Passersby server returned an unexpected beacon.')
  }
  return { token: r.token.toLowerCase(), epoch: r.epoch, expiresAt: r.expiresAt }
}

export async function postSightings(token: string, sightings: SightingInput[]): Promise<Confirmation[]> {
  const r = await request<unknown>('/sightings', { method: 'POST', token, body: JSON.stringify({ sightings }) })
  if (!isRecord(r) || !Array.isArray(r.confirmed))
    throw new Error('The Passersby server returned an unexpected response.')
  return r.confirmed as Confirmation[]
}

export async function fetchEncounters(identity: string): Promise<EncountersResponse> {
  const r = await request<unknown>(`/encounters?identity=${encodeURIComponent(identity)}`)
  if (!isRecord(r) || !Array.isArray(r.encounters))
    throw new Error('The Passersby server returned an unexpected response.')
  return { encounters: r.encounters as EncounterRecord[], profile: (r.profile as ProfileRecord | null) ?? null }
}
