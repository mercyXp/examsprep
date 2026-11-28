import { Redirect } from 'expo-router'

import { useSession } from '@/features/auth/session'

export default function Index() {
  const { ready, token } = useSession()
  if (!ready) return null
  if (!token) return <Redirect href="/sign-in" />
  return <Redirect href="/(main)" />
}
