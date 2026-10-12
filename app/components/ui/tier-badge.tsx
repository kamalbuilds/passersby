import { StyleSheet, View } from 'react-native'
import { color, font, radius, space } from '@/constants/theme'
import type { Tier } from '@/lib/api'
import { T } from './text'

/** Filled for a verified Seeker, outlined for an unverified wallet. Text carries the meaning, colour only backs it up. */
export function TierBadge({ tier }: { tier: Tier }) {
  const seeker = tier === 'seeker'
  return (
    <View style={[styles.base, seeker ? styles.seeker : styles.wallet]}>
      <T v="label" c={seeker ? 'onSignal' : 'inkDim'}>
        {seeker ? 'Seeker verified' : 'Wallet, unverified'}
      </T>
    </View>
  )
}

export function VerifiedBadge({ verified }: { verified: boolean }) {
  return (
    <View style={[styles.base, verified ? styles.seeker : styles.wallet]}>
      <T v="caption" c={verified ? 'onSignal' : 'inkFaint'} style={{ fontFamily: font.bodyBold }}>
        {verified ? 'Verified Seeker' : 'Unverified'}
      </T>
    </View>
  )
}

const styles = StyleSheet.create({
  base: { paddingHorizontal: space.md, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  seeker: { backgroundColor: color.signal },
  wallet: { borderWidth: 1, borderColor: color.lineStrong },
})
