import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession, unauthorized } from "@/lib/auth";
import { bad, body, json, HANDLE_RE } from "@/lib/http";

const RESERVED = new Set(["api", "x", "admin", "ember", "app", "www", "settings", "market", "chat"]);

export async function PATCH(req: Request) {
  const s = await requireSession();
  if (!s) return unauthorized();
  const b = await body<{ handle?: string; askAboveUsd?: number }>(req);
  const patch: Partial<typeof schema.users.$inferInsert> = {};
  if (b.handle !== undefined) {
    const h = String(b.handle).trim().toLowerCase().replace(/^@/, "");
    if (!HANDLE_RE.test(h) || RESERVED.has(h)) return bad("handle: 2-32 lowercase letters, digits, _ or -");
    patch.handle = h;
  }
  if (b.askAboveUsd !== undefined) {
    const v = Number(b.askAboveUsd);
    if (!(v >= 0 && v <= 1000)) return bad("ask-above: between $0 and $1000");
    patch.askAboveUsd = String(v);
  }
  try {
    const [u] = await db.update(schema.users).set(patch).where(eq(schema.users.id, s.userId)).returning();
    return json({ handle: u.handle, askAboveUsd: Number(u.askAboveUsd) });
  } catch {
    return bad("that handle is taken", 409);
  }
}
