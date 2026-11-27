import { useState } from 'react'
import { StyleSheet, Text, TextInput } from 'react-native'
import { router } from 'expo-router'
import * as Google from 'expo-auth-session/providers/google'
import * as WebBrowser from 'expo-web-browser'
import { useMobileWallet } from '@wallet-ui/react-native-kit'

import { useSession, type SessionUser } from '@/features/auth/session'
import { linkConnectedWallet } from '@/features/auth/link-wallet'
import { api } from '@/lib/api'
import { Button, Card, ErrorText, Screen, Title, colors } from '@/ui/screen'
import { WalletUiConnectButton } from '@/features/wallet/ui/wallet-ui-connect-button'

WebBrowser.maybeCompleteAuthSession()

type AuthResponse = { access_token: string; user: SessionUser }

export default function SignInScreen() {
  const session = useSession()
  const wallet = useMobileWallet()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [linked, setLinked] = useState('')
  const googleClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID

  async function accept(result: AuthResponse) {
    session.signIn(result.access_token, result.user)
    setError('')
  }

  async function signInWithEmail() {
    setBusy(true)
    setError('')
    const result = await api<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    await accept(result.data)
  }

  async function linkWallet() {
    if (!session.token || !wallet.account) return
    setBusy(true)
    setError('')
    const result = await linkConnectedWallet({
      address: wallet.account.address,
      signMessages: wallet.signMessages,
      token: session.token,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setLinked(result.data.address)
  }

  return (
    <Screen>
      <Title subtitle="Email or Google for your ExamsPrep account, then connect a Solana wallet to hold badges and prize USDC.">
        Sign in
      </Title>
      {session.token ? (
        <Card>
          <Text style={styles.body}>Signed in as {session.user?.name}.</Text>
          {wallet.account ? (
            <>
              <Text style={styles.body}>Wallet {wallet.account.address}</Text>
              <Button disabled={busy} label={busy ? 'Waiting for the wallet…' : 'Sign the link message'} onPress={() => void linkWallet()} />
              {linked ? <Text style={styles.ok}>Linked {linked}</Text> : null}
            </>
          ) : (
            <WalletUiConnectButton connect={wallet.connect}>Connect wallet</WalletUiConnectButton>
          )}
          <Button label="Continue to my courses" onPress={() => router.replace('/(main)')} />
          <Button label="Sign out" tone="ghost" onPress={session.signOut} />
        </Card>
      ) : (
        <Card>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={email}
          />
          <TextInput
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={colors.muted}
            secureTextEntry
            style={styles.input}
            value={password}
          />
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Button disabled={busy} label="Sign in" onPress={() => void signInWithEmail()} />
          {googleClientId ? <GoogleSignIn clientId={googleClientId} onError={setError} onToken={accept} /> : null}
        </Card>
      )}
    </Screen>
  )
}

function GoogleSignIn({
  clientId,
  onError,
  onToken,
}: {
  clientId: string
  onError: (message: string) => void
  onToken: (result: AuthResponse) => Promise<void>
}) {
  const [request, , promptAsync] = Google.useAuthRequest({
    androidClientId: clientId,
    webClientId: clientId,
    scopes: ['openid', 'email', 'profile'],
  })

  async function start() {
    const result = await promptAsync()
    if (result.type !== 'success') return
    const accessToken = result.authentication?.accessToken
    if (!accessToken) {
      onError('Google did not return an access token. Use the same Web client ID as the website.')
      return
    }
    const response = await api<AuthResponse>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ access_token: accessToken }),
    })
    if (!response.ok) {
      onError(response.message)
      return
    }
    await onToken(response.data)
  }

  return <Button disabled={!request} label="Continue with Google" tone="ghost" onPress={() => void start()} />
}

const styles = StyleSheet.create({
  body: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  input: {
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  ok: { color: colors.accent, fontSize: 14 },
})
