import { Redirect } from 'expo-router'

import { useSession } from '@/features/auth/session'

export default function Index() {
  const { token } = useSession()
  if (!token) return <Redirect href="/sign-in" />
  return <Redirect href="/(main)" />
}
