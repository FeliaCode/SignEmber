import "server-only";
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, ComputeBudgetProgram } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync, TokenAccountNotFoundError } from "@solana/spl-token";
import bs58 from "bs58";
import { env } from "./env";
import { allowancePda, decodeAllowance, remaining, type Allowance } from "./limiter";

export const USDC_DECIMALS = 6;
export const usdcMint = () => new PublicKey(env.usdcMint);

const g = globalThis as unknown as { __emberConn?: Connection };
export const connection = () => (g.__emberConn ??= new Connection(env.rpcUrl, "confirmed"));

export const usdToUnits = (usd: number | string) => BigInt(Math.round(Number(usd) * 10 ** USDC_DECIMALS));
export const unitsToUsd = (u: bigint | number) => Number(u) / 10 ** USDC_DECIMALS;
export const fmtUsd = (u: bigint | number) => `$${unitsToUsd(u).toFixed(unitsToUsd(u) < 0.1 && unitsToUsd(u) > 0 ? 3 : 2)}`;

export function explorerTx(sig: string) {
  return `https://explorer.solana.com/tx/${sig}${env.explorerCluster === "mainnet-beta" ? "" : `?cluster=${env.explorerCluster}`}`;
}

export function keypairFromEnv(secret: string): Keypair {
  const s = secret.trim();
  return Keypair.fromSecretKey(s.startsWith("[") ? Uint8Array.from(JSON.parse(s)) : bs58.decode(s));
}

export async function readAllowance(owner: PublicKey): Promise<Allowance | null> {
  const acc = await connection().getAccountInfo(allowancePda(owner));
  return acc ? decodeAllowance(acc.data) : null;
}

export async function usdcBalance(owner: PublicKey): Promise<bigint> {
  try {
    return (await getAccount(connection(), getAssociatedTokenAddressSync(usdcMint(), owner, true))).amount;
  } catch (e) {
    if (e instanceof TokenAccountNotFoundError) return 0n;
    throw e;
  }
}

/** Delegate state of the owner's USDC account (approval to the limiter PDA). */
export async function approvalState(owner: PublicKey): Promise<{ delegatedToLimiter: boolean; approved: bigint; balance: bigint }> {
  try {
    const a = await getAccount(connection(), getAssociatedTokenAddressSync(usdcMint(), owner));
    const toLimiter = !!a.delegate && a.delegate.equals(allowancePda(owner));
    return { delegatedToLimiter: toLimiter, approved: toLimiter ? a.delegatedAmount : 0n, balance: a.amount };
  } catch (e) {
    if (e instanceof TokenAccountNotFoundError) return { delegatedToLimiter: false, approved: 0n, balance: 0n };
    throw e;
  }
}

/**
 * What the agent can actually move right now: the program's caps, bounded by the SPL approval and the balance.
 * Uses the cluster clock, the same clock the program uses.
 */
export async function budget(owner: PublicKey) {
  const [a, appr, slot] = await Promise.all([readAllowance(owner), approvalState(owner), connection().getSlot()]);
  const nowSec = BigInt((await connection().getBlockTime(slot)) ?? Math.floor(Date.now() / 1000));
  const r = remaining(a, nowSec);
  const limit = [r.today, appr.approved, appr.balance].reduce((m, x) => (x < m ? x : m));
  return {
    allowance: a,
    active: r.active && appr.delegatedToLimiter,
    dailyCap: a?.dailyCap ?? 0n,
    perTxCap: a?.perTxCap ?? 0n,
    leftToday: r.active && appr.delegatedToLimiter ? limit : 0n,
    perTxNow: r.active && appr.delegatedToLimiter ? (r.perTx < limit ? r.perTx : limit) : 0n,
    approved: appr.approved,
    ownerBalance: appr.balance,
  };
}

export async function sendIxs(ixs: TransactionInstruction[], signers: Keypair[]): Promise<string> {
  const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 }), ...ixs);
  return sendAndConfirmTransaction(connection(), tx, signers, { commitment: "confirmed" });
}
