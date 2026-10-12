import { memo, useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated'
import { T } from '@/components/ui/text'
import { color } from '@/constants/theme'
import type { Nearby } from './radar-provider'

const PULSE_MS = 3600
const DOT = 12

type Props = {
  size: number
  nearby: Nearby[]
  /** Pulses and plots dots. Off draws the still rings only. */
  live: boolean
  idleLabel: string
}

function PulseRing({ size, delay, run }: { size: number; delay: number; run: boolean }) {
  const p = useSharedValue(0)
  useEffect(() => {
    if (!run) {
      cancelAnimation(p)
      p.value = 0
      return
    }
    p.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: PULSE_MS, easing: Easing.out(Easing.quad) }), -1, false),
    )
    return () => cancelAnimation(p)
  }, [run, delay, p])
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.15, 1], [0, 0.6, 0]),
    transform: [{ scale: interpolate(p.value, [0, 1], [0.14, 1]) }],
  }))
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: color.signal,
        },
        style,
      ]}
    />
  )
}

// A token is anonymous and rotates every five minutes, so its hash is the only stable thing to place it by.
const angleOf = (token: string) => (parseInt(token.slice(0, 4), 16) / 0x10000) * Math.PI * 2

// Stronger signal sits closer to the middle. -45 dBm is a hand away, -95 dBm is the edge of range.
const radiusOf = (rssi: number) => 0.4 + 0.54 * Math.min(1, Math.max(0, (-rssi - 45) / 50))

function Dot({ token, rssi, size }: { token: string; rssi: number; size: number }) {
  const reduced = useReducedMotion()
  const half = size / 2
  const r = radiusOf(rssi) * half
  const a = angleOf(token)
  const x = useSharedValue(half + Math.cos(a) * r - DOT / 2)
  const y = useSharedValue(half + Math.sin(a) * r - DOT / 2)
  useEffect(() => {
    const dur = reduced ? 0 : 700
    x.value = withTiming(half + Math.cos(a) * r - DOT / 2, { duration: dur })
    y.value = withTiming(half + Math.sin(a) * r - DOT / 2, { duration: dur })
  }, [a, r, half, x, y, reduced])
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }] }))
  return (
    // Two layers: the outer one owns the position transform, the inner one owns the entering animation.
    <Animated.View style={[styles.dotWrap, style]} pointerEvents="none">
      <Animated.View entering={ZoomIn.duration(320)} style={styles.dotInner}>
        <View style={styles.halo} />
        <View style={styles.dot} />
      </Animated.View>
    </Animated.View>
  )
}

function RadarDiscBase({ size, nearby, live, idleLabel }: Props) {
  const reduced = useReducedMotion()
  const count = nearby.length
  const pulse = live && !reduced
  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel={live ? `${count} ${count === 1 ? 'phone' : 'phones'} nearby now` : idleLabel}
    >
      <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }]} />
      <View
        style={[
          styles.ring,
          { width: size * 0.66, height: size * 0.66, borderRadius: size / 3, left: size * 0.17, top: size * 0.17 },
        ]}
      />
      <View
        style={[
          styles.ring,
          { width: size * 0.33, height: size * 0.33, borderRadius: size / 6, left: size * 0.335, top: size * 0.335 },
        ]}
      />
      <PulseRing size={size} delay={0} run={pulse} />
      <PulseRing size={size} delay={PULSE_MS / 2} run={pulse} />
      {live ? nearby.map((n) => <Dot key={n.token} token={n.token} rssi={n.rssi} size={size} />) : null}
      <View style={styles.center} pointerEvents="none">
        {live ? (
          <>
            <T v="numeral" tabular>
              {count}
            </T>
            <T v="label" c="inkDim">
              {count === 1 ? 'phone nearby now' : 'phones nearby now'}
            </T>
          </>
        ) : (
          <T v="label" c="inkFaint">
            {idleLabel}
          </T>
        )}
      </View>
    </View>
  )
}

export const RadarDisc = memo(RadarDiscBase)

const styles = StyleSheet.create({
  ring: { position: 'absolute', borderWidth: 1, borderColor: color.lineStrong },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  dotWrap: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: DOT,
    height: DOT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotInner: { width: DOT, height: DOT, alignItems: 'center', justifyContent: 'center' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: color.signal },
  halo: {
    position: 'absolute',
    width: DOT * 2.4,
    height: DOT * 2.4,
    borderRadius: DOT * 1.2,
    backgroundColor: color.signal,
    opacity: 0.16,
  },
})
