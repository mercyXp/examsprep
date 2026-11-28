#!/usr/bin/env bash
# Build and deploy the ExamsPrep rewards program to Solana devnet.
#
# Usage, from the solana/ directory, or from anywhere:
#   ./scripts/deploy-devnet.sh
#
# Run this on a machine you control (GitHub Codespaces is the intended place).
# The script pays the deploy fee from ~/.config/solana/id.json. That wallet
# becomes the program upgrade authority. It is not the badge authority, and
# it is not the program keypair in keys/examsprep-program.json (that file is
# in git so the program id stays stable; do not fund it).
#
# GitHub Codespaces does not put the installer directories on PATH for you.
# This script adds them itself:
#   ~/.local/share/solana/install/active_release/bin
#   ~/.cargo/bin

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="${HOME}/.local/share/solana/install/active_release/bin:${HOME}/.cargo/bin:${HOME}/.local/bin:${PATH}"

PROGRAM_ID="Ebo9c8SiwLx37wXejAwQmx1vLv1YtR8kYVb2Lb6V8FVH"
USDC_MINT="4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
RPC_URL="https://api.devnet.solana.com"
KEYS_DIR="${ROOT}/.keys"
AUTHORITY_FILE="${KEYS_DIR}/authority.json"
SPONSOR_FILE="${KEYS_DIR}/sponsor.json"

if ! command -v solana >/dev/null 2>&1; then
  echo "The Solana CLI is not installed."
  echo "Install it with the official installer, then open a new shell or export PATH as below:"
  echo "  curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash"
  echo "  export PATH=\"\$HOME/.local/share/solana/install/active_release/bin:\$HOME/.cargo/bin:\$PATH\""
  exit 1
fi

if ! command -v anchor >/dev/null 2>&1; then
  echo "The Anchor CLI is not installed, or ~/.cargo/bin is not on PATH."
  echo "This program is built with Anchor 1.2.2. A matching Linux binary:"
  echo "  curl -fsSL -o \"\$HOME/.cargo/bin/anchor\" https://github.com/otter-sec/anchor/releases/download/v1.2.2/anchor-1.2.2-x86_64-unknown-linux-gnu"
  echo "  chmod +x \"\$HOME/.cargo/bin/anchor\""
  exit 1
fi

ANCHOR_VERSION="$(anchor --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
if [[ "${ANCHOR_VERSION}" != 1.2.* ]]; then
  echo "Anchor 1.2.x is required (found ${ANCHOR_VERSION})."
  echo "Install 1.2.2 next to your current CLI:"
  echo "  curl -fsSL -o \"\$HOME/.cargo/bin/anchor\" https://github.com/otter-sec/anchor/releases/download/v1.2.2/anchor-1.2.2-x86_64-unknown-linux-gnu"
  echo "  chmod +x \"\$HOME/.cargo/bin/anchor\""
  exit 1
fi

mkdir -p target/deploy
cp keys/examsprep-program.json target/deploy/examsprep-keypair.json

umask 077
mkdir -p "${KEYS_DIR}"
if [[ ! -f "${HOME}/.config/solana/id.json" ]]; then
  echo "Creating a deployer wallet at ~/.config/solana/id.json"
  solana-keygen new -o "${HOME}/.config/solana/id.json" --no-bip39-passphrase
fi
if [[ ! -f "${AUTHORITY_FILE}" ]]; then
  echo "Creating the backend authority key at ${AUTHORITY_FILE}"
  solana-keygen new -o "${AUTHORITY_FILE}" --no-bip39-passphrase
fi
if [[ ! -f "${SPONSOR_FILE}" ]]; then
  echo "Creating the sponsor key at ${SPONSOR_FILE}"
  solana-keygen new -o "${SPONSOR_FILE}" --no-bip39-passphrase
fi

PROGRAM_PUBKEY="$(solana-keygen pubkey keys/examsprep-program.json)"
AUTHORITY_PUBKEY="$(solana-keygen pubkey "${AUTHORITY_FILE}")"
SPONSOR_PUBKEY="$(solana-keygen pubkey "${SPONSOR_FILE}")"
if [[ "${AUTHORITY_PUBKEY}" == "${PROGRAM_PUBKEY}" || "${SPONSOR_PUBKEY}" == "${PROGRAM_PUBKEY}" ]]; then
  echo "Refusing to use the program keypair as the authority or the sponsor."
  echo "Those keys are in git. Delete ${KEYS_DIR} and run this script again."
  exit 1
fi

solana config set --url "${RPC_URL}" >/dev/null
DEPLOYER="$(solana address)"
echo "Deployer wallet:  ${DEPLOYER}"
echo "Authority wallet: ${AUTHORITY_PUBKEY}"
echo "Sponsor wallet:   ${SPONSOR_PUBKEY}"
echo "Program id:       ${PROGRAM_ID}"

airdrop_if_needed() {
  local pubkey="$1"
  local label="$2"
  local balance
  balance="$(solana balance "${pubkey}" | awk '{print $1}')"
  local enough
  enough="$(python3 -c "import sys; print('yes' if float(sys.argv[1]) >= 1.5 else 'no')" "${balance}")"
  if [[ "${enough}" == "yes" ]]; then
    echo "${label} balance is ${balance} SOL."
    return 0
  fi
  echo "${label} balance is ${balance} SOL. Requesting a devnet airdrop of 2 SOL..."
  if ! solana airdrop 2 "${pubkey}" --url "${RPC_URL}"; then
    echo
    echo "Devnet airdrop did not succeed for ${label} (${pubkey})."
    echo "The public faucet often rate-limits this. Do these steps, then run the script again:"
    echo
    echo "  1. solana config set --url ${RPC_URL}"
    echo "  2. Open https://faucet.solana.com and request devnet SOL for:"
    echo "       ${pubkey}"
    echo "     Or retry: solana airdrop 1 ${pubkey} --url ${RPC_URL}"
    echo "  3. solana balance ${pubkey}"
    echo "     Wait until it shows at least 1.5 SOL."
    echo "  4. cd solana && ./scripts/deploy-devnet.sh"
    echo
    return 1
  fi
}

airdrop_if_needed "${DEPLOYER}" "Deployer"

if [[ ! -d node_modules ]]; then
  npm install
fi

echo "Building the program..."
anchor build

DEPLOY_LOG="$(mktemp)"
echo "Deploying to devnet. The upgrade authority will be ${DEPLOYER}."
anchor deploy --provider.cluster devnet --provider.wallet "${HOME}/.config/solana/id.json" | tee "${DEPLOY_LOG}"
DEPLOY_SIGNATURE="$(grep -E 'Signature:' "${DEPLOY_LOG}" | tail -1 | awk '{print $NF}' || true)"

# The authority pays rent for the config account, the demo pool, and the vault.
if ! airdrop_if_needed "${AUTHORITY_PUBKEY}" "Authority"; then
  echo "Deploy succeeded, but the authority wallet still needs SOL before config can be initialized."
  echo "Deploy signature: ${DEPLOY_SIGNATURE:-unknown}"
  node scripts/print-addresses.mjs || true
  echo "After the authority wallet has SOL, run this script again. It will skip the upgrade if the program is unchanged and continue with initialize."
  exit 1
fi

echo "Initializing config and the devnet USDC demo pool (skipped if they already exist)..."
AUTHORITY_KEYPAIR="${AUTHORITY_FILE}" \
  SPONSOR_KEYPAIR="${SPONSOR_FILE}" \
  DEPLOY_SIGNATURE="${DEPLOY_SIGNATURE}" \
  SOLANA_RPC_URL="${RPC_URL}" \
  node scripts/post-deploy.mjs

echo
echo "Render environment variables for the API service."
echo "Paste these into Render. Do not commit them and do not put them on Vercel."
echo "SOLANA_AUTHORITY_KEYPAIR and SOLANA_SPONSOR_KEYPAIR are secret keys."
echo
echo "SOLANA_RPC_URL=${RPC_URL}"
echo "SOLANA_PROGRAM_ID=${PROGRAM_ID}"
echo "SOLANA_USDC_MINT=${USDC_MINT}"
echo "SOLANA_CHAIN_MODE="
echo "SOLANA_AUTHORITY_KEYPAIR=$(tr -d '[:space:]' < "${AUTHORITY_FILE}")"
echo "SOLANA_SPONSOR_KEYPAIR=$(tr -d '[:space:]' < "${SPONSOR_FILE}")"
echo
echo "Authority file (gitignored): ${AUTHORITY_FILE}"
echo "Sponsor file (gitignored):   ${SPONSOR_FILE}"
echo "Devnet USDC for the sponsor, if the pool was created empty: https://faucet.circle.com/"
echo "Send it to ${SPONSOR_PUBKEY}, then run this script again to fund the demo pool."
