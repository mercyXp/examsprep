import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { ScrollView, Text } from 'react-native'

import { PollarRewards } from '@/features/rewards/PollarRewards'
import { SeekerWallet } from '@/features/rewards/SeekerWallet'
import { api } from '@/lib/api'
import { useSession } from '@/state/session'
import { Button, Card, Screen, Title, colors } from '@/ui/theme'

type Claim = { kind: string; label: string; reason?: string }
type Badge = { id: string; label: string; kind: string }

export default function RewardsScreen() {
  const session = useSession()
  const [claimable, setClaimable] = useState<Claim[]>([])
  const [badges, setBadges] = useState<Badge[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session.token) return
    void api<{ claimable: Claim[]; badges: Badge[] }>('/api/badges/eligibility', {}, session.token).then((result) => {
      if (!result.ok) {
        setError(result.message)
        return
      }
      setClaimable(result.data.claimable)
      setBadges(result.data.badges)
    })
  }, [session.token])

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 32 }}>
        <Title
          kicker="REWARDS"
          subtitle="Eligibility comes from ExamsPrep. A Seeker signs with Mobile Wallet Adapter. Pollar is how a student without a wallet can still hold USDC."
        >
          Balances and badges
        </Title>
        {!session.token ? <Button label="Sign in" onPress={() => router.push('/sign-in')} /> : null}
        {error ? <Text style={{ color: colors.coral }}>{error}</Text> : null}
        <Card>
          <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '800' }}>ExamsPrep eligibility</Text>
          <Text style={{ color: colors.muted, lineHeight: 22 }}>
            Topic mastery, mock passes, and streaks are decided by the learning API. Weekly USDC is paid when an
            administrator settles a prize pool. This screen does not send a payment.
          </Text>
          {claimable.length === 0 && badges.length === 0 ? (
            <Text style={{ color: colors.muted }}>Nothing claimable yet. Finish lessons and quizzes in ExamsPrep.</Text>
          ) : null}
          {claimable.map((item) => (
            <Text key={`${item.kind}-${item.label}`} style={{ color: colors.amber }}>
              Ready · {item.label}
            </Text>
          ))}
          {badges.map((item) => (
            <Text key={item.id} style={{ color: colors.mint }}>
              Held · {item.label}
            </Text>
          ))}
        </Card>
        <SeekerWallet />
        <PollarRewards />
        <Button label="Home" tone="ghost" onPress={() => router.replace('/')} />
      </ScrollView>
    </Screen>
  )
}
