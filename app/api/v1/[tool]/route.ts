// REST for an owner's own agent: POST /api/v1/<tool> with `Authorization: Bearer ek_...` and the tool's
// input as JSON. GET /api/v1/tools lists the tools with their input schemas.
import { callerFromKey, unauthorized } from "@/lib/auth";
import { TOOLS, runTool, toolByName } from "@/lib/agent/tools";
import { body, bad, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Ctx = { params: Promise<{ tool: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { tool } = await ctx.params;
  if (tool !== "tools") return bad("use POST, or GET /api/v1/tools", 405);
  const c = await callerFromKey(req.headers.get("authorization"), "api");
  if (!c) return unauthorized();
  return json(TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema, moves_money: t.money })));
}

export async function POST(req: Request, ctx: Ctx) {
  const { tool } = await ctx.params;
  const c = await callerFromKey(req.headers.get("authorization"), "api");
  if (!c) return unauthorized();
  if (!toolByName(tool)) return bad(`unknown tool ${tool}`, 404);
  if (!rateLimit(`api:${c.userId}`, 60, 60_000)) return bad("rate limited", 429);
  return json(await runTool(c, tool, await body(req)));
}
