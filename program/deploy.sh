#!/bin/sh
# Build and deploy EmberLimiter. Keypairs live in $KEYS (default ./keys, never committed).
#   sh program/deploy.sh devnet            # build (devnet USDC) + deploy
#   sh program/deploy.sh mainnet           # build with --features mainnet (mainnet USDC) + deploy
#   sh program/deploy.sh mainnet --final   # after review: remove the upgrade authority forever (no admin, no upgrades)
# Cost: rent for the program (~0.8 SOL at current rent, locked while the program exists) plus a temporary buffer
# of the same size that is refunded when the deploy finishes, and a few transaction fees.
set -eu
NET=${1:?devnet or mainnet}
FINAL=${2:-}
export PATH=$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH
KEYS=${KEYS:-./keys}
HERE=$(cd "$(dirname "$0")" && pwd)
case "$NET" in
  devnet) URL=https://api.devnet.solana.com; FEAT="" ;;
  mainnet) URL=${MAINNET_RPC_URL:-https://mainnet.helius-rpc.com/?api-key=$(cat "$KEYS/helius.key")}; FEAT="--features mainnet" ;;
  *) echo "devnet or mainnet"; exit 1 ;;
esac
PROGRAM_ID=$(solana-keygen pubkey "$KEYS/ember_limiter-keypair.json")

if [ "$FINAL" = "--final" ]; then
  solana program set-upgrade-authority "$PROGRAM_ID" --final -u "$URL" -k "$KEYS/deployer.json"
  solana program show "$PROGRAM_ID" -u "$URL" | grep -i authority
  exit 0
fi

OUT="$HERE/target/deploy-$NET"
mkdir -p "$OUT"
( cd "$HERE" && nice cargo-build-sbf $FEAT --sbf-out-dir "$OUT" -- -j 2 2>&1 | grep -E "^error|Finished" )
SO="$OUT/ember_limiter.so"
SIZE=$(stat -c %s "$SO")
echo "program $PROGRAM_ID  $NET  $SIZE bytes"
echo "deployer $(solana-keygen pubkey "$KEYS/deployer.json") balance: $(solana balance -u "$URL" -k "$KEYS/deployer.json")"
echo "rent needed (program): $(solana rent "$SIZE" -u "$URL" | head -1)"
solana program deploy "$SO" \
  --program-id "$KEYS/ember_limiter-keypair.json" \
  --keypair "$KEYS/deployer.json" \
  --upgrade-authority "$KEYS/deployer.json" \
  --max-len "$SIZE" \
  --with-compute-unit-price 20000 \
  -u "$URL"
solana program show "$PROGRAM_ID" -u "$URL" -k "$KEYS/deployer.json"
