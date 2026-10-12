import { Text as RNText, type TextProps, type TextStyle } from 'react-native'
import { color, type } from '@/constants/theme'

type Props = TextProps & {
  v?: keyof typeof type
  c?: keyof typeof color
  tabular?: boolean
}

/** Themed text. Numbers in lists and ledgers use tabular figures so columns hold still. */
export function T({ v = 'body', c = 'ink', tabular, style, ...rest }: Props) {
  const base: TextStyle = { ...type[v], color: color[c] }
  return <RNText {...rest} style={[base, tabular && { fontVariant: ['tabular-nums'] }, style]} />
}
