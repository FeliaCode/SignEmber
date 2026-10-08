import { caller, unauthorized } from "@/lib/auth";
import { cancelPayment } from "@/lib/pay";
import { json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const c = await caller(req);
  if (!c) return unauthorized();
  const { id } = await ctx.params;
  return json({ cancelled: await cancelPayment(c.userId, id) });
}
