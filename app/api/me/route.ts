import { PublicKey } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { budget, connection, unitsToUsd, usdcBalance } from "@/lib/chain";
import { getAgentAddress } from "@/lib/agent-wallet";
import { allowancePda } from "@/lib/limiter";
import { env } from "@/lib/env";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await requireSession();
  if (!s) return json(null); // signed out
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, s.userId) });
  if (!user) return json(null);
  const owner = new PublicKey(user.address);
  const agent = await getAgentAddress(user.id);
  const [b, float, agentSol] = await Promise.all([
    budget(owner),
    agent ? usdcBalance(agent) : 0n,
    agent ? connection().getBalance(agent) : 0,
  ]);
  return json({
    address: user.address,
    handle: user.handle,
    agent: agent?.toBase58() ?? null,
    agentSol: agentSol / 1e9,
    allowancePda: allowancePda(owner).toBase58(),
    active: b.active,
    revoked: b.allowance?.revoked ?? false,
    configured: !!b.allowance,
    dailyCapUsd: unitsToUsd(b.dailyCap),
    perTxCapUsd: unitsToUsd(b.perTxCap),
    leftTodayUsd: unitsToUsd(b.leftToday),
    approvedUsd: unitsToUsd(b.approved),
    ownerUsdcUsd: unitsToUsd(b.ownerBalance),
    floatUsd: unitsToUsd(float),
    askAboveUsd: Number(user.askAboveUsd),
    usdcMint: env.usdcMint,
    network: env.network,
    appUrl: env.appUrl,
    cluster: env.explorerCluster,
  });
}
