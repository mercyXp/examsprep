import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import { useMobileWallet } from '@wallet-ui/react-native-kit'

import { useSession } from '@/features/auth/session'
import { linkConnectedWallet } from '@/features/auth/link-wallet'
import { api } from '@/lib/api'
import { Button, Card, ErrorText, Screen, Title, colors } from '@/ui/screen'
import { WalletUiConnectButton } from '@/features/wallet/ui/wallet-ui-connect-button'

type Badge = { id: string; kind: string; label: string; detail: number; tx: string | null }
type Claimable = { kind: string; subjectKey: string; label: string; reason: string }

const KIND_LABEL: Record<string, string> = {
  topic_mastered: 'Topic mastered',
  mock_exam_passed: 'Mock exam passed',
  study_streak: 'Study streak',
  weekly_leaderboard: 'Weekly leaderboard',
}

export default function BadgesScreen() {
  const { token } = useSession()
  const wallet = useMobileWallet()
  const [badges, setBadges] = useState<Badge[]>([])
  const [claimable, setClaimable] = useState<Claimable[]>([])
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    if (!token) return
    const [badgeResult, walletResult] = await Promise.all([
      api<{ badges: Badge[]; claimable: Claimable[] }>('/api/badges/me', {}, token),
      api<{ address: string | null }>('/api/wallet/me', {}, token),
    ])
    if (!badgeResult.ok) setError(badgeResult.message)
    else {
      setBadges(badgeResult.data.badges ?? [])
      setClaimable(badgeResult.data.claimable ?? [])
    }
    if (walletResult.ok) setWalletAddress(walletResult.data.address)
  }, [token])

  useEffect(() => {
    void reload()
  }, [reload])

  async function link() {
    if (!token || !wallet.account) return
    setBusy(true)
    setError('')
    const result = await linkConnectedWallet({
      address: wallet.account.address,
      signMessages: wallet.signMessages,
      token,
    })
    setBusy(false)
    if (!result.ok) setError(result.message)
    else await reload()
  }

  async function claim(item: Claimable) {
    if (!token) return
    setBusy(true)
    setError('')
    const result = await api('/api/badges/claim', {
      method: 'POST',
      body: JSON.stringify({ kind: item.kind, subject_key: item.subjectKey }),
    }, token)
    setBusy(false)
    if (!result.ok) setError(result.message)
    else await reload()
  }

  return (
    <Screen>
      <Title subtitle="Badges are written by the ExamsPrep authority key. You sign once to prove the wallet is yours.">
        My badges
      </Title>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Card>
        <Text style={styles.heading}>{walletAddress ? `Wallet ${walletAddress}` : 'No wallet linked yet'}</Text>
        {wallet.account ? (
          <Button disabled={busy} label="Sign and link this wallet" onPress={() => void link()} />
        ) : (
          <WalletUiConnectButton connect={wallet.connect}>Connect wallet</WalletUiConnectButton>
        )}
      </Card>
      {claimable.map((item) => (
        <Card key={`${item.kind}:${item.subjectKey}`}>
          <Text style={styles.kind}>{KIND_LABEL[item.kind] ?? item.kind}</Text>
          <Text style={styles.heading}>{item.label}</Text>
          <Text style={styles.body}>{item.reason}</Text>
          <Button disabled={busy || !walletAddress} label="Claim on Solana" onPress={() => void claim(item)} />
        </Card>
      ))}
      {badges.map((badge) => (
        <Card key={badge.id}>
          <Text style={styles.kind}>{KIND_LABEL[badge.kind] ?? badge.kind}</Text>
          <Text style={styles.heading}>{badge.label}</Text>
          <Text style={styles.body}>Detail {badge.detail}</Text>
          {badge.tx ? <Text style={styles.body}>Tx {badge.tx}</Text> : null}
        </Card>
      ))}
      {badges.length === 0 && claimable.length === 0 ? (
        <Card>
          <Text style={styles.body}>Finish every published lesson in a module, pass a mock, or study three days in a row.</Text>
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
