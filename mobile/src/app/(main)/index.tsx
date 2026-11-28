import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'

import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'
import { Button, Card, ErrorText, Screen, Title, colors } from '@/ui/screen'

type ModuleRow = { id: string; code: string; name: string; progressPercent: number; continueLessonId: string | null }
type BadgePayload = { badges: unknown[]; claimable: { label: string; reason: string }[] }
type PoolRow = { id: string; title: string; status: string; totalAmount: number }

const LINKS = [
  { href: '/(main)/quizzes', label: 'Quizzes' },
  { href: '/(main)/mocks', label: 'Mock exams' },
  { href: '/(main)/planner', label: 'Planner' },
  { href: '/(main)/snap', label: 'Snap a question' },
  { href: '/(main)/tutor', label: 'AI tutor' },
  { href: '/(main)/audio', label: 'Audio' },
  { href: '/(main)/wallet', label: 'Wallet' },
  { href: '/(main)/achievements', label: 'Achievements' },
] as const

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
      <Text style={styles.brand}>ExamsPrep</Text>
      <Title subtitle="Lessons, quizzes, and Solana rewards for Cavendish University Zambia.">
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
      <View style={styles.grid}>
        {LINKS.map((link) => (
          <Pressable key={link.href} onPress={() => router.push(link.href)} style={styles.tile}>
            <Text style={styles.tileLabel}>{link.label}</Text>
          </Pressable>
        ))}
      </View>
      <Card>
        <Text style={styles.heading}>Badges ready to claim</Text>
        <Text style={styles.body}>
          {claimable === 0 ? 'Finish lessons or a mock exam to earn one.' : `${claimable} ready.`}
        </Text>
        <Button label="Wallet and rewards" tone="ghost" onPress={() => router.push('/(main)/wallet')} />
      </Card>
      <Card>
        <Text style={styles.heading}>Active prize pools</Text>
        {pools.length === 0 ? <Text style={styles.body}>No open pool right now.</Text> : null}
        {pools.map((pool) => (
          <Text key={pool.id} style={styles.body}>
            {pool.title} · {pool.status}
          </Text>
        ))}
        <Button label="See prize pools" tone="ghost" onPress={() => router.push('/pools')} />
      </Card>
      <Button label="Sign out" tone="ghost" onPress={() => void signOut()} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  brand: { color: colors.accent, fontSize: 13, fontWeight: '800', letterSpacing: 0.4 },
  heading: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 14,
    width: '48%',
  },
  tileLabel: { color: colors.ink, fontSize: 15, fontWeight: '700' },
})
