import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import * as Speech from 'expo-speech'

import { useSession } from '@/features/auth/session'
import { useStudyData } from '@/features/offline/study-data'
import { AI_UNAVAILABLE, aiPaths, api } from '@/lib/api'
import { lessonPlainText } from '@/lib/policies'
import { Button, Card, ErrorText, Note, Screen, Title, colors } from '@/ui/screen'

type LessonPick = { id: string; title: string; slides?: { title?: string; blocks?: { text?: string }[] }[] }

const SPEEDS = [0.75, 1, 1.25, 1.5]

export default function AudioScreen() {
  const { token } = useSession()
  const study = useStudyData()
  const [lessons, setLessons] = useState<LessonPick[]>([])
  const [selected, setSelected] = useState<LessonPick | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [speed, setSpeed] = useState(1)
  const player = useAudioPlayer(audioUrl ? { uri: audioUrl } : null, { updateInterval: 400 })
  const status = useAudioPlayerStatus(player)

  useEffect(() => {
    void setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
      shouldPlayInBackground: true,
      shouldRouteThroughEarpiece: false,
    })
  }, [])

  useEffect(() => {
    if (!token) return
    void (async () => {
      const modules = await api<{ items: { id: string }[] }>('/api/learn/modules', {}, token)
      if (!modules.ok) {
        const saved = await study.listDownloads('lesson')
        setLessons(
          saved.map((row) => {
            const parsed = JSON.parse(row.payload) as LessonPick
            return { ...parsed, id: row.remoteId, title: row.title }
          }),
        )
        if (saved.length === 0) setError(modules.message)
        return
      }
      const picks: LessonPick[] = []
      for (const module of (modules.data.items ?? []).slice(0, 4)) {
        const detail = await api<{ item: { chapters: { lessons: { id: string; title: string }[] }[] } }>(
          `/api/learn/modules/${module.id}`,
          {},
          token,
        )
        if (!detail.ok) continue
        for (const chapter of detail.data.item.chapters) {
          for (const lesson of chapter.lessons) picks.push(lesson)
        }
      }
      setLessons(picks.slice(0, 12))
    })()
  }, [study, token])

  useEffect(() => {
    player.setPlaybackRate(speed)
    if (audioUrl)
      player.setActiveForLockScreen(true, { title: selected?.title || 'ExamsPrep lesson', artist: 'ExamsPrep' })
  }, [audioUrl, player, selected?.title, speed])

  async function requestSpeech(lesson: LessonPick) {
    if (!token) return
    setSelected(lesson)
    setAudioUrl(null)
    setError('')
    setNote('')
    const result = await api<{ audioUrl?: string }>(
      aiPaths.lessonSpeech(lesson.id),
      { method: 'POST', body: '{}' },
      token,
      {
        unavailableStatuses: AI_UNAVAILABLE,
      },
    )
    if (!result.ok) {
      setNote(result.message)
      return
    }
    if (!result.data.audioUrl) {
      setNote('The speech API responded without an audio file.')
      return
    }
    setAudioUrl(result.data.audioUrl)
  }

  function readOnDevice() {
    if (!selected) return
    const text = lessonPlainText(selected.slides ?? [])
    if (!text) {
      setNote(
        'Save the lesson on this phone first, then the on-device voice can read it. This is the phone voice, not the AI tutor.',
      )
      return
    }
    Speech.stop()
    Speech.speak(text, { rate: speed, language: 'en-GB' })
    setNote('Playing with this phone’s voice. Seek works on the server audio file, not on this on-device reading.')
  }

  const duration = status.duration || 0
  const position = status.currentTime || 0

  return (
    <Screen>
      <Title subtitle="Server audio plays in the background with seek and speed. On-device reading is labeled separately and does not pretend to be ElevenLabs.">
        Audio learning
      </Title>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {lessons.map((lesson) => (
        <Pressable key={lesson.id} onPress={() => void requestSpeech(lesson)}>
          <Card>
            <Text style={styles.title}>{lesson.title}</Text>
          </Card>
        </Pressable>
      ))}
      {selected ? (
        <Card>
          <Text style={styles.title}>{selected.title}</Text>
          {note ? <Note>{note}</Note> : null}
          {audioUrl ? (
            <>
              <Text style={styles.body}>
                {formatTime(position)} / {formatTime(duration)}
              </Text>
              <Button
                label={status.playing ? 'Pause' : 'Play'}
                onPress={() => (status.playing ? player.pause() : player.play())}
              />
              <Button label="Back 15s" tone="ghost" onPress={() => void player.seekTo(Math.max(0, position - 15))} />
              <Button label="Forward 15s" tone="ghost" onPress={() => void player.seekTo(position + 15)} />
            </>
          ) : null}
          <Text style={styles.body}>Speed {speed}×</Text>
          {SPEEDS.map((value) => (
            <Button key={value} label={`${value}×`} tone="ghost" onPress={() => setSpeed(value)} />
          ))}
          <Button label="Read on this phone" tone="ghost" onPress={readOnDevice} />
        </Card>
      ) : null}
    </Screen>
  )
}

function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(whole / 60)
  const rest = whole % 60
  return `${minutes}:${rest.toString().padStart(2, '0')}`
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  body: { color: colors.muted, fontSize: 14 },
})
