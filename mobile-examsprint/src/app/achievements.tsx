import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { ScrollView, Text } from 'react-native'

import { api } from '@/lib/api'
import type { Achievement } from '@/lib/types'
import { useSession } from '@/state/session'
import { Button, Card, Screen, Title, colors } from '@/ui/theme'

export default function AchievementsScreen() {
  const session = useSession()
  const [items, setItems] = useState<Achievement[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session.ready) return
    if (!session.token) return
    void api<{ achievements: Achievement[] }>('/api/sprint/achievements', {}, session.token).then((result) => {
      if (!result.ok) {
        setError(result.message)
        return
      }
      setItems(result.data.achievements)
    })
  }, [session.ready, session.token])

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 28 }}>
        <Title kicker="BADGES" subtitle="They unlock when a run finishes. Quitting does not count.">
          Achievements
        </Title>
        {!session.token ? (
          <Button label="Sign in to see yours" onPress={() => router.push('/sign-in')} />
        ) : null}
        {error ? <Text style={{ color: colors.coral }}>{error}</Text> : null}
        {items.map((item) => (
          <Card key={item.code}>
            <Text style={{ color: item.unlocked ? colors.mint : colors.muted, fontWeight: '800', fontSize: 18 }}>
              {item.unlocked ? 'Unlocked' : 'Locked'} · {item.title}
            </Text>
            <Text style={{ color: colors.muted }}>{item.detail}</Text>
          </Card>
        ))}
        <Button label="Home" tone="ghost" onPress={() => router.replace('/')} />
      </ScrollView>
    </Screen>
  )
}
