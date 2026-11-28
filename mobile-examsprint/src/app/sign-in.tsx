import { router } from 'expo-router'
import { useState } from 'react'
import { ScrollView, Text, TextInput } from 'react-native'
import * as Google from 'expo-auth-session/providers/google'
import * as WebBrowser from 'expo-web-browser'

import { api } from '@/lib/api'
import type { AuthResponse } from '@/lib/types'
import { useSession } from '@/state/session'
import { Button, Card, Screen, Title, colors } from '@/ui/theme'

WebBrowser.maybeCompleteAuthSession()

export default function SignInScreen() {
  const session = useSession()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const googleClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID

  async function accept(result: AuthResponse) {
    session.signIn(result.access_token, result.user)
    router.replace('/play')
  }

  async function submit() {
    setBusy(true)
    setError('')
    const path = mode === 'in' ? '/api/auth/login' : '/api/auth/signup'
    const body = mode === 'in' ? { email, password } : { name, email, password }
    const result = await api<AuthResponse>(path, { method: 'POST', body: JSON.stringify(body) })
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    await accept(result.data)
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled">
        <Title kicker="EXAMSPRINT" subtitle="Email and password, or Google. This is the same account as the learning app.">
          {mode === 'in' ? 'Sign in' : 'Create account'}
        </Title>
        <Card>
          {mode === 'up' ? (
            <Field placeholder="Name" value={name} onChangeText={setName} />
          ) : null}
          <Field placeholder="Email" value={email} onChangeText={setEmail} keyboard="email-address" />
          <Field placeholder="Password" value={password} onChangeText={setPassword} secure />
          {mode === 'up' ? <Text style={{ color: colors.muted }}>Use at least 8 characters.</Text> : null}
          {error ? <Text style={{ color: colors.coral }}>{error}</Text> : null}
          <Button disabled={busy} label={mode === 'in' ? 'Sign in' : 'Create account'} onPress={() => void submit()} />
          <Button
            label={mode === 'in' ? 'Need an account?' : 'I already have an account'}
            tone="ghost"
            onPress={() => setMode(mode === 'in' ? 'up' : 'in')}
          />
          {googleClientId ? <GoogleButton clientId={googleClientId} onError={setError} onToken={accept} /> : null}
        </Card>
        <Button label="Back" tone="ghost" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  )
}

function Field({
  placeholder,
  value,
  onChangeText,
  secure,
  keyboard,
}: {
  placeholder: string
  value: string
  onChangeText: (value: string) => void
  secure?: boolean
  keyboard?: 'email-address'
}) {
  return (
    <TextInput
      autoCapitalize="none"
      keyboardType={keyboard}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      secureTextEntry={secure}
      style={{
        borderColor: colors.line,
        borderRadius: 12,
        borderWidth: 1,
        color: colors.ink,
        fontSize: 16,
        paddingHorizontal: 12,
        paddingVertical: 12,
      }}
      value={value}
    />
  )
}

function GoogleButton({
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
      onError('Google did not return an access token.')
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
