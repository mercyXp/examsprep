import { getBase64Decoder } from '@solana/kit'

import { api } from '@/lib/api'

/**
 * The API issues one sentence. Mobile Wallet Adapter signs that sentence.
 * The API stores the address only after the signature checks.
 */
export async function linkConnectedWallet({
  address,
  signMessages,
  token,
}: {
  address: string
  signMessages: (message: Uint8Array) => Promise<Uint8Array | null | undefined>
  token: string
}) {
  const challenge = await api<{ challenge: string }>('/api/wallet/challenge', { method: 'POST' }, token)
  if (!challenge.ok) return challenge
  const signed = await signMessages(new TextEncoder().encode(challenge.data.challenge))
  if (!signed) {
    return { ok: false as const, message: 'The wallet did not return a signature.' }
  }
  return api<{ address: string }>(
    '/api/wallet/link',
    {
      method: 'POST',
      body: JSON.stringify({ address, signature: getBase64Decoder().decode(signed) }),
    },
    token,
  )
}
