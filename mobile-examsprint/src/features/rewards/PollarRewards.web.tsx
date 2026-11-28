import { useEffect, useState } from 'react'
import { Text, TextInput, View } from 'react-native'
import { PollarProvider, usePollar } from '@pollar/react'

import { Button, Card, colors } from '@/ui/theme'

const publishableKey = process.env.EXPO_PUBLIC_POLLAR_PUBLISHABLE_KEY ?? ''

export function PollarRewards() {
  if (!publishableKey) {
    return (
      <Card>
        <Text style={{ color: colors.amber, fontWeight: '800' }}>Pollar is not configured</Text>
        <Text style={{ color: colors.muted, lineHeight: 22 }}>
          Students can still sign in to ExamsPrep and, on Android, connect a Seeker wallet with Mobile Wallet Adapter.
          Pollar is the extra path for someone who does not have a wallet yet. To turn it on, the owner needs:
        </Text>
        <Text style={{ color: colors.ink, lineHeight: 22 }}>
          1. An app at dashboard.pollar.xyz{'\n'}
          2. Solana enabled under Wallets, Settings, Enabled chains{'\n'}
          3. USDC added under Wallets, Tokens and Trustlines{'\n'}
          4. The publishable key (pub_testnet_… or the live key) in EXPO_PUBLIC_POLLAR_PUBLISHABLE_KEY{'\n'}
          5. A restart of this web build. Do not commit the key.
        </Text>
      </Card>
    )
  }
  return (
    <PollarProvider client={{ apiKey: publishableKey }}>
      <PollarPanel />
    </PollarProvider>
  )
}

function PollarPanel() {
  const { isAuthenticated, login, logout, openLoginModal, wallets, walletBalance, refreshWalletBalance, txHistory, getClient } =
    usePollar()
  const [email, setEmail] = useState('')
  const solana = wallets.find((item) => item.chain === 'SOLANA')

  useEffect(() => {
    if (!isAuthenticated) return
    void refreshWalletBalance()
    void getClient().fetchTxHistory({ limit: 20, offset: 0 })
  }, [getClient, isAuthenticated, refreshWalletBalance])

  return (
    <Card>
      <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '800' }}>Pollar wallet</Text>
      <Text style={{ color: colors.muted, lineHeight: 22 }}>
        Google or email creates a Solana wallet without a seed phrase. USDC shown here is the balance Pollar reports
        for that wallet. Prize eligibility still comes from ExamsPrep, and a Seeker still signs with Mobile Wallet
        Adapter.
      </Text>
      {isAuthenticated ? (
        <>
          <Text style={{ color: colors.ink }}>
            Solana address {solana?.address ?? 'Not created yet. Pollar creates it after login when Solana is enabled.'}
          </Text>
          {walletBalance.step !== 'loaded' ? (
            <Text style={{ color: colors.muted }}>Loading balances…</Text>
          ) : (
            walletBalance.data.balances.map((row) => (
              <Text key={row.code} style={{ color: row.code === 'USDC' ? colors.mint : colors.ink }}>
                {row.balance} {row.code}
              </Text>
            ))
          )}
          <Text style={{ color: colors.ink, fontWeight: '800', marginTop: 8 }}>History</Text>
          {txHistory.step !== 'loaded' ? (
            <Text style={{ color: colors.muted }}>Loading history…</Text>
          ) : txHistory.data.records.length === 0 ? (
            <Text style={{ color: colors.muted }}>No Pollar transfers yet.</Text>
          ) : (
            txHistory.data.records.map((row) => (
              <Text key={row.id} style={{ color: colors.muted }}>
                {row.summary} · {row.status}
              </Text>
            ))
          )}
          <Button label="Sign out of Pollar" tone="ghost" onPress={() => logout()} />
        </>
      ) : (
        <View style={{ gap: 10 }}>
          <Button label="Continue with Google" onPress={() => login({ provider: 'google' })} />
          <Button label="Open Pollar sign-in" tone="ghost" onPress={() => openLoginModal()} />
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="Email for a one-time code"
            placeholderTextColor={colors.muted}
            style={{
              borderColor: colors.line,
              borderRadius: 12,
              borderWidth: 1,
              color: colors.ink,
              paddingHorizontal: 12,
              paddingVertical: 12,
            }}
            value={email}
          />
          <Button
            disabled={!email.includes('@')}
            label="Email me a code"
            tone="ghost"
            onPress={() => login({ provider: 'email', email })}
          />
          <Text style={{ color: colors.muted, lineHeight: 20 }}>
            The email button sends the code. Enter it in the Pollar sign-in window, which is the documented place for
            that step.
          </Text>
        </View>
      )}
    </Card>
  )
}
