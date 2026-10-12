/**
 * Passersby design tokens. Direction: a city at night seen on a radar. Asphalt blue-black ground,
 * hairline rings, one crosswalk-lime signal colour. Type: Unbounded for the numbers and headlines,
 * Hanken Grotesk for reading, JetBrains Mono for addresses, times and amounts.
 */
export const color = {
  ground: '#080B0F',
  surface: '#0F141A',
  surfaceRaised: '#161D26',
  line: '#1F2934',
  lineStrong: '#2C3946',
  ink: '#EAEFF3',
  inkDim: '#A3AFBA',
  inkFaint: '#7C8995',
  signal: '#C9F24B',
  signalDim: '#7E9B2C',
  onSignal: '#0B1104',
  warn: '#F2B94B',
  danger: '#FF7A6B',
} as const

export const font = {
  display: 'Unbounded_600SemiBold',
  displayHeavy: 'Unbounded_800ExtraBold',
  body: 'HankenGrotesk_400Regular',
  bodyMedium: 'HankenGrotesk_500Medium',
  bodyBold: 'HankenGrotesk_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoBold: 'JetBrainsMono_700Bold',
} as const

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, huge: 48 } as const

export const radius = { sm: 8, md: 14, lg: 22, pill: 999 } as const

export const type = {
  caption: { fontFamily: font.body, fontSize: 12, lineHeight: 16 },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: font.bodyBold, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: font.bodyMedium, fontSize: 13, lineHeight: 18 },
  mono: { fontFamily: font.mono, fontSize: 13, lineHeight: 18 },
  title: { fontFamily: font.display, fontSize: 22, lineHeight: 30, letterSpacing: -0.4 },
  headline: { fontFamily: font.display, fontSize: 28, lineHeight: 36, letterSpacing: -0.6 },
  numeral: { fontFamily: font.displayHeavy, fontSize: 64, lineHeight: 72, letterSpacing: -2 },
} as const
