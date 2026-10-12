import type { TextStyle } from 'react-native'

/**
 * Passersby design tokens, Sodium night. See DESIGN.md. This file is the only place a colour, a
 * font family or a type size is defined: components import from here and never hold a literal.
 */
export const color = {
  night: '#0B0E14',
  night2: '#121722',
  night3: '#1B2230',
  line: '#263042',
  text: '#F2EBDD',
  text2: '#A9A293',
  text3: '#6B6759',
  sodium: '#FFB547',
  /** sodium at 14% alpha: the lamp pool glow */
  sodiumDim: 'rgba(255, 181, 71, 0.14)',
  /** sodium darkened 12%: pressed primary */
  sodiumPressed: '#E09F3E',
  sodiumInk: '#1A1206',
  seeker: '#7FE3C4',
  warn: '#FF7A59',
  clear: 'transparent',
} as const

export type ColorName = keyof typeof color

export const font = {
  display: 'SpaceGrotesk_700Bold',
  displayMedium: 'SpaceGrotesk_500Medium',
  mono: 'JetBrainsMono_400Regular',
  monoSemi: 'JetBrainsMono_600SemiBold',
} as const

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, huge: 48, giant: 64 } as const

export const radius = { ticket: 6, button: 999, badge: 4 } as const

export const text = {
  hero: { fontFamily: font.display, fontSize: 40, lineHeight: 42, letterSpacing: -0.5 },
  title: { fontFamily: font.display, fontSize: 24, lineHeight: 28 },
  body: { fontFamily: font.displayMedium, fontSize: 16, lineHeight: 22 },
  label: {
    fontFamily: font.monoSemi,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  mono: { fontFamily: font.mono, fontSize: 13, lineHeight: 18 },
  count: { fontFamily: font.display, fontSize: 64, lineHeight: 64, fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>

/** Motion durations in ms. Nothing else on screen moves. */
export const motion = { dot: 300, breathe: 4000, ticket: 260, reveal: 180 } as const

/** Street geometry: RSSI at the lamp's feet and at the edge of range, as design fractions of the street radius. */
export const street = { rssiNear: -40, rssiFar: -95, nearFrac: 0.16, farFrac: 0.94, breatheScale: 1.04 } as const
