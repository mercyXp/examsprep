import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'

import { AppProviders } from '@/providers/AppProviders'
import { SessionProvider } from '@/state/session'
import { colors } from '@/ui/theme'

export default function RootLayout() {
  return (
    <AppProviders>
      <SessionProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
      </SessionProvider>
    </AppProviders>
  )
}
