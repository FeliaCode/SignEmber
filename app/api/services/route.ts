import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession, unauthorized } from "@/lib/auth";
import { emberServiceUrl } from "@/lib/pay";
import { unitsToUsd } from "@/lib/chain";
import { bad, body, json, SLUG_RE } from "@/lib/http";

export const dynamic = "force-dynamic";

interface ServiceInput {
  id?: string;
  slug?: string;
  name?: string;
  description?: string;
  priceUsd?: number | string;
  prompt?: string;
  active?: boolean;
  worldSlug?: string | null;
}

function validate(b: ServiceInput, partial: boolean): string | null {
  if (!partial || b.slug !== undefined) if (!SLUG_RE.test(String(b.slug ?? ""))) return "slug: lowercase letters, digits and dashes";
  if (!partial || b.name !== undefined) if (!String(b.name ?? "").trim() || String(b.name).length > 60) return "name: 1-60 characters";
  if (b.description !== undefined && String(b.description).length > 200) return "description: up to 200 characters";
  if (!partial || b.priceUsd !== undefined) {
    const p = Number(b.priceUsd);
    if (!(p >= 0.001 && p <= 100)) return "price: between $0.001 and $100";
  }
  if (!partial || b.prompt !== undefined) if (!String(b.prompt ?? "").trim() || String(b.prompt).length > 4000) return "prompt: 1-4000 characters";
  return null;
}

async function worldIdFor(userId: string, slug: string | null | undefined): Promise<string | null | undefined> {
  if (slug === undefined) return undefined;
  if (!slug) return null;
  const w = await db.query.worlds.findFirst({ where: and(eq(schema.worlds.slug, slug), eq(schema.worlds.userId, userId)) });
  if (!w) throw new Error("you can only add stalls to your own worlds");
  return w.id;
}

export async function GET() {
  const s = await requireSession();
  if (!s) return unauthorized();
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, s.userId) });
  const rows = await db
    .select({
      service: schema.services,
      earned: sql<number>`coalesce((select sum(${schema.earnings.amountUsdc}) from ${schema.earnings} where ${schema.earnings.serviceId} = ${schema.services.id}), 0)`,
      calls: sql<number>`(select count(*) from ${schema.earnings} where ${schema.earnings.serviceId} = ${schema.services.id})`,
    })
    .from(schema.services)
    .where(eq(schema.services.userId, s.userId));
  return json(
    rows.map((r) => ({
      ...r.service,
      priceUsd: Number(r.service.priceUsd),
      url: user?.handle ? emberServiceUrl(user.handle, r.service.slug) : null,
      earnedUsd: unitsToUsd(Number(r.earned)),
      calls: Number(r.calls),
    })),
  );
}

export async function POST(req: Request) {
  const s = await requireSession();
  if (!s) return unauthorized();
  const b = await body<ServiceInput>(req);
  const err = validate(b, false);
  if (err) return bad(err);
  let worldId: string | null | undefined;
  try {
    worldId = await worldIdFor(s.userId, b.worldSlug);
  } catch (e) {
    return bad((e as Error).message);
  }
  try {
    const [row] = await db
      .insert(schema.services)
      .values({ userId: s.userId, slug: b.slug!, name: b.name!.trim(), description: (b.description ?? "").trim(), priceUsd: String(Number(b.priceUsd)), prompt: b.prompt!, active: b.active ?? true, worldId: worldId ?? null })
      .returning();
    return json(row, 201);
  } catch {
    return bad("you already have a service with that slug", 409);
  }
}

export async function PATCH(req: Request) {
  const s = await requireSession();
  if (!s) return unauthorized();
  const b = await body<ServiceInput>(req);
  if (!b.id) return bad("id is required");
  const err = validate(b, true);
  if (err) return bad(err);
  const patch: Partial<typeof schema.services.$inferInsert> = {};
  if (b.slug !== undefined) patch.slug = b.slug;
  if (b.name !== undefined) patch.name = b.name.trim();
  if (b.description !== undefined) patch.description = b.description.trim();
  if (b.priceUsd !== undefined) patch.priceUsd = String(Number(b.priceUsd));
  if (b.prompt !== undefined) patch.prompt = b.prompt;
  if (b.active !== undefined) patch.active = !!b.active;
  try {
    const wid = await worldIdFor(s.userId, b.worldSlug);
    if (wid !== undefined) patch.worldId = wid;
  } catch (e) {
    return bad((e as Error).message);
  }
  const [row] = await db.update(schema.services).set(patch).where(and(eq(schema.services.id, b.id), eq(schema.services.userId, s.userId))).returning();
  return row ? json(row) : bad("not found", 404);
}
