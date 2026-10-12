import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { T } from '@/components/ui/text'
import { color, space } from '@/constants/theme'

export const TAB_BAR_HEIGHT = 64

/** One line icon per tab, drawn in the tab's own tone: a lamp pool, a ticket, a passport. */
function TabIcon({ route, tone }: { route: string; tone: string }) {
  const common = { stroke: tone, strokeWidth: 1.5, fill: color.clear }
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      {route === 'index' ? (
        <>
          <Circle cx={12} cy={12} r={9} {...common} />
          <Circle cx={12} cy={12} r={2.5} fill={tone} />
        </>
      ) : route === 'encounters' ? (
        <>
          <Path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z" {...common} strokeLinejoin="round" />
          <Line x1={14} y1={7.5} x2={14} y2={16.5} stroke={tone} strokeWidth={1.5} strokeDasharray={[1.5, 2.5]} />
        </>
      ) : (
        <>
          <Rect x={5} y={3} width={14} height={18} rx={2} {...common} />
          <Circle cx={12} cy={11} r={3} {...common} />
          <Line x1={9} y1={17} x2={15} y2={17} stroke={tone} strokeWidth={1.5} strokeLinecap="round" />
        </>
      )}
    </Svg>
  )
}

function Tab({ route, label, focused, onPress }: { route: string; label: string; focused: boolean; onPress: () => void }) {
  const [ring, setRing] = useState(false)
  const tone = focused ? color.sodium : color.text3
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPress={onPress}
      onFocus={() => setRing(true)}
      onBlur={() => setRing(false)}
      style={({ pressed }) => [styles.tab, pressed && styles.pressed, ring && styles.ring]}
    >
      <TabIcon route={route} tone={tone} />
      <T v="label" c={focused ? 'sodium' : 'text3'}>
        {label}
      </T>
    </Pressable>
  )
}

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.bar, { height: TAB_BAR_HEIGHT + Math.max(insets.bottom, space.sm) }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index
        const label = descriptors[route.key].options.title ?? route.name
        return (
          <Tab
            key={route.key}
            route={route.name}
            label={label}
            focused={focused}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params)
            }}
          />
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: color.night, borderTopWidth: 1, borderTopColor: color.line },
  tab: { flex: 1, height: TAB_BAR_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: space.xs },
  pressed: { backgroundColor: color.night3 },
  ring: { outlineWidth: 2, outlineColor: color.sodium, outlineOffset: -4, outlineStyle: 'solid' },
})
