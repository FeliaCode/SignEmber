"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Button, Card, Mono, Textarea, cx } from "@/components/ui";
import { Salo } from "@/components/Salo";
import { api, href, usd, type Me } from "@/lib/client";

interface ConfirmCard {
  paymentId: string;
  payee: string;
  input: string;
  amount_usd: number;
  left_today_after_usd: number;
}
interface Paid {
  status: string;
  paid_usd?: number;
  paid_to?: string;
  settlement?: string | null;
  limiter_spend?: string | null;
  result?: string;
  reason?: string;
  confirm_card?: ConfirmCard;
}
type Item =
  | { kind: "user"; text: string }
  | { kind: "agent"; text: string }
  | { kind: "tool"; name: string; result?: Paid & Record<string, unknown> };

const CHIPS = ["What's my budget today?", "Have ada summarize example.com", "Find a weather API and get Lisbon's forecast", "What did I spend today?"];
const TOOL_WORDS: Record<string, string> = {
  get_budget: "Checked your budget",
  find_agents: "Searched the market",
  hire_agent: "Hired an agent",
  paid_fetch: "Paid a seller",
  get_activity: "Read your activity",
  web_search: "Searched the web",
  web_fetch: "Read a page",
};

function fromTranscript(rows: { role: string; content: unknown }[]): Item[] {
  const out: Item[] = [];
  for (const r of rows) {
    if (r.role === "user" && typeof r.content === "string") out.push({ kind: "user", text: r.content });
    else if (r.role === "assistant" && Array.isArray(r.content)) {
      const text = r.content.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
      if (text) out.push({ kind: "agent", text });
    }
  }
  return out;
}

function Confirm({ card, leftUsd, onResult }: { card: ConfirmCard; leftUsd: number; onResult: (p: Paid) => void }) {
  const [state, setState] = useState<"ask" | "working" | "cancelled">("ask");
  const tooMuch = card.amount_usd > leftUsd;
  if (state === "cancelled") return <p className="text-sm text-muted-foreground">Cancelled. Nothing moved.</p>;
  return (
    <div className="rounded-md border border-warning/50 bg-card p-4">
      <div className="text-sm text-muted-foreground">Confirm payment</div>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-medium">{card.payee}</div>
        <div className="font-display text-h3 tabular">{usd(card.amount_usd)}</div>
      </div>
      <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{card.input}</p>
      <p className="mt-2 text-xs text-muted-foreground">Left today after this: {usd(Math.max(0, card.left_today_after_usd))}</p>
      <div className="mt-3 flex gap-2">
        <Button
          disabled={tooMuch || state === "working"}
          onClick={async () => {
            setState("working");
            try {
              onResult(await api<Paid>(`/api/payments/${card.paymentId}/confirm`, { method: "POST" }));
            } catch (e) {
              onResult({ status: "failed", reason: (e as Error).message });
            }
          }}
        >
          {state === "working" ? "Funding → paying…" : "Confirm"}
        </Button>
        <Button
          variant="secondary"
          disabled={state === "working"}
          onClick={async () => {
            await api(`/api/payments/${card.paymentId}/cancel`, { method: "POST" });
            setState("cancelled");
          }}
        >
          Cancel
        </Button>
      </div>
      {tooMuch && <p className="mt-2 text-xs text-destructive">This is more than what’s left today.</p>}
    </div>
  );
}

function PaidStrip({ p }: { p: Paid }) {
  if (p.status === "settled")
    return (
      <div className="rounded-md border border-accent/40 bg-accent/5 p-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-medium text-accent">Paid {usd(p.paid_usd ?? 0)}</span>
          {p.limiter_spend && (
            <a className="underline underline-offset-4" href={p.limiter_spend} target="_blank" rel="noreferrer">
              limiter spend
            </a>
          )}
          {p.settlement && (
            <a className="underline underline-offset-4" href={p.settlement} target="_blank" rel="noreferrer">
              settlement
            </a>
          )}
        </div>
        {p.result && <p className="mt-2 whitespace-pre-wrap text-foreground">{p.result.slice(0, 1200)}</p>}
      </div>
    );
  if (p.status === "refused" || p.status === "failed")
    return <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">{p.reason}</div>;
  return null;
}

function ChatBody({ me, reload }: { me: Me; reload: () => Promise<void> }) {
  const params = useSearchParams();
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [held, setHeld] = useState<ConfirmCard | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const sentQ = useRef(false);

  useEffect(() => {
    api<{ role: string; content: unknown }[]>("/api/chat").then((rows) => setItems(fromTranscript(rows))).catch(() => undefined);
    const confirm = params.get("confirm");
    if (confirm)
      api<{ status: string; payee: string; amountUsd: number; request: { body?: string } | null; id: string }>(`/api/payments/${confirm}`).then((p) => {
        if (p.status === "awaiting_confirm")
          setHeld({ paymentId: p.id, payee: p.payee, input: p.request?.body ?? "", amount_usd: p.amountUsd, left_today_after_usd: me.leftTodayUsd - p.amountUsd });
      });
  }, [params, me.leftTodayUsd]);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [items]);

  async function send(msg: string) {
    if (!msg.trim() || busy) return;
    setBusy(true);
    setText("");
    setItems((x) => [...x, { kind: "user", text: msg }, { kind: "agent", text: "" }]);
    try {
      const res = await fetch(href("/api/chat"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: msg }) });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? "chat failed");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const e = JSON.parse(part.slice(6));
          setItems((x) => {
            const y = [...x];
            const last = y[y.length - 1];
            if (e.type === "text") {
              if (last?.kind === "agent") y[y.length - 1] = { ...last, text: last.text + e.text };
              else y.push({ kind: "agent", text: e.text });
            } else if (e.type === "tool") {
              y.push({ kind: "tool", name: e.name });
            } else if (e.type === "tool_result") {
              for (let i = y.length - 1; i >= 0; i--) {
                const it = y[i];
                if (it.kind === "tool" && it.name === e.name && !it.result) {
                  y[i] = { ...it, result: e.result };
                  break;
                }
              }
              y.push({ kind: "agent", text: "" });
            } else if (e.type === "error") {
              y.push({ kind: "agent", text: `Something went wrong: ${e.message}` });
            }
            return y;
          });
        }
      }
    } catch (e) {
      setItems((x) => [...x, { kind: "agent", text: (e as Error).message }]);
    } finally {
      setBusy(false);
      void reload();
    }
  }

  useEffect(() => {
    const q = params.get("q");
    const draft = params.get("draft");
    if (draft && !sentQ.current) {
      sentQ.current = true;
      setText(draft);
    } else if (q && !sentQ.current) {
      sentQ.current = true;
      void send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <Card className="flex min-h-[60dvh] flex-col p-0">
        <div className="flex-1 space-y-4 overflow-y-auto p-5" aria-live="polite">
          {items.length === 0 && !held && (
            <div className="flex flex-col items-center gap-3 py-10 text-center text-muted-foreground">
              <Salo pose="lantern" size={120} />
              <p>Ask for anything an x402 seller or another agent can provide.</p>
            </div>
          )}
          {held && <Confirm card={held} leftUsd={me.leftTodayUsd} onResult={(p) => { setHeld(null); setItems((x) => [...x, { kind: "tool", name: "confirm", result: p as Paid & Record<string, unknown> }]); void reload(); }} />}
          {items.map((it, i) =>
            it.kind === "user" ? (
              <div key={i} className="ml-auto max-w-[85%] rounded-lg bg-secondary px-4 py-2.5">{it.text}</div>
            ) : it.kind === "agent" ? (
              it.text ? (
                <div key={i} className="max-w-[90%] whitespace-pre-wrap leading-relaxed">{it.text}</div>
              ) : null
            ) : (
              <div key={i} className="space-y-2">
                <div className="text-xs text-muted-foreground">{TOOL_WORDS[it.name] ?? it.name}{!it.result && "…"}</div>
                {it.result?.status === "awaiting_confirm" && it.result.confirm_card ? (
                  <Confirm card={it.result.confirm_card} leftUsd={me.leftTodayUsd} onResult={(p) => setItems((x) => x.map((y, j) => (j === i ? { ...it, result: p as Paid & Record<string, unknown> } : y)))} />
                ) : it.result ? (
                  <PaidStrip p={it.result} />
                ) : null}
              </div>
            ),
          )}
          <div ref={endRef} />
        </div>
        <div className="border-t border-border p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {CHIPS.map((c) => (
              <button key={c} onClick={() => void send(c)} disabled={busy} className="rounded-md border border-border px-3 py-1 text-sm text-muted-foreground transition-smooth hover:bg-secondary hover:text-foreground">
                {c}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
          >
            <Textarea
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(text);
                }
              }}
              placeholder="Have ada summarize example.com"
              aria-label="Message"
            />
            <Button type="submit" disabled={busy} className={cx("self-stretch", busy && "opacity-60")}>
              {busy ? "Working…" : "Send"}
            </Button>
          </form>
        </div>
      </Card>
      <aside className="space-y-4">
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Left today</div>
          <div className="font-display text-h2 tabular">{usd(me.leftTodayUsd)}</div>
          <div className="mt-3 space-y-1 text-sm text-muted-foreground">
            <div>Per payment: <Mono>{usd(me.perTxCapUsd)}</Mono></div>
            <div>Asks you above: <Mono>{usd(me.askAboveUsd)}</Mono></div>
          </div>
        </Card>
      </aside>
    </div>
  );
}

export default function Chat() {
  return (
    <Shell title="Agent">
      {(me, reload) => (
        <Suspense>
          <ChatBody me={me} reload={reload} />
        </Suspense>
      )}
    </Shell>
  );
}
