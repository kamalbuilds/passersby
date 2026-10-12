import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PropsWithChildren, useEffect } from 'react'
import { AppState } from 'react-native'
import { MobileWalletProvider } from '@wallet-ui/react-native-kit'
import { AppConfig } from '@/constants/app-config'
import { RadarProvider } from '@/features/radar/radar-provider'
import { SessionProvider } from '@/features/session/session-provider'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 10_000 } } })

export function AppProviders({ children }: PropsWithChildren) {
  // React Query has no notion of a backgrounded phone; tell it when the app is foregrounded.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'))
    return () => sub.remove()
  }, [])
  return (
    <QueryClientProvider client={queryClient}>
      <MobileWalletProvider cluster={AppConfig.cluster} identity={AppConfig.identity}>
        <SessionProvider>
          <RadarProvider>{children}</RadarProvider>
        </SessionProvider>
      </MobileWalletProvider>
    </QueryClientProvider>
  )
}
