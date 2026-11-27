import { getBase64Decoder } from '@solana/kit'
import type { useMobileWallet } from '@wallet-ui/react-native-kit'

import { api } from '@/lib/api'

/**
 * Connect is handled by Mobile Wallet Adapter (`wallet.connect`).
 * This function asks the API for a one-time sentence, asks the wallet to
 * sign that exact sentence, and sends the signature back. The API checks
 * the signature before it stores the address.
 */
export async function linkConnectedWallet({
  address,
  signMessages,
  token,
}: {
  address: string
  signMessages: ReturnType<typeof useMobileWallet>['signMessages']
  token: string
}) {
  const challenge = await api<{ challenge: string }>('/api/wallet/challenge', { method: 'POST' }, token)
  if (!challenge.ok) return challenge

  const signed = await signMessages(new TextEncoder().encode(challenge.data.challenge))
  if (!signed) {
    return { ok: false as const, message: 'The wallet did not return a signature.' }
  }

  return api<{ address: string }>('/api/wallet/link', {
    method: 'POST',
    body: JSON.stringify({
      address,
      signature: getBase64Decoder().decode(signed),
    }),
  }, token)
}
