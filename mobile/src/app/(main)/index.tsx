import { useEffect, useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import { router } from 'expo-router'

import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { Button, Card, ErrorText, Screen, Title, colors } from '@/ui/screen'

type ModuleRow = { id: string; code: string; name: string; progressPercent: number; continueLessonId: string | null }
type BadgePayload = { badges: unknown[]; claimable: { label: string; reason: string }[] }
type PoolRow = { id: string; title: string; status: string; totalAmount: number }

export default function DashboardScreen() {
  const { token, user, signOut } = useSession()
  const [modules, setModules] = useState<ModuleRow[]>([])
  const [claimable, setClaimable] = useState(0)
  const [pools, setPools] = useState<PoolRow[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    void (async () => {
      const [courseResult, badgeResult, poolResult] = await Promise.all([
        api<{ items: ModuleRow[] }>('/api/learn/modules', {}, token),
        api<BadgePayload>('/api/badges/me', {}, token),
        api<{ items: PoolRow[] }>('/api/pools'),
      ])
      if (!courseResult.ok) setError(courseResult.message)
      else setModules(courseResult.data.items ?? [])
      if (badgeResult.ok) setClaimable(badgeResult.data.claimable?.length ?? 0)
      if (poolResult.ok) setPools((poolResult.data.items ?? []).filter((pool) => pool.status !== 'settled'))
    })()
  }, [token])

  const next = modules.find((module) => module.continueLessonId)

  return (
    <Screen>
      <Title subtitle="Published lessons, quizzes, badges, and this week’s prize pool.">
        {`Hello ${user?.name?.split(' ')[0] ?? 'there'}`}
      </Title>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Card>
        <Text style={styles.heading}>Continue</Text>
        {next?.continueLessonId ? (
          <>
            <Text style={styles.body}>
              {next.code} {next.name} · {next.progressPercent}%
            </Text>
            <Button label="Open lesson" onPress={() => router.push(`/lesson/${next.continueLessonId}`)} />
          </>
        ) : (
          <Text style={styles.body}>Pick a course to start a published lesson.</Text>
        )}
      </Card>
      <Card>
        <Text style={styles.heading}>Badges ready to claim</Text>
        <Text style={styles.body}>{claimable === 0 ? 'Finish lessons or a mock exam to earn one.' : `${claimable} ready.`}</Text>
        <Button label="My badges" tone="ghost" onPress={() => router.push('/(main)/badges')} />
      </Card>
      <Card>
        <Text style={styles.heading}>Active prize pools</Text>
        {pools.length === 0 ? <Text style={styles.body}>No open pool right now.</Text> : null}
        {pools.map((pool) => (
          <Text key={pool.id} style={styles.body}>
            {pool.title} · {pool.status} · {pool.totalAmount} base units
          </Text>
        ))}
        <Button label="See prize pools" tone="ghost" onPress={() => router.push('/pools')} />
      </Card>
      <Button label="Sign out" tone="ghost" onPress={signOut} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  heading: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 },
})
