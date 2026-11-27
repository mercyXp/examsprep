# ExamsPrep on Solana

This folder is the on-chain half of the hackathon entry. It is an [Anchor](https://www.anchor-lang.com/) program. If you have not written Rust before, read this page first, then `programs/examsprep/src/lib.rs`. The comments in that file explain each word the first time it matters.

## What the program does

Two things, and only these two:

1. **Badges.** A badge is an account that says a student wallet earned something: a topic, a passed mock exam, a study streak, or a weekly leaderboard place. Students cannot create these accounts. Only the backend **authority** key can.
2. **Prize pools.** A sponsor locks USDC in an escrow account owned by the program. Later the authority names the winners and the program pays them from that escrow.

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

That boots a local validator, deploys the program, and runs `tests/examsprep.ts`. It does not spend devnet SOL. The test mints its own 6-decimal token so it can move funds without Circle's USDC faucet.

## Deploy to devnet

One command:

```bash
./scripts/deploy-devnet.sh
```

The script points the Solana CLI at devnet, asks for an airdrop if the deployer wallet has under 1.5 SOL, builds, and deploys. The deployer wallet is `~/.config/solana/id.json`, which you create with:

```bash
solana-keygen new -o ~/.config/solana/id.json --no-bip39-passphrase
```

If the airdrop is refused (the public faucet does this often), the script stops and prints these steps. Do them, then run the script again:

1. `solana config set --url https://api.devnet.solana.com`
2. `solana address` and copy the address.
3. Open [https://faucet.solana.com](https://faucet.solana.com) and request **devnet** SOL for that address. If the site is capped, wait and retry, or run `solana airdrop 1 <address> --url https://api.devnet.solana.com`.
4. `solana balance` should show at least 1.5 SOL. Deploying a program costs more than a transfer.
5. `cd solana && ./scripts/deploy-devnet.sh`

After a successful deploy, create a **separate** authority key and fund it with a little SOL so it can pay rent for badge accounts:

```bash
solana-keygen new -o authority.json --no-bip39-passphrase
solana airdrop 1 "$(solana-keygen pubkey authority.json)" --url devnet
```

Put the contents of `authority.json` in `SOLANA_AUTHORITY_KEYPAIR` on the API. Do not commit that file.

To print the program id and config PDA again:

```bash
node scripts/print-addresses.mjs
```

The longer explanation of how the API and the phone use this program is [docs/architecture/solana.md](../docs/architecture/solana.md).
