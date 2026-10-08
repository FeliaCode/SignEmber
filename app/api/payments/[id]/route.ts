import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { caller, unauthorized } from "@/lib/auth";
import { explorerTx, unitsToUsd } from "@/lib/chain";
import { bad, json } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const c = await caller(req);
  if (!c) return unauthorized();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return bad("bad id");
  const p = await db.query.payments.findFirst({ where: and(eq(schema.payments.id, id), eq(schema.payments.userId, c.userId)) });
  if (!p) return bad("not found", 404);
  return json({
    id: p.id,
    kind: p.kind,
    status: p.status,
    reason: p.reason,
    payee: p.host,
    amountUsd: unitsToUsd(p.amountUsdc),
    spend: p.spendTx ? explorerTx(p.spendTx) : null,
    settlement: p.settleTx ? explorerTx(p.settleTx) : null,
    result: p.resultExcerpt,
    request: p.request,
    createdAt: p.createdAt,
  });
}
