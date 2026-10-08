import { ensureHarbor, HARBOR, worldView } from "@/lib/worlds";
import { bad, json } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ slug: string }> };

// Public: the world's stalls, tasks and live feed.
export async function GET(_req: Request, ctx: Ctx) {
  const { slug } = await ctx.params;
  if (slug === HARBOR) await ensureHarbor();
  const v = await worldView(slug.toLowerCase());
  return v ? json(v) : bad("no such world", 404);
}
