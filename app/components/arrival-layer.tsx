import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { viewOf } from '@/features/encounters/encounter-view'
import { ArrivalTicket } from '@/features/encounters/ticket'
import { useRadar } from '@/features/radar/radar-provider'
import { useSession } from '@/features/session/session-provider'
import { space } from '@/constants/theme'
import { TAB_BAR_HEIGHT } from './tab-bar'

const SHOWN_MS = 7_000

/** Floats the newest confirmed encounter above the tab bar for a few seconds, whichever tab you are on. */
export function ArrivalLayer() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { session } = useSession()
  const { arrivals } = useRadar()
  const [dismissed, setDismissed] = useState<string | null>(null)

  const latest = useMemo(() => {
    if (!session) return null
    const a = arrivals.find((x) => x.fresh)
    if (!a) return null
    const view = viewOf(a.confirmation.encounter, session.identity)
    return view ? { view, key: `${view.record.address}:${a.arrivedAt}` } : null
  }, [arrivals, session])

  const key = latest?.key ?? null
  useEffect(() => {
    if (!key) return
    const id = setTimeout(() => setDismissed(key), SHOWN_MS)
    return () => clearTimeout(id)
  }, [key])

  const bottom = TAB_BAR_HEIGHT + Math.max(insets.bottom, space.sm) + space.md
  return (
    <View style={[styles.layer, { bottom }]} pointerEvents="box-none">
      {latest && dismissed !== latest.key ? (
        <ArrivalTicket
          key={latest.key}
          view={latest.view}
          onPress={() => {
            setDismissed(latest.key)
            router.navigate('/encounters')
          }}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({ layer: { position: 'absolute', left: space.lg, right: space.lg } })
