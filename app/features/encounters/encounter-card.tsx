import { memo, useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import Animated, { Easing, FadeInDown } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import * as WebBrowser from 'expo-web-browser'
import { Button } from '@/components/ui/button'
import { Glyph } from '@/components/ui/glyph'
import { T } from '@/components/ui/text'
import { VerifiedBadge } from '@/components/ui/tier-badge'
import { ACTIVE_CLUSTER, explorerTx } from '@/constants/cluster'
import { color, radius, space } from '@/constants/theme'
import { describeError } from '@/lib/errors'
import { relativeTime, shortAddress } from '@/lib/format'
import type { EncounterView } from './encounter-view'
import { useWave, WAVE_AMOUNTS, type WaveAmount, type WaveStep } from './use-wave'
import { useWaveLog } from './wave-log'

const STEP_LABEL: Record<WaveStep, string> = {
  wallet: 'Opening your wallet',
  checking: 'Checking your balance',
  approve: 'Approve in your wallet',
  confirming: 'Confirming on Solana',
}

type WaveUi =
  { kind: 'idle' } | { kind: 'choose' } | { kind: 'sending'; step: WaveStep } | { kind: 'error'; message: string }

type Props = {
  view: EncounterView
  nowMs: number
  /** Plays the entrance animation. Set for encounters that just landed. */
  animate?: boolean
  /** Outlines the card in the signal colour: this encounter was confirmed a moment ago. */
  fresh?: boolean
}

function EncounterCardBase({ view, nowMs, animate, fresh }: Props) {
  const wave = useWave()
  const waves = useWaveLog()
  const sent = waves.get(view.record.address)
  const [ui, setUi] = useState<WaveUi>({ kind: 'idle' })

  const send = useCallback(
    async (amount: WaveAmount) => {
      setUi({ kind: 'sending', step: 'wallet' })
      try {
        await wave(view, amount, (step) => setUi({ kind: 'sending', step }))
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
        setUi({ kind: 'idle' })
      } catch (e) {
        const { message, cancelled } = describeError(e)
        setUi(cancelled ? { kind: 'choose' } : { kind: 'error', message })
      }
    },
    [wave, view],
  )

  return (
    <Animated.View
      entering={animate ? FadeInDown.duration(380).easing(Easing.out(Easing.cubic)) : undefined}
      style={[styles.card, fresh && styles.fresh]}
    >
      <View style={styles.head}>
        <Glyph seed={view.otherIdentity} />
        <View style={styles.who}>
          <T v="mono" style={styles.address} numberOfLines={1} selectable>
            {shortAddress(view.otherWallet)}
          </T>
          <T v="caption" c="inkDim">
            {relativeTime(view.record.firstSeen, nowMs)}
          </T>
        </View>
        <VerifiedBadge verified={view.record.verified} />
      </View>

      {sent && ui.kind === 'idle' ? (
        <View style={styles.sentRow}>
          <T v="label" c="signal">
            Waved {sent.amount} {ACTIVE_CLUSTER.skrLabel}
          </T>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="View the wave on the Solana explorer"
            onPress={() => WebBrowser.openBrowserAsync(explorerTx(sent.signature))}
            hitSlop={8}
          >
            <T v="label" c="inkDim" style={styles.link}>
              View transaction
            </T>
          </Pressable>
        </View>
      ) : null}

      {ui.kind === 'idle' ? (
        <View style={styles.actions}>
          <Button
            label={sent ? 'Wave again' : 'Wave'}
            variant="secondary"
            compact
            onPress={() => setUi({ kind: 'choose' })}
          />
        </View>
      ) : null}

      {ui.kind === 'choose' ? (
        <View style={styles.choose}>
          <T v="caption" c="inkDim">
            Send {ACTIVE_CLUSTER.skrLabel} to this person. You can only wave at people you passed.
          </T>
          <View style={styles.amounts}>
            {WAVE_AMOUNTS.map((a) => (
              <Button
                key={a}
                label={`${a} SKR`}
                variant="secondary"
                compact
                onPress={() => send(a)}
                style={styles.amount}
              />
            ))}
          </View>
          <Button label="Cancel" variant="ghost" compact onPress={() => setUi({ kind: 'idle' })} />
        </View>
      ) : null}

      {ui.kind === 'sending' ? (
        <View style={styles.sending} accessibilityLiveRegion="polite">
          <ActivityIndicator color={color.signal} size="small" />
          <T v="label" c="inkDim">
            {STEP_LABEL[ui.step]}…
          </T>
        </View>
      ) : null}

      {ui.kind === 'error' ? (
        <View style={styles.choose} accessibilityLiveRegion="polite">
          <T v="label" c="danger">
            {ui.message}
          </T>
          <Button label="Try again" variant="secondary" compact onPress={() => setUi({ kind: 'choose' })} />
        </View>
      ) : null}
    </Animated.View>
  )
}

export const EncounterCard = memo(EncounterCardBase)

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.line,
    padding: space.lg,
    gap: space.md,
  },
  fresh: { borderColor: color.signal },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  who: { flex: 1, gap: 2 },
  address: { fontSize: 16, lineHeight: 22 },
  actions: { flexDirection: 'row' },
  sentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { textDecorationLine: 'underline' },
  choose: { gap: space.md },
  amounts: { flexDirection: 'row', gap: space.sm },
  amount: { flex: 1, paddingHorizontal: space.sm },
  sending: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 40 },
})
