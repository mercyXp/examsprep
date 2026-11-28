# Pollar and ExamSprint rewards

Pollar is the onboarding-to-payment layer Dev3pack lists among the hackathon sponsors. ExamSprint uses only the calls in the current Pollar docs. Mobile Wallet Adapter stays the way a Seeker signs, and ExamsPrep stays the source of who has earned a badge or a prize.

## What the docs actually say

- [Overview](https://docs.pollar.xyz/docs/getting-started/overview): one login (Google, GitHub, or email) creates a wallet on every chain the app enables, with no seed phrase. Solana is supported for managed, co-signed, and self-custody wallets, Sign In With Solana, SPL balances, sponsored transfers, and history.
- [Quickstart](https://docs.pollar.xyz/docs/getting-started/quickstart): `npm install @pollar/react`, wrap the tree in `PollarProvider` with `client={{ apiKey }}`, then `usePollar()`. The key is a publishable key from [dashboard.pollar.xyz](https://dashboard.pollar.xyz).
- [Chain support](https://docs.pollar.xyz/docs/core-concepts/chain-support): enable chains under Wallets → Settings → Enabled chains. `login()` creates one wallet per enabled chain. `sendPayment({ chain: 'SOLANA', ... })` sends SOL or an SPL token. Amounts are integer base units. USDC has 6 decimals. The docs' Solana USDC mint example is `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.
- [@pollar/react](https://docs.pollar.xyz/docs/sdk-reference/pollar-react): `login({ provider: 'google' })`, `login({ provider: 'email', email })`, `openLoginModal()`, `logout()`, `wallets` (each item has `chain`; Solana is `'SOLANA'`), `refreshWalletBalance()`, `walletBalance`, and `getClient().fetchTxHistory({ limit, offset })` which fills `txHistory`.
- [Payments UI](https://docs.pollar.xyz/docs/guides/payments-ui): balance rows expose `code` and `balance`. On Solana, `sendPayment` is the call, not the Stellar `runTx('payment')` helper.
- [Transaction history](https://docs.pollar.xyz/docs/core-concepts/transaction-history): history is what Pollar itself handled. A transfer an external wallet submits on its own does not appear. Records expose `id`, `summary`, `status`, and `createdAt`.
- [Tokens](https://docs.pollar.xyz/docs/operator-guide/wallets/tokens-trustlines): add USDC under Wallets → Tokens & Trustlines so it shows in balances. Solana has no trustline; the associated token account is created when the token first arrives.

There is no documented React Native SDK in those pages. `@pollar/react` is a React client and renders its own modals. ExamSprint therefore runs it in the web build only.

## What this repo implements

The rewards screen in `mobile-examsprint` has three blocks:

1. **Eligibility** from `GET /api/badges/eligibility`. That is the existing ExamsPrep reward protocol (lessons, mocks, streaks, and the on-chain badge rules). This game does not decide payouts and does not call `sendPayment`.
2. **Seeker signing** with Mobile Wallet Adapter (`@wallet-ui/react-native-kit`), the same stack as the main app. Connect, then sign the sentence from `POST /api/wallet/challenge` and send it to `POST /api/wallet/link`. That is the primary signing path on Android.
3. **Pollar**, only in the web build, and only when `EXPO_PUBLIC_POLLAR_PUBLISHABLE_KEY` is set:
   - `PollarProvider client={{ apiKey }}`
   - `login({ provider: 'google' })`
   - `login({ provider: 'email', email })` to send the one-time code
   - `openLoginModal()` for the documented sign-in window, which is where the code is entered
   - `wallets.find(wallet => wallet.chain === 'SOLANA')`
   - `refreshWalletBalance()` and `walletBalance.data.balances` (USDC called out when `code` is `USDC`)
   - `getClient().fetchTxHistory({ limit: 20, offset: 0 })` and `txHistory.data.records`

The Android build does not import `@pollar/react`. It tells the student that Pollar's documented client is the web SDK, and it keeps Mobile Wallet Adapter.

## Not configured

Leave `EXPO_PUBLIC_POLLAR_PUBLISHABLE_KEY` unset and the web rewards screen says **Pollar is not configured**. No Pollar request is made. The owner has to:

1. Create an app at [dashboard.pollar.xyz](https://dashboard.pollar.xyz).
2. Enable Solana under Wallets → Settings → Enabled chains.
3. Add USDC under Wallets → Tokens & Trustlines, and turn on sponsored transfers if a new wallet should receive USDC without holding SOL.
4. Copy the **publishable** key (`pub_testnet_…` in Test mode, or the live key). Put it in `mobile-examsprint/.env` as `EXPO_PUBLIC_POLLAR_PUBLISHABLE_KEY`.
5. Restart the web build. Do not commit the key. Do not put a secret key in the app.

Test mode keeps the managed key in Pollar's wallet service. Live mode uses a Turnkey wallet (co-signed or self-custody), which the docs describe as a device approval. This repo does not try to recreate that flow.

## What we did not invent

- No custom OTP verification call. The docs show sending the code with `login({ provider: 'email', email })` and completing sign-in through the Pollar UI (`openLoginModal`).
- No `sendPayment`. Moving USDC would need a destination and a user confirmation, and prize settlement already belongs to the ExamsPrep program and its administrator.
- No claim that a Mobile Wallet Adapter signature shows up in Pollar history. The history doc says Pollar only lists transfers it handled.
- The devnet USDC mint ExamsPrep already uses (`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`) is not the same string as the mainnet mint in Pollar's examples. Which mint a Pollar app shows is chosen in the Pollar dashboard, not hardcoded here.
