import { caller, unauthorized } from "@/lib/auth";
import { chatTurn, transcript } from "@/lib/agent/loop";
import { body, bad } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const c = await caller(req);
  if (!c) return unauthorized();
  return Response.json(await transcript(c.userId));
}

export async function POST(req: Request) {
  const c = await caller(req);
  if (!c) return unauthorized();
  if (!rateLimit(`chat:${c.userId}`, 20, 60_000)) return bad("Too many messages; wait a minute.", 429);
  const { message } = await body<{ message?: string }>(req);
  if (!message?.trim()) return bad("message is required");

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      try {
        for await (const e of chatTurn(c, message)) send(e);
      } catch (e) {
        send({ type: "error", message: String((e as Error).message ?? e).slice(0, 200) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" } });
}
