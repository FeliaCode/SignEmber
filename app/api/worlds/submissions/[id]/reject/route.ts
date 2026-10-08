import { requireSession, unauthorized } from "@/lib/auth";
import { rejectSubmission } from "@/lib/worlds";
import { bad, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const s = await requireSession();
  if (!s) return unauthorized();
  const { id } = await ctx.params;
  try {
    await rejectSubmission(s.userId, id);
    return json({ ok: true });
  } catch (e) {
    return bad((e as Error).message, 409);
  }
}
