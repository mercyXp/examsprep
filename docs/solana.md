# ExamsPrep rewards on Solana

The on-chain program is the ExamsPrep Rewards Protocol. FastAPI stays the source of truth for who a student is and what they studied. The program stores badges and USDC escrow. It does not store a name, an email, a lesson, or an exam answer.

The program is not deployed yet. Deploy is a manual step for the owner, described at the bottom. The program id is already fixed by `solana/keys/examsprep-program.json`.

| | Address |
| --- | --- |
| Program | `Ebo9c8SiwLx37wXejAwQmx1vLv1YtR8kYVb2Lb6V8FVH` |
| Config PDA | `kkStmSTS4zYhJNCMj9umfUbyfAU1yUnpaWcK3ZX8EG8` |
| Devnet USDC mint | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |

The config account exists only after `initialize` (or `initialize_config`). The API sends `initialize` the first time it awards a badge or opens a pool. The deploy script sends `initialize_config` itself.

## Architecture

```text
Android app                         Next.js
  email / Google / lessons            admin rewards page
        \                             /
         +-------- FastAPI -----------+
                     |  SOLANA_AUTHORITY_KEYPAIR (server only)
                     v
              Anchor program
              achievements + USDC vault
```

The phone uses Mobile Wallet Adapter to sign the wallet-link sentence. That signature proves the student controls the wallet. It does not move SOL or USDC.

Badge claims and prize claims are built and submitted by the API. The authority key signs them. The phone does not sign those transactions, and the API does not return an unsigned transaction for them. That matches the badge claim the app already calls (`POST /api/badges/claim`).

Before the authority key is used, the API decides eligibility from its own tables:

| Achievement | Rule | Kind byte |
| --- | --- | --- |
| Topic mastered | Every published lesson in the module is complete. Subject key `programme-slug:module-code`. | 0 |
| Mock exam passed | A submitted mock with `passed = true`. The best score is kept. | 1 |
| Study streak | Three or more consecutive UTC study days, ending today or yesterday. | 2 |
| Weekly leaderboard | Ranked inside a pool's period. Best score on each quiz, then lessons completed, then who finished earlier. | 3 |

The subject stored on-chain is SHA-256 of that subject key, not the key itself. `detail` is a count, a percent, a streak length, or a rank.

A programme administrator can manage pools only for a programme they are assigned to. A pool with no programme is platform-wide and only a super administrator can manage it. Creators and students get 403. The check is `assert_pool_admin` in `api/app/solana/gates.py`.

## Instructions

The first name in each row is the one the API sends today. Where a rewards-protocol name is listed beside it, both names run the same handler and write the same accounts.

| Instruction | Signer | Effect |
| --- | --- | --- |
| `initialize`, `initialize_config` | Authority | Creates the config account. The signer becomes the only authority. |
| `award_badge` | Authority | Creates a student achievement with prize amount 0. Fails if that achievement already exists. |
| `record_achievement` | Authority | Creates the same kind of account and stores `pool_id` plus a claimable amount. A non-zero amount requires a non-zero pool id. |
| `create_pool`, `create_reward_pool` | Authority | Creates the pool and an empty vault. The vault's owner is the pool PDA. |
| `fund_pool`, `fund_reward_pool` | Sponsor | Moves tokens of the pool's mint into the vault. The mint account must be the pool's mint. Amount must be greater than zero. Rejected after the pool is closed, batch-paid, or a claim has landed. |
| `claim_reward` | Authority | Pays the achievement's amount from the vault to the student's token account and creates a claim receipt. Rejected if the signer is not the authority, the mint does not match, the amount does not match the achievement, the vault is short, the pool is closed or already batch-paid, or the receipt already exists. |
| `pay_winners` | Authority | Pays a list of winner token accounts and sets the pool as distributed. Rejected if any `claim_reward` has already increased `total_claimed`. |
| `close_reward_pool` | Authority | Sets the pool closed. Any tokens still in the vault go to the sponsor (or to the authority if the pool was never funded). |

`claim_reward` and `pay_winners` are alternative ways to empty a pool. A pool that students have started claiming cannot be batch-paid, and a settled pool cannot be claimed.

## Accounts

Every account below is a program-derived address. No person holds the private key. The program signs for the pool PDA when it moves tokens out of the vault.

| Account | Seeds | Stored |
| --- | --- | --- |
| Config | `["config"]` | Authority pubkey, bump |
| Student achievement | `["badge", wallet, kind byte, 32-byte subject hash]` | Wallet, kind, hash, detail, time, pool id, amount, bump |
| Reward pool | `["pool", pool id as u64 little-endian]` | Authority, sponsor, pool id, mint, vault, period, top N, funded total, claimed total, flags, bumps |
| Reward vault | `["vault", pool address]` | SPL token account. Owner is the pool PDA. |
| Claim receipt | `["receipt", pool address, wallet]` | Pool, wallet, achievement, amount, time, bump |

Creating the receipt is what makes a second claim fail. The account is initialized once. A second `claim_reward` for the same student and pool cannot create it again.

The vault authority is the pool PDA, not a person's wallet. `fund_reward_pool` checks the mint, the sponsor token account's mint and owner, and that the sponsor is not sending the vault to itself.

## API

| Method | Path | Who | Chain |
| --- | --- | --- | --- |
| GET | `/api/solana/status` | Public | None. No secrets. |
| POST | `/api/wallet/challenge` | Signed in | None. Returns the sentence to sign. |
| POST | `/api/wallet/link` | Signed in | None. Checks the Mobile Wallet Adapter signature. |
| GET | `/api/badges/me` | Signed in | None. Held badges and ones the API would accept. |
| POST | `/api/badges/claim` | Student with a linked wallet | `award_badge`, after an eligibility check. |
| GET | `/api/badges/verify/{wallet}` | Public | None. First name only, not an email. |
| POST | `/api/admin/pools` | Super admin or programme admin | `create_pool` |
| POST | `/api/admin/pools/{id}/fund` | Same | `fund_pool`, signed by `SOLANA_SPONSOR_KEYPAIR` |
| POST | `/api/admin/pools/{id}/settle` | Same | `pay_winners`, then `record_achievement` for each paid student |
| POST | `/api/pools/{id}/claim` | Student with a linked wallet | `record_achievement` and `claim_reward` in one transaction |
| POST | `/api/admin/pools/{id}/close` | Super admin or programme admin | `close_reward_pool` |

`POST /api/pools/{id}/claim` does not take an amount from the client. The API ranks the period, keeps students who linked a wallet inside the top N, and splits the funded total. The first linked student gets any remainder. The claim is rejected when the period has not ended, the pool is not funded, the student is outside that payable set, or they already have a paid row. The program then rejects a second claim, a mint mismatch, a short vault, and a signer that is not the authority.

`SOLANA_CHAIN_MODE=record` stores those calls and does not contact a cluster. `off`, or an empty authority key, makes chain routes answer 503.

## Environment variables

Set these on the API service on Render. Not on Vercel. Not in the mobile app.

| Variable | Purpose |
| --- | --- |
| `SOLANA_RPC_URL` | Default `https://api.devnet.solana.com` |
| `SOLANA_PROGRAM_ID` | `Ebo9c8SiwLx37wXejAwQmx1vLv1YtR8kYVb2Lb6V8FVH` |
| `SOLANA_AUTHORITY_KEYPAIR` | JSON array of the authority secret. Signs badges, achievements, claims, and closing. Server only. |
| `SOLANA_SPONSOR_KEYPAIR` | JSON array of the wallet that locks USDC when an admin funds a pool. |
| `SOLANA_USDC_MINT` | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` on devnet |
| `SOLANA_CHAIN_MODE` | Empty means live when the authority key is set. `record` does not contact the cluster. `off` refuses chain calls. |

The program accepts any SPL token mint so the tests can mint their own 6-decimal token. Pools created by the API use `SOLANA_USDC_MINT`.

## Tests

From `solana/`, with Rust 1.89, the Solana CLI, and Anchor CLI 1.2.2:

```bash
npm install
anchor test --validator legacy
```

`anchor test` boots a local validator, deploys the program, and runs `solana/tests/examsprep.ts`. The cases cover init, pool create, fund, achievement issue, a successful claim, a duplicate claim, unauthorised issuance, an invalid mint, an insufficient vault, an invalid authority, and closing a pool. The older badge and `pay_winners` cases still run.

From `api/`:

```bash
python -m unittest discover -s tests
```

Those tests do not need a validator. They check eligibility, the prize split, wallet signatures, and that the instruction bytes match the Anchor discriminators.

## Deploy to devnet

Do this yourself. The script uses your deployer wallet (`~/.config/solana/id.json`) as the upgrade authority. A key generated by someone else would leave them able to upgrade the program.

GitHub Codespaces needs the installer directories on `PATH`. The script adds them, but a new shell needs the export too.

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
```

Anchor 1.2.x has to match the crate in `solana/programs/examsprep/Cargo.toml`. On Linux:

```bash
curl -fsSL -o "$HOME/.cargo/bin/anchor" \
  https://github.com/otter-sec/anchor/releases/download/v1.2.2/anchor-1.2.2-x86_64-unknown-linux-gnu
chmod +x "$HOME/.cargo/bin/anchor"
```

Then:

```bash
cd solana
./scripts/deploy-devnet.sh
```

The script:

1. Points the Solana CLI at devnet.
2. Creates `~/.config/solana/id.json` if you do not have a deployer wallet.
3. Creates `solana/.keys/authority.json` and `solana/.keys/sponsor.json` if they are missing. Both paths are gitignored. The script refuses to use the program keypair for either role.
4. Asks the devnet faucet for SOL when a wallet is under 1.5 SOL.
5. Builds and deploys.
6. Initializes config, creates demo pool id `20261128` for the devnet USDC mint if it is missing, and funds it only when the sponsor already holds USDC.
7. Prints the program id, deploy signature, config PDA, pool PDA, vault PDA, and the Render env vars.

If the faucet returns an error, nothing is deployed (or, if deploy already succeeded, config is left for the next run). Request devnet SOL at [https://faucet.solana.com](https://faucet.solana.com) for the address the script prints, then run it again. Devnet USDC for the sponsor comes from [Circle's faucet](https://faucet.circle.com/). Send it to the sponsor address the script prints and run the script again to fund the demo pool.

Copy `SOLANA_AUTHORITY_KEYPAIR` and `SOLANA_SPONSOR_KEYPAIR` from the script output into the Render API service. Do not commit those files. Do not set them on Vercel.

To print the program id and config PDA without deploying:

```bash
node scripts/print-addresses.mjs
```
