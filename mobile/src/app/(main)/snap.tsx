import { useRef, useState } from 'react'
import { Image, StyleSheet, Text, TextInput, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator'

import { useSession } from '@/features/auth/session'
import { useStudyData } from '@/features/offline/study-data'
import { AI_UNAVAILABLE, aiPaths, api } from '@/lib/api'
import { Button, Card, ErrorText, Note, Screen, Title, colors } from '@/ui/screen'

type SnapResponse = {
  id?: string
  explanation?: string
  followUps?: { id: string; prompt: string }[]
}

export default function SnapScreen() {
  const { token } = useSession()
  const study = useStudyData()
  const camera = useRef<CameraView>(null)
  const [permission, requestPermission] = useCameraPermissions()
  const [uri, setUri] = useState<string | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [explanation, setExplanation] = useState('')
  const [snapId, setSnapId] = useState<string | null>(null)
  const [followUps, setFollowUps] = useState<{ id: string; prompt: string }[]>([])
  const [followUp, setFollowUp] = useState('')
  const [followAnswer, setFollowAnswer] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [savedLocal, setSavedLocal] = useState(false)

  async function capture() {
    const photo = await camera.current?.takePictureAsync({ quality: 0.8 })
    if (!photo?.uri) return
    setUri(photo.uri)
    setSize({ width: photo.width, height: photo.height })
    setExplanation('')
    setSnapId(null)
    setFollowUps([])
    setFollowAnswer('')
    setSavedLocal(false)
  }

  async function rotate() {
    if (!uri) return
    const next = await manipulateAsync(uri, [{ rotate: 90 }], { compress: 0.85, format: SaveFormat.JPEG })
    setUri(next.uri)
    setSize({ width: next.width, height: next.height })
  }

  async function tighten() {
    if (!uri || size.width < 20 || size.height < 20) return
    const originX = Math.round(size.width * 0.08)
    const originY = Math.round(size.height * 0.08)
    const next = await manipulateAsync(
      uri,
      [{ crop: { originX, originY, width: size.width - originX * 2, height: size.height - originY * 2 } }],
      { compress: 0.85, format: SaveFormat.JPEG },
    )
    setUri(next.uri)
    setSize({ width: next.width, height: next.height })
  }

  async function upload() {
    if (!token || !uri) return
    setBusy(true)
    setError('')
    const body = new FormData()
    body.append('image', { uri, name: 'question.jpg', type: 'image/jpeg' } as unknown as Blob)
    const result = await api<SnapResponse>(aiPaths.snap, { method: 'POST', body }, token, {
      unavailableStatuses: AI_UNAVAILABLE,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      if (result.offline || result.unavailable) {
        await study.saveDownload({
          kind: 'practice',
          remoteId: `snap-${Date.now()}`,
          title: 'Snap waiting to upload',
          payload: JSON.stringify({ uri, savedAt: new Date().toISOString() }),
        })
        setSavedLocal(true)
      }
      return
    }
    setSnapId(result.data.id ?? null)
    setExplanation(result.data.explanation || '')
    setFollowUps(result.data.followUps ?? [])
  }

  async function askFollowUp() {
    if (!token || !snapId || !followUp.trim()) return
    setBusy(true)
    setError('')
    const result = await api<{ explanation?: string }>(
      aiPaths.snapFollowUp(snapId),
      { method: 'POST', body: JSON.stringify({ prompt: followUp.trim() }) },
      token,
      { unavailableStatuses: AI_UNAVAILABLE },
    )
    setBusy(false)
    if (!result.ok) setError(result.message)
    else setFollowAnswer(result.data.explanation || '')
  }

  async function saveSnap() {
    if (!token || !snapId) return
    setBusy(true)
    const result = await api(aiPaths.snapSave(snapId), { method: 'POST', body: '{}' }, token, {
      unavailableStatuses: AI_UNAVAILABLE,
    })
    setBusy(false)
    if (!result.ok) setError(result.message)
    else setSavedLocal(true)
  }

  return (
    <Screen>
      <Title subtitle="The camera stays on the phone. The explanation comes from the API, or the screen says the API is not available.">
        Snap a question
      </Title>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!permission?.granted ? (
        <Card>
          <Text style={styles.body}>
            Camera permission: {permission?.status ?? 'not asked'}. ExamsPrep needs it only to photograph a question.
          </Text>
          <Button label="Allow camera" onPress={() => void requestPermission()} />
        </Card>
      ) : null}
      {permission?.granted && !uri ? (
        <View style={styles.cameraWrap}>
          <CameraView ref={camera} facing="back" style={styles.camera} />
          <Button label="Capture" onPress={() => void capture()} />
        </View>
      ) : null}
      {uri ? (
        <Card>
          <Image source={{ uri }} style={styles.preview} />
          <Text style={styles.body}>Review the photo. Rotate or tighten the crop, then upload.</Text>
          <Button label="Rotate" tone="ghost" onPress={() => void rotate()} />
          <Button label="Tighten crop" tone="ghost" onPress={() => void tighten()} />
          <Button label="Retake" tone="ghost" onPress={() => setUri(null)} />
          <Button disabled={busy} label={busy ? 'Working…' : 'Upload'} onPress={() => void upload()} />
        </Card>
      ) : null}
      {explanation ? (
        <Card>
          <Text style={styles.heading}>Explanation</Text>
          <Text style={styles.body}>{explanation}</Text>
          {followUps.map((item) => (
            <Text key={item.id} style={styles.body}>
              {item.prompt}
            </Text>
          ))}
          <TextInput
            onChangeText={setFollowUp}
            placeholder="Ask a follow-up"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={followUp}
          />
          <Button disabled={busy || !snapId} label="Send follow-up" onPress={() => void askFollowUp()} />
          {followAnswer ? <Text style={styles.body}>{followAnswer}</Text> : null}
          <Button disabled={busy || !snapId} label="Save" tone="ghost" onPress={() => void saveSnap()} />
        </Card>
      ) : null}
      {savedLocal ? (
        <Note>Saved. If the server was unavailable, the photo is on this phone and was not marked as answered.</Note>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  heading: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  cameraWrap: { gap: 12 },
  camera: { borderRadius: 16, height: 360, overflow: 'hidden' },
  preview: { borderRadius: 12, height: 280, width: '100%' },
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
