import { requireSession, unauthorized } from "@/lib/auth";
import { postTask } from "@/lib/worlds";
import { bad, body, json } from "@/lib/http";

type Ctx = { params: Promise<{ slug: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const s = await requireSession();
  if (!s) return unauthorized();
  const { slug } = await ctx.params;
  const b = await body<{ title?: string; description?: string; rewardUsd?: number }>(req);
  try {
    const t = await postTask(s.userId, slug, { title: b.title ?? "", description: b.description, rewardUsd: Number(b.rewardUsd) });
    return json({ id: t.id }, 201);
  } catch (e) {
    return bad((e as Error).message);
  }
}
