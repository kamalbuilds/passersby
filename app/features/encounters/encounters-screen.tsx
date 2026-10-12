import { useMemo } from 'react'
import { RefreshControl, SectionList, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import { Button } from '@/components/ui/button'
import { T } from '@/components/ui/text'
import { color, radius, space } from '@/constants/theme'
import { SignInPrompt } from '@/features/session/sign-in-prompt'
import { useSession } from '@/features/session/session-provider'
import { describeApiError } from '@/lib/api'
import { SECONDS_PER_DAY, utcDay } from '@/lib/format'
import { useNow } from '@/lib/use-now'
import { EncounterCard } from './encounter-card'
import type { EncounterView } from './encounter-view'
import { useEncounters } from './use-encounters'

type Section = { title: string; data: EncounterView[] }

function dayTitle(day: number, today: number): string {
  if (day === today) return 'Today'
  if (day === today - 1) return 'Yesterday'
  return new Date(day * SECONDS_PER_DAY * 1000).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function Placeholder() {
  return (
    <View style={styles.list} accessibilityLabel="Loading encounters">
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.ghost} />
      ))}
    </View>
  )
}

export function EncountersScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { status } = useSession()
  const { query, views } = useEncounters()
  const nowMs = useNow(30_000)

  const sections = useMemo<Section[]>(() => {
    const today = utcDay(nowMs)
    const byDay = new Map<number, EncounterView[]>()
    for (const v of views) byDay.set(v.record.day, [...(byDay.get(v.record.day) ?? []), v])
    return [...byDay.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([day, data]) => ({ title: dayTitle(day, today), data }))
  }, [views, nowMs])

  const header = (
    <View style={styles.header}>
      <T v="headline">Encounters</T>
      {views.length > 0 ? (
        <T v="mono" c="inkDim" tabular>
          {views.length} {views.length === 1 ? 'person' : 'people'} passed
        </T>
      ) : null}
    </View>
  )

  let empty: React.ReactElement | null = null
  if (status !== 'signed-in') {
    empty = status === 'loading' ? null : <SignInPrompt reason="Connect to see everyone you have passed, and to wave at them." />
  } else if (query.isPending) {
    empty = <Placeholder />
  } else if (query.isError) {
    empty = (
      <View style={styles.message}>
        <T v="bodyStrong" c="warn">
          Could not load your encounters
        </T>
        <T v="body" c="inkDim">
          {describeApiError(query.error)}
        </T>
        <Button label="Try again" variant="secondary" onPress={() => query.refetch()} />
      </View>
    )
  } else if (views.length === 0) {
    empty = (
      <View style={styles.message}>
        <T v="title">No one yet</T>
        <T v="body" c="inkDim">
          Open the radar and walk. The first Seeker you pass will show up here, ready to wave at.
        </T>
        <Button label="Open the radar" onPress={() => router.navigate('/')} />
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SectionList
        sections={sections}
        keyExtractor={(v) => v.record.address}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingTop: insets.top + space.md, paddingHorizontal: space.xl, paddingBottom: space.huge }}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        renderSectionHeader={({ section }) => (
          <T v="label" c="inkDim" style={styles.sectionTitle}>
            {section.title}
          </T>
        )}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <EncounterCard view={item} nowMs={nowMs} />
          </View>
        )}
        refreshControl={
          status === 'signed-in' ? (
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => query.refetch()}
              tintColor={color.signal}
              colors={[color.signal]}
              progressBackgroundColor={color.surfaceRaised}
            />
          ) : undefined
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ground },
  header: { gap: space.xs, marginBottom: space.lg },
  sectionTitle: { marginTop: space.lg, marginBottom: space.sm },
  item: { marginBottom: space.md },
  list: { gap: space.md },
  ghost: { height: 92, borderRadius: radius.lg, backgroundColor: color.surface, borderWidth: 1, borderColor: color.line },
  message: { gap: space.md, paddingTop: space.lg },
})
