import { StyleSheet, View } from 'react-native'
import { Bloom } from '@/components/ui/bloom'
import { T } from '@/components/ui/text'
import { color, space } from '@/constants/theme'
import { LAMP_DAYS } from './lamp-days'

const LAMP = 14
const HALO = 36

/** Fourteen street lamps, one per night. Lit if you passed someone that day, line colour if not. */
export function LampRow({ lit }: { lit: boolean[] }) {
  const n = lit.filter(Boolean).length
  return (
    <View
      accessible
      accessibilityLabel={`${n} of the last ${LAMP_DAYS} days had an encounter`}
      style={styles.wrap}
    >
      <View style={styles.row}>
        {lit.map((on, i) => (
          <View key={i} style={styles.cell}>
            {on ? (
              <View style={styles.halo}>
                <Bloom size={HALO} id="bloom-lamp" />
              </View>
            ) : null}
            <View style={[styles.lamp, { backgroundColor: on ? color.sodium : color.line }]} />
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        <T v="label" c="text3">
          {LAMP_DAYS - 1} days ago
        </T>
        <T v="label" c="text2">
          {n} of {LAMP_DAYS} lit
        </T>
        <T v="label" c="text3">
          Today
        </T>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: { width: LAMP, height: LAMP },
  halo: { position: 'absolute', left: (LAMP - HALO) / 2, top: (LAMP - HALO) / 2 },
  lamp: { width: LAMP, height: LAMP, borderRadius: LAMP / 2 },
  legend: { flexDirection: 'row', justifyContent: 'space-between' },
})
