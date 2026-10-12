import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { color, space, type ColorName } from '@/constants/theme'

const STEP_MS = 160

function Dot({ index, tone }: { index: number; tone: ColorName }) {
  const reduced = useReducedMotion()
  const p = useSharedValue(0.35)
  useEffect(() => {
    if (reduced) {
      p.value = 0.7
      return
    }
    p.value = withDelay(
      index * STEP_MS,
      withRepeat(
        withSequence(
          withTiming(1, { duration: STEP_MS * 2, easing: Easing.out(Easing.quad) }),
          withTiming(0.35, { duration: STEP_MS * 2, easing: Easing.in(Easing.quad) }),
          withDelay(STEP_MS * 2, withTiming(0.35, { duration: 0 })),
        ),
        -1,
      ),
    )
    return () => cancelAnimation(p)
  }, [index, p, reduced])
  const style = useAnimatedStyle(() => ({ opacity: p.value }))
  return <Animated.View style={[styles.dot, { backgroundColor: color[tone] }, style]} />
}

/** Loading: three dots pulsing in sequence. Sodium on night, sodium ink when sitting on a sodium fill. */
export function Dots({ tone = 'sodium' }: { tone?: ColorName }) {
  return (
    <View style={styles.row} accessibilityRole="progressbar" accessibilityLabel="Loading">
      {[0, 1, 2].map((i) => (
        <Dot key={i} index={i} tone={tone} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
})
