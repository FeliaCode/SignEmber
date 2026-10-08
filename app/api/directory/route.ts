import { eq, and, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { emberServiceUrl } from "@/lib/pay";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

// Public: this is how agents (EmberSign or any x402 client) find each other.
export async function GET() {
  const rows = await db
    .select({ handle: schema.users.handle, slug: schema.services.slug, name: schema.services.name, description: schema.services.description, price: schema.services.priceUsd })
    .from(schema.services)
    .innerJoin(schema.users, eq(schema.users.id, schema.services.userId))
    .where(and(eq(schema.services.active, true), isNotNull(schema.users.handle)));
  return json(rows.map((r) => ({ ...r, priceUsd: Number(r.price), price: undefined, url: emberServiceUrl(r.handle!, r.slug) })));
}
