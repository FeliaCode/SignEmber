#!/bin/sh
# Switch Ember between Solana devnet and mainnet, then redeploy (zero downtime).
#   sh deploy/use-network.sh devnet | mainnet
# The browser reaches Solana through /api/rpc, so the RPC key stays server-side.
# Mainnet uses EmberSign's in-process x402 facilitator (fees paid by the gas treasury); devnet uses x402.org's.
set -eu
NET=${1:?devnet or mainnet}
F=/etc/ember.env
cp "$F" "$F.bak_$(date +%Y%m%d_%H%M%S)"
set_kv() { sed -i "/^$1=/d" "$F"; echo "$1=$2" >> "$F"; }
case "$NET" in
  devnet)
    set_kv SOLANA_RPC_URL https://api.devnet.solana.com
    set_kv NEXT_PUBLIC_SOLANA_NETWORK solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1
    set_kv NEXT_PUBLIC_EXPLORER_CLUSTER devnet
    set_kv NEXT_PUBLIC_USDC_MINT 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
    set_kv X402_FACILITATOR_URL https://x402.org/facilitator ;;
  mainnet)
    RPC=${MAINNET_RPC_URL:-https://mainnet.helius-rpc.com/?api-key=$(cat ${KEYS:-./keys}/helius.key)}
    set_kv SOLANA_RPC_URL "$RPC"
    set_kv NEXT_PUBLIC_SOLANA_NETWORK solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp
    set_kv NEXT_PUBLIC_EXPLORER_CLUSTER mainnet-beta
    set_kv NEXT_PUBLIC_USDC_MINT EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
    set_kv X402_FACILITATOR_URL local ;;
  *) echo "devnet or mainnet"; exit 1 ;;
esac
cd "${SRC:-$(pwd)}" && sh deploy/deploy.sh
