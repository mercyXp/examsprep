import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createSolanaDevnet, MobileWalletProvider, type AppIdentity } from '@wallet-ui/react-native-kit'
import type { ReactNode } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

const identity: AppIdentity = { name: 'ExamSprint', uri: 'https://www.examsprep.xyz' }
const cluster = createSolanaDevnet({ url: 'https://api.devnet.solana.com' })
const queryClient = new QueryClient()

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <MobileWalletProvider cluster={cluster} identity={identity}>
            {children}
          </MobileWalletProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
