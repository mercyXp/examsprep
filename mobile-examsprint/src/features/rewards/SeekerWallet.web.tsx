import { Text } from 'react-native'

import { Card } from '@/ui/theme'

export function SeekerWallet() {
  return (
    <Card>
      <Text style={{ color: '#F4F7FB', fontSize: 18, fontWeight: '800' }}>Seeker signing</Text>
      <Text style={{ color: '#93A4BD', lineHeight: 22 }}>
        Mobile Wallet Adapter is the signer on Android and on a Solana Seeker. This browser preview cannot open that
        wallet. Install the ExamSprint APK, connect the wallet, and sign the one-time link sentence. That links the
        address the ExamsPrep reward program already uses for badges and prize pools.
      </Text>
    </Card>
  )
}
