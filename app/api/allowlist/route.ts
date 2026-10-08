import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession, unauthorized } from "@/lib/auth";
import { bad, body, json } from "@/lib/http";

export const dynamic = "force-dynamic";

function normHost(raw: unknown): string | null {
  const s = String(raw ?? "").trim().toLowerCase();
  try {
    const h = new URL(s.includes("://") ? s : `https://${s}`).host;
    return /^[a-z0-9.-]+(:\d+)?$/.test(h) && h.includes(".") ? h : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const s = await requireSession();
  if (!s) return unauthorized();
  return json((await db.query.allowlist.findMany({ where: eq(schema.allowlist.userId, s.userId) })).map((r) => r.host));
}

export async function POST(req: Request) {
  const s = await requireSession();
  if (!s) return unauthorized();
  const host = normHost((await body<{ host?: string }>(req)).host);
  if (!host) return bad("enter a host like api.example.com");
  await db.insert(schema.allowlist).values({ userId: s.userId, host }).onConflictDoNothing();
  return json({ host });
}

export async function DELETE(req: Request) {
  const s = await requireSession();
  if (!s) return unauthorized();
  const host = normHost((await body<{ host?: string }>(req)).host);
  if (!host) return bad("bad host");
  await db.delete(schema.allowlist).where(and(eq(schema.allowlist.userId, s.userId), eq(schema.allowlist.host, host)));
  return json({ removed: host });
}
