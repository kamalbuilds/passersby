import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { Button } from '@/components/ui/button'
import { Dots } from '@/components/ui/dots'
import { T } from '@/components/ui/text'
import { ACTIVE_CLUSTER } from '@/constants/cluster'
import { color, space } from '@/constants/theme'
import { SignInPrompt } from '@/features/session/sign-in-prompt'
import { EpochCountdown } from './epoch-countdown'
import type { Nearby, RadarPhase } from './radar-provider'
import { Street } from './street'

export type RadarViewProps = {
  /** The stored session is still being read: draw the dark street and nothing under it. */
  loading?: boolean
  signedIn: boolean
  phase: RadarPhase
  problem: string | null
  syncError: string | null
  nearby: Nearby[]
  epochEndsAt: number | null
  onFix: () => void
}

/** What is off, how to fix it, and the one action that does. The street stays dark until it is done. */
const FIX: Partial<Record<RadarPhase, { title: string; body: string; action: string }>> = {
  'bluetooth-off': {
    title: 'Bluetooth is off.',
    body: 'Your lamp is out. Turn Bluetooth on and the street lights up by itself.',
    action: 'Turn on Bluetooth',
  },
  'permission-denied': {
    title: 'Nearby devices is off.',
    body: 'Passersby needs it to broadcast and listen. Nothing is shared until another phone is in range.',
    action: 'Allow nearby devices',
  },
  'permission-blocked': {
    title: 'Nearby devices needs a setting.',
    body: 'Android will not ask again. Open settings, choose Permissions, then allow Nearby devices.',
    action: 'Allow nearby devices',
  },
  error: {
    title: 'The lamp went out.',
    body: 'Something stopped the broadcast.',
    action: 'Try again',
  },
}

function Unconnected() {
  return (
    <View style={styles.block}>
      <T v="title">Walk past another Seeker. Both phones remember.</T>
      <SignInPrompt />
      <T v="mono" c="text3">
        Your phone broadcasts a code that changes every five minutes, never your address.
      </T>
    </View>
  )
}

function Count({ n }: { n: number }) {
  if (n === 0) {
    return (
      <View style={styles.count} accessibilityLiveRegion="polite">
        <T v="body" c="text2">
          Quiet street. Keep Passersby open while you walk.
        </T>
      </View>
    )
  }
  return (
    <View style={[styles.count, styles.countRow]} accessibilityLiveRegion="polite">
      <T v="count">{n}</T>
      <T v="body" c="text2">
        {n === 1 ? 'phone within reach' : 'phones within reach'}
      </T>
    </View>
  )
}

export function RadarView({ loading, signedIn, phase, problem, syncError, nearby, epochEndsAt, onFix }: RadarViewProps) {
  const insets = useSafeAreaInsets()
  // Measured, not read from the window: the first web render happens before the window has a width.
  const [area, setArea] = useState({ width: 0, height: 0 })
  const size = area.height
  const reach = Math.min(area.width, size) / 2
  const fix = FIX[phase]
  const lit = signedIn && phase === 'live'

  let below: React.ReactElement
  if (loading) {
    below = <View style={styles.block} />
  } else if (!signedIn) {
    below = <Unconnected />
  } else if (fix) {
    below = (
      <View style={styles.block} accessibilityLiveRegion="polite">
        <T v="title" c="warn">
          {fix.title}
        </T>
        <T v="body" c="text2">
          {phase === 'error' && problem ? problem : fix.body}
        </T>
        <Button label={fix.action} onPress={onFix} />
      </View>
    )
  } else if (!lit) {
    below = (
      <View style={styles.block}>
        <Dots />
        <T v="label" c="text3">
          Lighting your lamp
        </T>
      </View>
    )
  } else {
    below = (
      <View style={styles.block}>
        <Count n={nearby.length} />
        <View style={styles.status}>
          <View style={styles.statusRow}>
            <View style={styles.pip} />
            <T v="label" c="text2">
              Broadcasting
            </T>
            <T v="label" c="text3">
              ·
            </T>
            <EpochCountdown endsAt={epochEndsAt} />
          </View>
          {syncError ? (
            <T v="mono" c="warn">
              {syncError}
            </T>
          ) : null}
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.lg }]}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <T v="label" c="text2">
          Passersby
        </T>
        <T v="label" c="text3">
          {ACTIVE_CLUSTER.networkLabel}
        </T>
      </View>
      <View style={styles.street} onLayout={(e) => setArea(e.nativeEvent.layout)}>
        {size > 0 ? <Street size={size} reach={reach} lit={lit} nearby={nearby} /> : null}
      </View>
      {below}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.night, paddingBottom: space.xl },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.xl,
    marginBottom: space.lg,
  },
  street: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  block: { paddingHorizontal: space.xl, gap: space.lg, minHeight: 150 },
  count: { minHeight: 64, justifyContent: 'center' },
  countRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-start', gap: space.md },
  status: { gap: space.sm },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  pip: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.sodium },
})
