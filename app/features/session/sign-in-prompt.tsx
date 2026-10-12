import { StyleSheet, View } from 'react-native'
import { Button } from '@/components/ui/button'
import { T } from '@/components/ui/text'
import { space } from '@/constants/theme'
import { useSession } from './session-provider'

const WORKING_LABEL = {
  connecting: 'Opening your wallet',
  signing: 'Waiting for your signature',
  verifying: 'Checking Seeker status',
} as const

/** Shown on tabs that need a session. One sentence of why, one button. */
export function SignInPrompt({ reason }: { reason: string }) {
  const { status, error, signIn } = useSession()
  const working = status === 'connecting' || status === 'signing' || status === 'verifying'
  return (
    <View style={styles.box}>
      <T v="body" c="inkDim">
        {reason}
      </T>
      {error ? (
        <T v="label" c="danger" accessibilityLiveRegion="polite">
          {error}
        </T>
      ) : null}
      <Button label={working ? `${WORKING_LABEL[status]}…` : 'Connect wallet'} loading={working} onPress={signIn} />
    </View>
  )
}

const styles = StyleSheet.create({ box: { gap: space.md, paddingTop: space.lg } })
