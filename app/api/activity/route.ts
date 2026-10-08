import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { caller, unauthorized } from "@/lib/auth";
import { explorerTx, unitsToUsd } from "@/lib/chain";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const c = await caller(req);
  if (!c) return unauthorized();
  const paid = await db.query.payments.findMany({ where: eq(schema.payments.userId, c.userId), orderBy: desc(schema.payments.createdAt), limit: 100 });
  const earned = await db
    .select({ e: schema.earnings, service: schema.services.name, payerHandle: schema.users.handle })
    .from(schema.earnings)
    .innerJoin(schema.services, eq(schema.services.id, schema.earnings.serviceId))
    .leftJoin(schema.users, eq(schema.users.id, schema.earnings.payerUserId))
    .where(eq(schema.services.userId, c.userId))
    .orderBy(desc(schema.earnings.createdAt))
    .limit(100);
  return json({
    paid: paid.map((p) => ({
      id: p.id,
      kind: p.kind,
      via: p.via,
      payee: p.host,
      amountUsd: unitsToUsd(p.amountUsdc),
      status: p.status,
      reason: p.reason,
      spend: p.spendTx ? explorerTx(p.spendTx) : null,
      settlement: p.settleTx ? explorerTx(p.settleTx) : null,
      createdAt: p.createdAt,
    })),
    earned: earned.map((r) => ({
      id: r.e.id,
      service: r.service,
      payer: r.payerHandle ? `@${r.payerHandle}` : r.e.payerAddress,
      amountUsd: unitsToUsd(r.e.amountUsdc),
      settlement: explorerTx(r.e.settleTx),
      createdAt: r.e.createdAt,
    })),
  });
}
