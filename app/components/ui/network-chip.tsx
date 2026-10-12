import { StyleSheet, View } from 'react-native'
import { ACTIVE_CLUSTER } from '@/constants/cluster'
import { color, font, radius, space } from '@/constants/theme'
import { T } from './text'

export function NetworkChip() {
  return (
    <View style={styles.chip} accessibilityLabel={`Network ${ACTIVE_CLUSTER.networkLabel}`}>
      <T v="caption" c="inkDim" style={styles.text}>
        {ACTIVE_CLUSTER.networkLabel}
      </T>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderColor: color.lineStrong,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 3,
  },
  text: { fontFamily: font.mono, fontSize: 11 },
})
