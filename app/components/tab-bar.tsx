import { Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { T } from '@/components/ui/text'
import { color, space } from '@/constants/theme'

/** Three words and a ring. The ring is hollow until you are on that tab, then it fills with the signal colour. */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index
        const label = descriptors[route.key].options.title ?? route.name
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params)
        }
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            onPress={onPress}
            style={styles.tab}
            android_ripple={{ color: color.line, borderless: false }}
          >
            <View style={[styles.ring, focused && styles.ringOn]} />
            <T v="label" c={focused ? 'signal' : 'inkFaint'}>
              {label}
            </T>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: color.ground,
    borderTopWidth: 1,
    borderTopColor: color.line,
    paddingTop: space.sm,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xs, minHeight: 52 },
  ring: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: color.inkFaint },
  ringOn: { backgroundColor: color.signal, borderColor: color.signal },
})
