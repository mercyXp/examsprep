import { useEffect, useState } from 'react'
import { StyleSheet, Text } from 'react-native'

import { api } from '@/lib/api'
import { Card, ErrorText, Screen, Title, colors } from '@/ui/screen'

type Payout = { rank: number; displayName: string; amount: number; note: string }
type Pool = {
  id: string
  title: string
  status: string
  topN: number
  totalAmount: number
  mint: string
  poolAddress: string
  payouts: Payout[]
}

export default function PoolsScreen() {
  const [items, setItems] = useState<Pool[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    void api<{ items: Pool[] }>('/api/pools').then((result) => {
      if (!result.ok) setError(result.message)
      else setItems(result.data.items ?? [])
    })
  }, [])

  return (
    <Screen>
      <Title subtitle="A sponsor locks devnet USDC in an escrow. An administrator pays the top students from that escrow.">
        Prize pools
      </Title>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {items.length === 0 && !error ? <Card><Text style={styles.body}>No prize pools yet.</Text></Card> : null}
      {items.map((pool) => (
        <Card key={pool.id}>
          <Text style={styles.title}>{pool.title}</Text>
          <Text style={styles.body}>
            {pool.status} · top {pool.topN} · {pool.totalAmount} base units
          </Text>
          <Text style={styles.meta}>Escrow {pool.poolAddress}</Text>
          {pool.payouts.map((payout) => (
            <Text key={`${pool.id}-${payout.rank}`} style={styles.body}>
              #{payout.rank} {payout.displayName} · {payout.amount} {payout.note ? `· ${payout.note}` : ''}
            </Text>
          ))}
        </Card>
      ))}
    </Screen>
  )
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  meta: { color: colors.ink, fontSize: 12 },
})
