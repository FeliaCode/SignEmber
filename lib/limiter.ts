// EmberLimiter client: PDA, instruction encoders, account decoder, event parser.
// Browser-safe (no node:crypto): Anchor discriminators are precomputed
// (sha256("global:<ix>") / sha256("account:Allowance") / sha256("event:Spent"), first 8 bytes).

import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Buffer } from "buffer";

export const LIMITER_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_LIMITER_PROGRAM_ID ?? "C6GmJ6m2sFVdzZTEvLsqzze1DseU2DrHd82jovhCMn8w",
);

const IX_CONFIGURE = Uint8Array.from([245, 7, 108, 117, 95, 196, 54, 217]);
const IX_REVOKE = Uint8Array.from([170, 23, 31, 34, 133, 173, 93, 242]);
const IX_SPEND = Uint8Array.from([242, 205, 255, 87, 101, 217, 245, 57]);
const ACCOUNT_ALLOWANCE = Uint8Array.from([144, 8, 184, 213, 49, 248, 73, 131]);
const EVENT_SPENT = Uint8Array.from([43, 51, 164, 100, 191, 244, 174, 98]);

export const SECONDS_PER_DAY = 86_400n;

export function allowancePda(owner: PublicKey, programId = LIMITER_PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("allowance"), owner.toBuffer()], programId)[0];
}

function u64(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

export function configureIx(
  owner: PublicKey,
  agent: PublicKey,
  dailyCap: bigint,
  perTxCap: bigint,
  programId = LIMITER_PROGRAM_ID,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: allowancePda(owner, programId), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([IX_CONFIGURE, agent.toBuffer(), u64(dailyCap), u64(perTxCap)]),
  });
}

export function revokeIx(owner: PublicKey, programId = LIMITER_PROGRAM_ID): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: false },
      { pubkey: allowancePda(owner, programId), isSigner: false, isWritable: true },
    ],
    data: Buffer.from(IX_REVOKE),
  });
}

/** source/destination default to the owner's and agent's USDC ATAs. */
export function spendIx(args: {
  agent: PublicKey;
  owner: PublicKey;
  mint: PublicKey;
  amount: bigint;
  ref: Uint8Array;
  source?: PublicKey;
  destination?: PublicKey;
  programId?: PublicKey;
}): TransactionInstruction {
  const programId = args.programId ?? LIMITER_PROGRAM_ID;
  if (args.ref.length !== 32) throw new Error("ref must be 32 bytes");
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: args.agent, isSigner: true, isWritable: false },
      { pubkey: args.owner, isSigner: false, isWritable: false },
      { pubkey: allowancePda(args.owner, programId), isSigner: false, isWritable: true },
      { pubkey: args.mint, isSigner: false, isWritable: false },
      { pubkey: args.source ?? getAssociatedTokenAddressSync(args.mint, args.owner), isSigner: false, isWritable: true },
      { pubkey: args.destination ?? getAssociatedTokenAddressSync(args.mint, args.agent), isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([IX_SPEND, u64(args.amount), Buffer.from(args.ref)]),
  });
}

export interface Allowance {
  agent: PublicKey;
  dailyCap: bigint;
  perTxCap: bigint;
  spentToday: bigint;
  day: bigint;
  revoked: boolean;
  bump: number;
}

export function decodeAllowance(data: Uint8Array): Allowance {
  const b = Buffer.from(data);
  if (b.length < 8 + 32 + 8 * 4 + 2 || !b.subarray(0, 8).equals(Buffer.from(ACCOUNT_ALLOWANCE))) {
    throw new Error("not an Allowance account");
  }
  return {
    agent: new PublicKey(b.subarray(8, 40)),
    dailyCap: b.readBigUInt64LE(40),
    perTxCap: b.readBigUInt64LE(48),
    spentToday: b.readBigUInt64LE(56),
    day: b.readBigInt64LE(64),
    revoked: b[72] === 1,
    bump: b[73],
  };
}

/** Same arithmetic as the program: what can still move today, at `nowSec`. */
export function remaining(a: Allowance | null, nowSec: bigint): { today: bigint; perTx: bigint; active: boolean } {
  if (!a) return { today: 0n, perTx: 0n, active: false };
  const active = !a.revoked && !a.agent.equals(PublicKey.default);
  if (!active) return { today: 0n, perTx: 0n, active: false };
  const day = nowSec / SECONDS_PER_DAY;
  const spent = day === a.day ? a.spentToday : 0n;
  const today = a.dailyCap > spent ? a.dailyCap - spent : 0n;
  return { today, perTx: a.perTxCap < today ? a.perTxCap : today, active };
}

export interface SpentEvent {
  owner: PublicKey;
  agent: PublicKey;
  amount: bigint;
  ref: Uint8Array;
  spentToday: bigint;
}

/** Parses `Program data:` log lines for Spent events. */
export function parseSpentEvents(logs: string[]): SpentEvent[] {
  const out: SpentEvent[] = [];
  for (const line of logs) {
    const m = /^Program data: (.+)$/.exec(line);
    if (!m) continue;
    const b = Buffer.from(m[1], "base64");
    if (b.length < 8 + 32 + 32 + 8 + 32 + 8 || !b.subarray(0, 8).equals(Buffer.from(EVENT_SPENT))) continue;
    out.push({
      owner: new PublicKey(b.subarray(8, 40)),
      agent: new PublicKey(b.subarray(40, 72)),
      amount: b.readBigUInt64LE(72),
      ref: Uint8Array.from(b.subarray(80, 112)),
      spentToday: b.readBigUInt64LE(112),
    });
  }
  return out;
}
