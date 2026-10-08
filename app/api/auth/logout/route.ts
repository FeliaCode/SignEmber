import { session } from "@/lib/auth";

export async function POST() {
  const s = await session();
  s.destroy();
  return Response.json({ ok: true });
}
