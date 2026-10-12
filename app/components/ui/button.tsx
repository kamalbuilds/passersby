import { ActivityIndicator, Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import { color, radius, space } from '@/constants/theme'
import { T } from './text'

type Variant = 'primary' | 'secondary' | 'ghost'

type Props = Omit<PressableProps, 'style' | 'children'> & {
  label: string
  variant?: Variant
  loading?: boolean
  compact?: boolean
  style?: StyleProp<ViewStyle>
}

export function Button({ label, variant = 'primary', loading, compact, disabled, style, ...rest }: Props) {
  const inactive = disabled || loading
  const labelColor = variant === 'primary' ? 'onSignal' : variant === 'ghost' ? 'inkDim' : 'ink'
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      hitSlop={compact ? 6 : 0}
      {...rest}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        inactive && { opacity: 0.5 },
        pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={variant === 'primary' ? color.onSignal : color.ink} size="small" /> : null}
      <T v="bodyStrong" c={labelColor} numberOfLines={1}>
        {label}
      </T>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  compact: { minHeight: 40, paddingHorizontal: space.lg },
  primary: { backgroundColor: color.signal },
  secondary: { borderWidth: 1, borderColor: color.lineStrong, backgroundColor: 'transparent' },
  ghost: { backgroundColor: 'transparent' },
})
