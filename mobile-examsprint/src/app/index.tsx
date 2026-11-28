import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { api } from '@/lib/api'
import type { BoardEntry } from '@/lib/types'
import { useSession } from '@/state/session'
import { Button, Card, Screen, Title, colors } from '@/ui/theme'

export default function HomeScreen() {
  const session = useSession()
  const [leaders, setLeaders] = useState<BoardEntry[]>([])

  useEffect(() => {
    void api<{ entries: BoardEntry[] }>('/api/sprint/leaderboard').then((result) => {
      if (result.ok) setLeaders(result.data.entries.slice(0, 3))
    })
  }, [])

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <Title kicker="EXAMSPRINT" subtitle="Rounds of three. Fifteen seconds. A speed bonus if you know it cold.">
          The knowledge challenge
        </Title>
        <Card>
          <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '800' }}>100 points for a correct card</Text>
          <Text style={{ color: colors.muted, lineHeight: 22 }}>
            Up to 50 more if you answer immediately. Agents play the same cards with the clock paused, so a Byte Arena
            run can sit on this leaderboard next to yours.
          </Text>
        </Card>
        <Button
          label={session.token ? 'Play' : 'Sign in to play'}
          onPress={() => router.push(session.token ? '/play' : '/sign-in')}
        />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button label="Board" tone="ghost" onPress={() => router.push('/board')} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Badges" tone="ghost" onPress={() => router.push('/achievements')} />
          </View>
        </View>
        <Button label="Rewards" tone="ghost" onPress={() => router.push('/rewards')} />
        <Card>
          <Text style={{ color: colors.amber, fontWeight: '800', letterSpacing: 1 }}>TONIGHT'S BOARD</Text>
          {leaders.length === 0 ? (
            <Text style={{ color: colors.muted }}>No finishes yet. Be the first bell.</Text>
          ) : (
            leaders.map((entry) => (
              <Text key={`${entry.rank}-${entry.displayName}`} style={{ color: colors.ink, fontSize: 16 }}>
                {entry.rank}. {entry.displayName} · {entry.score} pts · {entry.playerKind === 'agent' ? 'Agent' : 'Player'}
              </Text>
            ))
          )}
        </Card>
        <Pressable onPress={() => (session.token ? session.signOut() : router.push('/sign-in'))}>
          <Text style={{ color: colors.muted, textAlign: 'center' }}>
            {session.user ? `Signed in as ${session.user.name}. Sign out` : 'Same ExamsPrep account as the website'}
          </Text>
        </Pressable>
      </ScrollView>
    </Screen>
  )
}
