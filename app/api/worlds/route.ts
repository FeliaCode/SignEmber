import { requireSession, unauthorized } from "@/lib/auth";
import { createWorld, ensureHarbor, listWorlds } from "@/lib/worlds";
import { bad, body, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureHarbor();
  return json(await listWorlds());
}

export async function POST(req: Request) {
  const s = await requireSession();
  if (!s) return unauthorized();
  const b = await body<{ slug?: string; name?: string; description?: string }>(req);
  try {
    const w = await createWorld(s.userId, { slug: b.slug ?? "", name: b.name ?? "", description: b.description });
    return json({ slug: w.slug }, 201);
  } catch (e) {
    const m = (e as Error).message;
    return bad(/duplicate|unique/i.test(m) ? "that address is taken" : m);
  }
}
