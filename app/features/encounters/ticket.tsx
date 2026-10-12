import { memo, useCallback, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, { Easing, FadeIn, ReduceMotion, SlideInDown, SlideOutDown } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import * as WebBrowser from 'expo-web-browser'
import { VerifiedBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dots } from '@/components/ui/dots'
import { Perforation } from '@/components/ui/perforation'
import { T } from '@/components/ui/text'
import { explorerTx } from '@/constants/cluster'
import { color, font, motion, radius, space } from '@/constants/theme'
import { describeError } from '@/lib/errors'
import { shortAddress } from '@/lib/format'
import type { EncounterView } from './encounter-view'
import { ticketTime } from './ticket-format'
import { useWave, WAVE_AMOUNTS, type WaveAmount, type WaveStep } from './use-wave'
import { useWaveLog } from './wave-log'

const STEP_LABEL: Record<WaveStep, string> = {
  wallet: 'Opening your wallet',
  checking: 'Checking your balance',
  approve: 'Approve in your wallet',
  confirming: 'Confirming on Solana',
}

type WaveUi =
  | { kind: 'idle' }
  | { kind: 'choose' }
  | { kind: 'sending'; step: WaveStep }
  | { kind: 'error'; message: string }

/** One kept meeting: time and date on the left, a tear line, then who and what you can do about it. */
function TicketBase({ view }: { view: EncounterView }) {
  const wave = useWave()
  const waves = useWaveLog()
  const sent = waves.get(view.record.address)
  const [ui, setUi] = useState<WaveUi>({ kind: 'idle' })
  const { time, date } = ticketTime(view.record.firstSeen)
  const sending = ui.kind === 'sending'

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
    <View style={styles.ticket}>
      <View style={styles.left}>
        <T v="mono" style={styles.time}>
          {time}
        </T>
        <T v="label" c="text3">
          {date}
        </T>
      </View>
      <Perforation notch />
      <View style={[styles.right, sending && styles.sending]}>
        <View style={styles.who}>
          <T v="label" c={sending ? 'sodiumInk' : 'sodium'}>
            Passed · {time}
          </T>
          <T v="mono" c={sending ? 'sodiumInk' : 'text'} numberOfLines={1} selectable>
            {shortAddress(view.otherWallet)}
          </T>
          {view.record.verified ? <VerifiedBadge /> : null}
        </View>

        {ui.kind === 'idle' && sent ? (
          <View style={styles.sentRow} accessibilityLiveRegion="polite">
            <T v="label" c="sodium">
              Waved {sent.amount} SKR
            </T>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="View the wave on the Solana explorer"
              onPress={() => WebBrowser.openBrowserAsync(explorerTx(sent.signature))}
              hitSlop={12}
            >
              <T v="label" c="text3" style={styles.link}>
                Tx
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
              style={styles.action}
            />
          </View>
        ) : null}

        {ui.kind === 'choose' ? (
          <Animated.View
            entering={FadeIn.duration(motion.reveal).reduceMotion(ReduceMotion.System)}
            style={styles.choose}
          >
            <View style={styles.amounts}>
              {WAVE_AMOUNTS.map((a) => (
                <Button
                  key={a}
                  label={String(a)}
                  variant="secondary"
                  compact
                  onPress={() => send(a)}
                  accessibilityLabel={`Wave ${a} SKR`}
                  style={styles.amount}
                />
              ))}
              <T v="label" c="text3">
                SKR
              </T>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel wave" onPress={() => setUi({ kind: 'idle' })} hitSlop={12}>
              <T v="label" c="text3">
                Cancel
              </T>
            </Pressable>
          </Animated.View>
        ) : null}

        {ui.kind === 'sending' ? (
          <View style={styles.progress} accessibilityLiveRegion="polite">
            <T v="label" c="sodiumInk">
              {STEP_LABEL[ui.step]}
            </T>
            <Dots tone="sodiumInk" />
          </View>
        ) : null}

        {ui.kind === 'error' ? (
          <View style={styles.choose} accessibilityLiveRegion="polite">
            <T v="mono" c="warn">
              {ui.message}
            </T>
            <Button label="Try again" variant="secondary" compact onPress={() => setUi({ kind: 'choose' })} style={styles.start} />
          </View>
        ) : null}
      </View>
    </View>
  )
}

export const Ticket = memo(TicketBase)

/** Slides up over the tab bar when a new encounter confirms. Tapping it files it away and opens the list. */
export function ArrivalTicket({ view, onPress }: { view: EncounterView; onPress: () => void }) {
  const { time } = ticketTime(view.record.firstSeen)
  return (
    <Animated.View
      entering={SlideInDown.duration(motion.ticket).easing(Easing.out(Easing.cubic)).reduceMotion(ReduceMotion.System)}
      exiting={SlideOutDown.duration(motion.ticket).easing(Easing.in(Easing.cubic)).reduceMotion(ReduceMotion.System)}
      style={styles.arrival}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Passed ${shortAddress(view.otherWallet)} at ${time}. Open encounters.`}
        accessibilityLiveRegion="polite"
        onPress={onPress}
        style={({ pressed }) => [styles.arrivalRow, pressed && styles.arrivalPressed]}
      >
        <Perforation notch style={styles.arrivalPerf} />
        <View style={styles.arrivalBody}>
          <T v="label" c="sodium">
            Passed · {time}
          </T>
          <View style={styles.who}>
            <T v="mono" c="text" selectable={false}>
              {shortAddress(view.otherWallet)}
            </T>
            {view.record.verified ? <VerifiedBadge /> : null}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  ticket: {
    flexDirection: 'row',
    minHeight: 104,
    backgroundColor: color.night2,
    borderRadius: radius.ticket,
    overflow: 'hidden',
  },
  left: { width: 88, paddingVertical: space.lg, paddingLeft: space.lg, gap: space.xs },
  time: { fontFamily: font.monoSemi },
  right: { flex: 1, padding: space.lg, gap: space.md, justifyContent: 'center' },
  sending: { backgroundColor: color.sodium },
  who: { gap: space.sm, alignItems: 'flex-start' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  action: { marginLeft: 'auto' },
  start: { alignSelf: 'flex-start' },
  sentRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  link: { textDecorationLine: 'underline' },
  choose: { gap: space.md },
  amounts: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  amount: { minWidth: 44, paddingHorizontal: space.md },
  progress: { gap: space.sm },
  arrival: {
    backgroundColor: color.night2,
    borderRadius: radius.ticket,
    borderWidth: 1,
    borderColor: color.line,
    overflow: 'hidden',
  },
  arrivalRow: { flexDirection: 'row', alignItems: 'stretch' },
  arrivalPressed: { backgroundColor: color.night3 },
  arrivalPerf: { marginLeft: space.sm },
  arrivalBody: { flex: 1, padding: space.lg, paddingLeft: space.md, gap: space.sm },
})
