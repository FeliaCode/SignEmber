import { handleServiceCall } from "@/lib/sell";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ handle: string; slug: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { handle, slug } = await ctx.params;
  return handleServiceCall(req, handle.toLowerCase(), slug.toLowerCase());
}

// GET answers with the 402 too, so any x402 client can discover price and payTo.
export async function GET(req: Request, ctx: Ctx) {
  const { handle, slug } = await ctx.params;
  return handleServiceCall(new Request(req.url, { method: "POST", headers: req.headers }), handle.toLowerCase(), slug.toLowerCase());
}
