// Who is calling: an owner's browser session (SIWS + iron-session), or an owner's own agent / MCP client
// holding an API key. The model never sees or holds either.
import "server-only";
import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import { randomBytes } from "node:crypto";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "./env";
import { sha256hex } from "./crypto";
import type { Via } from "./pay";

export interface SessionData {
  userId?: string;
  address?: string;
  nonce?: string;
  nonceAt?: number;
}

const sessionOptions = (): SessionOptions => ({
  password: env.sessionSecret,
  cookieName: "ember_session",
  cookieOptions: {
    secure: env.appUrl.startsWith("https://"),
    httpOnly: true,
    sameSite: "lax",
    path: new URL(env.appUrl).pathname || "/",
    maxAge: 60 * 60 * 24 * 14,
  },
});

export async function session() {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}

// ---------------------------------------------------------------- SIWS

export function siwsMessage(address: string, nonce: string, issuedAt: string): string {
  const u = new URL(env.appUrl);
  return [
    `${u.host} wants you to sign in with your Solana account:`,
    address,
    "",
    "Sign in to EmberSign. Signing in moves nothing.",
    "",
    `URI: ${env.appUrl}`,
    "Version: 1",
    `Chain ID: ${env.explorerCluster}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

export async function newNonce(): Promise<string> {
  const s = await session();
  s.nonce = bs58.encode(randomBytes(16));
  s.nonceAt = Date.now();
  await s.save();
  return s.nonce;
}

/** Verifies a signed SIWS message; creates the user on first sign-in. */
export async function verifySiws(address: string, message: string, signatureB58: string): Promise<{ userId: string; isNew: boolean }> {
  const s = await session();
  if (!s.nonce || !s.nonceAt || Date.now() - s.nonceAt > 10 * 60_000) throw new Error("sign-in expired, try again");
  const pk = new PublicKey(address);
  const lines = message.split("\n");
  const issued = lines.find((l) => l.startsWith("Issued At: "))?.slice(11) ?? "";
  if (message !== siwsMessage(pk.toBase58(), s.nonce, issued)) throw new Error("sign-in message does not match");
  if (Math.abs(Date.now() - Date.parse(issued)) > 10 * 60_000) throw new Error("sign-in message is stale");
  const ok = nacl.sign.detached.verify(new TextEncoder().encode(message), bs58.decode(signatureB58), pk.toBytes());
  if (!ok) throw new Error("signature does not verify");

  let user = await db.query.users.findFirst({ where: eq(schema.users.address, pk.toBase58()) });
  const isNew = !user;
  if (!user) [user] = await db.insert(schema.users).values({ address: pk.toBase58() }).onConflictDoNothing().returning();
  user ??= await db.query.users.findFirst({ where: eq(schema.users.address, pk.toBase58()) });
  s.userId = user!.id;
  s.address = user!.address;
  s.nonce = undefined;
  s.nonceAt = undefined;
  await s.save();
  return { userId: user!.id, isNew };
}

// ---------------------------------------------------------------- API keys

export function newApiKey(): { key: string; prefix: string; hash: string } {
  const key = `ek_${bs58.encode(randomBytes(32))}`;
  return { key, prefix: key.slice(0, 12), hash: sha256hex(key) };
}

export interface Caller {
  userId: string;
  via: Via;
  scope: "pay" | "read";
}

export async function callerFromKey(authorization: string | null, via: Via): Promise<Caller | null> {
  const m = /^Bearer\s+(ek_[1-9A-HJ-NP-Za-km-z]{30,60})$/.exec(authorization ?? "");
  if (!m) return null;
  const row = await db.query.apiKeys.findFirst({
    where: and(eq(schema.apiKeys.keyHash, sha256hex(m[1])), isNull(schema.apiKeys.revokedAt)),
  });
  if (!row) return null;
  await db.update(schema.apiKeys).set({ lastUsedAt: new Date() }).where(eq(schema.apiKeys.id, row.id));
  return { userId: row.userId, via, scope: row.scope === "read" ? "read" : "pay" };
}

/** Session first (dashboard and in-house agent), else API key. */
export async function caller(req: Request, viaForKey: Via = "api"): Promise<Caller | null> {
  const fromKey = await callerFromKey(req.headers.get("authorization"), viaForKey);
  if (fromKey) return fromKey;
  const s = await session();
  return s.userId ? { userId: s.userId, via: "chat", scope: "pay" } : null;
}

export async function requireSession(): Promise<{ userId: string; address: string } | null> {
  const s = await session();
  return s.userId && s.address ? { userId: s.userId, address: s.address } : null;
}

export const unauthorized = () => Response.json({ error: "sign in or pass an API key" }, { status: 401 });
