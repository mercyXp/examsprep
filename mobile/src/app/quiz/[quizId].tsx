import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { useLocalSearchParams } from 'expo-router'

import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { Button, Card, ErrorText, Screen, Title, colors } from '@/ui/screen'

type Choice = { id: string; label: string }
type Question = { id: string; prompt: string; choices: Choice[] }
type Quiz = { title: string; kind: string; passMarkPercent: number | null; questions: Question[] }
type Result = { scorePercent: number; passed: boolean; questions: { id: string; correct: boolean; explanation: string }[] }

export default function QuizScreen() {
  const { quizId } = useLocalSearchParams<{ quizId: string }>()
  const { token } = useSession()
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!token || !quizId) return
    void api<{ item: Quiz }>(`/api/learn/quizzes/${quizId}`, {}, token).then((response) => {
      if (!response.ok) setError(response.message)
      else setQuiz(response.data.item)
    })
  }, [quizId, token])

  async function submit() {
    if (!token || !quizId || !quiz) return
    setBusy(true)
    setError('')
    const response = await api<Result>(`/api/learn/quizzes/${quizId}/attempts`, {
      method: 'POST',
      body: JSON.stringify({
        answers: Object.entries(answers).map(([question_version_id, option]) => ({
          question_version_id,
          selected_option_ids: [option],
        })),
      }),
    }, token)
    setBusy(false)
    if (!response.ok) setError(response.message)
    else setResult(response.data)
  }

  return (
    <Screen>
      <Title subtitle={quiz?.kind === 'mock' ? 'Mock exam. A pass can be claimed as a badge.' : 'Practice quiz.'}>
        {quiz?.title ?? 'Quiz'}
      </Title>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {result ? (
        <Card>
          <Text style={styles.score}>{result.scorePercent}%</Text>
          <Text style={styles.body}>{result.passed ? 'Passed.' : 'Not passed yet. You can try again.'}</Text>
          {result.questions.map((question) => (
            <Text key={question.id} style={styles.body}>
              {question.correct ? 'Correct. ' : 'Not this time. '}
              {question.explanation}
            </Text>
          ))}
        </Card>
      ) : (
        quiz?.questions.map((question, index) => (
          <Card key={question.id}>
            <Text style={styles.prompt}>
              {index + 1}. {question.prompt}
            </Text>
            {question.choices.map((choice) => (
              <Pressable key={choice.id} onPress={() => setAnswers((current) => ({ ...current, [question.id]: choice.id }))}>
                <Text style={[styles.choice, answers[question.id] === choice.id && styles.chosen]}>{choice.label}</Text>
              </Pressable>
            ))}
          </Card>
        ))
      )}
      {!result && quiz ? <Button disabled={busy} label={busy ? 'Marking…' : 'Submit'} onPress={() => void submit()} /> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  prompt: { color: colors.ink, fontSize: 16, fontWeight: '700', lineHeight: 22 },
  choice: { color: colors.ink, fontSize: 16, paddingVertical: 6 },
  chosen: { color: colors.accent, fontWeight: '700' },
  score: { color: colors.ink, fontSize: 36, fontWeight: '700' },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 },
})
