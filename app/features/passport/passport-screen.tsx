import { useMemo } from 'react'
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { TierBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Glyph } from '@/components/ui/glyph'
import { Screen } from '@/components/ui/screen'
import { T } from '@/components/ui/text'
import { ACTIVE_CLUSTER } from '@/constants/cluster'
import { color, radius, space } from '@/constants/theme'
import { useEncounters } from '@/features/encounters/use-encounters'
import { SignInPrompt } from '@/features/session/sign-in-prompt'
import { useSession } from '@/features/session/session-provider'
import { liveStreak, shortAddress, utcDay } from '@/lib/format'
import { lampDays } from './lamp-days'
import { LampRow } from './lamp-row'

function Line({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <View style={styles.line} accessible accessibilityLabel={`${label}: ${value}${note ? ` ${note}` : ''}`}>
      <View style={styles.lineLabel}>
        <T v="label" c="text2">
          {label}
        </T>
        {note ? (
          <T v="label" c="text3">
            {note}
          </T>
        ) : null}
      </View>
      <T v="title">{value}</T>
    </View>
  )
}

export function PassportScreen() {
  const { status, session, signOut } = useSession()
  const { query, views, profile } = useEncounters()
  const today = utcDay(Date.now())
  const lit = useMemo(() => lampDays(views.map((v) => v.record.day), today), [views, today])

  if (status !== 'signed-in' || !session) {
    return (
      <Screen>
        <T v="hero">Passport</T>
        {status === 'loading' ? null : (
          <View style={styles.signedOut}>
            <T v="title">Stamped by every person you pass.</T>
            <SignInPrompt reason="Connect your wallet to open your passport and see the nights you have lit." />
          </View>
        )}
      </Screen>
    )
  }

  const seeker = session.tier === 'seeker'
  const streak = profile ? liveStreak(profile.streak, profile.lastDay, today) : 0
  const programId = ACTIVE_CLUSTER.programId

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => query.refetch()}
          tintColor={color.sodium}
          colors={[color.sodium]}
          progressBackgroundColor={color.night2}
        />
      }
    >
      <T v="hero">Passport</T>

      <View style={styles.identity}>
        <View style={styles.identityHead}>
          <Glyph seed={session.identity} size={56} />
          <View style={styles.identityText}>
            <T v="mono" selectable>
              {shortAddress(session.wallet)}
            </T>
            <TierBadge tier={session.tier} />
          </View>
        </View>
        <T v="mono" c="text2">
          {seeker
            ? 'Your Seeker Genesis Token is on-chain proof of a Seeker phone. It makes your meetings with other Seekers count as verified.'
            : 'A Seeker Genesis Token is on-chain proof of a Seeker phone. Hold one and your meetings with other Seekers count as verified.'}
        </T>
      </View>

      <View style={styles.total} accessibilityLabel={`${profile?.encounters ?? 0} encounters`} accessible>
        <T v="count">{profile?.encounters ?? 0}</T>
        <T v="body" c="text2">
          {profile?.encounters === 1 ? 'person passed' : 'people passed'}
        </T>
      </View>

      <LampRow lit={lit} />

      <View style={styles.ledger}>
        <Line label="Verified" value={profile?.verifiedEncounters ?? 0} note="Seeker to Seeker" />
        <Line label="Day streak" value={streak} />
        <Line label="Waves received" value={profile?.wavesReceived ?? 0} />
      </View>

      {query.isPending ? (
        <T v="mono" c="text3" style={styles.note}>
          Reading your passport from Solana
        </T>
      ) : profile ? null : (
        <T v="body" c="text2" style={styles.note}>
          Nothing stamped yet. Open the street and pass someone to earn your first entry.
        </T>
      )}

      {programId ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="View the Passersby program on the Solana explorer"
          onPress={() =>
            WebBrowser.openBrowserAsync(`https://explorer.solana.com/address/${programId}${ACTIVE_CLUSTER.explorerParam}`)
          }
          hitSlop={8}
          style={styles.program}
        >
          <T v="label" c="text3">
            Program
          </T>
          <T v="mono" c="text2" style={styles.link}>
            {shortAddress(programId)}
          </T>
          <T v="label" c="text3">
            {ACTIVE_CLUSTER.networkLabel}
          </T>
        </Pressable>
      ) : null}

      <Button label="Disconnect" variant="ghost" compact onPress={signOut} style={styles.signOut} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  signedOut: { gap: space.lg, marginTop: space.xl },
  identity: { backgroundColor: color.night2, borderRadius: radius.ticket, padding: space.lg, gap: space.lg, marginTop: space.xl },
  identityHead: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  identityText: { gap: space.sm, flex: 1 },
  total: { flexDirection: 'row', alignItems: 'baseline', gap: space.md, marginTop: space.xxl, marginBottom: space.xl },
  ledger: { marginTop: space.xl, borderTopWidth: 1, borderTopColor: color.line },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  lineLabel: { gap: space.xs },
  note: { marginTop: space.lg },
  program: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xl },
  link: { textDecorationLine: 'underline' },
  signOut: { marginTop: space.xl, alignSelf: 'flex-start', marginLeft: -space.lg },
})
