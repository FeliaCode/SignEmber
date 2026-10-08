import { and, desc, eq, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { explorerTx, unitsToUsd } from "@/lib/chain";
import { emberServiceUrl } from "@/lib/pay";
import { bad, json } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ handle: string }> };

// Public agent profile: handle, services, worlds, and real receipts it is part of (handles only, no wallets).
export async function GET(_req: Request, ctx: Ctx) {
  const handle = (await ctx.params).handle.toLowerCase().replace(/^@/, "");
  const u = await db.query.users.findFirst({ where: eq(schema.users.handle, handle) });
  if (!u) return bad("no such agent", 404);

  const services = await db.query.services.findMany({ where: and(eq(schema.services.userId, u.id), eq(schema.services.active, true)) });
  const worlds = await db.query.worlds.findMany({ where: eq(schema.worlds.userId, u.id) });

  const payer = alias(schema.users, "payer");
  const seller = alias(schema.users, "seller");
  const deals = await db
    .select({ at: schema.payments.createdAt, amount: schema.payments.amountUsdc, tx: schema.payments.settleTx, payer: payer.handle, seller: seller.handle, service: schema.services.name })
    .from(schema.payments)
    .innerJoin(payer, eq(payer.id, schema.payments.userId))
    .innerJoin(schema.services, eq(schema.services.id, schema.payments.serviceId))
    .innerJoin(seller, eq(seller.id, schema.services.userId))
    .where(and(eq(schema.payments.status, "done"), eq(schema.payments.kind, "agent"), or(eq(payer.id, u.id), eq(seller.id, u.id))))
    .orderBy(desc(schema.payments.createdAt))
    .limit(20);
  const rewards = await db
    .select({ at: schema.worldSubmissions.createdAt, amount: schema.worldTasks.rewardUsdc, tx: schema.worldSubmissions.payTx, task: schema.worldTasks.title, world: schema.worlds.name })
    .from(schema.worldSubmissions)
    .innerJoin(schema.worldTasks, eq(schema.worldTasks.id, schema.worldSubmissions.taskId))
    .innerJoin(schema.worlds, eq(schema.worlds.id, schema.worldTasks.worldId))
    .where(and(eq(schema.worldSubmissions.userId, u.id), eq(schema.worldSubmissions.status, "paid")))
    .orderBy(desc(schema.worldSubmissions.createdAt))
    .limit(20);

  const earned = deals.filter((d) => d.seller === handle).reduce((s, d) => s + d.amount, 0) + rewards.reduce((s, r) => s + r.amount, 0);
  const spent = deals.filter((d) => d.payer === handle).reduce((s, d) => s + d.amount, 0);
  return json({
    handle,
    joined: u.createdAt,
    stats: { earnedUsd: unitsToUsd(earned), spentUsd: unitsToUsd(spent), deals: deals.length + rewards.length },
    services: services.map((s) => ({ name: s.name, description: s.description, priceUsd: Number(s.priceUsd), url: emberServiceUrl(handle, s.slug) })),
    worlds: worlds.map((w) => ({ slug: w.slug, name: w.name })),
    receipts: [
      ...deals.map((d) => ({ at: d.at, text: d.payer === handle ? `Paid @${d.seller} for ${d.service}` : `Sold ${d.service} to @${d.payer}`, usd: unitsToUsd(d.amount), earned: d.seller === handle, tx: d.tx ? explorerTx(d.tx) : null })),
      ...rewards.map((r) => ({ at: r.at, text: `Reward for “${r.task}” in ${r.world}`, usd: unitsToUsd(r.amount), earned: true, tx: r.tx ? explorerTx(r.tx) : null })),
    ].sort((a, b) => +new Date(b.at) - +new Date(a.at)),
  });
}
