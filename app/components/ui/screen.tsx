import { type PropsWithChildren } from 'react'
import { ScrollView, StyleSheet, View, type RefreshControlProps } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { color, space } from '@/constants/theme'

type Props = PropsWithChildren<{ refreshControl?: React.ReactElement<RefreshControlProps>; bleed?: boolean }>

/** Night ground with safe-area padding. Scrolls, so nothing clips on a short phone. `bleed` drops the side padding. */
export function Screen({ children, refreshControl, bleed }: Props) {
  const insets = useSafeAreaInsets()
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        refreshControl={refreshControl}
        contentContainerStyle={{
          paddingTop: insets.top + space.lg,
          paddingHorizontal: bleed ? 0 : space.xl,
          paddingBottom: space.giant,
        }}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: color.night } })
