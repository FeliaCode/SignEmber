// Solana RPC proxy for the browser: the RPC provider key stays on the server. Only the calls the dashboard needs
// (blockhash, send, confirm, a few reads) pass; everything else is refused. Rate-limited per client IP.
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED = new Set([
  "getLatestBlockhash",
  "isBlockhashValid",
  "sendTransaction",
  "simulateTransaction",
  "getSignatureStatuses",
  "getBlockHeight",
  "getSlot",
  "getAccountInfo",
  "getBalance",
  "getTokenAccountBalance",
  "getMinimumBalanceForRentExemption",
  "getFeeForMessage",
  "getGenesisHash",
  "getVersion",
  "getEpochInfo",
]);

type Rpc = { jsonrpc: "2.0"; id?: unknown; method?: string; params?: unknown };
const refuse = (id: unknown, message: string, code = -32601) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export async function POST(req: Request) {
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`rpc:${ip}`, 120, 60_000)) return Response.json(refuse(null, "rate limited", -32005), { status: 429 });
  let body: Rpc | Rpc[];
  try {
    body = await req.json();
  } catch {
    return Response.json(refuse(null, "parse error", -32700), { status: 400 });
  }
  const batch = Array.isArray(body) ? body : [body];
  if (batch.length === 0 || batch.length > 20) return Response.json(refuse(null, "bad batch", -32600), { status: 400 });
  const bad = batch.find((m) => !m || typeof m.method !== "string" || !ALLOWED.has(m.method));
  if (bad) return Response.json(refuse(bad?.id, `method not allowed: ${String(bad?.method)}`), { status: 403 });

  const upstream = await fetch(env.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  return new Response(await upstream.text(), { status: upstream.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
