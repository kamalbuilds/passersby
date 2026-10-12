import { StyleSheet, View } from 'react-native'
import { Button } from '@/components/ui/button'
import { T } from '@/components/ui/text'
import { color, radius, space } from '@/constants/theme'
import { EpochCountdown } from './epoch-countdown'
import { useRadar, type RadarPhase } from './radar-provider'

const FIX: Partial<Record<RadarPhase, { title: string; body: string; action: string }>> = {
  'permission-denied': {
    title: 'Bluetooth access is off',
    body: 'Passersby needs nearby-device access to broadcast and listen. Nothing is shared until another phone is in range.',
    action: 'Allow Bluetooth',
  },
  'permission-blocked': {
    title: 'Bluetooth access is blocked',
    body: 'Android will not ask again. Open the app settings, choose Permissions, then allow Nearby devices.',
    action: 'Open app settings',
  },
  'bluetooth-off': {
    title: 'Bluetooth is off',
    body: 'Turn Bluetooth on and the radar starts by itself.',
    action: 'Open Bluetooth settings',
  },
  error: {
    title: 'The radar hit a problem',
    body: 'Something stopped the broadcast.',
    action: 'Try again',
  },
}

/** One block under the disc: either the live broadcast line, or what is wrong and the button that fixes it. */
export function RadarStatus() {
  const { phase, problem, syncError, epochEndsAt, openFix } = useRadar()
  const fix = FIX[phase]

  if (fix) {
    return (
      <View style={styles.fix} accessibilityLiveRegion="polite">
        <T v="bodyStrong" c="warn">
          {fix.title}
        </T>
        <T v="body" c="inkDim">
          {phase === 'error' && problem ? problem : fix.body}
        </T>
        <Button label={fix.action} onPress={openFix} />
      </View>
    )
  }

  if (phase === 'starting') {
    return (
      <T v="label" c="inkDim" style={styles.line}>
        Starting the radar…
      </T>
    )
  }

  return (
    <View style={styles.live}>
      <View style={styles.liveRow}>
        <View style={styles.pip} />
        <T v="label" c="ink">
          Broadcasting
        </T>
        <T v="label" c="inkFaint">
          ·
        </T>
        <EpochCountdown endsAt={epochEndsAt} />
      </View>
      {syncError ? (
        <T v="caption" c="warn">
          {syncError}
        </T>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  line: { textAlign: 'center' },
  fix: {
    backgroundColor: color.surface,
    borderColor: color.lineStrong,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  live: { alignItems: 'center', gap: space.xs },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pip: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.signal },
})
