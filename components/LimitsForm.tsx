"use client";
import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { createApproveInstruction, createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { allowancePda, configureIx } from "@/lib/limiter";
import { api, explorerTx, signSendConfirm, type Me } from "@/lib/client";
import { Button, Input, Label, Notice } from "./ui";

const PRESETS = [1, 5, 20, 30];
export const MAX_DAILY_USD = 30; // the program rejects more
const units = (usd: number) => BigInt(Math.round(usd * 1e6));

function Stepper({ id, label, value, onChange, step, max }: { id: string; label: string; value: number; onChange: (v: number) => void; step: number; max?: number }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" aria-label={`Lower ${label}`} onClick={() => onChange(Math.max(0, +(value - step).toFixed(2)))}>
          −
        </Button>
        <Input id={id} type="number" min={0} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="text-center tabular" />
        <Button type="button" variant="secondary" aria-label={`Raise ${label}`} onClick={() => onChange(Math.min(max ?? Infinity, +(value + step).toFixed(2)))}>
          +
        </Button>
      </div>
    </div>
  );
}

/** Daily + per-payment caps and ask-above, then ONE wallet transaction: approve the limiter PDA, configure. */
export function LimitsForm({ me, onDone, submitLabel = "Approve and set limits" }: { me: Me; onDone: () => void; submitLabel?: string }) {
  const { publicKey, signTransaction } = useWallet();
  const [daily, setDaily] = useState(me.dailyCapUsd || 5);
  const [perTx, setPerTx] = useState(me.perTxCapUsd || 1);
  const [askAbove, setAskAbove] = useState(me.askAboveUsd ?? 0.05);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const invalid =
    daily > MAX_DAILY_USD ? `The daily cap can be at most $${MAX_DAILY_USD}.` : perTx > daily ? "The per-payment cap can't be above the daily cap." : daily <= 0 ? "Set a daily cap above $0." : null;

  async function submit() {
    if (!publicKey || !signTransaction) return setErr("Connect the wallet you signed in with.");
    if (publicKey.toBase58() !== me.address) return setErr("The connected wallet is not the one you signed in with.");
    if (!me.agent) return setErr("Your agent wallet isn't ready yet; reload in a moment.");
    setErr(null);
    try {
      setBusy("Saving your ask-above amount…");
      await api("/api/settings", { method: "PATCH", json: { askAboveUsd: askAbove } });
      setBusy("Approve in your wallet…");
      const owner = new PublicKey(me.address);
      const mint = new PublicKey(me.usdcMint);
      const ata = getAssociatedTokenAddressSync(mint, owner);
      const tx = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(owner, ata, owner, mint),
        createApproveInstruction(ata, allowancePda(owner), owner, units(daily * 7)),
        configureIx(owner, new PublicKey(me.agent), units(daily), units(perTx)),
      );
      tx.feePayer = owner;
      setSig(await signSendConfirm(tx, signTransaction));
      setBusy(null);
      onDone();
    } catch (e) {
      setBusy(null);
      setErr((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button key={p} type="button" variant={daily === p ? "primary" : "secondary"} size="sm" onClick={() => { setDaily(p); setPerTx(Math.min(perTx, p)); }}>
            ${p} a day
          </Button>
        ))}
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <Stepper id="daily" label={`Daily cap (USD, max $${MAX_DAILY_USD})`} value={daily} onChange={setDaily} step={1} max={MAX_DAILY_USD} />
        <Stepper id="pertx" label="Per payment (USD)" value={perTx} onChange={setPerTx} step={0.25} max={daily} />
        <Stepper id="ask" label="Ask me above (USD)" value={askAbove} onChange={setAskAbove} step={0.05} />
      </div>
      <Notice>
        Worst case, even if EmberSign's servers were compromised: <strong>${daily.toFixed(2)} a day</strong> leaves your wallet, never more than ${perTx.toFixed(2)} at once. You approve ${(daily * 7).toFixed(2)} (a week of caps) and can revoke with one signature. The day resets at 00:00 UTC, so up to twice the cap can move across midnight.
      </Notice>
      {invalid && <p className="text-sm text-destructive">{invalid}</p>}
      {err && <p className="text-sm text-destructive">{err}</p>}
      <div className="flex flex-wrap items-center gap-4">
        <Button size="lg" onClick={submit} disabled={!!busy || !!invalid}>
          {busy ?? submitLabel}
        </Button>
        {sig && (
          <a className="text-sm underline underline-offset-4" href={explorerTx(sig)} target="_blank" rel="noreferrer">
            View transaction
          </a>
        )}
      </div>
    </div>
  );
}
