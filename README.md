# ExamsPrep

ExamsPrep ([www.examsprep.xyz](https://www.examsprep.xyz)) is an independent, student-built exam-prep platform for Cavendish University Zambia students. It is not affiliated with the university. Content follows the university's curriculum, lecture slides, and assessment style, starting with BSc Computing.

The Next.js app is in `app/`. The FastAPI and PostgreSQL API is in `api/`. Notes are in `docs/`. Start locally with [docs/SETUP.md](docs/SETUP.md).

## Hackathon

Phase 1 of a Dev3pack Solana entry. Tracks in mind: Best App Overall, DeFi, and Seeker Mobile. ElevenLabs comes later.

Students keep signing in with email or Google. Lessons, quizzes, and roles stay in FastAPI. Solana adds two things the phone can show:

- **Badges** a student can prove: topic mastered, mock exam passed, study streak, weekly leaderboard place. Only the API's authority key can write them.
- **USDC prize pools** on devnet. A sponsor locks USDC in an escrow. An administrator submits the top students and the program pays them.

### User flow

1. A student signs in on the Android app with the same email or Google account as the website.
2. They connect a wallet with Mobile Wallet Adapter (Fake Wallet on an emulator, or a Seeker wallet) and sign one sentence. That links the wallet. It does not send tokens.
3. They study published lessons and sit quizzes. The API marks a topic mastered when every published lesson in that module is done, a mock when a mock attempt passed, and a streak after three consecutive study days.
4. They claim the badge. The API signs `award_badge`. Anyone can open `GET /api/badges/verify/{wallet}` and read the badge without an account.
5. A super administrator or a programme administrator opens a prize pool and a sponsor locks devnet USDC. When the period is settled, the top students who linked a wallet are paid from the escrow and receive the weekly badge. Creators and students cannot run this. A programme administrator cannot settle another programme's pool.

### Program

| | Address |
| --- | --- |
| Program id | `Ebo9c8SiwLx37wXejAwQmx1vLv1YtR8kYVb2Lb6V8FVH` |
| Config PDA | `kkStmSTS4zYhJNCMj9umfUbyfAU1yUnpaWcK3ZX8EG8` |
| Devnet USDC mint | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |

The program is Anchor, in `solana/`. Tests: `cd solana && anchor test --validator legacy` (these pass on a local validator). Deploy: `cd solana && ./scripts/deploy-devnet.sh`. The config account appears on devnet after the first `initialize`, which the API sends the first time it awards a badge or opens a pool.

**Devnet deploy status:** not on devnet yet. The deploy script requested an airdrop for `2rxJbaiJViRFixwRFCrE3vG7GRm34Q7Yq81tpnM4G9s8` and devnet returned `airdrop request failed` (rate limit). Nothing was deployed. The program id above is still the id that deploy will use, because it comes from `solana/keys/examsprep-program.json`. Do not send SOL to that keypair. It is in the repo so the address stays stable.

From a machine that can get devnet SOL:

1. `solana config set --url https://api.devnet.solana.com`
2. `solana-keygen new -o ~/.config/solana/id.json --no-bip39-passphrase` if you do not already have a deployer wallet.
3. `solana address` and request devnet SOL at [https://faucet.solana.com](https://faucet.solana.com). If the site is capped: `solana airdrop 1 <address> --url https://api.devnet.solana.com`.
4. Wait until `solana balance` shows at least 1.5 SOL.
5. `cd solana && ./scripts/deploy-devnet.sh`
6. `solana-keygen new -o authority.json --no-bip39-passphrase`, airdrop a little SOL to that pubkey, and put the file's JSON array in `SOLANA_AUTHORITY_KEYPAIR` on the API. Do not commit `authority.json`.

### Demo

- Demo video (under 3 minutes): add the link here before submission.
- Live demo: [https://www.examsprep.xyz](https://www.examsprep.xyz). Solana badges and pools appear after `SOLANA_AUTHORITY_KEYPAIR` is set on the API and the program is deployed. Until then the site behaves as it does today and those routes answer 503.

Design notes: [docs/architecture/solana.md](docs/architecture/solana.md). Phone build and Fake Wallet: [mobile/README.md](mobile/README.md).

ExamSprint, the separate Android knowledge-challenge game, lives in [mobile-examsprint/](mobile-examsprint/README.md). It uses this API for sign-in and the question bank. Byte Arena and Pollar notes: [docs/byte.md](docs/byte.md), [docs/pollar.md](docs/pollar.md).
