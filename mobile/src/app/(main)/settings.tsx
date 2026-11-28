import { useEffect, useState } from 'react'
import { StyleSheet, Text, TextInput } from 'react-native'

import { useSession } from '@/features/auth/session'
import { useStudyData } from '@/features/offline/study-data'
import { applyLocalReminders } from '@/features/notifications/reminders'
import { API_URL, api } from '@/lib/api'
import { Button, Card, ErrorText, Note, Screen, Title, colors } from '@/ui/screen'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'

type Prefs = {
  dailyStudy: boolean
  streakWarning: boolean
  examReminder: boolean
  newLesson: boolean
  achievement: boolean
  reward: boolean
  leaderboard: boolean
  dailyHour: number
  dailyMinute: number
}

type Me = { name: string; email: string; exam_dates?: string[] }

const DEFAULTS: Prefs = {
  dailyStudy: true,
  streakWarning: true,
  examReminder: true,
  newLesson: true,
  achievement: true,
  reward: true,
  leaderboard: true,
  dailyHour: 18,
  dailyMinute: 0,
}

const TOGGLES: { key: keyof Prefs; label: string; remote: boolean }[] = [
  { key: 'dailyStudy', label: 'Daily study reminder', remote: false },
  { key: 'streakWarning', label: 'Streak warning', remote: false },
  { key: 'examReminder', label: 'Exam reminders', remote: false },
  { key: 'newLesson', label: 'New lessons', remote: true },
  { key: 'achievement', label: 'Achievements', remote: true },
  { key: 'reward', label: 'Rewards', remote: true },
  { key: 'leaderboard', label: 'Leaderboard', remote: true },
]

export default function SettingsScreen() {
  const { token, user, signIn } = useSession()
  const study = useStudyData()
  const [name, setName] = useState(user?.name ?? '')
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS)
  const [downloads, setDownloads] = useState(0)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!token) return
    void (async () => {
      const [preferenceResult, saved] = await Promise.all([
        api<Prefs>('/api/mobile/notification-preferences', {}, token),
        study.listDownloads(),
      ])
      if (preferenceResult.ok) setPrefs({ ...DEFAULTS, ...preferenceResult.data })
      setDownloads(saved.length)
    })()
  }, [study, token])

  async function saveName() {
    if (!token) return
    setBusy(true)
    setError('')
    const result = await api<Me>('/api/auth/me', { method: 'PATCH', body: JSON.stringify({ name }) }, token)
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    if (user) await signIn(token, { ...user, name: result.data.name || name })
    setNote('Name saved.')
  }

  async function savePrefs(next: Prefs) {
    if (!token) return
    setPrefs(next)
    setBusy(true)
    setError('')
    const result = await api(
      '/api/mobile/notification-preferences',
      { method: 'PUT', body: JSON.stringify(toBody(next)) },
      token,
    )
    if (!result.ok) {
      setBusy(false)
      setError(result.message)
      return
    }
    const profile = await api<Me>('/api/auth/me', {}, token)
    const dates = profile.ok ? (profile.data.exam_dates ?? []) : []
    const scheduled = await applyLocalReminders({
      dailyStudy: next.dailyStudy,
      streakWarning: next.streakWarning,
      examReminder: next.examReminder,
      dailyHour: Number(next.dailyHour) || 18,
      dailyMinute: Number(next.dailyMinute) || 0,
      examDates: dates,
    })
    let pushNote = 'Remote categories are stored for the server. Local reminders do not need Firebase.'
    if (Device.isDevice) {
      const permission = await Notifications.getPermissionsAsync()
      if (permission.granted) {
        try {
          const push = await Notifications.getExpoPushTokenAsync()
          const registered = await api(
            '/api/mobile/push-tokens',
            {
              method: 'POST',
              body: JSON.stringify({ token: push.data, platform: 'android' }),
            },
            token,
          )
          pushNote = registered.ok
            ? 'Push token stored. Server delivery still needs the Firebase file described in the README.'
            : registered.message
        } catch {
          pushNote = 'Local reminders are set. This build has no Firebase file, so a server push token was not issued.'
        }
      }
    } else {
      pushNote =
        'Local reminders can be scheduled on a device or emulator. Expo push tokens need a physical device and Firebase.'
    }
    setBusy(false)
    setNote(
      scheduled.permission
        ? `${scheduled.scheduled} local reminder${scheduled.scheduled === 1 ? '' : 's'} scheduled. ${pushNote}`
        : 'Notification permission was not granted, so local reminders were not scheduled.',
    )
  }

  return (
    <Screen>
      <Title subtitle={`API ${API_URL}`}>Profile and settings</Title>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {note ? <Note>{note}</Note> : null}
      <Card>
        <Text style={styles.heading}>Name</Text>
        <TextInput onChangeText={setName} style={styles.input} value={name} />
        <Button disabled={busy} label="Save name" onPress={() => void saveName()} />
        <Text style={styles.body}>{user?.email}</Text>
      </Card>
      <Card>
        <Text style={styles.heading}>Notifications</Text>
        <Text style={styles.body}>
          Daily study, streak, and exam reminders are scheduled on this phone. The other four are preferences for server
          push.
        </Text>
        {TOGGLES.map((item) => (
          <Button
            key={item.key}
            label={`${prefs[item.key] ? 'On' : 'Off'} · ${item.label}${item.remote ? ' (server)' : ''}`}
            tone="ghost"
            onPress={() => void savePrefs({ ...prefs, [item.key]: !prefs[item.key] })}
          />
        ))}
        <Text style={styles.body}>Daily reminder hour</Text>
        <TextInput
          keyboardType="number-pad"
          onChangeText={(value) => setPrefs((current) => ({ ...current, dailyHour: Number(value) }))}
          style={styles.input}
          value={String(prefs.dailyHour)}
        />
        <Button disabled={busy} label="Save reminder time" onPress={() => void savePrefs(prefs)} />
      </Card>
      <Card>
        <Text style={styles.heading}>On this phone</Text>
        <Text style={styles.body}>{downloads} downloaded lessons, notes, or quizzes.</Text>
        <Text style={styles.body}>
          {study.pending} waiting to sync. {study.conflicts.length} need attention.
        </Text>
        {study.conflicts.map((row) => (
          <Text key={row.id} style={styles.body}>
            {row.kind}: {row.lastError || 'Conflict'}
          </Text>
        ))}
        <Button label="Sync now" onPress={() => void study.flush()} />
      </Card>
    </Screen>
  )
}

function toBody(prefs: Prefs) {
  return {
    daily_study: prefs.dailyStudy,
    streak_warning: prefs.streakWarning,
    exam_reminder: prefs.examReminder,
    new_lesson: prefs.newLesson,
    achievement: prefs.achievement,
    reward: prefs.reward,
    leaderboard: prefs.leaderboard,
    daily_hour: Math.min(23, Math.max(0, Number(prefs.dailyHour) || 0)),
    daily_minute: Math.min(59, Math.max(0, Number(prefs.dailyMinute) || 0)),
  }
}

const styles = StyleSheet.create({
  heading: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  body: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  input: {
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
})
