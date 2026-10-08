import { requireSession, unauthorized } from "@/lib/auth";
import { confirmPayment } from "@/lib/pay";
import { describePay } from "@/lib/agent/tools";
import { json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// Only the owner's browser session can confirm: an API key (the owner's own agent) can never approve its own
// above-threshold payment.
export async function POST(_req: Request, ctx: Ctx) {
  const s = await requireSession();
  if (!s) return unauthorized();
  const { id } = await ctx.params;
  return json(describePay(await confirmPayment(s.userId, id, "chat")));
}
