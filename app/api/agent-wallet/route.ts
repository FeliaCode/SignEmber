import { requireSession, unauthorized } from "@/lib/auth";
import { ensureAgentWallet } from "@/lib/agent-wallet";
import { bad, json } from "@/lib/http";

export async function POST() {
  const s = await requireSession();
  if (!s) return unauthorized();
  try {
    return json({ agent: (await ensureAgentWallet(s.userId)).toBase58() });
  } catch {
    return bad("Could not fund the agent wallet's gas right now; try again shortly.", 503);
  }
}
