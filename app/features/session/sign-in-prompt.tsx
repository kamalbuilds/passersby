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

/** The one way in. An optional sentence of why, the wallet error if there was one, and one pill. */
export function SignInPrompt({ reason }: { reason?: string }) {
  const { status, error, signIn } = useSession()
  const working = status === 'connecting' || status === 'signing' || status === 'verifying'
  return (
    <View style={styles.box}>
      {reason ? (
        <T v="body" c="text2">
          {reason}
        </T>
      ) : null}
      {working ? (
        <T v="mono" c="text2" accessibilityLiveRegion="polite">
          {WORKING_LABEL[status]}
        </T>
      ) : null}
      {error ? (
        <T v="mono" c="warn" accessibilityLiveRegion="polite">
          {error}
        </T>
      ) : null}
      <Button label="Connect wallet" loading={working} onPress={signIn} />
    </View>
  )
}

const styles = StyleSheet.create({ box: { gap: space.md } })
