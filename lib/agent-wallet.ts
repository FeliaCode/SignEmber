// Agent wallets: one per owner, created on first sign-in. The secret key is decrypted only inside
// withAgentKey(), which the pay path uses; no route ever returns it.
import "server-only";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decryptSecret, encryptSecret, sha256 } from "./crypto";
import { connection, keypairFromEnv, sendIxs, usdcBalance, usdcMint, USDC_DECIMALS } from "./chain";
import { env } from "./env";
import { spendIx } from "./limiter";
import { planPull } from "./float";

const GAS_INITIAL = 0.01 * LAMPORTS_PER_SOL;
const GAS_FLOOR = 0.003 * LAMPORTS_PER_SOL;
export { FLOAT_MAX, FLOAT_LOW, FLOAT_REFILL } from "./float";

export async function getAgentAddress(userId: string): Promise<PublicKey | null> {
  const row = await db.query.agentWallets.findFirst({ where: eq(schema.agentWallets.userId, userId) });
  return row ? new PublicKey(row.address) : null;
}

/** Create the agent wallet if missing, fund gas, create its USDC account. Idempotent. */
export async function ensureAgentWallet(userId: string): Promise<PublicKey> {
  let addr = await getAgentAddress(userId);
  if (!addr) {
    const kp = Keypair.generate();
    await db
      .insert(schema.agentWallets)
      .values({ userId, address: kp.publicKey.toBase58(), encKey: encryptSecret(kp.secretKey) })
      .onConflictDoNothing();
    kp.secretKey.fill(0);
    addr = (await getAgentAddress(userId))!;
  }
  await topUpGas(addr);
  return addr;
}

export async function topUpGas(agent: PublicKey): Promise<void> {
  const conn = connection();
  const bal = await conn.getBalance(agent);
  const ata = getAssociatedTokenAddressSync(usdcMint(), agent);
  const hasAta = !!(await conn.getAccountInfo(ata));
  if (bal >= GAS_FLOOR && hasAta) return;
  const treasury = keypairFromEnv(env.gasTreasuryKey);
  const ixs = [];
  if (bal < GAS_FLOOR) ixs.push(SystemProgram.transfer({ fromPubkey: treasury.publicKey, toPubkey: agent, lamports: GAS_INITIAL - bal }));
  // the treasury pays the agent's USDC account rent, so the agent's SOL is only for fees
  if (!hasAta) ixs.push(createAssociatedTokenAccountIdempotentInstruction(treasury.publicKey, ata, agent, usdcMint()));
  await sendIxs(ixs, [treasury]);
}

export async function withAgentKey<T>(userId: string, fn: (kp: Keypair) => Promise<T>): Promise<T> {
  const row = await db.query.agentWallets.findFirst({ where: eq(schema.agentWallets.userId, userId) });
  if (!row) throw new Error("no agent wallet");
  const secret = decryptSecret(row.encKey);
  const kp = Keypair.fromSecretKey(secret);
  try {
    return await fn(kp);
  } finally {
    secret.fill(0);
    kp.secretKey.fill(0);
  }
}

export const paymentRef = (paymentId: string) => new Uint8Array(sha256(paymentId));

/**
 * Make sure the agent holds at least `amount` USDC for a payment.
 * Float rule: if the payment fits in the float use it; if the float would drop below $0.05 refill $0.25
 * along with the payment; a payment bigger than the float is funded just in time with its exact amount.
 * Returns the spend() signature, or null when the float covered it.
 */
export async function fundAgent(
  userId: string,
  owner: PublicKey,
  amount: bigint,
  paymentId: string,
  maxPull: bigint, // what the limiter allows in one spend right now
): Promise<string | null> {
  return withAgentKey(userId, async (agent) => {
    const pull = planPull(await usdcBalance(agent.publicKey), amount, maxPull);
    if (pull === 0n) return null;
    await topUpGas(agent.publicKey);
    return sendIxs([spendIx({ agent: agent.publicKey, owner, mint: usdcMint(), amount: pull, ref: paymentRef(paymentId) })], [agent]);
  });
}

/** Return every USDC unit in the agent wallet to the owner. */
export async function sweep(userId: string, owner: PublicKey): Promise<string | null> {
  return withAgentKey(userId, async (agent) => {
    const bal = await usdcBalance(agent.publicKey);
    if (bal === 0n) return null;
    const mint = usdcMint();
    return sendIxs(
      [
        createAssociatedTokenAccountIdempotentInstruction(agent.publicKey, getAssociatedTokenAddressSync(mint, owner), owner, mint),
        createTransferCheckedInstruction(
          getAssociatedTokenAddressSync(mint, agent.publicKey),
          mint,
          getAssociatedTokenAddressSync(mint, owner),
          agent.publicKey,
          bal,
          USDC_DECIMALS,
        ),
      ],
      [agent],
    );
  });
}
