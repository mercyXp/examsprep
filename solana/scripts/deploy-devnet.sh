#!/usr/bin/env bash
# Deploy the ExamsPrep program to Solana devnet in one command.
#
# Usage, from the solana/ directory:
#   ./scripts/deploy-devnet.sh
#
# The program id is already chosen (keys/examsprep-program.json). This script
# pays the deploy fee from your Solana CLI wallet (~/.config/solana/id.json),
# which is a different key from the badge authority. Do not put prize money
# on the program keypair: that file is in the git repo so the address stays
# stable, so anyone can see it.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="${HOME}/.local/share/solana/install/active_release/bin:${HOME}/.local/bin:${PATH}"

if ! command -v solana >/dev/null 2>&1; then
  echo "The Solana CLI is not installed."
  echo "Install it, then run this script again:"
  echo "  sh -c \"\$(curl -sSfL https://release.anza.xyz/stable/install)\""
  exit 1
fi

if ! command -v anchor >/dev/null 2>&1; then
  echo "The Anchor CLI is not installed."
  echo "Install Anchor 1.2.2, then run this script again:"
  echo "  https://www.anchor-lang.com/docs/installation"
  exit 1
fi

mkdir -p target/deploy
cp keys/examsprep-program.json target/deploy/examsprep-keypair.json

solana config set --url https://api.devnet.solana.com >/dev/null
DEPLOYER="$(solana address)"
echo "Deployer wallet: ${DEPLOYER}"
echo "Program id:      Ebo9c8SiwLx37wXejAwQmx1vLv1YtR8kYVb2Lb6V8FVH"

# `solana balance` prints a line like "1.5 SOL". A new wallet prints "0 SOL".
BALANCE_SOL="$(solana balance | awk '{print $1}')"
ENOUGH="$(python3 -c "import sys; print('yes' if float(sys.argv[1]) >= 1.5 else 'no')" "${BALANCE_SOL}")"

if [[ "${ENOUGH}" != "yes" ]]; then
  echo "Balance is ${BALANCE_SOL} SOL. Requesting a devnet airdrop of 2 SOL..."
  if ! solana airdrop 2; then
    echo
    echo "Devnet airdrop did not succeed. The public faucet often rate-limits this."
    echo "Do these steps, then run ./scripts/deploy-devnet.sh again:"
    echo
    echo "  1. solana config set --url https://api.devnet.solana.com"
    echo "  2. solana address"
    echo "     Copy that address."
    echo "  3. Open https://faucet.solana.com and request devnet SOL for that address."
    echo "     If the website is capped, try again later, or from another network:"
    echo "       solana airdrop 1 ${DEPLOYER} --url https://api.devnet.solana.com"
    echo "  4. solana balance"
    echo "     Wait until it shows at least 1.5 SOL. Deploying a program costs more than a transfer."
    echo "  5. cd solana && ./scripts/deploy-devnet.sh"
    echo
    echo "Nothing was deployed."
    exit 1
  fi
fi

if [[ ! -d node_modules ]]; then
  npm install
fi

echo "Building and deploying to devnet..."
anchor build
anchor deploy --provider.cluster devnet --provider.wallet "${HOME}/.config/solana/id.json"

echo
echo "Deployed. Addresses:"
node scripts/print-addresses.mjs
echo
echo "Next, on the API host, create a separate authority key (do not use the program keypair):"
echo "  solana-keygen new -o authority.json --no-bip39-passphrase"
echo "  solana airdrop 1 <authority pubkey> --url devnet   # or use the faucet steps above"
echo "  Put the contents of authority.json in SOLANA_AUTHORITY_KEYPAIR."
echo "Devnet USDC mint: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
