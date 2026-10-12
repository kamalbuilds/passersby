import { useMemo } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { NetworkChip } from '@/components/ui/network-chip'
import { Screen } from '@/components/ui/screen'
import { T } from '@/components/ui/text'
import { space } from '@/constants/theme'
import type { ProfileRecord } from '@/lib/api'
import { EncounterCard } from '@/features/encounters/encounter-card'
import { viewOf, type EncounterView } from '@/features/encounters/encounter-view'
import { useEncounters } from '@/features/encounters/use-encounters'
import { useSession } from '@/features/session/session-provider'
import { SignInPrompt } from '@/features/session/sign-in-prompt'
import { liveStreak, utcDay } from '@/lib/format'
import { useNow } from '@/lib/use-now'
import { RadarDisc } from './radar-disc'
import { useRadar } from './radar-provider'
import { RadarStatus } from './radar-status'

const FRESH_MS = 20_000

function SignedOut() {
  return (
    <View style={styles.block}>
      <T v="headline" style={styles.promise}>
        Walk past another Seeker. Both phones remember.
      </T>
      <SignInPrompt reason="Your phone broadcasts a code that changes every five minutes, never your address. When two phones hear each other, the meeting is written on Solana." />
    </View>
  )
}

function Today({
  views,
  profile,
  freshAddresses,
  nowMs,
}: {
  views: EncounterView[]
  profile: ProfileRecord | null
  freshAddresses: Map<string, boolean>
  nowMs: number
}) {
  const today = utcDay(nowMs)
  const streak = profile ? liveStreak(profile.streak, profile.lastDay, today) : 0
  return (
    <View style={styles.today}>
      <View style={styles.todayHead}>
        <T v="title">Today</T>
        <T v="mono" c="inkDim" tabular>
          {streak} day streak · {views.length} met
        </T>
      </View>
      {views.length === 0 ? (
        <T v="body" c="inkDim">
          {streak > 0
            ? `Meet one person today to keep your ${streak} day streak.`
            : 'Nobody yet. Keep this screen open while you walk. When two phones hear each other, the meeting lands here.'}
        </T>
      ) : (
        <View style={styles.list}>
          {views.map((v) => (
            <EncounterCard
              key={v.record.address}
              view={v}
              nowMs={nowMs}
              animate={freshAddresses.has(v.record.address)}
              fresh={freshAddresses.get(v.record.address) === true}
            />
          ))}
        </View>
      )}
    </View>
  )
}

export function RadarScreen() {
  const { width } = useWindowDimensions()
  const { status, session } = useSession()
  const radar = useRadar()
  const { views, profile } = useEncounters()
  const nowMs = useNow(5_000)
  const size = Math.min(width - space.xl * 2, 320)
  const signedIn = status === 'signed-in' && !!session
  const live = signedIn && radar.phase === 'live'

  const { todayViews, freshAddresses } = useMemo(() => {
    const today = utcDay(nowMs)
    const map = new Map<string, EncounterView>()
    for (const v of views) if (v.record.day === today) map.set(v.record.address, v)
    const fresh = new Map<string, boolean>()
    if (session) {
      for (const a of radar.arrivals) {
        const view = viewOf(a.confirmation.encounter, session.identity)
        if (!view) continue
        if (!map.has(view.record.address)) map.set(view.record.address, view)
        if (a.fresh) fresh.set(view.record.address, nowMs - a.arrivedAt < FRESH_MS)
      }
    }
    return {
      todayViews: [...map.values()].sort((a, b) => b.record.firstSeen - a.record.firstSeen),
      freshAddresses: fresh,
    }
  }, [views, radar.arrivals, session, nowMs])

  return (
    <Screen>
      <View style={styles.header}>
        <T v="title" style={styles.wordmark}>
          passersby
        </T>
        <NetworkChip />
      </View>

      <View style={styles.disc}>
        <RadarDisc size={size} nearby={radar.nearby} live={live} idleLabel={signedIn ? 'Radar paused' : 'Radar off'} />
      </View>

      {signedIn ? (
        <View style={styles.block}>
          <RadarStatus />
          <Today views={todayViews} profile={profile} freshAddresses={freshAddresses} nowMs={nowMs} />
        </View>
      ) : status === 'loading' ? null : (
        <SignedOut />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xl },
  wordmark: { fontSize: 17, letterSpacing: -0.2 },
  disc: { alignItems: 'center', marginBottom: space.xl },
  block: { gap: space.lg },
  promise: { fontSize: 26, lineHeight: 34 },
  today: { gap: space.md, marginTop: space.md },
  todayHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  list: { gap: space.md },
})
