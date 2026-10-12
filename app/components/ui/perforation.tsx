import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Line } from 'react-native-svg'
import { color } from '@/constants/theme'

const WIDTH = 14
const REACH = 640
const PITCH = 10

/**
 * A column of small circles in the line colour, the tear line of a ticket. It fills whatever height its
 * row gives it: the svg is taller than any ticket and the clip view trims it. Round caps on zero-length
 * dashes draw the circles. Notches bite a half circle out of the ticket at both ends of the column.
 */
export function Perforation({ notch, style }: { notch?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.column, style]} pointerEvents="none">
      <View style={styles.clip}>
        <Svg width={WIDTH} height={REACH}>
          <Line
            x1={WIDTH / 2}
            y1={PITCH}
            x2={WIDTH / 2}
            y2={REACH}
            stroke={color.line}
            strokeWidth={4}
            strokeDasharray={[0, PITCH]}
            strokeLinecap="round"
          />
        </Svg>
      </View>
      {notch ? (
        <>
          <View style={[styles.notch, { top: -WIDTH / 2 }]} />
          <View style={[styles.notch, { bottom: -WIDTH / 2 }]} />
        </>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  column: { width: WIDTH, alignSelf: 'stretch' },
  clip: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  notch: {
    position: 'absolute',
    left: 0,
    width: WIDTH,
    height: WIDTH,
    borderRadius: WIDTH / 2,
    backgroundColor: color.night,
  },
})
