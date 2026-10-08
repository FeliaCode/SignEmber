import { requireSession, unauthorized } from "@/lib/auth";
import { myWorlds } from "@/lib/worlds";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await requireSession();
  if (!s) return unauthorized();
  return json(await myWorlds(s.userId));
}
