import { useEffect, useState } from 'react'
import { StyleSheet, Text } from 'react-native'

import { useSession } from '@/features/auth/session'
import { AI_UNAVAILABLE, aiPaths, api } from '@/lib/api'
import { Card, ErrorText, Note, Screen, Title, colors } from '@/ui/screen'

type Me = {
  daily_goal_minutes?: number
  study_days?: string[]
  revision_start?: string | null
  exam_dates?: string[]
}
type Schedule = { nextDate?: string | null; dates?: string[]; revisionStart?: string | null }
type PlanItem = { date?: string; title?: string; minutes?: number; moduleCode?: string | null }

export default function PlannerScreen() {
  const { token } = useSession()
  const [me, setMe] = useState<Me | null>(null)
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [plan, setPlan] = useState<PlanItem[] | null>(null)
  const [planNote, setPlanNote] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    void (async () => {
      const [profile, exams, generated] = await Promise.all([
        api<Me>('/api/auth/me', {}, token),
        api<Schedule>('/api/learn/exam-schedule', {}, token),
        api<{ items?: PlanItem[] }>(aiPaths.planner, {}, token, { unavailableStatuses: AI_UNAVAILABLE }),
      ])
      if (!profile.ok) setError(profile.message)
      else setMe(profile.data)
      if (exams.ok) setSchedule(exams.data)
      if (!generated.ok) setPlanNote(generated.unavailable ? generated.message : generated.message)
      else setPlan(generated.data.items ?? [])
    })()
  }, [token])

  const dates = schedule?.dates?.length ? schedule.dates : (me?.exam_dates ?? [])

  return (
    <Screen>
      <Title subtitle="Exam dates come from your ExamsPrep account. A generated day-by-day plan appears only when that API is live.">
        Revision planner
      </Title>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Card>
        <Text style={styles.heading}>Your pace</Text>
        <Text style={styles.body}>Daily goal {me?.daily_goal_minutes ?? '—'} minutes</Text>
        <Text style={styles.body}>Study days {(me?.study_days ?? []).join(', ') || '—'}</Text>
        <Text style={styles.body}>Revision start {me?.revision_start || schedule?.revisionStart || 'not set'}</Text>
      </Card>
      <Card>
        <Text style={styles.heading}>Exam dates</Text>
        {dates.length === 0 ? <Text style={styles.body}>No exam dates on this account yet.</Text> : null}
        {dates.map((date) => (
          <Text key={date} style={styles.body}>
            {date}
            {schedule?.nextDate === date ? ' · next' : ''}
          </Text>
        ))}
      </Card>
      <Card>
        <Text style={styles.heading}>Generated plan</Text>
        {plan === null ? <Note>{planNote || 'Checking the planner API.'}</Note> : null}
        {plan?.length === 0 ? <Text style={styles.body}>The planner returned no tasks.</Text> : null}
        {plan?.map((item, index) => (
          <Text key={`${item.date}-${item.title}-${index}`} style={styles.body}>
            {item.date || 'Day'} · {item.title || 'Task'}
            {item.moduleCode ? ` · ${item.moduleCode}` : ''}
            {item.minutes ? ` · ${item.minutes} min` : ''}
          </Text>
        ))}
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  heading: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 },
})
