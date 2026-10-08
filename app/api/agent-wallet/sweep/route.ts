import { PublicKey } from "@solana/web3.js";
import { requireSession, unauthorized } from "@/lib/auth";
import { sweep } from "@/lib/agent-wallet";
import { explorerTx } from "@/lib/chain";
import { bad, json } from "@/lib/http";

export async function POST() {
  const s = await requireSession();
  if (!s) return unauthorized();
  try {
    const sig = await sweep(s.userId, new PublicKey(s.address));
    return json({ ok: true, tx: sig, explorer: sig ? explorerTx(sig) : null });
  } catch (e) {
    return bad(`Sweep failed: ${(e as Error).message.slice(0, 160)}`, 502);
  }
}
