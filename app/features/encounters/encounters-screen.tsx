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
import type { EncounterView } from './encounter-view'
import { Ticket } from './ticket'
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

function LoadingTickets() {
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
      <T v="hero">Encounters</T>
      {views.length > 0 ? (
        <T v="label" c="text2">
          {views.length} {views.length === 1 ? 'ticket' : 'tickets'} kept
        </T>
      ) : null}
    </View>
  )

  let empty: React.ReactElement | null = null
  if (status !== 'signed-in') {
    empty =
      status === 'loading' ? null : (
        <View style={styles.message}>
          <T v="title">Your tickets are kept here.</T>
          <SignInPrompt reason="Connect to see everyone you have passed, and to wave at them." />
        </View>
      )
  } else if (query.isPending) {
    empty = <LoadingTickets />
  } else if (query.isError) {
    empty = (
      <View style={styles.message}>
        <T v="title" c="warn">
          Your tickets did not load.
        </T>
        <T v="body" c="text2">
          {describeApiError(query.error)}
        </T>
        <Button label="Try again" variant="secondary" onPress={() => query.refetch()} />
      </View>
    )
  } else if (views.length === 0) {
    empty = (
      <View style={styles.message}>
        <T v="title">Nobody under the lamps yet.</T>
        <T v="body" c="text2">
          Open the street and walk. The first Seeker you pass is kept here as a ticket, ready to wave at.
        </T>
        <Button label="Open the street" onPress={() => router.navigate('/')} />
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
        contentContainerStyle={{
          paddingTop: insets.top + space.lg,
          paddingHorizontal: space.xl,
          paddingBottom: space.giant,
        }}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        renderSectionHeader={({ section }) => (
          <T v="label" c="text3" style={styles.sectionTitle}>
            {section.title}
          </T>
        )}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Ticket view={item} />
          </View>
        )}
        refreshControl={
          status === 'signed-in' ? (
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => query.refetch()}
              tintColor={color.sodium}
              colors={[color.sodium]}
              progressBackgroundColor={color.night2}
            />
          ) : undefined
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.night },
  header: { gap: space.sm, marginBottom: space.md },
  sectionTitle: { marginTop: space.xl, marginBottom: space.md },
  item: { marginBottom: space.md },
  list: { gap: space.md },
  ghost: { height: 104, borderRadius: radius.ticket, backgroundColor: color.night2 },
  message: { gap: space.lg, paddingTop: space.xl },
})
