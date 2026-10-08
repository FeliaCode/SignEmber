"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Shell } from "@/components/Shell";
import { Button, Card, EmberBar, H2, Input, Mono, Stat, Status } from "@/components/ui";
import { Salo } from "@/components/Salo";
import { useJson, usd, type Me } from "@/lib/client";

interface Activity {
  paid: { id: string; kind: string; payee: string; amountUsd: number; status: string; createdAt: string; settlement: string | null }[];
  earned: { id: string; service: string; payer: string; amountUsd: number; createdAt: string; settlement: string }[];
}

function Body({ me }: { me: Me }) {
  const router = useRouter();
  const { data: act } = useJson<Activity>("/api/activity");
  const [ask, setAsk] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const earnedToday = (act?.earned ?? []).filter((e) => e.createdAt.slice(0, 10) === today).reduce((s, e) => s + e.amountUsd, 0);
  const recent = [
    ...(act?.paid ?? []).map((p) => ({ id: p.id, at: p.createdAt, text: `Paid ${p.payee}`, amount: -p.amountUsd, status: p.status })),
    ...(act?.earned ?? []).map((e) => ({ id: e.id, at: e.createdAt, text: `${e.payer} used ${e.service}`, amount: e.amountUsd, status: "done" })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <H2 sub={me.active ? "Active. Your agent can spend inside these limits." : me.revoked ? "Revoked. Your agent cannot spend." : "Not active. Approval missing or limits not set."}>Budget</H2>
          <Link href="/settings" className="text-sm underline-offset-4 hover:underline">
            Edit limits
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Stat label="Left today" value={usd(me.leftTodayUsd)} />
          <Stat label="Daily cap" value={usd(me.dailyCapUsd)} />
          <Stat label="Per payment" value={usd(me.perTxCapUsd)} />
          <Stat label="Agent float" value={usd(me.floatUsd)} hint="kept for small payments" />
        </div>
        <div className="mt-6">
          <EmberBar left={me.leftTodayUsd} cap={me.dailyCapUsd} />
        </div>
        <form
          className="mt-6 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/chat?q=${encodeURIComponent(ask)}`);
          }}
        >
          <Input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Tell your agent what to get…" aria-label="Message your agent" />
          <Button type="submit">Ask</Button>
        </form>
      </Card>

      <div className="grid gap-6">
        <Card className="p-6">
          <Stat label="Earned today" value={usd(earnedToday)} hint="paid straight to your wallet" />
        </Card>
        <Card className="p-6">
          <H2>Recent</H2>
          {recent.length === 0 ? (
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <Salo pose="rest" size={90} />
              Nothing yet. Ask your agent for something, or publish a service.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="truncate">{r.text}</div>
                    <Status s={r.status} />
                  </div>
                  <Mono className={r.amount >= 0 ? "text-accent" : ""}>{r.amount >= 0 ? `+${usd(r.amount)}` : `−${usd(-r.amount)}`}</Mono>
                </li>
              ))}
            </ul>
          )}
          <Link href="/activity" className="mt-3 inline-block text-sm underline-offset-4 hover:underline">
            All activity
          </Link>
        </Card>
      </div>
    </div>
  );
}

export default function Home() {
  return <Shell title="Home">{(me) => <Body me={me} />}</Shell>;
}
