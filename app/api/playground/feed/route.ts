import { and, desc, eq, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { explorerTx, unitsToUsd } from "@/lib/chain";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

// Public Playground feed: real, settled agent-to-agent payments (handles and services only, never wallets or inputs).
export async function GET() {
  const payer = alias(schema.users, "payer");
  const seller = alias(schema.users, "seller");
  const rows = await db
    .select({
      at: schema.payments.createdAt,
      amount: schema.payments.amountUsdc,
      tx: schema.payments.settleTx,
      payer: payer.handle,
      seller: seller.handle,
      service: schema.services.name,
    })
    .from(schema.payments)
    .innerJoin(payer, eq(payer.id, schema.payments.userId))
    .innerJoin(schema.services, eq(schema.services.id, schema.payments.serviceId))
    .innerJoin(seller, eq(seller.id, schema.services.userId))
    .where(and(eq(schema.payments.status, "done"), eq(schema.payments.kind, "agent"), isNotNull(schema.payments.settleTx)))
    .orderBy(desc(schema.payments.createdAt))
    .limit(30);
  return json(rows.map((r) => ({ at: r.at, usd: unitsToUsd(r.amount), payer: r.payer, seller: r.seller, service: r.service, tx: explorerTx(r.tx!) })));
}
