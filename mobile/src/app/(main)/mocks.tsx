import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { router } from 'expo-router'

import { useSession } from '@/features/auth/session'
import { useStudyData } from '@/features/offline/study-data'
import { api } from '@/lib/api'
import { Card, ErrorText, Screen, Title, colors } from '@/ui/screen'

type QuizRow = { id: string; title: string; kind: string; moduleCode: string | null }

export default function MocksScreen() {
  const { token } = useSession()
  const study = useStudyData()
  const [items, setItems] = useState<QuizRow[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    void (async () => {
      const result = await api<{ items: QuizRow[] }>('/api/learn/quizzes', {}, token)
      if (result.ok) {
        setItems((result.data.items ?? []).filter((quiz) => quiz.kind === 'mock'))
        return
      }
      if (result.offline) {
        const saved = await study.listDownloads('quiz')
        const mocks = saved.map((row) => JSON.parse(row.payload) as QuizRow).filter((quiz) => quiz.kind === 'mock')
        setItems(mocks)
        if (mocks.length === 0) setError(result.message)
        return
      }
      setError(result.message)
    })()
  }, [study, token])

  return (
    <Screen>
      <Title subtitle="Timed when the quiz has a limit. The clock starts when the paper opens.">Mock exams</Title>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {items.length === 0 && !error ? (
        <Card>
          <Text style={styles.body}>No published mock exams yet.</Text>
        </Card>
      ) : null}
      {items.map((quiz) => (
        <Pressable key={quiz.id} onPress={() => router.push(`/quiz/${quiz.id}`)}>
          <Card>
            <Text style={styles.kind}>{quiz.moduleCode || 'Mock'}</Text>
            <Text style={styles.title}>{quiz.title}</Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  )
}

const styles = StyleSheet.create({
  kind: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  title: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  body: { color: colors.muted, fontSize: 14 },
})
