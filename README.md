# ExamsPrep

ExamsPrep ([www.examsprep.xyz](https://www.examsprep.xyz)) is an independent, student-built exam-prep platform for Cavendish University Zambia students. It is not affiliated with the university. Content follows the university's curriculum, lecture slides, and assessment style, starting with BSc Computing.

The Next.js app is in `app/`. The FastAPI and PostgreSQL API is in `api/`. Notes are in `docs/`. Start locally with [docs/SETUP.md](docs/SETUP.md).

## Hackathon

Phase 1 of a Dev3pack Solana entry. Tracks in mind: Best App Overall, DeFi, and Seeker Mobile. ElevenLabs comes later.

Students keep signing in with email or Google. Lessons, quizzes, and roles stay in FastAPI. Solana adds two things the phone can show:

- **Badges** a student can prove: topic mastered, mock exam passed, study streak, weekly leaderboard place. Only the API's authority key can write them.
- **USDC prize pools** on devnet. A sponsor locks USDC in an escrow. A student claims their share after the period, or an administrator settles the pool in one batch.

### User flow

1. A student signs in on the Android app with the same email or Google account as the website.
2. They connect a wallet with Mobile Wallet Adapter (Fake Wallet on an emulator, or a Seeker wallet) and sign one sentence. That links the wallet. It does not send tokens.
3. They study published lessons and sit quizzes. The API marks a topic mastered when every published lesson in that module is done, a mock when a mock attempt passed, and a streak after three consecutive study days.
4. They claim the badge. The API checks eligibility from its own lesson and quiz rows, then signs `award_badge`. Anyone can open `GET /api/badges/verify/{wallet}` and read the badge without an account.
5. A super administrator or a programme administrator opens a prize pool and a sponsor locks devnet USDC. After the period ends, a student in the payable top N calls `POST /api/pools/{id}/claim`. The API ranks them again, signs `record_achievement`, and signs `claim_reward`. An administrator can instead settle the pool in one batch (`pay_winners`) or close it and return leftover USDC to the sponsor. Creators and students cannot open, fund, settle, or close a pool. A programme administrator cannot touch another programme's pool.

### Solana rewards program

Anchor program in `solana/`. The full operator notes are [docs/solana.md](docs/solana.md).

| | Address |
| --- | --- |
| Program id | `Ebo9c8SiwLx37wXejAwQmx1vLv1YtR8kYVb2Lb6V8FVH` |
| Config PDA (`["config"]`) | `kkStmSTS4zYhJNCMj9umfUbyfAU1yUnpaWcK3ZX8EG8` |
| Devnet USDC mint | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |

Nothing personal and no exam answers go on-chain. An achievement stores a wallet address, a kind byte, a 32-byte subject hash, and a number (lesson count, score percent, streak days, or rank).

Instructions. The original names are what the API already sends. The rewards names call the same code where the behaviour already existed.

| Instruction | Who signs | What it does |
| --- | --- | --- |
| `initialize` / `initialize_config` | Backend authority | Creates the config PDA and stores the authority |
| `award_badge` | Backend authority | Records a badge with no prize amount |
| `record_achievement` | Backend authority | Records a prize entitlement (kind, subject hash, pool id, amount) |
| `create_pool` / `create_reward_pool` | Backend authority | Opens a pool and its token vault |
| `fund_pool` / `fund_reward_pool` | Sponsor | Locks tokens (devnet USDC in production) into the vault |
| `claim_reward` | Backend authority | Pays the recorded amount to the student and writes a claim receipt |
| `pay_winners` | Backend authority | Pays a list of winners once, if nobody has claimed yet |
| `close_reward_pool` | Backend authority | Closes the pool and returns leftover tokens to the sponsor |

Accounts, all PDAs:

| Account | Seeds |
| --- | --- |
| Config | `["config"]` |
| Student achievement | `["badge", student, kind, subject hash]` |
| Reward pool | `["pool", pool id as 8 little-endian bytes]` |
| Reward vault | `["vault", pool address]` |
| Claim receipt | `["receipt", pool address, student]` |

The API env vars (Render, not Vercel) are `SOLANA_RPC_URL`, `SOLANA_PROGRAM_ID`, `SOLANA_AUTHORITY_KEYPAIR`, `SOLANA_SPONSOR_KEYPAIR`, `SOLANA_USDC_MINT`, and `SOLANA_CHAIN_MODE`. The authority key stays on the server. It is the only signer of `record_achievement`.

Tests, from `solana/` with Rust, the Solana CLI, and Anchor 1.2.2:

```bash
npm install
anchor test --validator legacy
```

That uses a local validator and a test mint. It does not spend devnet SOL. API unit tests, from `api/`:

```bash
python -m unittest discover -s tests
```

**Devnet deploy status:** not deployed. The program id above comes from `solana/keys/examsprep-program.json`, which is in git so the address stays stable. Do not send SOL to that keypair. This change does not deploy, so the upgrade authority stays with whoever runs the script below.

On a machine that can receive devnet SOL, including GitHub Codespaces:

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
cd solana && ./scripts/deploy-devnet.sh
```

The script builds, deploys, initializes config, creates demo pool id `20261128` for devnet USDC when it is missing, and prints the program id, deploy signature, config PDA, and the Render env vars. It writes the authority and sponsor keys under `solana/.keys/`, which is gitignored. If the faucet refuses the airdrop, the script stops and prints the faucet steps. Put `SOLANA_AUTHORITY_KEYPAIR` on the API only. Do not commit it.

### Demo

- Demo video (under 3 minutes): add the link here before submission.
- Live demo: [https://www.examsprep.xyz](https://www.examsprep.xyz). Solana badges and pools appear after `SOLANA_AUTHORITY_KEYPAIR` is set on the API and the program is deployed. Until then the site behaves as it does today and those routes answer 503.

Operator guide: [docs/solana.md](docs/solana.md). Design notes: [docs/architecture/solana.md](docs/architecture/solana.md). Phone build and Fake Wallet: [mobile/README.md](mobile/README.md).

ExamSprint, the separate Android knowledge-challenge game, lives in [mobile-examsprint/](mobile-examsprint/README.md). It uses this API for sign-in and the question bank. Byte Arena and Pollar notes: [docs/byte.md](docs/byte.md), [docs/pollar.md](docs/pollar.md).
