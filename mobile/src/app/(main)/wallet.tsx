import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import { useMobileWallet } from '@wallet-ui/react-native-kit'

import { useSession } from '@/features/auth/session'
import { linkConnectedWallet } from '@/features/auth/link-wallet'
import { useAppCluster } from '@/features/cluster/data-access/cluster-provider'
import { AppClusterSwitcher } from '@/features/core/ui/app-cluster-switcher'
import { executeWalletSignAndSendTransaction } from '@/features/wallet/util/execute-wallet-sign-and-send-transaction'
import { executeWalletSignMessage } from '@/features/wallet/util/execute-wallet-sign-message'
import { WalletUiConnectButton } from '@/features/wallet/ui/wallet-ui-connect-button'
import { api } from '@/lib/api'
import { Button, Card, ErrorText, Note, Screen, Title, colors } from '@/ui/screen'

type Badge = { id: string; kind: string; label: string; tx: string | null }
type Claimable = { kind: string; subjectKey: string; label: string; reason: string }
type PoolRow = { id: string; title: string; status: string; totalAmount: number }

export default function WalletScreen() {
  const { token } = useSession()
  const wallet = useMobileWallet()
  const { client, cluster } = useAppCluster()
  const [badges, setBadges] = useState<Badge[]>([])
  const [claimable, setClaimable] = useState<Claimable[]>([])
  const [linked, setLinked] = useState<string | null>(null)
  const [pools, setPools] = useState<PoolRow[]>([])
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    if (!token) return
    const [badgeResult, walletResult, poolResult] = await Promise.all([
      api<{ badges: Badge[]; claimable: Claimable[] }>('/api/badges/me', {}, token),
      api<{ address: string | null }>('/api/wallet/me', {}, token),
      api<{ items: PoolRow[] }>('/api/pools'),
    ])
    if (!badgeResult.ok) setError(badgeResult.message)
    else {
      setBadges(badgeResult.data.badges ?? [])
      setClaimable(badgeResult.data.claimable ?? [])
    }
    if (walletResult.ok) setLinked(walletResult.data.address)
    if (poolResult.ok) setPools(poolResult.data.items ?? [])
  }, [token])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    void (async () => {
      const [badgeResult, walletResult, poolResult] = await Promise.all([
        api<{ badges: Badge[]; claimable: Claimable[] }>('/api/badges/me', {}, token),
        api<{ address: string | null }>('/api/wallet/me', {}, token),
        api<{ items: PoolRow[] }>('/api/pools'),
      ])
      if (cancelled) return
      if (!badgeResult.ok) setError(badgeResult.message)
      else {
        setBadges(badgeResult.data.badges ?? [])
        setClaimable(badgeResult.data.claimable ?? [])
      }
      if (walletResult.ok) setLinked(walletResult.data.address)
      if (poolResult.ok) setPools(poolResult.data.items ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [token])

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
    else {
      setNote(`Wallet linked after the signed message. ${result.data.address}`)
      await reload()
    }
  }

  async function signPreview() {
    if (!wallet.account) return
    setBusy(true)
    setError('')
    try {
      const signature = await executeWalletSignMessage({
        text: 'ExamsPrep wallet check. This signature is not a token transfer.',
        signMessages: wallet.signMessages,
      })
      setNote(`Message signed. ${signature.slice(0, 24)}…`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The wallet did not sign.')
    } finally {
      setBusy(false)
    }
  }

  async function claim(item: Claimable, withTransaction: boolean) {
    if (!token) return
    setBusy(true)
    setError('')
    let studentTx = ''
    if (withTransaction) {
      if (!wallet.account) {
        setBusy(false)
        setError('Connect a wallet on this phone before signing the devnet transaction.')
        return
      }
      if (cluster.id !== 'solana:devnet') {
        setBusy(false)
        setError('Switch the cluster to Devnet. Reward transactions are sent there.')
        return
      }
      try {
        studentTx = await executeWalletSignAndSendTransaction({
          account: wallet.account,
          client,
          getTransactionSigner: wallet.getTransactionSigner,
          text: `ExamsPrep claim ${item.kind} ${item.subjectKey}`.slice(0, 500),
        })
      } catch (cause) {
        setBusy(false)
        setError(cause instanceof Error ? cause.message : 'The wallet did not send the transaction.')
        return
      }
    }
    const result = await api<{ badge?: { tx?: string | null } }>(
      '/api/badges/claim',
      { method: 'POST', body: JSON.stringify({ kind: item.kind, subject_key: item.subjectKey }) },
      token,
    )
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      if (studentTx) setNote(`Your devnet signature ${studentTx} was sent. The badge write did not finish.`)
      return
    }
    const authorityTx = result.data.badge?.tx
    setNote(
      studentTx
        ? `You signed and sent ${studentTx}. The program badge was written by the authority${authorityTx ? ` in ${authorityTx}` : ''}. award_badge does not take a student signature.`
        : `Badge recorded${authorityTx ? ` in ${authorityTx}` : ''}. The authority key signed award_badge.`,
    )
    await reload()
  }

  return (
    <Screen>
      <Title subtitle="Connect with Mobile Wallet Adapter, sign a message to link the wallet, then sign and send a devnet memo when you claim. The badge account itself is still written by the ExamsPrep authority, because the program does not let the student sign award_badge.">
        Wallet and rewards
      </Title>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {note ? <Note>{note}</Note> : null}
      <Card>
        <Text style={styles.heading}>{linked ? `Linked ${linked}` : 'No wallet linked yet'}</Text>
        <AppClusterSwitcher />
        {wallet.account ? (
          <>
            <Text style={styles.body}>Connected {wallet.account.address}</Text>
            <Button disabled={busy} label="Sign and link this wallet" onPress={() => void link()} />
            <Button disabled={busy} label="Sign a message" tone="ghost" onPress={() => void signPreview()} />
          </>
        ) : (
          <WalletUiConnectButton connect={wallet.connect}>Connect wallet</WalletUiConnectButton>
        )}
      </Card>
      {claimable.map((item) => (
        <Card key={`${item.kind}:${item.subjectKey}`}>
          <Text style={styles.heading}>{item.label}</Text>
          <Text style={styles.body}>{item.reason}</Text>
          <Button
            disabled={busy || !linked}
            label="Sign and send claim on devnet"
            onPress={() => void claim(item, true)}
          />
          <Button
            disabled={busy || !linked}
            label="Claim with the authority key"
            tone="ghost"
            onPress={() => void claim(item, false)}
          />
        </Card>
      ))}
      {badges.map((badge) => (
        <Card key={badge.id}>
          <Text style={styles.heading}>{badge.label}</Text>
          {badge.tx ? <Text style={styles.body}>Tx {badge.tx}</Text> : null}
        </Card>
      ))}
      <Card>
        <Text style={styles.heading}>Prize pools</Text>
        {pools.length === 0 ? <Text style={styles.body}>No pools yet.</Text> : null}
        {pools.map((pool) => (
          <Text key={pool.id} style={styles.body}>
            {pool.title} · {pool.status} · {pool.totalAmount}
          </Text>
        ))}
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  heading: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  body: { color: colors.muted, fontSize: 14, lineHeight: 20 },
})
