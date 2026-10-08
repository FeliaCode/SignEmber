"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { api, short, useMe, type Me } from "@/lib/client";
import { Salo } from "./Salo";
import { cx } from "./ui";
import { Ca } from "./Ca";
import { AgentIcon } from "./AgentIcon";

const NAV = [
  ["/home", "Home"],
  ["/chat", "Agent"],
  ["/market", "Market"],
  ["/services", "My services"],
  ["/activity", "Activity"],
  ["/playground", "Playground"],
  ["/worlds", "My worlds"],
  ["/settings", "Settings"],
] as const;

/** Signed-in app frame. Redirects to setup when signed out or not configured. */
export function Shell({ children, title, allowUnconfigured = false }: { children: (me: Me, reload: () => Promise<void>) => ReactNode; title: string; allowUnconfigured?: boolean }) {
  const { me, reload } = useMe();
  const router = useRouter();
  const path = usePathname();
  const { disconnect } = useWallet();

  useEffect(() => {
    if (me === null) router.replace("/setup");
    else if (me && !allowUnconfigured && (!me.handle || !me.configured)) router.replace("/setup");
  }, [me, router, allowUnconfigured]);

  if (!me) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Salo pose="rest" size={120} className="opacity-70" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 sm:px-6">
          <Link href="/home" className="font-pixel text-lg tracking-wide">
            EMBERSIGN
          </Link>
          <nav className="hidden flex-1 items-center gap-1 lg:flex" aria-label="Main">
            {NAV.map(([h, l]) => (
              <Link key={h} href={h} className={cx("rounded-md px-3 py-1.5 text-sm transition-smooth", path?.endsWith(h) ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground")}>
                {l}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <Ca className="hidden sm:inline-flex" />
            <a href="https://x.com/signEmber" target="_blank" rel="noreferrer" className="label text-muted-foreground hover:text-foreground" aria-label="EmberSign on X">X</a>
            {me.handle && (
              <Link href={`/a/${me.handle}`} className="hidden items-center gap-2 text-muted-foreground hover:text-foreground sm:flex">
                <AgentIcon handle={me.handle} size={24} /> @{me.handle}
              </Link>
            )}
            <span className="font-mono text-label text-muted-foreground">{short(me.address)}</span>
            <button
              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              onClick={async () => {
                await api("/api/auth/logout", { method: "POST" });
                await disconnect().catch(() => undefined);
                router.replace("/");
              }}
            >
              Sign out
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden" aria-label="Main mobile">
          {NAV.map(([h, l]) => (
            <Link key={h} href={h} className={cx("shrink-0 rounded-md px-3 py-1.5 text-sm", path?.endsWith(h) ? "bg-secondary font-medium" : "text-muted-foreground")}>
              {l}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="mb-8 text-h2 sm:text-h1">{title}</h1>
        {children(me, reload)}
      </main>
    </div>
  );
}
