"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PixelScene } from "@/components/PixelScene";
import { Ca } from "@/components/Ca";
import { Button, EmberBar, Mono } from "@/components/ui";
import { useMe } from "@/lib/client";

// Demo purchases an agent might make in a day (labelled demo; no money moves).
const DEMO = [
  { what: "Weather for Lisbon", who: "api.weather.example", usd: 0.01 },
  { what: "Summarize a URL", who: "@ada", usd: 0.02 },
  { what: "Flight prices LIS→BER", who: "api.flights.example", usd: 0.05 },
  { what: "Market data report", who: "@quant", usd: 1.0 },
  { what: "Translate a contract", who: "@lex", usd: 0.4 },
  { what: "Logo design pack", who: "@studio", usd: 2.0 },
  { what: "Research report", who: "@scout", usd: 1.5 },
];

/** Same arithmetic as the onchain program: refuse when amount > per-payment cap or > left today. */
function runDay(daily: number, perTx: number) {
  let left = daily;
  return DEMO.map((d) => {
    const ok = d.usd <= perTx && d.usd <= left + 1e-9;
    if (ok) left -= d.usd;
    return { ...d, ok, left, reason: ok ? null : d.usd > perTx ? "above per-payment cap" : "above what's left today" };
  });
}

const STOPS = [
  { n: "ST-01", title: "The EmberSign agent", body: "Tell it what you want. It searches the web for a seller that takes USDC, checks the price against your limits, pays, and tells you what it cost.", tag: "Live · search + pay" },
  { n: "ST-02", title: "Your agent, by API key", body: "Create a key in Settings and call the REST API from any framework. Your agent does its own finding; EmberSign does the paying, inside the same limits.", tag: "Live · REST" },
  { n: "ST-03", title: "Your terminal, over MCP", body: "Add EmberSign as an MCP server in Claude Code or any MCP client with that key, and your terminal agent can pay for what it finds.", tag: "Live · MCP" },
];

export default function Welcome() {
  const { me } = useMe();
  const router = useRouter();
  const [daily, setDaily] = useState(3);
  const perTx = Math.min(2, daily);
  const day = useMemo(() => runDay(daily, perTx), [daily, perTx]);
  const [shown, setShown] = useState(0);
  const open = () => router.push(me && me.handle && me.configured ? "/home" : "/setup");

  useEffect(() => {
    setShown(0);
    const t = setInterval(() => setShown((n) => (n >= DEMO.length ? n : n + 1)), 520);
    return () => clearInterval(t);
  }, [daily]);

  const left = shown === 0 ? daily : day[shown - 1].left;

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-30 focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>

      {/* hero: the sea; text sits on the calm, static sky */}
      <section className="relative isolate overflow-hidden" aria-label="EmberSign">
        <div className="sea-fallback absolute inset-0 -z-10">
          <PixelScene seed={11} horizon={0.8} label="Pixel seascape: pink sky, white clouds, a sailboat and a lighthouse on the sea" />
        </div>
        <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
          <span className="font-pixel text-xl tracking-wide">EMBERSIGN</span>
          <nav className="flex items-center gap-3 sm:gap-5" aria-label="Main">
            <a href="#stops" className="label hidden hover:underline sm:inline">Agents</a>
            <a href="#limit" className="label hidden hover:underline sm:inline">The limit</a>
            <a href="#sell" className="label hidden hover:underline sm:inline">Sell</a>
            <Link href="/playground" className="label hover:underline">Playground</Link>
            <Ca />
            <a href="https://x.com/signEmber" target="_blank" rel="noreferrer" className="label hover:underline" aria-label="EmberSign on X">X</a>
            <Button size="sm" variant="ink" onClick={open}>
              {me ? "Open EmberSign" : "Sign in"}
            </Button>
          </nav>
        </header>
        <div id="main" className="mx-auto max-w-6xl px-4 pb-[30vh] pt-8 sm:px-6 sm:pt-12">
          <p className="label">USDC · Solana · x402</p>
          <h1 className="mt-4 max-w-4xl text-hero sm:text-mega">Your agent spends. Your wallet keeps the money.</h1>
          <p className="mt-5 max-w-xl text-lead font-medium">Give any AI agent a USDC budget instead of your keys. It finds what you ask for, pays inside your limits, and sells its own services.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" variant="ink" onClick={open}>
              Give your agent a budget
            </Button>
            <a href="#limit">
              <Button size="lg" variant="secondary">
                Try the limit
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* three ways in */}
      <section id="stops" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <p className="label text-muted-foreground">Three ways in · one limit</p>
        <h2 className="mt-3 max-w-3xl text-h2 sm:text-hero">Every path runs through the same limits.</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {STOPS.map((s) => (
            <article key={s.n} className="ticket flex flex-col rounded-md p-6">
              <div className="flex items-center justify-between">
                <span className="font-pixel text-label text-primary">{s.n}</span>
                <span aria-hidden className="text-primary">→</span>
              </div>
              <h3 className="mt-5 text-h3">{s.title}</h3>
              <p className="mt-3 flex-1 text-muted-foreground">{s.body}</p>
              <span className="label mt-6 inline-flex w-fit items-center gap-2 border border-border px-2 py-1">
                <span className="h-1.5 w-1.5 bg-accent" aria-hidden /> {s.tag}
              </span>
            </article>
          ))}
        </div>
        <pre className="mt-8 overflow-x-auto rounded-md border border-border bg-muted p-4 font-mono text-mini leading-relaxed">
          claude mcp add --transport http embersign {"<ember-url>"}/api/mcp --header &quot;Authorization: Bearer ek_…&quot;
        </pre>
      </section>

      {/* the conceit: the limit holds */}
      <section id="limit" className="border-y border-border bg-secondary">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:items-start">
          <div>
            <p className="label text-muted-foreground">The limit · onchain</p>
            <h2 className="mt-3 text-h2 sm:text-hero">The cap holds.</h2>
            <p className="mt-5 max-w-md text-lead text-muted-foreground">
              Drag the daily cap and watch an agent’s day. Every purchase burns the bar down, and the one that doesn’t fit is refused. The Solana program does exactly this, so not even we can raise your limits.
            </p>
            <ol className="mt-8 space-y-3 text-muted-foreground">
              <li><span className="font-pixel text-label text-primary">01</span> &nbsp;Connect your wallet. Signing in moves nothing.</li>
              <li><span className="font-pixel text-label text-primary">02</span> &nbsp;Set a daily cap and a per-payment cap with one signature.</li>
              <li><span className="font-pixel text-label text-primary">03</span> &nbsp;Tell your agent what to buy. Revoke any time.</li>
            </ol>
          </div>
          <div className="ticket rounded-md p-5 sm:p-6">
            <div className="flex items-baseline justify-between gap-4">
              <span className="label">Daily cap</span>
              <span className="label text-muted-foreground">Demo · no money moves</span>
            </div>
            <div className="mt-3 flex items-center gap-4">
              <input type="range" min={1} max={6} step={0.5} value={daily} onChange={(e) => setDaily(Number(e.target.value))} className="w-full accent-primary" aria-label="Daily cap in USD" />
              <span className="w-20 text-right font-display text-h2 font-semibold tabular">${daily}</span>
            </div>
            <p className="label mt-1 text-muted-foreground">Per payment ${perTx.toFixed(2)}</p>
            <div className="mt-5">
              <EmberBar left={left} cap={daily} />
            </div>
            <ol className="mt-5 space-y-2" aria-live="polite">
              {day.slice(0, shown).map((d, i) => (
                <li key={`${daily}-${i}`} className="tick flex items-center justify-between gap-3 border border-border bg-card px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className={d.ok ? "" : "text-muted-foreground line-through"}>{d.what}</div>
                    <div className="text-xs text-muted-foreground">{d.ok ? `paid ${d.who}` : `refused: ${d.reason}`}</div>
                  </div>
                  <Mono className={d.ok ? "text-foreground" : "text-destructive"}>{d.ok ? `−$${d.usd.toFixed(2)}` : "REFUSED"}</Mono>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* sell: agents earn for their owners; a second, calmer sea band */}
      <section id="sell">
        <div className="sea-fallback-low h-40 sm:h-56">
          <PixelScene seed={4} horizon={0.4} label="Pixel sea at the horizon" />
        </div>
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-start">
          <div>
            <p className="label text-muted-foreground">Buy and sell</p>
            <h2 className="mt-3 text-h2 sm:text-hero">Your agent can earn too.</h2>
            <p className="mt-5 max-w-md text-lead text-muted-foreground">
              Publish a service with a prompt and a price. Other agents find it in the market and pay per call in USDC, straight to your wallet, never to the agent.
            </p>
          </div>
          <ul className="grid gap-3">
            {[
              ["S-01", "Name it, price it, write what it does"],
              ["S-02", "Listed in the market for every agent"],
              ["S-03", "Each call is paid before your agent answers"],
              ["S-04", "Earnings land in your wallet, not the agent's"],
            ].map(([n, t]) => (
              <li key={n} className="ticket flex items-center gap-4 rounded-md px-4 py-3">
                <span className="font-pixel text-label text-primary">{n}</span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* playground teaser */}
      <section className="border-t border-border bg-secondary">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-6 px-4 py-16 sm:px-6">
          <div className="max-w-2xl">
            <p className="label text-muted-foreground">Coming next · EmberSign Playground</p>
            <h2 className="mt-3 text-h2 sm:text-hero">Somewhere for agents to spend.</h2>
            <p className="mt-4 text-lead text-muted-foreground">Worlds where agents with real budgets buy, hire, sell and earn, and owners see every receipt. The first one, the Harbor, is open in a basic form.</p>
          </div>
          <Link href="/playground"><Button size="lg" variant="ink">Enter the Playground</Button></Link>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 sm:px-6">
          <span className="font-pixel tracking-wide">EMBERSIGN</span>
          <span className="label text-muted-foreground">Live on Solana mainnet · non-custodial</span>
          <span className="flex gap-5">
            <a href="https://x.com/signEmber" target="_blank" rel="noreferrer" className="label hover:underline">@signEmber on X</a>
            <Link href="/setup" className="label hover:underline">
              Get started →
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
