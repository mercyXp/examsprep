# Solana badges and prize pools

Phase 1 of the Dev3pack hackathon entry. The website and the phone keep using FastAPI for accounts, lessons, and quizzes. Solana is added beside that, not instead of it.

ExamsPrep is an independent student project. It is not affiliated with Cavendish University Zambia. The program does not store grades from the university. It stores badges the ExamsPrep API decides a student has earned, and USDC prize pools an administrator settles.

## Pieces

```text
Android app (mobile/)                 Next.js (app/)
        |  email / Google / lessons          |
        +---------------- API (api/) --------+
                         |  authority key (env)
                         v
              Solana program (solana/)
              badges + USDC escrow
```

| Piece | Where | Job |
| --- | --- | --- |
| Program | `solana/` | Badge accounts and prize-pool escrow. Anchor, Rust. |
| API | `api/app/solana/`, `api/app/routers/rewards.py` | Who earned a badge, who may run a pool, and the signed transactions. |
| Phone | `mobile/` | Email or Google sign-in, Mobile Wallet Adapter, lessons, quizzes, badges, pools. |

Addresses (devnet, once `./scripts/deploy-devnet.sh` has succeeded):

| Account | Address |
| --- | --- |
| Program | `Ebo9c8SiwLx37wXejAwQmx1vLv1YtR8kYVb2Lb6V8FVH` |
| Config PDA | `kkStmSTS4zYhJNCMj9umfUbyfAU1yUnpaWcK3ZX8EG8` |
| Devnet USDC mint | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |

The config PDA exists only after the authority key sends `initialize`. The API does that automatically on the first badge or pool.

## Who is allowed to do what

The program stores one authority public key. Every `award_badge`, `create_pool`, and `pay_winners` transaction must be signed by that key. A student wallet cannot mint their own badge.

On the API, before that key is used:

- A student claims a topic, mock-exam, or streak badge only when the eligibility rules below say they earned it, and only for their linked wallet.
- Weekly leaderboard badges are not self-serve. They are written when an administrator settles a pool.
- Creating, funding, and settling a pool requires a **super administrator** or a **programme administrator**. A programme administrator can only touch a pool for a programme they are assigned to. A pool with no programme is platform-wide and only a super administrator can manage it. Creators and students get 403. The check is `assert_pool_admin` in `api/app/solana/gates.py`, on the server.

## How a badge is earned

The API reads lessons and quizzes it already stores. It does not ask the phone to say "I passed."

| Badge | Rule |
| --- | --- |
| Topic mastered | Every **published** lesson in that module is completed. The subject key is `programme-slug:module-code`, for example `computing:IT212`. |
| Mock exam passed | A submitted attempt with `passed = true` on a quiz whose kind is `mock`. The best score is kept. |
| Study streak | Three or more consecutive UTC days, ending today or yesterday, on which the student completed a lesson or submitted a quiz. Opening a lesson without finishing it does not count. The badge records the length on the day it is claimed. The chain account is created once, so a later longer streak does not rewrite it. |
| Weekly leaderboard | When a pool is settled, students are ranked on activity inside the pool's period. The best score on each quiz is summed. Completed lessons break a tie, then whoever finished earlier. The top N who have linked a wallet receive this badge. |

Claiming sends `award_badge`. The badge address is a PDA:

```text
["badge", student wallet, kind byte, sha256(subject key)]
```

Anyone can recompute that address and read the account. `GET /api/badges/verify/{wallet}` returns the same badges with the PDA and the transaction signature, and it does not require a sign-in. It returns a first name, not an email.

## Prize pools

1. An administrator creates a pool (`POST /api/admin/pools`). The API sends `create_pool`. That creates the pool account and an empty token escrow (the vault). The vault's owner is the pool PDA, not a person's wallet.
2. `POST /api/admin/pools/{id}/fund` with an amount in **base units** sends `fund_pool`, signed by `SOLANA_SPONSOR_KEYPAIR`. That wallet must already hold the token (devnet USDC) in its associated token account. 1 USDC is `1000000`.
3. `POST /api/admin/pools/{id}/settle` ranks students for that period, pays the ones with linked wallets, and writes their weekly badges. The amount is split evenly. Any remainder goes to first place among the students who can actually be paid. A top student with no wallet is listed and not paid. If the pool has USDC and nobody in the top N has a wallet, settle refuses so the funds stay in escrow.

`pay_winners` can run once. A second call is rejected by the program.

The program accepts any SPL token mint so the tests can use a local mint. The API defaults to devnet USDC.

## Wallet linking

`POST /api/wallet/challenge` returns a sentence that includes the user id and a nonce. The phone asks Mobile Wallet Adapter to sign those exact bytes. `POST /api/wallet/link` checks the signature against the wallet address. A matching signature is what proves the signed-in student controls that wallet. The signature does not send SOL or USDC.

One wallet can belong to one account. Unlink with `DELETE /api/wallet` before linking a different one.

## API routes

| Method | Path | Who |
| --- | --- | --- |
| GET | `/api/solana/status` | Public. Program id and whether the authority key is set. No secrets. |
| POST | `/api/wallet/challenge` | Signed in |
| POST | `/api/wallet/link` | Signed in |
| GET | `/api/wallet/me` | Signed in |
| DELETE | `/api/wallet` | Signed in |
| GET | `/api/badges/me` | Signed in. Held badges and ones they can claim. |
| GET | `/api/badges/eligibility` | Signed in. Same payload, named for the eligibility check. |
| POST | `/api/badges/claim` | Student, linked wallet, eligible |
| GET | `/api/badges/verify/{wallet}` | Public |
| GET | `/api/leaderboard?days=7` | Signed in |
| GET | `/api/pools` | Public |
| POST | `/api/admin/pools` | Super admin or programme admin |
| POST | `/api/admin/pools/{id}/fund` | Same, and only inside their programmes |
| POST | `/api/admin/pools/{id}/settle` | Same |
| GET | `/api/learn/quizzes` | Signed in, published quizzes on visible modules |
| GET | `/api/learn/quizzes/{id}` | Same. Answers are not included. |
| POST | `/api/learn/quizzes/{id}/attempts` | Same. Score is stored on `quiz_attempts`. |

If `SOLANA_AUTHORITY_KEYPAIR` is empty, chain routes answer 503 and do not pretend a badge was written. Set `SOLANA_CHAIN_MODE=record` only on a laptop when you want the database rows without a cluster. Do not use `record` in production.

## Environment variables

Set these on the **API** (Render). Not on Vercel. Not in the mobile app, except `EXPO_PUBLIC_API_URL` and the Google client id.

| Variable | Purpose |
| --- | --- |
| `SOLANA_RPC_URL` | Default `https://api.devnet.solana.com` |
| `SOLANA_PROGRAM_ID` | `Ebo9c8SiwLx37wXejAwQmx1vLv1YtR8kYVb2Lb6V8FVH` |
| `SOLANA_AUTHORITY_KEYPAIR` | JSON array from `authority.json`, or a path to that file on a machine that has a disk. This key signs badges and payouts. |
| `SOLANA_SPONSOR_KEYPAIR` | Optional. The wallet that locks USDC into a pool when an admin calls fund. |
| `SOLANA_USDC_MINT` | Default devnet USDC mint above. |
| `SOLANA_CHAIN_MODE` | Empty means live when the authority key is set. `off` refuses chain calls. `record` does not contact the cluster. |

The phone:

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | FastAPI origin, no trailing slash. The Android emulator uses `http://10.0.2.2:8000` for the computer's localhost. |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID` | Same Web client id as `GOOGLE_CLIENT_ID` on the API and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` on the website. |

## Database

Alembic revision `20261127_0016` adds `wallet_links`, `badge_awards`, `prize_pools`, and `prize_payouts`. It does not change users, lessons, or roles. Run `alembic upgrade head` as the API already does on deploy.

## Phone

`mobile/` was scaffolded with:

```bash
npx solana-mobile@latest create mobile --template expo-kit-wallet --skip-git
```

That template is the Expo / React Native app from templates.solanamobile.com with Mobile Wallet Adapter wired through `@wallet-ui/react-native-kit`. The ExamsPrep screens replace the template's demo wallet pages. They call FastAPI. They are native views, not a webview of the website.

Build an APK and try it with Fake Wallet: [mobile/README.md](../../mobile/README.md).

## What is deliberately unchanged

Sign-in, roles, lesson review, and the Render/Vercel deploy commands are the same. The lesson studio under `app/src/app/admin` and `app/src/app/components/studio` is not part of this change. Chain keys are optional, so an API deploy without them still boots. Badge and pool calls then return 503 until the keys are set.
