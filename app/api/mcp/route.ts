// MCP over Streamable HTTP (stateless, JSON responses). Connect a terminal agent with:
//   claude mcp add --transport http embersign <APP_URL>/api/mcp --header "Authorization: Bearer ek_..."
// The same tools and the same pay() path as the in-house agent and the REST API.
import { callerFromKey } from "@/lib/auth";
import { TOOLS, runTool } from "@/lib/agent/tools";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PROTOCOL = "2025-06-18";
type RpcReq = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

const ok = (id: RpcReq["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const err = (id: RpcReq["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export async function GET() {
  return new Response("EmberSign MCP: POST JSON-RPC here with Authorization: Bearer <api key>", { status: 405, headers: { allow: "POST" } });
}

export async function POST(req: Request) {
  const c = await callerFromKey(req.headers.get("authorization"), "mcp");
  if (!c) return Response.json(err(null, -32001, "missing or invalid API key"), { status: 401, headers: { "www-authenticate": "Bearer" } });
  if (!rateLimit(`mcp:${c.userId}`, 60, 60_000)) return Response.json(err(null, -32002, "rate limited"), { status: 429 });

  let payload: RpcReq | RpcReq[];
  try {
    payload = await req.json();
  } catch {
    return Response.json(err(null, -32700, "parse error"), { status: 400 });
  }
  const batch = Array.isArray(payload) ? payload : [payload];
  const out = [];
  for (const m of batch) {
    const r = await handle(c, m);
    if (r) out.push(r);
  }
  if (out.length === 0) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(payload) ? out : out[0], { headers: { "mcp-protocol-version": PROTOCOL } });
}

async function handle(c: NonNullable<Awaited<ReturnType<typeof callerFromKey>>>, m: RpcReq) {
  const isNotification = m.id === undefined;
  switch (m.method) {
    case "initialize":
      return ok(m.id, {
        protocolVersion: PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "embersign", version: "0.1.0" },
        instructions:
          "EmberSign pays for things in USDC on Solana inside limits the owner set onchain. Pay only for what your user asked for; if a call is refused, report the reason instead of retrying another way. Call get_budget before any paid step. Payments above the owner's ask-above threshold return awaiting_confirm: the owner confirms in the EmberSign dashboard.",
      });
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return ok(m.id, {});
    case "tools/list":
      return ok(m.id, {
        tools: TOOLS.filter((t) => c.scope === "pay" || !t.money).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.input_schema,
          annotations: { readOnlyHint: !t.money, destructiveHint: false, openWorldHint: true },
        })),
      });
    case "tools/call": {
      const name = String(m.params?.name ?? "");
      const args = (m.params?.arguments ?? {}) as Record<string, unknown>;
      const result = await runTool(c, name, args);
      const isError = !!(result as { error?: unknown })?.error;
      return ok(m.id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result, isError });
    }
    default:
      return isNotification ? null : err(m.id, -32601, `method not found: ${m.method}`);
  }
}
