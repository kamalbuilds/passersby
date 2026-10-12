import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { color } from '@/constants/theme'
import { glyphCells } from '@/lib/identicon'

/** A small mirrored dot-grid drawn from the address. Same person, same glyph, everywhere. */
export function Glyph({ seed, size = 40, lit = color.signal }: { seed: string; size?: number; lit?: string }) {
  const cells = useMemo(() => glyphCells(seed), [seed])
  const cell = size / 5
  return (
    <View style={[styles.frame, { width: size, height: size, borderRadius: size * 0.28 }]} accessibilityElementsHidden>
      {cells.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((on, c) => (
            <View key={c} style={{ width: cell, height: cell, alignItems: 'center', justifyContent: 'center' }}>
              <View
                style={{
                  width: cell * 0.62,
                  height: cell * 0.62,
                  borderRadius: cell,
                  backgroundColor: on ? lit : color.line,
                }}
              />
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  frame: { backgroundColor: color.surfaceRaised, overflow: 'hidden', justifyContent: 'center' },
  row: { flexDirection: 'row' },
})
