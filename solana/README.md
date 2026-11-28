# ExamsPrep on Solana

This folder is the on-chain half of the hackathon entry. It is an [Anchor](https://www.anchor-lang.com/) program. If you have not written Rust before, read this page first, then `programs/examsprep/src/lib.rs`. The comments in that file explain each word the first time it matters.

## What the program does

Two things, and only these two:

1. **Badges.** A badge is an account that says a student wallet earned something: a topic, a passed mock exam, a study streak, or a weekly leaderboard place. Students cannot create these accounts. Only the backend **authority** key can.
2. **Prize pools.** A sponsor locks USDC in an escrow account owned by the program. The authority records what each student may claim. A claim pays that amount once and writes a receipt. An administrator can also pay the top students in one batch, or close the pool and return what is left.

The program id, which is the address of the code itself, is:

```text
Ebo9c8SiwLx37wXejAwQmx1vLv1YtR8kYVb2Lb6V8FVH
```

The config account (created once by `initialize`, and the place the authority public key is stored) is:

```text
kkStmSTS4zYhJNCMj9umfUbyfAU1yUnpaWcK3ZX8EG8
```

Devnet USDC, the token the prize pools are meant to hold:

```text
4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
```

`keys/examsprep-program.json` is the keypair for that program id. It is in git so every clone deploys the same address. It is **not** the badge authority, and it should not hold SOL or USDC. Anyone can see it.

## Words

| Word | Plain meaning |
| --- | --- |
| Program | The deployed code. It does not have its own private memory. |
| Account | A piece of data on the chain. Transactions pass accounts in. |
| PDA | An address computed from seeds and the program id. No person holds its secret key. The program can still sign for it, which is how the escrow sends USDC. |
| Authority | The one wallet allowed to award badges and pay winners. Its secret stays in `SOLANA_AUTHORITY_KEYPAIR` on the API. |
| Mint | The definition of a token. USDC is one mint. A test token in the unit tests is another. |
| Base units | The integer the chain stores. USDC has 6 decimals, so 1 USDC is `1000000`. |

Badge kind bytes, also listed at the top of `lib.rs`:

| Byte | Kind |
| --- | --- |
| 0 | Topic mastered |
| 1 | Mock exam passed |
| 2 | Study streak |
| 3 | Weekly leaderboard |

## Tests

From this folder, with Rust, the Solana CLI, and Anchor 1.2.2 installed:

```bash
npm install
anchor test --validator legacy
```

That boots a local validator, deploys the program, and runs `tests/examsprep.ts`. It does not spend devnet SOL. The test mints its own 6-decimal token so it can move funds without Circle's USDC faucet. The rewards cases cover init, create, fund, record achievement, claim, a duplicate claim, an unauthorised issuer, a wrong mint, a short vault, a wrong authority, and close.

## Deploy to devnet

One command, after the Solana CLI and Anchor 1.2.x are on `PATH` (Codespaces needs the two directories below):

```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
./scripts/deploy-devnet.sh
```

Install Solana with:

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash
```

The script points the CLI at devnet, creates `~/.config/solana/id.json` when you do not already have a deployer wallet, and asks for an airdrop when that wallet is under 1.5 SOL. It then builds, deploys, initializes config, and creates demo pool `20261128` for devnet USDC if needed. Authority and sponsor keys are written to `.keys/`, which is gitignored. The script prints the program id, deploy signature, config PDA, and the Render env vars, including `SOLANA_AUTHORITY_KEYPAIR`. Do not commit that key.

If the airdrop is refused, the script stops and prints the faucet steps. Request devnet SOL at [https://faucet.solana.com](https://faucet.solana.com), then run the script again.

To print the program id and config PDA without deploying:

```bash
node scripts/print-addresses.mjs
```

The operator guide is [docs/solana.md](../docs/solana.md). How the API and the phone use the program is [docs/architecture/solana.md](../docs/architecture/solana.md).
