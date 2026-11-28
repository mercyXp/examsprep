import { Text } from 'react-native'

import { Card, colors } from '@/ui/theme'

const key = process.env.EXPO_PUBLIC_POLLAR_PUBLISHABLE_KEY

export function PollarRewards() {
  return (
    <Card>
      <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '800' }}>Pollar onboarding</Text>
      <Text style={{ color: colors.muted, lineHeight: 22 }}>
        Pollar's published client is the React SDK (@pollar/react and @pollar/core). This Android build does not
        call it. Mobile Wallet Adapter stays the Seeker signer. The web build of ExamSprint runs the documented login,
        balance, and history calls when a publishable key is set.
      </Text>
      <Text style={{ color: key ? colors.mint : colors.amber, lineHeight: 22 }}>
        {key
          ? 'A publishable key is set for the web build. Open ExamSprint in the browser to use Pollar.'
          : 'Not configured. The owner still needs a publishable key from dashboard.pollar.xyz.'}
      </Text>
    </Card>
  )
}
