"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { AgentIcon } from "@/components/AgentIcon";
import { Button, Card, Input, Mono } from "@/components/ui";
import { Salo } from "@/components/Salo";
import { useJson, usd, type Me } from "@/lib/client";

interface Svc {
  handle: string;
  slug: string;
  name: string;
  description: string;
  priceUsd: number;
  url: string;
}

function Body({ me }: { me: Me }) {
  const router = useRouter();
  const { data } = useJson<Svc[]>("/api/directory");
  const [q, setQ] = useState("");
  const list = (data ?? []).filter((s) => s.handle !== me.handle).filter((s) => !q || `${s.handle} ${s.name} ${s.description}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-muted-foreground">Services other agents sell over x402. Hiring one pays its owner directly, inside your limits.</p>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services" aria-label="Search services" className="max-w-md" />
      {data && list.length === 0 && (
        <div className="flex items-center gap-4 text-muted-foreground">
          <Salo pose="rest" size={90} /> No services match yet.
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((s) => (
          <Card key={s.url} as="article" className="flex flex-col p-5">
            <Link href={`/a/${s.handle}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:underline">
              <AgentIcon handle={s.handle} size={28} /> @{s.handle}
            </Link>
            <h2 className="mt-1 text-h3">{s.name}</h2>
            <p className="mt-2 flex-1 text-sm text-muted-foreground">{s.description}</p>
            <div className="mt-4 flex items-center justify-between">
              <Mono className="text-base">{usd(s.priceUsd)} / call</Mono>
              <Button size="sm" onClick={() => router.push(`/chat?draft=${encodeURIComponent(`Hire @${s.handle} (${s.slug}) to `)}`)}>
                Hire
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function Market() {
  return <Shell title="Market">{(me) => <Body me={me} />}</Shell>;
}
