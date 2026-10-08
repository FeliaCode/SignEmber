"use client";
import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { api } from "@/lib/client";
import { Button } from "./ui";

/** Connect a wallet, then sign in with a SIWS message (moves nothing). */
export function Connect({ onSignedIn, label = "Connect wallet" }: { onSignedIn?: () => void; label?: string }) {
  const { wallets, select, connect, connected, publicKey, signMessage, wallet } = useWallet();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const installed = wallets.filter((w) => w.readyState === "Installed" || w.readyState === "Loadable");

  async function signIn() {
    if (!publicKey || !signMessage) return setErr("This wallet cannot sign messages.");
    setBusy(true);
    setErr(null);
    try {
      const { message } = await api<{ message: string }>("/api/auth/nonce", { json: { address: publicKey.toBase58() } });
      const sig = await signMessage(new TextEncoder().encode(message));
      await api("/api/auth/verify", { json: { address: publicKey.toBase58(), message, signature: bs58.encode(sig) } });
      onSignedIn?.();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (connected && publicKey) {
    return (
      <div className="flex flex-col items-start gap-2">
        <Button size="lg" onClick={signIn} disabled={busy}>
          {busy ? "Waiting for your wallet…" : `Sign in as ${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`}
        </Button>
        <p className="text-xs text-muted-foreground">Signing in is a message signature. It moves nothing.</p>
        {err && <p className="text-sm text-destructive">{err}</p>}
      </div>
    );
  }

  return (
    <div className="relative inline-block">
      <Button size="lg" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {wallet && !connected ? `Connecting ${wallet.adapter.name}…` : label}
      </Button>
      {open && (
        <div className="absolute z-20 mt-2 w-64 rounded-md border border-border bg-card p-2 shadow-md">
          {installed.length === 0 && <p className="p-2 text-sm text-muted-foreground">No Solana wallet found. Install Phantom, Solflare or Backpack, then reload.</p>}
          {installed.map((w) => (
            <button
              key={w.adapter.name}
              className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-sm hover:bg-secondary"
              onClick={async () => {
                setOpen(false);
                select(w.adapter.name);
                try {
                  await connect();
                } catch {
                  /* autoConnect picks it up after select */
                }
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={w.adapter.icon} alt="" width={20} height={20} />
              {w.adapter.name}
            </button>
          ))}
        </div>
      )}
      {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
    </div>
  );
}
