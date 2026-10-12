import { memo, useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle, Defs, Line, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg'
import { color, motion, street } from '@/constants/theme'
import { Bloom } from '@/components/ui/bloom'
import type { Nearby } from './radar-provider'
import { place } from './street-geometry'

const DOT = 8
const HALO = 44
const CORE = 5

type Props = {
  /** Side of the square the street and its lamp pool are drawn in. May be wider than the screen: the parent clips it. */
  size: number
  /** How far from the lamp a phone can stand, in px. The street's visible half-width. */
  reach: number
  /** The lamp is on: pool of light, breathing, phones plotted. Off draws the bare street in line colour. */
  lit: boolean
  nearby: Nearby[]
}

/** Two kerbs with a raised pavement beyond each, and a dashed centre line, drawn top down. Lit by the lamp when it is on, line colour when it is not. */
function Ground({ size, lit }: { size: number; lit: boolean }) {
  const c = size / 2
  const curb = size * 0.3
  const edge = lit ? 'url(#kerb)' : color.line
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="kerb" gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={size} y2={0}>
          <Stop offset="0" stopColor={color.line} />
          <Stop offset="0.5" stopColor={color.sodium} stopOpacity={0.55} />
          <Stop offset="1" stopColor={color.line} />
        </LinearGradient>
        <LinearGradient id="walk-top" gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={0} y2={c - curb}>
          <Stop offset="0" stopColor={color.night2} stopOpacity={0} />
          <Stop offset="1" stopColor={color.night2} stopOpacity={1} />
        </LinearGradient>
        <LinearGradient id="walk-bottom" gradientUnits="userSpaceOnUse" x1={0} y1={size} x2={0} y2={c + curb}>
          <Stop offset="0" stopColor={color.night2} stopOpacity={0} />
          <Stop offset="1" stopColor={color.night2} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={size} height={c - curb} fill="url(#walk-top)" />
      <Rect x={0} y={c + curb} width={size} height={c - curb} fill="url(#walk-bottom)" />
      <Line x1={0} y1={c - curb} x2={size} y2={c - curb} stroke={edge} strokeWidth={1} />
      <Line x1={0} y1={c + curb} x2={size} y2={c + curb} stroke={edge} strokeWidth={1} />
      <Line x1={0} y1={c} x2={size} y2={c} stroke={edge} strokeWidth={1.5} strokeDasharray={[10, 16]} />
      {lit ? null : (
        <>
          <Circle cx={c} cy={c} r={CORE + 6} stroke={color.line} strokeWidth={1} fill={color.clear} />
          <Circle cx={c} cy={c} r={CORE} fill={color.line} />
        </>
      )}
    </Svg>
  )
}

/** Your own lamp, the only thing on the street that moves on its own. */
function Lamp({ size }: { size: number }) {
  const reduced = useReducedMotion()
  const scale = useSharedValue(1)
  useEffect(() => {
    if (reduced) {
      scale.value = 1
      return
    }
    const half = motion.breathe / 2
    const ease = Easing.inOut(Easing.sin)
    scale.value = withRepeat(
      withSequence(
        withTiming(street.breatheScale, { duration: half, easing: ease }),
        withTiming(1, { duration: half, easing: ease }),
      ),
      -1,
    )
    return () => cancelAnimation(scale)
  }, [reduced, scale])
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  const c = size / 2
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="pool" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color.sodiumDim} />
            <Stop offset="1" stopColor={color.sodium} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {[0.5, 0.44, 0.32, 0.2, 0.09].map((r) => (
          <Circle key={r} cx={c} cy={c} r={size * r} fill="url(#pool)" />
        ))}
        <Circle cx={c} cy={c} r={CORE + 5} fill={color.sodiumDim} />
        <Circle cx={c} cy={c} r={CORE} fill={color.sodium} />
      </Svg>
    </Animated.View>
  )
}

/** A phone passing under the lamp. It fades in when first heard and fades out when the provider drops it. */
function Passerby({ token, rssi, size, reach }: { token: string; rssi: number; size: number; reach: number }) {
  const { x, y } = place(token, rssi, reach - HALO / 2)
  return (
    <Animated.View
      entering={FadeIn.duration(motion.dot).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(motion.dot).reduceMotion(ReduceMotion.System)}
      pointerEvents="none"
      style={[styles.passerby, { left: size / 2 + x - HALO / 2, top: size / 2 + y - HALO / 2 }]}
    >
      <View style={StyleSheet.absoluteFill}>
        <Bloom size={HALO} id="bloom-dot" />
      </View>
      <View style={styles.dot} />
    </Animated.View>
  )
}

function StreetBase({ size, reach, lit, nearby }: Props) {
  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        lit ? `A street at night. ${nearby.length} ${nearby.length === 1 ? 'phone' : 'phones'} within reach.` : 'A dark street. Your lamp is unlit.'
      }
    >
      <Ground size={size} lit={lit} />
      {lit ? <Lamp size={size} /> : null}
      {lit ? nearby.map((n) => <Passerby key={n.token} token={n.token} rssi={n.rssi} size={size} reach={reach} />) : null}
    </View>
  )
}

export const Street = memo(StreetBase)

const styles = StyleSheet.create({
  passerby: { position: 'absolute', width: HALO, height: HALO, alignItems: 'center', justifyContent: 'center' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: color.sodium },
})
