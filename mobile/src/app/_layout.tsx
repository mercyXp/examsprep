import '../global.css'

import { Stack } from 'expo-router/stack'

import { AppProviders } from '@/features/core/data-access/app-providers'
import { SessionProvider } from '@/features/auth/session'

export default function RootLayout() {
  return (
    <AppProviders>
      <SessionProvider>
        <Stack screenOptions={{ headerShadowVisible: false, headerStyle: { backgroundColor: '#F3F6F4' } }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="sign-in" options={{ title: 'ExamsPrep' }} />
          <Stack.Screen name="(main)" options={{ headerShown: false }} />
          <Stack.Screen name="course/[moduleId]" options={{ title: 'Course' }} />
          <Stack.Screen name="lesson/[lessonId]" options={{ title: 'Lesson' }} />
          <Stack.Screen name="quiz/[quizId]" options={{ title: 'Quiz' }} />
          <Stack.Screen name="pools" options={{ title: 'Prize pools' }} />
        </Stack>
      </SessionProvider>
    </AppProviders>
  )
}
