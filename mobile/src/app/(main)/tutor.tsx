import { useEffect, useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
} from 'expo-audio'

import { useSession } from '@/features/auth/session'
import { AI_UNAVAILABLE, aiPaths, api } from '@/lib/api'
import { Button, Card, ErrorText, Note, Screen, Title, colors } from '@/ui/screen'

type Turn = { transcript?: string; replyText?: string; audioUrl?: string | null }

export default function TutorScreen() {
  const { token } = useSession()
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown')
  const [recording, setRecording] = useState(false)
  const [clip, setClip] = useState<string | null>(null)
  const [turn, setTurn] = useState<Turn | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const player = useAudioPlayer(turn?.audioUrl ? { uri: turn.audioUrl } : null)

  useEffect(() => {
    void requestRecordingPermissionsAsync().then((result) => {
      setPermission(result.granted ? 'granted' : 'denied')
    })
  }, [])

  async function toggle() {
    if (permission !== 'granted') {
      const result = await requestRecordingPermissionsAsync()
      setPermission(result.granted ? 'granted' : 'denied')
      if (!result.granted) return
    }
    if (recording) {
      await recorder.stop()
      setRecording(false)
      setClip(recorder.uri)
      return
    }
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    })
    await recorder.prepareToRecordAsync()
    recorder.record()
    setRecording(true)
    setTurn(null)
    setError('')
  }

  async function send() {
    if (!token || !clip) return
    setBusy(true)
    setError('')
    const body = new FormData()
    body.append('audio', { uri: clip, name: 'question.m4a', type: 'audio/mp4' } as unknown as Blob)
    const result = await api<Turn>(aiPaths.tutorTurn, { method: 'POST', body }, token, {
      unavailableStatuses: AI_UNAVAILABLE,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      setTurn(null)
      return
    }
    setTurn(result.data)
  }

  return (
    <Screen>
      <Title subtitle="The microphone indicator shows the permission state. A reply is played only when the tutor API returns one.">
        AI tutor
      </Title>
      <Card>
        <Text style={styles.indicator}>
          Microphone {permission === 'granted' ? 'allowed' : permission === 'denied' ? 'blocked' : 'checking'}
        </Text>
        <Button label={recording ? 'Stop recording' : 'Record a question'} onPress={() => void toggle()} />
        {clip && !recording ? <Note>Recording ready to send.</Note> : null}
        <Button
          disabled={busy || !clip || recording}
          label={busy ? 'Sending…' : 'Send audio'}
          onPress={() => void send()}
        />
      </Card>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {turn ? (
        <Card>
          {turn.transcript ? <Text style={styles.body}>You said: {turn.transcript}</Text> : null}
          {turn.replyText ? <Text style={styles.body}>{turn.replyText}</Text> : null}
          {turn.audioUrl ? (
            <Button label="Play reply" onPress={() => player.play()} />
          ) : (
            <Note>The tutor did not return an audio file.</Note>
          )}
        </Card>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  indicator: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  body: { color: colors.ink, fontSize: 15, lineHeight: 22 },
})
