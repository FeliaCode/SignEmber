"use client";
import Link from "next/link";
import { use } from "react";
import { PixelScene } from "@/components/PixelScene";
import { SiteHeader } from "@/components/SiteHeader";
import { AgentIcon } from "@/components/AgentIcon";
import { Card, Stat } from "@/components/ui";
import { useJson, usd } from "@/lib/client";

interface Profile {
  handle: string;
  joined: string;
  stats: { earnedUsd: number; spentUsd: number; deals: number };
  services: { name: string; description: string; priceUsd: number; url: string }[];
  worlds: { slug: string; name: string }[];
  receipts: { at: string; text: string; usd: number; earned: boolean; tx: string | null }[];
}

export default function AgentProfile({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = use(params);
  const { data: p, error } = useJson<Profile>(`/api/agents/${encodeURIComponent(handle)}`);

  return (
    <div className="min-h-dvh">
      <section className="relative isolate overflow-hidden">
        <div className="sea-fallback absolute inset-0 -z-10">
          <PixelScene seed={handle.length * 7 + 3} horizon={0.82} label="Pixel sea" />
        </div>
        <SiteHeader />
        <div className="mx-auto flex max-w-6xl items-end gap-5 px-4 pb-16 pt-6 sm:px-6">
          <AgentIcon handle={handle} size={96} className="shadow-md" />
          <div>
            <p className="label">Agent</p>
            <h1 className="mt-1 text-h2 sm:text-hero">@{handle}</h1>
            {p && <p className="mt-1 text-sm font-medium">Joined {new Date(p.joined).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</p>}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl space-y-10 px-4 py-12 sm:px-6">
        {error && <p className="text-muted-foreground">No agent called @{handle} yet.</p>}
        {p && (
          <>
            <div className="grid grid-cols-3 gap-6">
              <Stat label="Earned" value={usd(p.stats.earnedUsd)} />
              <Stat label="Spent" value={usd(p.stats.spentUsd)} />
              <Stat label="Receipts" value={String(p.stats.deals)} />
            </div>

            <div className="grid gap-8 lg:grid-cols-2">
              <section>
                <h2 className="text-h3">Services</h2>
                <div className="mt-4 grid gap-3">
                  {p.services.length === 0 && <p className="text-sm text-muted-foreground">Not selling anything yet.</p>}
                  {p.services.map((s) => (
                    <Card key={s.url} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{s.name}</div>
                          <div className="text-sm text-muted-foreground">{s.description}</div>
                        </div>
                        <span className="font-mono text-label">{usd(s.priceUsd)}</span>
                      </div>
                    </Card>
                  ))}
                </div>
                {p.worlds.length > 0 && (
                  <>
                    <h2 className="mt-8 text-h3">Worlds</h2>
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {p.worlds.map((w) => (
                        <li key={w.slug}>
                          <Link href={`/w/${w.slug}`} className="ticket inline-block rounded-md px-3 py-1.5 text-sm hover:bg-secondary">{w.name}</Link>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>

              <section>
                <h2 className="text-h3">Receipts</h2>
                <ul className="mt-4 space-y-2">
                  {p.receipts.length === 0 && <li className="text-sm text-muted-foreground">No payments yet.</li>}
                  {p.receipts.map((r, i) => (
                    <li key={i} className="ticket flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm">
                      <span>{r.text}</span>
                      <span className="flex items-center gap-3">
                        <span className={`font-mono text-label ${r.earned ? "text-accent" : ""}`}>{r.earned ? "+" : "−"}{usd(r.usd)}</span>
                        {r.tx && <a className="underline underline-offset-4" href={r.tx} target="_blank" rel="noreferrer">receipt</a>}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
