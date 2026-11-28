import { useEffect, useState } from 'react'
import { Text } from 'react-native'

import { linkConnectedWallet } from '@/features/wallet/link-wallet'
import { useSprintWallet } from '@/features/wallet/use-wallet'
import { api } from '@/lib/api'
import { useSession } from '@/state/session'
import { Button, Card } from '@/ui/theme'

export function SeekerWallet() {
  const session = useSession()
  const wallet = useSprintWallet()
  const [linked, setLinked] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!session.token) return
    void api<{ linked: boolean; address: string | null }>('/api/wallet/me', {}, session.token).then((result) => {
      if (result.ok && result.data.address) setLinked(result.data.address)
    })
  }, [session.token])

  async function connect() {
    setBusy(true)
    setMessage('')
    try {
      if (wallet.address) await wallet.disconnect()
      else await wallet.connect()
    } catch {
      setMessage('The wallet picker was closed.')
    } finally {
      setBusy(false)
    }
  }

  async function signLink() {
    if (!session.token || !wallet.address) return
    setBusy(true)
    setMessage('')
    const result = await linkConnectedWallet({
      address: wallet.address,
      signMessages: wallet.signMessages,
      token: session.token,
    })
    setBusy(false)
    if (!result.ok) {
      setMessage(result.message)
      return
    }
    setLinked(result.data.address)
  }

  return (
    <Card>
      <Text style={{ color: '#F4F7FB', fontSize: 18, fontWeight: '800' }}>Seeker signing</Text>
      <Text style={{ color: '#93A4BD', lineHeight: 22 }}>
        Mobile Wallet Adapter is the primary way a Seeker signs. Connecting does not send tokens. The next step signs
        one sentence so ExamsPrep can attach badges and prize-pool payouts to this address.
      </Text>
      {linked ? <Text style={{ color: '#2EE6A6' }}>Linked {linked}</Text> : null}
      {wallet.address ? <Text style={{ color: '#F4F7FB' }}>Connected {wallet.address}</Text> : null}
      <Button
        disabled={busy}
        label={wallet.address ? 'Disconnect wallet' : 'Connect wallet'}
        onPress={() => void connect()}
      />
      {wallet.address && session.token ? (
        <Button disabled={busy} label="Sign the link sentence" tone="ghost" onPress={() => void signLink()} />
      ) : null}
      {message ? <Text style={{ color: '#FF5D73' }}>{message}</Text> : null}
    </Card>
  )
}
