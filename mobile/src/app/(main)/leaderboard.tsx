import { useEffect, useState } from 'react'
import { StyleSheet, Text } from 'react-native'

import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { Card, ErrorText, Screen, Title, colors } from '@/ui/screen'

type Row = { rank: number; displayName: string; quizPoints: number; lessonsCompleted: number }

export default function LeaderboardScreen() {
  const { token } = useSession()
  const [items, setItems] = useState<Row[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    void api<{ items: Row[] }>('/api/leaderboard?days=7', {}, token).then((result) => {
      if (!result.ok) setError(result.message)
      else setItems(result.data.items ?? [])
    })
  }, [token])

  return (
    <Screen>
      <Title subtitle="Last 7 days. Quiz scores come first. Completed lessons break a tie. Names are first names only.">
        Leaderboard
      </Title>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {items.length === 0 && !error ? (
        <Card>
          <Text style={styles.body}>No scores this week yet. Finish a quiz or a lesson and you will show up here.</Text>
        </Card>
      ) : null}
      {items.map((row) => (
        <Card key={`${row.rank}-${row.displayName}`}>
          <Text style={styles.rank}>
            #{row.rank} {row.displayName}
          </Text>
          <Text style={styles.body}>
            {row.quizPoints} quiz points · {row.lessonsCompleted} lessons
          </Text>
        </Card>
      ))}
    </Screen>
  )
}

const styles = StyleSheet.create({
  rank: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 },
})
