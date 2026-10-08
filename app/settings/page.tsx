"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { createRevokeInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Shell } from "@/components/Shell";
import { LimitsForm } from "@/components/LimitsForm";
import { Button, Card, Copy, H2, Input, Mono, Notice } from "@/components/ui";
import { revokeIx } from "@/lib/limiter";
import { api, explorerAddr, explorerTx, short, signSendConfirm, useJson, type Me } from "@/lib/client";

interface Key {
  id: string;
  name: string;
  prefix: string;
  scope: string;
  lastUsedAt: string | null;
  createdAt: string;
}

function Allowlist() {
  const { data, reload } = useJson<string[]>("/api/allowlist");
  const [host, setHost] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card className="p-6">
      <H2 sub="Outside x402 sellers your agent may pay. EmberSign agents in the market are always allowed.">Seller allowlist</H2>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          try {
            await api("/api/allowlist", { json: { host } });
            setHost("");
            void reload();
          } catch (x) {
            setErr((x as Error).message);
          }
        }}
      >
        <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="api.example.com" aria-label="Seller host" />
        <Button type="submit" variant="secondary">
          Add
        </Button>
      </form>
      {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
      <ul className="mt-4 divide-y divide-border">
        {data?.map((h) => (
          <li key={h} className="flex items-center justify-between py-2">
            <Mono>{h}</Mono>
            <Button variant="ghost" size="sm" onClick={async () => { await api("/api/allowlist", { method: "DELETE", json: { host: h } }); void reload(); }}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ApiKeys({ me }: { me: Me }) {
  const { data, reload } = useJson<Key[]>("/api/keys");
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"pay" | "read">("pay");
  const [fresh, setFresh] = useState<string | null>(null);
  const keyText = fresh ?? "ek_…";
  const mcp = `claude mcp add --transport http embersign ${me.appUrl}/api/mcp --header "Authorization: Bearer ${keyText}"`;
  const curl = `curl -X POST ${me.appUrl}/api/v1/get_budget -H "Authorization: Bearer ${keyText}"`;
  return (
    <Card className="p-6">
      <H2 sub="Let your own agent, or a terminal agent over MCP, spend inside the same limits. Payments above your ask-above amount still wait for you here.">API keys and MCP</H2>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await api<{ key: string }>("/api/keys", { json: { name, scope } });
          setFresh(r.key);
          setName("");
          void reload();
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Key name, e.g. my laptop" aria-label="Key name" className="max-w-xs" />
        <select value={scope} onChange={(e) => setScope(e.target.value as "pay" | "read")} className="h-10 rounded-md border border-input bg-card px-3 text-sm" aria-label="Key scope">
          <option value="pay">Can pay</option>
          <option value="read">Read only</option>
        </select>
        <Button type="submit" variant="secondary">
          Create key
        </Button>
      </form>
      {fresh && (
        <Notice tone="warning">
          <div className="mb-2 font-medium">Copy this key now. It won’t be shown again.</div>
          <div className="flex flex-wrap items-center gap-2">
            <Mono className="break-all">{fresh}</Mono>
            <Copy text={fresh} />
          </div>
        </Notice>
      )}
      <div className="mt-4 space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between text-sm text-muted-foreground">
            MCP (Claude Code or any MCP client) <Copy text={mcp} />
          </div>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-mini">{mcp}</pre>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-sm text-muted-foreground">
            REST <Copy text={curl} />
          </div>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-mini">{curl}</pre>
        </div>
      </div>
      <ul className="mt-4 divide-y divide-border">
        {data?.map((k) => (
          <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span>
              {k.name} <Mono className="text-muted-foreground">{k.prefix}…</Mono> · {k.scope === "read" ? "read only" : "can pay"}
              {k.lastUsedAt && <span className="text-muted-foreground"> · used {new Date(k.lastUsedAt).toLocaleDateString()}</span>}
            </span>
            <Button variant="ghost" size="sm" onClick={async () => { await api("/api/keys", { method: "DELETE", json: { id: k.id } }); void reload(); }}>
              Revoke key
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Body({ me, reload }: { me: Me; reload: () => Promise<void> }) {
  const router = useRouter();
  const { signTransaction, publicKey } = useWallet();
  const [msg, setMsg] = useState<{ tone: "settled" | "danger"; text: string; link?: string } | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  async function revoke() {
    if (!signTransaction || !publicKey || publicKey.toBase58() !== me.address) return setMsg({ tone: "danger", text: "Connect the wallet you signed in with." });
    try {
      const owner = new PublicKey(me.address);
      const ata = getAssociatedTokenAddressSync(new PublicKey(me.usdcMint), owner);
      const tx = new Transaction().add(revokeIx(owner), createRevokeInstruction(ata, owner));
      tx.feePayer = owner;
      const sig = await signSendConfirm(tx, signTransaction);
      await api("/api/agent-wallet/sweep", { method: "POST" }).catch(() => undefined);
      setMsg({ tone: "settled", text: "Revoked. Your agent can never pull again until you set limits.", link: explorerTx(sig) });
      setConfirmRevoke(false);
      await reload();
    } catch (e) {
      setMsg({ tone: "danger", text: (e as Error).message });
    }
  }

  return (
    <div className="grid gap-6">
      {msg && (
        <Notice tone={msg.tone}>
          {msg.text}{" "}
          {msg.link && (
            <a className="underline" href={msg.link} target="_blank" rel="noreferrer">
              View transaction
            </a>
          )}
        </Notice>
      )}
      <Card className="p-6">
        <H2 sub={`Agent wallet ${short(me.agent ?? "")}. Only your wallet can change these.`}>Limits</H2>
        <LimitsForm me={me} submitLabel="Update limits" onDone={() => { setMsg({ tone: "settled", text: "Limits updated onchain." }); void reload(); }} />
      </Card>
      <Allowlist />
      <ApiKeys me={me} />
      <Card className="p-6">
        <H2 sub="Sends any USDC your agent holds for small payments back to your wallet.">Return agent funds</H2>
        <div className="flex flex-wrap items-center gap-4">
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                const r = await api<{ explorer: string | null }>("/api/agent-wallet/sweep", { method: "POST" });
                setMsg({ tone: "settled", text: r.explorer ? "Returned to your wallet." : "Nothing to return.", link: r.explorer ?? undefined });
                await reload();
              } catch (e) {
                setMsg({ tone: "danger", text: (e as Error).message });
              }
            }}
          >
            Return {me.floatUsd > 0 ? `$${me.floatUsd.toFixed(2)}` : "funds"}
          </Button>
          {me.agent && (
            <a className="text-sm underline underline-offset-4" href={explorerAddr(me.agent)} target="_blank" rel="noreferrer">
              Agent wallet on explorer
            </a>
          )}
        </div>
      </Card>
      <Card className="border-destructive/40 p-6">
        <H2 sub="One signature. Your agent can never pull again, and the USDC approval is removed. Revoking the approval from any wallet tool also works without EmberSign.">Revoke</H2>
        {confirmRevoke ? (
          <div className="flex gap-2">
            <Button variant="danger" onClick={revoke}>
              Yes, revoke now
            </Button>
            <Button variant="ghost" onClick={() => setConfirmRevoke(false)}>
              Keep it
            </Button>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirmRevoke(true)} disabled={me.revoked}>
            {me.revoked ? "Revoked" : "Revoke agent"}
          </Button>
        )}
        {me.revoked && (
          <Button className="mt-3" variant="secondary" onClick={() => router.push("/setup")}>
            Set limits again
          </Button>
        )}
      </Card>
    </div>
  );
}

export default function Settings() {
  return (
    <Shell title="Settings" allowUnconfigured>
      {(me, reload) => <Body me={me} reload={reload} />}
    </Shell>
  );
}
