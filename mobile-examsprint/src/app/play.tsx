import { router } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'

import { api } from '@/lib/api'
import type { SprintState, Subject } from '@/lib/types'
import { useSession } from '@/state/session'
import { Button, Card, Screen, Title, colors } from '@/ui/theme'

export default function PlayScreen() {
  const session = useSession()
  const [subjects, setSubjects] = useState<Subject[] | null>(null)
  const [state, setState] = useState<SprintState | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [stamp, setStamp] = useState<SprintState['lastResult']>(null)

  useEffect(() => {
    if (!session.ready) return
    if (!session.token) {
      router.replace('/sign-in')
      return
    }
    void api<{ subjects: Subject[] }>('/api/sprint/subjects', {}, session.token).then((result) => {
      if (!result.ok) {
        setError(result.message)
        setSubjects([])
        return
      }
      setSubjects(result.data.subjects)
    })
  }, [session.ready, session.token])

  useEffect(() => {
    if (!state?.lastResult || (state.phase === 'question' && state.moves === 0)) return
    setStamp(state.lastResult)
    const timer = setTimeout(() => setStamp(null), 1100)
    return () => clearTimeout(timer)
  }, [state?.moves, state?.lastResult, state?.phase])

  async function start(subjectId: string) {
    if (!session.token) return
    setBusy(true)
    setError('')
    const result = await api<SprintState>(
      '/api/sprint/sessions',
      { method: 'POST', body: JSON.stringify({ subjectId }) },
      session.token,
    )
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setState(result.data)
  }

  async function send(path: string, body: Record<string, string | null>) {
    if (!session.token || !state) return
    setBusy(true)
    const result = await api<SprintState>(
      `/api/sprint/sessions/${state.sessionId}/${path}`,
      { method: 'POST', body: JSON.stringify(body) },
      session.token,
    )
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setError('')
    setState(result.data)
  }

  if (!state) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 28 }}>
          <Title kicker="PICK A SUBJECT" subtitle="Published multiple-choice questions, or the practice deck.">
            What are we sprinting?
          </Title>
          {error ? <Text style={{ color: colors.coral }}>{error}</Text> : null}
          {(subjects ?? []).map((subject) => (
            <Pressable key={subject.id} disabled={busy} onPress={() => void start(subject.id)}>
              <Card>
                <Text style={{ color: colors.amber, fontWeight: '800', letterSpacing: 1 }}>{subject.code}</Text>
                <Text style={{ color: colors.ink, fontSize: 22, fontWeight: '800' }}>{subject.name}</Text>
                <Text style={{ color: colors.muted }}>
                  {subject.questionCount} cards · {subject.source === 'bank' ? 'Question bank' : 'Practice deck'}
                </Text>
                {subject.blurb ? <Text style={{ color: colors.muted }}>{subject.blurb}</Text> : null}
              </Card>
            </Pressable>
          ))}
          {subjects === null ? <Text style={{ color: colors.muted }}>Loading subjects…</Text> : null}
          <Button label="Home" tone="ghost" onPress={() => router.replace('/')} />
        </ScrollView>
      </Screen>
    )
  }

  if (state.status === 'finished') {
    return <Results state={state} onAgain={() => setState(null)} />
  }

  if (state.phase === 'round_break' && state.roundSummary) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', gap: 16 }}>
          <Title kicker={`ROUND ${state.roundSummary.round}`}>Round clear</Title>
          <Card>
            <Text style={{ color: colors.ink, fontSize: 28, fontWeight: '800' }}>
              {state.roundSummary.correct}/{state.roundSummary.questions} correct
            </Text>
            <Text style={{ color: colors.mint, fontSize: 18 }}>+{state.roundSummary.points} this round</Text>
            <Text style={{ color: colors.muted }}>Running score {state.score}</Text>
          </Card>
          <Button
            disabled={busy}
            label="Next round"
            onPress={() => void send('continue', { moveId: `round-${state.round}-continue` })}
          />
        </View>
      </Screen>
    )
  }

  return (
    <Question
      busy={busy}
      error={error}
      stamp={stamp}
      state={state}
      onAnswer={(choiceId) => void send('answer', { choiceId, moveId: `q${state.questionNumber}-${choiceId ?? 'timeout'}` })}
    />
  )
}

function Question({
  state,
  stamp,
  error,
  busy,
  onAnswer,
}: {
  state: SprintState
  stamp: SprintState['lastResult']
  error: string
  busy: boolean
  onAnswer: (choiceId: string | null) => void
}) {
  const sent = useRef(false)
  const answerRef = useRef(onAnswer)
  const busyRef = useRef(busy)
  answerRef.current = onAnswer
  busyRef.current = busy
  const anchor = useRef({ at: Date.now(), remaining: state.remainingMs ?? 0 })
  const [remaining, setRemaining] = useState(state.remainingMs ?? 0)

  useEffect(() => {
    sent.current = false
    const starting = state.remainingMs ?? 0
    anchor.current = { at: Date.now(), remaining: starting }
    setRemaining(starting)
    const id = setInterval(() => {
      const left = Math.max(0, anchor.current.remaining - (Date.now() - anchor.current.at))
      setRemaining(left)
      if (left <= 0 && state.limitMs != null && !sent.current && !busyRef.current) {
        sent.current = true
        answerRef.current(null)
      }
    }, 100)
    return () => clearInterval(id)
  }, [state.limitMs, state.questionNumber, state.remainingMs, state.sessionId])

  const question = state.question
  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: colors.amber, fontWeight: '800', letterSpacing: 1 }}>
          ROUND {state.round}/{state.rounds}
        </Text>
        <Text style={{ color: colors.ink, fontSize: 22, fontWeight: '800' }}>{state.score}</Text>
      </View>
      <View style={{ alignItems: 'center', marginVertical: 12 }}>
        <TimerRing limit={state.limitMs ?? 15000} remaining={remaining} />
      </View>
      {stamp ? (
        <Text style={{ color: stamp.correct ? colors.mint : colors.coral, fontWeight: '800', textAlign: 'center' }}>
          {stamp.correct ? `+${stamp.points}` : `Not quite · ${stamp.correctLabel}`}
          {stamp.speedBonus ? ` · speed +${stamp.speedBonus}` : ''}
        </Text>
      ) : null}
      <Text style={{ color: colors.muted, marginBottom: 8 }}>
        Card {state.questionNumber} of {state.questionCount}
        {state.streak > 1 ? ` · streak ${state.streak}` : ''}
      </Text>
      <Text style={{ color: colors.ink, fontSize: 24, fontWeight: '800', letterSpacing: -0.4, marginBottom: 12 }}>
        {question?.prompt}
      </Text>
      <ScrollView contentContainerStyle={{ gap: 10 }}>
        {(question?.choices ?? []).map((choice) => (
          <Pressable
            key={choice.id}
            disabled={busy}
            onPress={() => {
              if (sent.current) return
              sent.current = true
              onAnswer(choice.id)
            }}
          >
            <Card>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    backgroundColor: colors.card2,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: colors.amber, fontWeight: '800' }}>{choice.letter}</Text>
                </View>
                <Text style={{ color: colors.ink, fontSize: 16, flex: 1 }}>{choice.label}</Text>
              </View>
            </Card>
          </Pressable>
        ))}
        {error ? <Text style={{ color: colors.coral }}>{error}</Text> : null}
      </ScrollView>
    </Screen>
  )
}

function TimerRing({ remaining, limit }: { remaining: number; limit: number }) {
  const size = 92
  const stroke = 8
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const ratio = Math.max(0, Math.min(1, remaining / limit))
  const color = ratio > 0.45 ? colors.mint : ratio > 0.2 ? colors.amber : colors.coral
  const seconds = Math.ceil(remaining / 1000)
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke="#1C3350" strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - ratio)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={{ position: 'absolute', color: colors.ink, fontSize: 26, fontWeight: '800' }}>{seconds}</Text>
    </View>
  )
}

function Results({ state, onAgain }: { state: SprintState; onAgain: () => void }) {
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 28 }}>
        <Title kicker={state.outcome === 'flawless' ? 'FLAWLESS' : 'SPRINT COMPLETE'}>{`${state.score} pts`}</Title>
        <Text style={{ color: colors.muted }}>
          {state.correct}/{state.questionCount} correct · speed bonus {state.speedBonus} · {state.subject}
        </Text>
        {state.achievements.map((item) => (
          <Card key={item.code}>
            <Text style={{ color: colors.mint, fontWeight: '800' }}>{item.new ? 'Unlocked' : 'Earned'} · {item.title}</Text>
            <Text style={{ color: colors.muted }}>{item.detail}</Text>
          </Card>
        ))}
        {state.review.map((card, index) => (
          <Card key={`${card.prompt}-${index}`}>
            <Text style={{ color: card.correct ? colors.mint : colors.coral, fontWeight: '800' }}>
              {card.correct ? 'Correct' : 'Missed'} · {card.points} pts
            </Text>
            <Text style={{ color: colors.ink }}>{card.prompt}</Text>
            <Text style={{ color: colors.muted }}>{card.explanation}</Text>
          </Card>
        ))}
        <Button label="Play again" onPress={onAgain} />
        <Button label="Leaderboard" tone="ghost" onPress={() => router.push('/board')} />
      </ScrollView>
    </Screen>
  )
}
