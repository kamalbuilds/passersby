import { Text as RNText, type TextProps } from 'react-native'
import { color, text, type ColorName } from '@/constants/theme'

type Props = TextProps & {
  v?: keyof typeof text
  c?: ColorName
}

/** Themed text: a type token and a colour token, nothing else. */
export function T({ v = 'body', c = 'text', style, ...rest }: Props) {
  return <RNText {...rest} style={[text[v], { color: color[c] }, style]} />
}
