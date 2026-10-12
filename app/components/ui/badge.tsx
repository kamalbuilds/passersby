import { StyleSheet, View } from 'react-native'
import { color, radius, space } from '@/constants/theme'
import type { Tier } from '@/lib/api'
import { T } from './text'

/** Passport tier. Text carries the meaning, the seeker colour only backs it up. */
export function TierBadge({ tier }: { tier: Tier }) {
  const seeker = tier === 'seeker'
  return (
    <View style={[styles.base, { borderColor: seeker ? color.seeker : color.text3 }]}>
      <T v="label" c={seeker ? 'seeker' : 'text3'}>
        {seeker ? 'Seeker verified' : 'Wallet only'}
      </T>
    </View>
  )
}

/** Shown on a ticket only when both phones held a Seeker Genesis Token. */
export function VerifiedBadge() {
  return (
    <View style={[styles.base, { borderColor: color.seeker }]}>
      <T v="label" c="seeker">
        Verified Seeker
      </T>
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.badge,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
})
