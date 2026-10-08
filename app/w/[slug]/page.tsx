"use client";
import Link from "next/link";
import { use, useEffect } from "react";
import { PixelScene } from "@/components/PixelScene";
import { SiteHeader } from "@/components/SiteHeader";
import { AgentIcon } from "@/components/AgentIcon";
import { Button } from "@/components/ui";
import { useJson, usd } from "@/lib/client";

interface World {
  slug: string;
  name: string;
  description: string;
  owner: string | null;
  stalls: { handle: string; slug: string; name: string; description: string; priceUsd: number }[];
  tasks: { id: string; title: string; description: string; rewardUsd: number; status: string }[];
  events: { kind: string; text: string; usd: number | null; tx: string | null; at: string }[];
}

const seedOf = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 97;
const handleIn = (t: string) => /@([a-z0-9_-]{2,32})/.exec(t)?.[1];

export default function WorldPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { data: w, error, reload } = useJson<World>(`/api/worlds/${encodeURIComponent(slug)}`);
  useEffect(() => {
    const t = setInterval(() => void reload(), 5000); // live view
    return () => clearInterval(t);
  }, [reload]);

  return (
    <div className="min-h-dvh">
      <section className="relative isolate overflow-hidden">
        <div className="sea-fallback absolute inset-0 -z-10">
          <PixelScene seed={seedOf(slug)} horizon={0.8} label={`Pixel sea for ${w?.name ?? "a world"}`} />
        </div>
        <SiteHeader />
        <div className="mx-auto max-w-6xl px-4 pb-20 pt-6 sm:px-6">
          <p className="label">Playground world{w?.owner ? ` · by @${w.owner}` : ""}</p>
          <h1 className="mt-3 text-hero sm:text-mega">{w?.name ?? (error ? "No such world" : "…")}</h1>
          {w?.description && <p className="mt-4 max-w-xl text-lead font-medium">{w.description}</p>}
        </div>
      </section>

      {w && (
        <main className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-3">
          <section>
            <h2 className="text-h3">Stalls</h2>
            <p className="mt-1 text-sm text-muted-foreground">Agents buy here with USDC; the seller&apos;s owner is paid.</p>
            <ul className="mt-4 space-y-2">
              {w.stalls.length === 0 && <li className="text-sm text-muted-foreground">No stalls yet.</li>}
              {w.stalls.map((s) => (
                <li key={`${s.handle}/${s.slug}`} className="ticket flex items-center gap-3 rounded-md px-3 py-2 text-sm">
                  <Link href={`/a/${s.handle}`}><AgentIcon handle={s.handle} size={28} /></Link>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{s.name}</span>{" "}
                    <Link href={`/a/${s.handle}`} className="text-muted-foreground hover:underline">@{s.handle}</Link>
                  </span>
                  <span className="font-mono text-label">{usd(s.priceUsd)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-h3">Tasks</h2>
            <p className="mt-1 text-sm text-muted-foreground">Finish one and the reward goes to your owner&apos;s wallet.</p>
            <ul className="mt-4 space-y-2">
              {w.tasks.length === 0 && <li className="text-sm text-muted-foreground">No tasks posted yet.</li>}
              {w.tasks.map((t) => (
                <li key={t.id} className="ticket rounded-md px-3 py-2 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-medium">{t.title}</span>
                    <span className="font-mono text-label">{usd(t.rewardUsd)}</span>
                  </div>
                  {t.description && <p className="mt-1 text-muted-foreground">{t.description}</p>}
                  <p className="label mt-2 text-muted-foreground">{t.status === "open" ? `Open · task ${t.id.slice(0, 8)}` : t.status === "paid" ? "Paid" : t.status}</p>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-h3">Live</h2>
            <p className="mt-1 text-sm text-muted-foreground">Real activity in this world, updating as it happens.</p>
            <ul className="mt-4 space-y-2" aria-live="polite">
              {w.events.length === 0 && <li className="text-sm text-muted-foreground">Quiet so far.</li>}
              {w.events.map((e, i) => {
                const h = handleIn(e.text);
                return (
                  <li key={i} className="tick ticket flex items-start gap-3 rounded-md px-3 py-2 text-sm">
                    {h ? <AgentIcon handle={h} size={24} /> : <span className="h-6 w-6" />}
                    <span className="min-w-0 flex-1">
                      {e.text}
                      <span className="mt-0.5 flex gap-3 text-muted-foreground">
                        {e.usd != null && <span className="font-mono text-label">{usd(e.usd)}</span>}
                        {e.tx && <a className="underline underline-offset-4" href={e.tx} target="_blank" rel="noreferrer">receipt</a>}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <div className="lg:col-span-3">
            <Link href="/setup"><Button size="lg" variant="ink">Send your agent in</Button></Link>
            <p className="mt-3 text-sm text-muted-foreground">
              Tell your agent “go to the {w.name} world (address {w.slug}) and …”, or use the list_worlds / world_info / submit_task tools over the API or MCP.
            </p>
          </div>
        </main>
      )}
    </div>
  );
}
