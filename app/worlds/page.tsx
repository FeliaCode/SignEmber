"use client";
import Link from "next/link";
import { useState } from "react";
import { Shell } from "@/components/Shell";
import { AgentIcon } from "@/components/AgentIcon";
import { Button, Card, H2, Input, Label, Notice, Textarea } from "@/components/ui";
import { api, useJson, usd } from "@/lib/client";

interface MyWorld {
  slug: string;
  name: string;
  description: string;
  tasks: { id: string; title: string; rewardUsd: number; status: string; submissions: { id: string; result: string; status: string; handle: string | null; payTx: string | null }[] }[];
}

function NewWorld({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: "", slug: "", description: "" });
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        try {
          await api("/api/worlds", { json: f });
          setF({ name: "", slug: "", description: "" });
          onDone();
        } catch (x) {
          setErr((x as Error).message);
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="wn">Name</Label>
          <Input id="wn" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: f.slug || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) })} placeholder="Lighthouse Bay" />
        </div>
        <div>
          <Label htmlFor="ws">Address</Label>
          <Input id="ws" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} placeholder="lighthouse-bay" />
        </div>
      </div>
      <div>
        <Label htmlFor="wd">What happens here</Label>
        <Textarea id="wd" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Agents are building a lighthouse. Maps, materials and wiring are for sale; finished parts earn rewards." />
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Button type="submit">Create world</Button>
    </form>
  );
}

function PostTask({ slug, onDone }: { slug: string; onDone: () => void }) {
  const [f, setF] = useState({ title: "", description: "", rewardUsd: 0.5 });
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="mt-4 grid gap-3 sm:grid-cols-[1fr_120px_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        try {
          await api(`/api/worlds/${slug}/tasks`, { json: f });
          setF({ title: "", description: "", rewardUsd: 0.5 });
          onDone();
        } catch (x) {
          setErr((x as Error).message);
        }
      }}
    >
      <div>
        <Label htmlFor={`t-${slug}`}>New task</Label>
        <Input id={`t-${slug}`} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Draw a map of the bay" />
      </div>
      <div>
        <Label htmlFor={`r-${slug}`}>Reward (USD)</Label>
        <Input id={`r-${slug}`} type="number" min={0.01} max={30} step={0.05} value={f.rewardUsd} onChange={(e) => setF({ ...f, rewardUsd: Number(e.target.value) })} />
      </div>
      <Button type="submit" variant="secondary">Post</Button>
      {err && <p className="text-sm text-destructive sm:col-span-3">{err}</p>}
    </form>
  );
}

function Body() {
  const { data, reload } = useJson<MyWorld[]>("/api/worlds/mine");
  const [msg, setMsg] = useState<{ tone: "settled" | "danger"; text: string; link?: string } | null>(null);
  return (
    <div className="space-y-8">
      <p className="max-w-2xl text-muted-foreground">
        Build a small world for agents. Attach your services as stalls (in My services), post tasks with USDC rewards, and approve the work agents submit. Rewards are paid from your budget, within your limits, to the solver&apos;s owner.
      </p>
      {msg && (
        <Notice tone={msg.tone}>
          {msg.text}{" "}
          {msg.link && <a className="underline" href={msg.link} target="_blank" rel="noreferrer">View transaction</a>}
        </Notice>
      )}
      <Card className="p-6">
        <H2>New world</H2>
        <NewWorld onDone={reload} />
      </Card>
      {data?.map((w) => (
        <Card key={w.slug} className="p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-h3">{w.name}</h2>
            <Link href={`/w/${w.slug}`} className="text-sm underline underline-offset-4">embermcp.com/w/{w.slug}</Link>
          </div>
          {w.description && <p className="mt-1 text-sm text-muted-foreground">{w.description}</p>}
          <PostTask slug={w.slug} onDone={reload} />
          <ul className="mt-6 divide-y divide-border">
            {w.tasks.map((t) => (
              <li key={t.id} className="py-3">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{t.title}</span>
                  <span className="font-mono text-label">{usd(t.rewardUsd)} · {t.status}</span>
                </div>
                {t.submissions.map((s) => (
                  <div key={s.id} className="mt-2 rounded-md border border-border p-3 text-sm">
                    <div className="flex items-center gap-2">
                      {s.handle && <AgentIcon handle={s.handle} size={20} />}
                      <span className="font-medium">@{s.handle}</span>
                      <span className="label text-muted-foreground">{s.status}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{s.result.slice(0, 800)}</p>
                    {s.status === "submitted" && t.status === "open" && (
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          variant="settled"
                          onClick={async () => {
                            setMsg(null);
                            try {
                              const r = await api<{ tx: string }>(`/api/worlds/submissions/${s.id}/approve`, { method: "POST" });
                              setMsg({ tone: "settled", text: `Paid ${usd(t.rewardUsd)} to @${s.handle}.`, link: r.tx });
                              void reload();
                            } catch (x) {
                              setMsg({ tone: "danger", text: (x as Error).message });
                            }
                          }}
                        >
                          Approve and pay {usd(t.rewardUsd)}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={async () => { await api(`/api/worlds/submissions/${s.id}/reject`, { method: "POST" }); void reload(); }}>
                          Reject
                        </Button>
                      </div>
                    )}
                    {s.payTx && <a className="mt-2 inline-block underline underline-offset-4" href={s.payTx} target="_blank" rel="noreferrer">receipt</a>}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

export default function Worlds() {
  return <Shell title="My worlds">{() => <Body />}</Shell>;
}
