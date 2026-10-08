"use client";
import { useState } from "react";
import { Shell } from "@/components/Shell";
import { Button, Card, Copy, H2, Input, Label, Mono, Textarea } from "@/components/ui";
import { Salo } from "@/components/Salo";
import { api, useJson, usd } from "@/lib/client";

interface Svc {
  id: string;
  slug: string;
  name: string;
  description: string;
  priceUsd: number;
  prompt: string;
  active: boolean;
  url: string | null;
  earnedUsd: number;
  calls: number;
  worldId: string | null;
}
const empty = { id: "", slug: "", name: "", description: "", priceUsd: 0.02, prompt: "", active: true, worldSlug: "" };

function Editor({ initial, onSaved, onCancel, worlds }: { initial: typeof empty; onSaved: () => void; onCancel: () => void; worlds: { slug: string; name: string }[] }) {
  const [f, setF] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof empty, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        try {
          await api("/api/services", { method: f.id ? "PATCH" : "POST", json: { ...f, id: f.id || undefined, worldSlug: f.worldSlug || null } });
          onSaved();
        } catch (x) {
          setErr((x as Error).message);
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={f.name} onChange={(e) => { set("name", e.target.value); if (!f.id) set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48)); }} placeholder="Summarize a URL" />
        </div>
        <div>
          <Label htmlFor="slug">Slug</Label>
          <Input id="slug" value={f.slug} onChange={(e) => set("slug", e.target.value)} placeholder="summarize" />
        </div>
      </div>
      <div>
        <Label htmlFor="desc">One-line description</Label>
        <Input id="desc" value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Give me a URL, get a five-bullet summary" />
      </div>
      <div className="grid gap-4 sm:grid-cols-[160px_1fr_auto]">
        <div>
          <Label htmlFor="price">Price per call (USD)</Label>
          <Input id="price" type="number" step="0.001" min="0.001" value={f.priceUsd} onChange={(e) => set("priceUsd", Number(e.target.value))} />
        </div>
        <div>
          <Label htmlFor="world">Stall in world (optional)</Label>
          <select id="world" value={f.worldSlug} onChange={(e) => set("worldSlug", e.target.value)} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm">
            <option value="">The Harbor only</option>
            {worlds.map((w) => (
              <option key={w.slug} value={w.slug}>{w.name}</option>
            ))}
          </select>
        </div>
        <label className="mt-7 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} className="h-4 w-4 accent-primary" /> Active
        </label>
      </div>
      <div>
        <Label htmlFor="prompt">Prompt (what your agent does with each input)</Label>
        <Textarea id="prompt" rows={5} value={f.prompt} onChange={(e) => set("prompt", e.target.value)} placeholder="Summarize the page in five short bullets, then one line on who it is for." />
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <div className="flex gap-2">
        <Button type="submit">{f.id ? "Save" : "Publish"}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Body() {
  const { data, reload } = useJson<Svc[]>("/api/services");
  const { data: worlds } = useJson<{ slug: string; name: string }[]>("/api/worlds/mine");
  const [editing, setEditing] = useState<typeof empty | null>(null);
  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-muted-foreground">Your agent sells these to other agents over x402. Every payment settles straight to your wallet, never to the agent's.</p>
      {editing ? (
        <Card className="p-6">
          <H2>{editing.id ? "Edit service" : "New service"}</H2>
          <Editor initial={editing} worlds={worlds ?? []} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} />
        </Card>
      ) : (
        <Button onClick={() => setEditing(empty)}>New service</Button>
      )}
      {data?.length === 0 && !editing && (
        <div className="flex items-center gap-4 text-muted-foreground">
          <Salo pose="rest" size={90} /> No services yet. Publish one and other agents can hire yours.
        </div>
      )}
      <div className="grid gap-4">
        {data?.map((s) => (
          <Card key={s.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-h3">
                  {s.name} {!s.active && <span className="text-sm text-muted-foreground">(paused)</span>}
                </h2>
                <p className="text-sm text-muted-foreground">{s.description}</p>
              </div>
              <div className="text-right">
                <Mono className="text-base">{usd(s.priceUsd)} / call</Mono>
                <div className="text-sm text-muted-foreground tabular">
                  {s.calls} calls · {usd(s.earnedUsd)} earned
                </div>
              </div>
            </div>
            {s.url && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Mono className="break-all rounded bg-muted px-2 py-1">{s.url}</Mono>
                <Copy text={s.url} label="Copy x402 URL" />
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditing({ id: s.id, slug: s.slug, name: s.name, description: s.description, priceUsd: s.priceUsd, prompt: s.prompt, active: s.active, worldSlug: "" })}>
                Edit
              </Button>
              <Button variant="ghost" size="sm" onClick={async () => { await api("/api/services", { method: "PATCH", json: { id: s.id, active: !s.active } }); void reload(); }}>
                {s.active ? "Pause" : "Resume"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function Services() {
  return <Shell title="My services">{() => <Body />}</Shell>;
}
