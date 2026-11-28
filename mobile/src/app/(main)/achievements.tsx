import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text } from 'react-native'

import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { Button, Card, ErrorText, Note, Screen, Title, colors } from '@/ui/screen'

type Badge = { id: string; kind: string; label: string; detail: number; tx: string | null }
type SeekerItem = { kind: string; mint: string; memberNumber: number; awardedAt: string | null }

const KIND_LABEL: Record<string, string> = {
  topic_mastered: 'Topic mastered',
  mock_exam_passed: 'Mock exam passed',
  study_streak: 'Study streak',
  weekly_leaderboard: 'Weekly leaderboard',
}

export default function AchievementsScreen() {
  const { token } = useSession()
  const [badges, setBadges] = useState<Badge[]>([])
  const [seeker, setSeeker] = useState<SeekerItem[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    const [badgeResult, seekerResult] = await Promise.all([
      api<{ badges: Badge[] }>('/api/badges/me', {}, token),
      api<{ items: SeekerItem[] }>('/api/mobile/seeker', {}, token),
    ])
    if (!badgeResult.ok) setError(badgeResult.message)
    else setBadges(badgeResult.data.badges ?? [])
    if (seekerResult.ok) setSeeker(seekerResult.data.items ?? [])
    else if (seekerResult.unavailable) setMessage(seekerResult.message)
  }, [token])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    void (async () => {
      const [badgeResult, seekerResult] = await Promise.all([
        api<{ badges: Badge[] }>('/api/badges/me', {}, token),
        api<{ items: SeekerItem[] }>('/api/mobile/seeker', {}, token),
      ])
      if (cancelled) return
      if (!badgeResult.ok) setError(badgeResult.message)
      else setBadges(badgeResult.data.badges ?? [])
      if (seekerResult.ok) setSeeker(seekerResult.data.items ?? [])
      else if (seekerResult.unavailable) setMessage(seekerResult.message)
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  async function verifySeeker() {
    if (!token) return
    setBusy(true)
    setError('')
    const result = await api<{ verified: boolean; message?: string; achievement: SeekerItem | null }>(
      '/api/mobile/seeker/verify',
      { method: 'POST' },
      token,
    )
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setMessage(
      result.data.message ||
        (result.data.verified ? 'Seeker verified.' : 'No Seeker Genesis Token on the linked wallet.'),
    )
    await load()
  }

  return (
    <Screen>
      <Title subtitle="Study badges are written by the ExamsPrep program. The Seeker achievement is separate: the API checks the linked wallet for a Seeker Genesis Token on mainnet.">
        Achievements
      </Title>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Card>
        <Text style={styles.heading}>Seeker owner</Text>
        <Text style={styles.body}>
          This works on any Android phone. The achievement is granted only when the linked wallet holds a Genesis Token.
          An emulator cannot hold one.
        </Text>
        {seeker.map((item) => (
          <Text key={item.mint} style={styles.body}>
            Verified mint {item.mint} · member {item.memberNumber}
          </Text>
        ))}
        <Button
          disabled={busy}
          label={busy ? 'Checking mainnet…' : 'Verify Seeker Genesis Token'}
          onPress={() => void verifySeeker()}
        />
        {message ? <Note>{message}</Note> : null}
      </Card>
      {badges.map((badge) => (
        <Card key={badge.id}>
          <Text style={styles.kind}>{KIND_LABEL[badge.kind] ?? badge.kind}</Text>
          <Text style={styles.heading}>{badge.label}</Text>
          {badge.tx ? <Text style={styles.body}>Tx {badge.tx}</Text> : null}
        </Card>
      ))}
      {badges.length === 0 ? (
        <Card>
          <Text style={styles.body}>Finish a topic, pass a mock, or keep a three-day streak to earn a badge.</Text>
        </Card>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  kind: { color: colors.gold, fontSize: 13, fontWeight: '700' },
  heading: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  body: { color: colors.muted, fontSize: 14, lineHeight: 20 },
})
