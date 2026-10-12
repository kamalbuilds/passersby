import { Pressable, RefreshControl, StyleSheet, View } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { Button } from '@/components/ui/button'
import { Glyph } from '@/components/ui/glyph'
import { NetworkChip } from '@/components/ui/network-chip'
import { Screen } from '@/components/ui/screen'
import { T } from '@/components/ui/text'
import { TierBadge } from '@/components/ui/tier-badge'
import { ACTIVE_CLUSTER } from '@/constants/cluster'
import { color, space } from '@/constants/theme'
import { useEncounters } from '@/features/encounters/use-encounters'
import { SignInPrompt } from '@/features/session/sign-in-prompt'
import { useSession } from '@/features/session/session-provider'
import { liveStreak, shortAddress, utcDay } from '@/lib/format'

function Row({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.rowLabel}>
        <T v="body">{label}</T>
        {note ? (
          <T v="caption" c="inkFaint">
            {note}
          </T>
        ) : null}
      </View>
      <T v="title" tabular style={styles.value}>
        {value}
      </T>
    </View>
  )
}

export function PassportScreen() {
  const { status, session, signOut } = useSession()
  const { query, profile } = useEncounters()

  if (status !== 'signed-in' || !session) {
    return (
      <Screen>
        <T v="headline">Passport</T>
        {status === 'loading' ? null : (
          <SignInPrompt reason="Your passport counts the people you have passed. Connect your wallet to open it." />
        )}
      </Screen>
    )
  }

  const seeker = session.tier === 'seeker'
  const streak = profile ? liveStreak(profile.streak, profile.lastDay, utcDay(Date.now())) : 0
  const programId = ACTIVE_CLUSTER.programId

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => query.refetch()}
          tintColor={color.signal}
          colors={[color.signal]}
          progressBackgroundColor={color.surfaceRaised}
        />
      }
    >
      <View style={styles.header}>
        <T v="headline">Passport</T>
        <NetworkChip />
      </View>

      <View style={styles.identity}>
        <Glyph seed={session.identity} size={64} />
        <View style={styles.identityText}>
          <T v="mono" style={styles.address} selectable>
            {shortAddress(session.wallet)}
          </T>
          <TierBadge tier={session.tier} />
        </View>
      </View>
      <T v="body" c="inkDim" style={styles.sgt}>
        {seeker
          ? 'Your Seeker Genesis Token (SGT) is the on-chain proof that comes with every Seeker phone. It makes encounters with other Seekers count as verified.'
          : 'A Seeker Genesis Token (SGT) is the on-chain proof that comes with every Seeker phone. Hold one and your encounters with other Seekers count as verified.'}
      </T>

      <View style={styles.ledger}>
        <Row label="Encounters" value={profile?.encounters ?? 0} />
        <Row label="Verified" value={profile?.verifiedEncounters ?? 0} note="Seeker to Seeker" />
        <Row label="Streak" value={streak} note={streak === 1 ? 'day' : 'days'} />
        <Row label="Waves received" value={profile?.wavesReceived ?? 0} />
      </View>
      {query.isPending ? (
        <T v="caption" c="inkFaint">
          Reading your passport from Solana…
        </T>
      ) : profile ? null : (
        <T v="body" c="inkDim">
          Nothing stamped yet. Open the radar and pass someone to earn your first entry.
        </T>
      )}

      {programId ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="View the Passersby program on the Solana explorer"
          onPress={() =>
            WebBrowser.openBrowserAsync(
              `https://explorer.solana.com/address/${programId}${ACTIVE_CLUSTER.explorerParam}`,
            )
          }
          style={styles.program}
        >
          <T v="caption" c="inkFaint">
            Program
          </T>
          <T v="mono" c="inkDim" style={styles.link}>
            {shortAddress(programId)}
          </T>
        </Pressable>
      ) : null}

      <Button label="Disconnect" variant="secondary" compact onPress={signOut} style={styles.signOut} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xl },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  identityText: { gap: space.sm, flex: 1 },
  address: { fontSize: 18, lineHeight: 24 },
  sgt: { marginTop: space.lg },
  ledger: { marginTop: space.xl, borderTopWidth: 1, borderTopColor: color.line },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  rowLabel: { gap: 2 },
  value: { fontSize: 30, lineHeight: 38 },
  program: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xl },
  link: { textDecorationLine: 'underline' },
  signOut: { marginTop: space.xl, alignSelf: 'flex-start' },
})
