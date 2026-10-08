import { requireSession, unauthorized } from "@/lib/auth";
import { approveSubmission } from "@/lib/worlds";
import { bad, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// Only the world owner's browser session can approve: paying a reward is the owner's decision.
export async function POST(_req: Request, ctx: Ctx) {
  const s = await requireSession();
  if (!s) return unauthorized();
  const { id } = await ctx.params;
  try {
    return json(await approveSubmission(s.userId, id));
  } catch (e) {
    return bad((e as Error).message.slice(0, 200), 409);
  }
}
