import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg'
import { color } from '@/constants/theme'

/** A soft sodium glow that falls off to nothing at its edge. A lit lamp or a phone under one sits on top of it. */
export function Bloom({ size, id = 'bloom' }: { size: number; id?: string }) {
  const c = size / 2
  return (
    <Svg width={size} height={size} pointerEvents="none">
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color.sodiumDim} />
          <Stop offset="1" stopColor={color.sodium} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={c} cy={c} r={c} fill={`url(#${id})`} />
      <Circle cx={c} cy={c} r={c * 0.6} fill={`url(#${id})`} />
    </Svg>
  )
}
