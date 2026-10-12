import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useQueryClient } from '@tanstack/react-query'
import { PassersbyBle, type BleError } from '@/modules/passersby-ble'
import { ApiError, describeApiError, fetchBeacon, postSightings, type Confirmation, type SightingInput } from '@/lib/api'
import { hasBlePermission, openAppSettings, openBluetoothSettings, requestBlePermission } from '@/lib/ble'
import { loadAnnounced, saveAnnounced } from '@/lib/announced'
import { useSession } from '@/features/session/session-provider'

export type RadarPhase =
  | 'off'
  | 'starting'
  | 'live'
  | 'permission-denied'
  | 'permission-blocked'
  | 'bluetooth-off'
  | 'error'

export type Nearby = { token: string; rssi: number; lastSeen: number }
export type Arrival = { confirmation: Confirmation; arrivedAt: number; fresh: boolean }

type RadarValue = {
  phase: RadarPhase
  problem: string | null
  syncError: string | null
  nearby: Nearby[]
  /** Encounters confirmed since the radar started, newest first. */
  arrivals: Arrival[]
  epochEndsAt: number | null
  retry: () => void
  openFix: () => void
}

const WINDOW_MS = 60_000
const FLUSH_MS = 10_000
const PENDING_MAX_AGE_MS = 10 * 60_000
const MIN_REFRESH_MS = 5_000
const POLL_MS = 2_000
const MAX_BATCH = 200

const RadarContext = createContext<RadarValue | null>(null)

export function useRadar(): RadarValue {
  const ctx = useContext(RadarContext)
  if (!ctx) throw new Error('useRadar must be used inside RadarProvider')
  return ctx
}

const ADVERTISE_ERRORS: Record<number, string> = {
  1: 'The broadcast payload was too large.',
  2: 'Your phone has no free Bluetooth advertising slot. Close other Bluetooth apps and retry.',
  3: 'Broadcasting was already running.',
  4: 'Bluetooth hit an internal error while broadcasting.',
  5: 'This phone cannot broadcast over Bluetooth LE.',
}
const SCAN_ERRORS: Record<number, string> = {
  1: 'Scanning was already running.',
  2: 'Bluetooth could not register the scanner. Toggle Bluetooth and retry.',
  3: 'Bluetooth hit an internal error while scanning.',
  4: 'This phone cannot scan over Bluetooth LE.',
  5: 'Your phone ran out of Bluetooth scanning resources. Close other Bluetooth apps and retry.',
  6: 'Android paused scanning because it restarted too often. Wait a minute and retry.',
}

function bleErrorMessage(e: BleError): string {
  const table = e.stage === 'advertise' ? ADVERTISE_ERRORS : SCAN_ERRORS
  const verb = e.stage === 'advertise' ? 'broadcast' : 'scan'
  return table[e.code] ?? `Bluetooth failed to ${verb} (code ${e.code}).`
}

export function RadarProvider({ children }: PropsWithChildren) {
  const { session, expire } = useSession()
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<RadarPhase>('off')
  const [problem, setProblem] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [nearby, setNearby] = useState<Nearby[]>([])
  const [arrivals, setArrivals] = useState<Arrival[]>([])
  const [epochEndsAt, setEpochEndsAt] = useState<number | null>(null)
  const [attempt, setAttempt] = useState(0)
  const phaseRef = useRef<RadarPhase>('off')

  const setPhaseBoth = useCallback((p: RadarPhase) => {
    phaseRef.current = p
    setPhase(p)
  }, [])

  const bearer = session?.sessionToken ?? null
  const identity = session?.identity ?? null

  useEffect(() => {
    if (!bearer || !identity) {
      setPhaseBoth('off')
      setNearby([])
      setArrivals([])
      setEpochEndsAt(null)
      return
    }
    let alive = true
    let refreshTimer: ReturnType<typeof setTimeout> | undefined
    let pollTimer: ReturnType<typeof setTimeout> | undefined
    let flushing = false
    let myToken: string | null = null
    const seen = new Map<string, Nearby>()
    const pending = new Map<string, SightingInput>()
    const announced = new Set<string>()
    const arrived = new Set<string>()
    const announcedReady = loadAnnounced(identity).then((s) => s.forEach((a) => announced.add(a)))

    const subs = [
      PassersbyBle.addListener('onSighting', (s) => {
        if (s.token === myToken) return
        const prev = seen.get(s.token)
        seen.set(s.token, { token: s.token, rssi: prev ? Math.max(prev.rssi, s.rssi) : s.rssi, lastSeen: s.at })
        const queued = pending.get(s.token)
        pending.set(s.token, {
          token: s.token,
          rssi: queued ? Math.max(queued.rssi, s.rssi) : s.rssi,
          at: s.at,
        })
      }),
      PassersbyBle.addListener('onError', (e) => {
        setProblem(bleErrorMessage(e))
        setPhaseBoth('error')
      }),
    ]

    const handleConfirmed = async (list: Confirmation[]) => {
      await announcedReady
      const added: Arrival[] = []
      for (const c of list) {
        const addr = c.encounter.address
        if (arrived.has(addr)) continue
        arrived.add(addr)
        const fresh = !announced.has(addr)
        if (fresh) announced.add(addr)
        added.push({ confirmation: c, arrivedAt: Date.now(), fresh })
      }
      if (added.length === 0 || !alive) return
      setArrivals((prev) => [...added, ...prev])
      if (added.some((a) => a.fresh)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
        saveAnnounced(identity, announced).catch(() => {})
      }
      queryClient.invalidateQueries({ queryKey: ['encounters', identity] })
    }

    const flush = async () => {
      if (flushing) return
      const now = Date.now()
      for (const [t, s] of pending) if (now - s.at > PENDING_MAX_AGE_MS) pending.delete(t)
      const batch = [...pending.values()].slice(0, MAX_BATCH)
      if (batch.length === 0) return
      flushing = true
      try {
        const confirmed = await postSightings(bearer, batch)
        for (const b of batch) {
          const cur = pending.get(b.token)
          if (cur && cur.at <= b.at) pending.delete(b.token)
        }
        if (alive) {
          setSyncError(null)
          await handleConfirmed(confirmed)
        }
      } catch (e) {
        if (e instanceof ApiError && e.unauthorized) {
          if (alive) expire()
        } else if (alive) {
          setSyncError(e instanceof ApiError ? describeApiError(e) : 'Offline. Sightings are kept and sent when you are back online.')
        }
      } finally {
        flushing = false
      }
    }

    let booting = false
    const boot = async (prompt: boolean) => {
      if (booting) return
      booting = true
      try {
        await bootOnce(prompt)
      } finally {
        booting = false
      }
    }
    const bootOnce = async (prompt: boolean) => {
      clearTimeout(refreshTimer)
      clearTimeout(pollTimer)
      if (!alive) return
      if (!(await hasBlePermission())) {
        if (!prompt) {
          if (alive) setPhaseBoth('permission-denied')
          return
        }
        setPhaseBoth('starting')
        const result = await requestBlePermission()
        if (!alive) return
        if (result !== 'granted') {
          setPhaseBoth(result === 'blocked' ? 'permission-blocked' : 'permission-denied')
          return
        }
      }
      if (!PassersbyBle.isEnabled()) {
        setPhaseBoth('bluetooth-off')
        pollTimer = setTimeout(() => boot(false), POLL_MS)
        return
      }
      if (phaseRef.current !== 'live') setPhaseBoth('starting')
      let beacon
      try {
        beacon = await fetchBeacon(bearer)
      } catch (e) {
        if (!alive) return
        if (e instanceof ApiError && e.unauthorized) {
          expire()
          return
        }
        setProblem(e instanceof ApiError ? describeApiError(e) : 'Could not reach Passersby. Retrying.')
        setPhaseBoth('error')
        pollTimer = setTimeout(() => boot(false), 10_000)
        return
      }
      if (!alive) return
      try {
        PassersbyBle.start(beacon.token)
      } catch (e) {
        const text = e instanceof Error ? e.message : String(e)
        if (/Bluetooth is off|ERR_BT_OFF/i.test(text)) {
          setPhaseBoth('bluetooth-off')
          pollTimer = setTimeout(() => boot(false), POLL_MS)
        } else {
          setProblem(text)
          setPhaseBoth('error')
        }
        return
      }
      myToken = beacon.token
      setProblem(null)
      setPhaseBoth('live')
      setEpochEndsAt(beacon.expiresAt * 1000)
      // The server answers with the same token until the epoch rolls over, so a refresh that fires
      // early on a skewed clock just reschedules itself.
      const wait = Math.max(MIN_REFRESH_MS, beacon.expiresAt * 1000 - Date.now() + 1_500)
      refreshTimer = setTimeout(() => boot(false), wait)
    }

    const flushTimer = setInterval(flush, FLUSH_MS)
    const tickTimer = setInterval(() => {
      const cutoff = Date.now() - WINDOW_MS
      for (const [t, n] of seen) if (n.lastSeen < cutoff) seen.delete(t)
      setNearby((prev) => (prev.length === 0 && seen.size === 0 ? prev : [...seen.values()]))
      if (phaseRef.current === 'live' && !PassersbyBle.isEnabled()) boot(false)
    }, 1_000)
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') boot(false)
    })

    boot(true)

    return () => {
      alive = false
      clearTimeout(refreshTimer)
      clearTimeout(pollTimer)
      clearInterval(flushTimer)
      clearInterval(tickTimer)
      appSub.remove()
      subs.forEach((s) => s.remove())
      PassersbyBle.stop()
    }
  }, [bearer, identity, attempt, expire, queryClient, setPhaseBoth])

  const retry = useCallback(() => setAttempt((a) => a + 1), [])
  const openFix = useCallback(() => {
    if (phaseRef.current === 'bluetooth-off') openBluetoothSettings().catch(() => {})
    else if (phaseRef.current === 'permission-blocked') openAppSettings().catch(() => {})
    else setAttempt((a) => a + 1)
  }, [])

  const value = useMemo<RadarValue>(
    () => ({ phase, problem, syncError, nearby, arrivals, epochEndsAt, retry, openFix }),
    [phase, problem, syncError, nearby, arrivals, epochEndsAt, retry, openFix],
  )
  return <RadarContext.Provider value={value}>{children}</RadarContext.Provider>
}
