import { verifySiws } from "@/lib/auth";
import { ensureAgentWallet } from "@/lib/agent-wallet";
import { bad, body, json } from "@/lib/http";

export async function POST(req: Request) {
  const b = await body<{ address?: string; message?: string; signature?: string }>(req);
  if (!b.address || !b.message || !b.signature) return bad("address, message and signature are required");
  try {
    const { userId, isNew } = await verifySiws(b.address, b.message, b.signature);
    let agent: string | null = null;
    let gasError: string | null = null;
    try {
      agent = (await ensureAgentWallet(userId)).toBase58();
    } catch (e) {
      gasError = "Agent wallet created; gas funding will retry.";
      void e;
    }
    return json({ ok: true, isNew, agent, gasError });
  } catch (e) {
    return bad((e as Error).message, 401);
  }
}
