import { useEffect } from 'react'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useFonts } from 'expo-font'
// Weight-specific entry points: the package root pulls every weight into the bundle.
import { SpaceGrotesk_500Medium } from '@expo-google-fonts/space-grotesk/500Medium'
import { SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk/700Bold'
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular'
import { JetBrainsMono_600SemiBold } from '@expo-google-fonts/jetbrains-mono/600SemiBold'
import 'react-native-reanimated'
import { AppProviders } from '@/components/app-providers'
import { color, font } from '@/constants/theme'

SplashScreen.preventAutoHideAsync().catch(() => {})

export default function RootLayout() {
  const [loaded, error] = useFonts({
    [font.displayMedium]: SpaceGrotesk_500Medium,
    [font.display]: SpaceGrotesk_700Bold,
    [font.mono]: JetBrainsMono_400Regular,
    [font.monoSemi]: JetBrainsMono_600SemiBold,
  })

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {})
  }, [loaded, error])

  if (!loaded && !error) return null

  return (
    <AppProviders>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.night } }} />
    </AppProviders>
  )
}
