"use client";
import { useState } from "react";
import { Shell } from "@/components/Shell";
import { Card, Mono, Status, Tabs } from "@/components/ui";
import { Salo } from "@/components/Salo";
import { useJson, usd } from "@/lib/client";

interface Activity {
  paid: { id: string; kind: string; via: string; payee: string; amountUsd: number; status: string; reason: string | null; spend: string | null; settlement: string | null; createdAt: string }[];
  earned: { id: string; service: string; payer: string; amountUsd: number; settlement: string; createdAt: string }[];
}
const KIND: Record<string, string> = { seller: "Seller", agent: "Agent" };
const VIA: Record<string, string> = { chat: "EmberSign agent", api: "API key", mcp: "MCP" };
const when = (s: string) => new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function Body() {
  const [tab, setTab] = useState<"paid" | "earned">("paid");
  const { data } = useJson<Activity>("/api/activity");
  const rows = tab === "paid" ? data?.paid : data?.earned;
  return (
    <div className="space-y-5">
      <Tabs value={tab} onChange={setTab} items={[{ value: "paid", label: "Paid" }, { value: "earned", label: "Earned" }]} />
      {rows?.length === 0 && (
        <div className="flex items-center gap-4 text-muted-foreground">
          <Salo pose="rest" size={90} /> Nothing here yet.
        </div>
      )}
      <Card className="divide-y divide-border">
        {tab === "paid"
          ? data?.paid.map((p) => (
              <div key={p.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="truncate font-medium">{p.payee ?? KIND[p.kind]}</div>
                  <div className="text-sm text-muted-foreground">
                    {KIND[p.kind] ?? p.kind} · {VIA[p.via] ?? p.via} · {when(p.createdAt)}
                  </div>
                  {p.reason && <div className="text-sm text-muted-foreground">{p.reason}</div>}
                </div>
                <div className="flex items-center gap-4 sm:justify-end">
                  <Status s={p.status} />
                  <Mono className="tabular">−{usd(p.amountUsd)}</Mono>
                  {p.spend && <a className="text-sm underline underline-offset-4" href={p.spend} target="_blank" rel="noreferrer">spend</a>}
                  {p.settlement && <a className="text-sm underline underline-offset-4" href={p.settlement} target="_blank" rel="noreferrer">settlement</a>}
                </div>
              </div>
            ))
          : data?.earned.map((e) => (
              <div key={e.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <div className="font-medium">{e.service}</div>
                  <div className="text-sm text-muted-foreground">
                    from {e.payer.length > 20 ? `${e.payer.slice(0, 4)}…${e.payer.slice(-4)}` : e.payer} · {when(e.createdAt)}
                  </div>
                </div>
                <div className="flex items-center gap-4 sm:justify-end">
                  <Mono className="text-accent tabular">+{usd(e.amountUsd)}</Mono>
                  <a className="text-sm underline underline-offset-4" href={e.settlement} target="_blank" rel="noreferrer">settlement</a>
                </div>
              </div>
            ))}
      </Card>
    </div>
  );
}

export default function ActivityPage() {
  return <Shell title="Activity">{() => <Body />}</Shell>;
}
