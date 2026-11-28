import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { router } from 'expo-router'

import { useSession } from '@/features/auth/session'
import { AI_UNAVAILABLE, aiPaths, api } from '@/lib/api'
import { Card, ErrorText, Note, Screen, Title, colors } from '@/ui/screen'

type QuizRow = { id: string; title: string; kind: string; moduleCode: string | null }

export default function QuizzesScreen() {
  const { token } = useSession()
  const [items, setItems] = useState<QuizRow[]>([])
  const [error, setError] = useState('')
  const [generatedNote, setGeneratedNote] = useState('')

  useEffect(() => {
    if (!token) return
    void api<{ items: QuizRow[] }>('/api/learn/quizzes', {}, token).then((result) => {
      if (!result.ok) setError(result.message)
      else setItems((result.data.items ?? []).filter((quiz) => quiz.kind !== 'mock'))
    })
    void api<{ items?: { id: string; prompt: string }[] }>(aiPaths.practice, {}, token, {
      unavailableStatuses: AI_UNAVAILABLE,
    }).then((result) => {
      if (!result.ok) setGeneratedNote(result.message)
      else
        setGeneratedNote(
          result.data.items?.length
            ? `${result.data.items.length} generated questions are on the server.`
            : 'The practice API returned no questions.',
        )
    })
  }, [token])

  return (
    <Screen>
      <Title subtitle="Published practice quizzes and mock exams. A passed mock can be claimed as a badge.">
        Quizzes
      </Title>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {items.length === 0 && !error ? (
        <Card>
          <Text style={styles.body}>
            No published quizzes yet. When an administrator publishes one, it shows up here.
          </Text>
        </Card>
      ) : null}
      <Card>
        <Text style={styles.title}>Generated practice</Text>
        <Note>{generatedNote || 'Checking the practice API.'}</Note>
      </Card>
      {items.map((quiz) => (
        <Pressable key={quiz.id} onPress={() => router.push(`/quiz/${quiz.id}`)}>
          <Card>
            <Text style={styles.kind}>
              {quiz.kind === 'mock' ? 'Mock exam' : 'Practice'}
              {quiz.moduleCode ? ` · ${quiz.moduleCode}` : ''}
            </Text>
            <Text style={styles.title}>{quiz.title}</Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  )
}

const styles = StyleSheet.create({
  kind: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  title: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 },
})
