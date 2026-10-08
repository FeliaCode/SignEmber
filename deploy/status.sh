#!/bin/sh
# What is deployed and what each wallet holds:  KEYS=./keys sh deploy/status.sh
set -u
export PATH=$HOME/.local/share/solana/install/active_release/bin:$PATH
. /etc/ember.env 2>/dev/null || true
URL=${SOLANA_RPC_URL:-https://api.devnet.solana.com}
K=${KEYS:-./keys}
pk() { solana-keygen pubkey "$K/$1.json" 2>/dev/null; }
bal() { solana balance "$1" -u "$URL" 2>/dev/null || echo "?"; }
usdc() { spl-token balance "${NEXT_PUBLIC_USDC_MINT}" --owner "$1" -u "$URL" 2>/dev/null || echo 0; }
echo "network: ${NEXT_PUBLIC_SOLANA_NETWORK}  rpc: $URL  facilitator: ${X402_FACILITATOR_URL:-local}"
echo "site: $(curl -s -o /dev/null -w '%{http_code}' ${NEXT_PUBLIC_APP_URL})  live slot port: $(sed -n 's/.*ember_port \([0-9]*\);.*/\1/p' /etc/nginx/snippets/ember-port.conf)"
P=$(pk ember_limiter-keypair)
if solana program show "$P" -u "$URL" >/dev/null 2>&1; then echo "limiter program $P: DEPLOYED"; else echo "limiter program $P: not deployed  -> sh program/deploy.sh <net>   (deployer needs ~1.7 SOL briefly, ~0.8 stays as rent)"; fi
printf "%-14s %-46s %-14s %s\n" wallet address SOL USDC
for w in deployer gas-treasury test-ada test-bob; do a=$(pk $w); printf "%-14s %-46s %-14s %s\n" "$w" "$a" "$(bal $a)" "$(usdc $a)"; done
echo "needs: deployer ~1.7 SOL (program), gas-treasury ~0.1 SOL (agent wallets + x402 fees), test-ada ~0.02 SOL, test-bob ~0.03 SOL + ~3 USDC"
