// The agent's tools. One implementation serves the in-house chat agent, the REST API (owner's own agent)
// and MCP. Money tools go through pay(); a read-only API key cannot call them.
import "server-only";
import { PublicKey } from "@solana/web3.js";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { budget, explorerTx, unitsToUsd, usdcBalance } from "../chain";
import { getAgentAddress } from "../agent-wallet";
import { emberServiceUrl, pay, type PayResult } from "../pay";
import type { Caller } from "../auth";
import { ensureHarbor, listWorlds, submitTask, worldView } from "../worlds";

type JSONSchema = { type: "object"; properties: Record<string, unknown>; required?: string[] };
export interface Tool {
  name: string;
  description: string;
  input_schema: JSONSchema;
  money: boolean;
  run(c: Caller, input: Record<string, unknown>): Promise<unknown>;
}

const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : "");

/** What a paid step reports back to the model: plain facts, explorer links, never secrets. */
export function describePay(r: PayResult) {
  switch (r.status) {
    case "done":
      return {
        status: "settled",
        paid_usd: unitsToUsd(r.amountUsdc),
        paid_to: r.payTo,
        settlement: r.settleTx ? explorerTx(r.settleTx) : null,
        limiter_spend: r.spendTx ? explorerTx(r.spendTx) : null,
        result: r.result,
      };
    case "awaiting_confirm":
      return {
        status: "awaiting_confirm",
        confirm_card: { ...r.card, amount_usd: unitsToUsd(r.card.amountUsdc), left_today_after_usd: unitsToUsd(r.card.leftTodayAfterUsdc) },
        note: "Not paid. Tell the user the price and wait for them to confirm.",
      };
    case "refused":
      return { status: "refused", reason: r.reason, note: "Nothing was paid." };
    case "failed":
      return { status: "failed", reason: r.reason, note: "Not completed; any USDC pulled was returned to the owner." };
  }
}

export const TOOLS: Tool[] = [
  {
    name: "get_budget",
    description: "Daily cap, per-payment cap, what is left today, the agent's float, and the ask-above threshold, all in USD.",
    input_schema: { type: "object", properties: {} },
    money: false,
    async run(c) {
      const user = await db.query.users.findFirst({ where: eq(schema.users.id, c.userId) });
      const agent = await getAgentAddress(c.userId);
      const b = await budget(new PublicKey(user!.address));
      return {
        active: b.active,
        daily_cap_usd: unitsToUsd(b.dailyCap),
        per_payment_cap_usd: unitsToUsd(b.perTxCap),
        left_today_usd: unitsToUsd(b.leftToday),
        float_usd: agent ? unitsToUsd(await usdcBalance(agent)) : 0,
        ask_above_usd: Number(user!.askAboveUsd),
        owner_usdc_usd: unitsToUsd(b.ownerBalance),
      };
    },
  },
  {
    name: "find_agents",
    description: "Search the EmberSign directory of agent services. Returns handle, slug, name, description, price.",
    input_schema: { type: "object", properties: { query: { type: "string", description: "words to match; omit to list all" } } },
    money: false,
    async run(c, input) {
      const q = str(input.query, 100).trim();
      const rows = await db
        .select({
          handle: schema.users.handle,
          slug: schema.services.slug,
          name: schema.services.name,
          description: schema.services.description,
          price: schema.services.priceUsd,
          ownerId: schema.users.id,
        })
        .from(schema.services)
        .innerJoin(schema.users, eq(schema.users.id, schema.services.userId))
        .where(
          and(
            eq(schema.services.active, true),
            q ? or(ilike(schema.services.name, `%${q}%`), ilike(schema.services.description, `%${q}%`), ilike(schema.users.handle, `%${q}%`)) : undefined,
          ),
        )
        .limit(25);
      return rows
        .filter((r) => r.handle && r.ownerId !== c.userId)
        .map((r) => ({ handle: r.handle, slug: r.slug, name: r.name, description: r.description, price_usd: Number(r.price), url: emberServiceUrl(r.handle!, r.slug) }));
    },
  },
  {
    name: "hire_agent",
    description: "Pay another EmberSign agent's service over x402 and return its output. Use the exact handle and slug from find_agents.",
    input_schema: {
      type: "object",
      properties: { handle: { type: "string" }, slug: { type: "string" }, input: { type: "string", description: "clear, self-contained input for the service" } },
      required: ["handle", "slug", "input"],
    },
    money: true,
    async run(c, input) {
      const handle = str(input.handle, 40).replace(/^@/, "").toLowerCase();
      const slug = str(input.slug, 60).toLowerCase();
      const me = await db.query.users.findFirst({ where: eq(schema.users.id, c.userId) });
      if (me?.handle === handle) return { status: "refused", reason: "An agent never hires itself." };
      const r = await pay(c.userId, emberServiceUrl(handle, slug), { method: "POST", body: JSON.stringify({ input: str(input.input, 8000) }) }, { purpose: `hire @${handle}/${slug}`, via: c.via });
      if (r.status === "done") {
        try {
          r.result = (JSON.parse(r.result) as { output?: string }).output ?? r.result;
        } catch {
          /* keep raw */
        }
      }
      return describePay(r);
    },
  },
  {
    name: "paid_fetch",
    description: "Pay an x402 seller on the owner's allowlist and return the response (first 4 KB).",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string" },
        method: { type: "string", enum: ["GET", "POST"] },
        body: { type: "string", description: "JSON body for POST" },
        purpose: { type: "string", description: "why this is being bought" },
      },
      required: ["url", "purpose"],
    },
    money: true,
    async run(c, input) {
      const method = input.method === "POST" ? "POST" : "GET";
      return describePay(await pay(c.userId, str(input.url, 2000), { method, body: method === "POST" ? str(input.body, 8000) : undefined }, { purpose: str(input.purpose, 300), via: c.via }));
    },
  },
  {
    name: "get_activity",
    description: "Recent payments out and earnings in, newest first.",
    input_schema: { type: "object", properties: { limit: { type: "number" } } },
    money: false,
    async run(c, input) {
      const limit = Math.min(Math.max(Number(input.limit) || 10, 1), 50);
      const out = await db.query.payments.findMany({ where: eq(schema.payments.userId, c.userId), orderBy: desc(schema.payments.createdAt), limit });
      const earned = await db
        .select({ amount: schema.earnings.amountUsdc, tx: schema.earnings.settleTx, at: schema.earnings.createdAt, service: schema.services.name })
        .from(schema.earnings)
        .innerJoin(schema.services, eq(schema.services.id, schema.earnings.serviceId))
        .where(eq(schema.services.userId, c.userId))
        .orderBy(desc(schema.earnings.createdAt))
        .limit(limit);
      return {
        paid: out.map((p) => ({ kind: p.kind, to: p.host, usd: unitsToUsd(p.amountUsdc), status: p.status, reason: p.reason, at: p.createdAt })),
        earned: earned.map((e) => ({ service: e.service, usd: unitsToUsd(e.amount), tx: explorerTx(e.tx), at: e.at })),
      };
    },
  },
  {
    name: "list_worlds",
    description: "Playground worlds agents can enter: name, address (slug), owner, description.",
    input_schema: { type: "object", properties: {} },
    money: false,
    async run() {
      await ensureHarbor();
      return (await listWorlds()).map((w) => ({ slug: w.slug, name: w.name, owner: w.owner ? `@${w.owner}` : "EmberSign", description: w.description }));
    },
  },
  {
    name: "world_info",
    description: "Inside a world: its stalls (services to buy with hire_agent), open tasks with USDC rewards, and recent activity.",
    input_schema: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] },
    money: false,
    async run(_c, input) {
      if (str(input.slug, 40) === "harbor") await ensureHarbor();
      return (await worldView(str(input.slug, 40).toLowerCase())) ?? { error: "no such world" };
    },
  },
  {
    name: "submit_task",
    description: "Submit your work for an open task in a world. The world's owner reviews it; if approved, the reward is paid in USDC to your owner's wallet.",
    input_schema: { type: "object", properties: { task_id: { type: "string" }, result: { type: "string", description: "the finished work, self-contained" } }, required: ["task_id", "result"] },
    money: true,
    async run(c, input) {
      return submitTask(c.userId, str(input.task_id, 40), str(input.result, 4000));
    },
  },
];

export const toolByName = (n: string) => TOOLS.find((t) => t.name === n);

export async function runTool(c: Caller, name: string, input: Record<string, unknown>): Promise<unknown> {
  const t = toolByName(name);
  if (!t) return { error: `unknown tool ${name}` };
  if (t.money && c.scope !== "pay") return { status: "refused", reason: "This API key is read-only." };
  try {
    return await t.run(c, input ?? {});
  } catch (e) {
    return { error: String((e as Error).message ?? e).slice(0, 300) };
  }
}
