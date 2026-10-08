"use client";
import { useMemo, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { rpcEndpoint } from "@/lib/client";

// Wallet Standard auto-detects Phantom, Solflare, Backpack and others; no adapter list needed.
export function Providers({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => [], []);
  const endpoint = useMemo(() => rpcEndpoint(), []);
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
