import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { color, radius } from '@/constants/theme'
import { glyphCells } from '@/lib/identicon'

/** A small mirrored grid of lamps drawn from the address. Same person, same glyph, everywhere. */
export function Glyph({ seed, size = 40 }: { seed: string; size?: number }) {
  const cells = useMemo(() => glyphCells(seed), [seed])
  const cell = size / 5
  return (
    <View style={[styles.frame, { width: size, height: size }]} accessibilityElementsHidden>
      {cells.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((on, c) => (
            <View key={c} style={{ width: cell, height: cell, alignItems: 'center', justifyContent: 'center' }}>
              <View
                style={{
                  width: cell * 0.5,
                  height: cell * 0.5,
                  borderRadius: cell,
                  backgroundColor: on ? color.sodium : color.line,
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
  frame: { backgroundColor: color.night2, borderRadius: radius.ticket, overflow: 'hidden', justifyContent: 'center' },
  row: { flexDirection: 'row' },
})
