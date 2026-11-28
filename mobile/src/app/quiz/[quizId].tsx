import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { useLocalSearchParams } from 'expo-router'

import { useSession } from '@/features/auth/session'
import { useStudyData } from '@/features/offline/study-data'
import { api } from '@/lib/api'
import { Button, Card, ErrorText, Note, Screen, Title, colors } from '@/ui/screen'

type Choice = { id: string; label: string }
type Question = { id: string; prompt: string; choices: Choice[] }
type Quiz = {
  id?: string
  title: string
  kind: string
  passMarkPercent: number | null
  timeLimitSeconds: number | null
  questions: Question[]
}
type Result = {
  scorePercent: number
  passed: boolean
  replayed?: boolean
  questions: { id: string; correct: boolean; explanation: string }[]
}

export default function QuizScreen() {
  const { quizId } = useLocalSearchParams<{ quizId: string }>()
  const { token } = useSession()
  const study = useStudyData()
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [offlineCopy, setOfflineCopy] = useState(false)
  const submitting = useRef(false)
  const readDownload = study.readDownload
  const online = study.online

  useEffect(() => {
    if (!quizId) return
    void (async () => {
      if (token && online) {
        const response = await api<{ item: Quiz }>(`/api/learn/quizzes/${quizId}`, {}, token)
        if (response.ok) {
          setQuiz(response.data.item)
          if (response.data.item.timeLimitSeconds) setRemaining(response.data.item.timeLimitSeconds)
          return
        }
        if (!response.offline) {
          setError(response.message)
          return
        }
      }
      const stored = await readDownload('quiz', quizId)
      if (!stored) {
        setError('This quiz is not saved on the phone, and the API could not be reached.')
        return
      }
      const item = JSON.parse(stored.payload) as Quiz
      setQuiz(item)
      setOfflineCopy(true)
      if (item.timeLimitSeconds) setRemaining(item.timeLimitSeconds)
    })()
  }, [online, quizId, readDownload, token])

  useEffect(() => {
    if (remaining === null || result) return
    if (remaining <= 0) {
      void submit()
      return
    }
    const timer = setTimeout(() => setRemaining((value) => (value === null ? value : value - 1)), 1000)
    return () => clearTimeout(timer)
    // submit reads the latest answers on the tick that hits zero. Listing it would reset the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, result])

  async function submit() {
    if (!token || !quizId || !quiz || submitting.current || result) return
    submitting.current = true
    setBusy(true)
    setError('')
    const body = {
      answers: Object.entries(answers).map(([question_version_id, option]) => ({
        question_version_id,
        selected_option_ids: [option],
      })),
    }
    if (!study.online) {
      await study.enqueue({ kind: 'attempt', path: `/api/learn/quizzes/${quizId}/attempts`, method: 'POST', body })
      setBusy(false)
      setNote(
        'Saved on this phone. It will be marked when you reconnect. The same idempotency key is reused, so a retry does not create a second attempt.',
      )
      return
    }
    const key = await study.enqueue({
      kind: 'attempt',
      path: `/api/learn/quizzes/${quizId}/attempts`,
      method: 'POST',
      body,
    })
    const response = await api<Result>(
      `/api/learn/quizzes/${quizId}/attempts`,
      { method: 'POST', body: JSON.stringify(body) },
      token,
      {
        idempotencyKey: key,
      },
    )
    setBusy(false)
    if (!response.ok) {
      if (response.offline) {
        setNote('The request did not finish. It stays in the sync queue with the same key.')
        return
      }
      submitting.current = false
      setError(response.message)
      return
    }
    setResult(response.data)
    await study.flush()
  }

  async function download() {
    if (!quiz || !quizId) return
    await study.saveDownload({
      kind: 'quiz',
      remoteId: quizId,
      title: quiz.title,
      payload: JSON.stringify({ ...quiz, id: quizId, kind: quiz.kind }),
    })
    if (quiz.kind !== 'mock') {
      await study.saveDownload({
        kind: 'practice',
        remoteId: quizId,
        title: quiz.title,
        payload: JSON.stringify({ ...quiz, id: quizId }),
      })
    }
    setNote('Saved on this phone. Correct answers stay on the server until you submit.')
  }

  return (
    <Screen>
      <Title subtitle={quiz?.kind === 'mock' ? 'Mock exam. A pass can be claimed as a badge.' : 'Practice quiz.'}>
        {quiz?.title ?? 'Quiz'}
      </Title>
      {offlineCopy ? <Note>Opened from this phone.</Note> : null}
      {remaining !== null && !result ? <Text style={styles.timer}>{formatClock(remaining)}</Text> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {note ? <Note>{note}</Note> : null}
      {quiz ? <Button label="Save for offline" tone="ghost" onPress={() => void download()} /> : null}
      {result ? (
        <Card>
          <Text style={styles.score}>{result.scorePercent}%</Text>
          <Text style={styles.body}>
            {result.passed ? 'Passed.' : 'Not passed yet. You can try again.'}
            {result.replayed ? ' This is the original attempt, not a second one.' : ''}
          </Text>
          {result.questions?.map((question) => (
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
              <Pressable
                key={choice.id}
                onPress={() => setAnswers((current) => ({ ...current, [question.id]: choice.id }))}
              >
                <Text style={[styles.choice, answers[question.id] === choice.id && styles.chosen]}>{choice.label}</Text>
              </Pressable>
            ))}
          </Card>
        ))
      )}
      {!result && quiz ? (
        <Button disabled={busy} label={busy ? 'Marking…' : 'Submit'} onPress={() => void submit()} />
      ) : null}
    </Screen>
  )
}

function formatClock(seconds: number): string {
  const whole = Math.max(0, seconds)
  const minutes = Math.floor(whole / 60)
  const rest = whole % 60
  return `${minutes}:${rest.toString().padStart(2, '0')}`
}

const styles = StyleSheet.create({
  timer: { color: colors.accent, fontSize: 28, fontWeight: '800' },
  score: { color: colors.ink, fontSize: 32, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  prompt: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  choice: { color: colors.ink, fontSize: 15, paddingVertical: 6 },
  chosen: { color: colors.accent, fontWeight: '700' },
})
