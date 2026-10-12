import { useState } from 'react'
import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import { color, radius, space } from '@/constants/theme'
import { Dots } from './dots'
import { T } from './text'

type Variant = 'primary' | 'secondary' | 'ghost'

type Props = Omit<PressableProps, 'style' | 'children'> & {
  label: string
  variant?: Variant
  loading?: boolean
  compact?: boolean
  style?: StyleProp<ViewStyle>
}

/**
 * The pill. Default, pressed (night3 ground, or sodium darkened 12%), focus (2px sodium ring, instant),
 * disabled (text3, no fill) and loading (three sodium dots) are all drawn here.
 */
export function Button({ label, variant = 'primary', loading, compact, disabled, style, onFocus, onBlur, ...rest }: Props) {
  const [focused, setFocused] = useState(false)
  const inactive = !!disabled || !!loading
  const primary = variant === 'primary'
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      hitSlop={compact ? 4 : 0}
      onFocus={(e) => {
        setFocused(true)
        onFocus?.(e)
      }}
      onBlur={(e) => {
        setFocused(false)
        onBlur?.(e)
      }}
      {...rest}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        variant === 'secondary' && styles.secondary,
        primary && !disabled && { backgroundColor: pressed && !loading ? color.sodiumPressed : color.sodium },
        !primary && pressed && { backgroundColor: color.night3 },
        disabled && styles.disabled,
        focused && styles.focus,
        style,
      ]}
    >
      {loading ? (
        <Dots tone={primary ? 'sodiumInk' : 'sodium'} />
      ) : (
        <T v="label" c={disabled ? 'text3' : primary ? 'sodiumInk' : variant === 'ghost' ? 'text2' : 'text'} numberOfLines={1}>
          {label}
        </T>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    paddingHorizontal: space.xl,
    borderRadius: radius.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  compact: { minHeight: 36, paddingHorizontal: space.lg },
  secondary: { borderWidth: 1, borderColor: color.text3 },
  disabled: { backgroundColor: color.clear, borderColor: color.clear },
  focus: { outlineWidth: 2, outlineColor: color.sodium, outlineOffset: 2, outlineStyle: 'solid' },
})
