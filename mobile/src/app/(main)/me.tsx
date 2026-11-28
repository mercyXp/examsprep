import { Pressable, StyleSheet, Text } from 'react-native'
import { router } from 'expo-router'

import { useSession } from '@/features/auth/session'
import { Button, Card, Screen, Title, colors } from '@/ui/screen'

const ITEMS = [
  { href: '/(main)/achievements', title: 'Achievements' },
  { href: '/(main)/leaderboard', title: 'Leaderboard' },
  { href: '/(main)/wallet', title: 'Wallet and rewards' },
  { href: '/(main)/settings', title: 'Profile and settings' },
  { href: '/pools', title: 'Prize pools' },
] as const

export default function MeScreen() {
  const { user, signOut } = useSession()
  return (
    <Screen>
      <Title subtitle={user?.email || 'Signed in'}>{user?.name || 'Your account'}</Title>
      {ITEMS.map((item) => (
        <Pressable key={item.href} onPress={() => router.push(item.href)}>
          <Card>
            <Text style={styles.title}>{item.title}</Text>
          </Card>
        </Pressable>
      ))}
      <Button label="Sign out" tone="ghost" onPress={() => void signOut()} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 17, fontWeight: '700' },
})
