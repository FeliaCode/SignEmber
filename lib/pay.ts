// The one money path out. Every driver (in-house chat agent, API key, MCP) pays through pay(),
// so the onchain caps, the allowlist, the ask-above threshold and the payTo check always apply.
import "server-only";
import { PublicKey } from "@solana/web3.js";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "./env";
import { budget, fmtUsd, usdToUnits } from "./chain";
import { fundAgent, sweep, withAgentKey, getAgentAddress } from "./agent-wallet";
import { isPublicHost } from "./net";
import { parseEmberUrl as parseEmberUrlFor, serviceUrl } from "./urls";
import { H, decodePaymentResponseHeader, encodePaymentSignatureHeader, pickRequirement, readPaymentRequired, signPayment } from "./x402";

export type Via = "chat" | "api" | "mcp";
export interface PayInit {
  method?: "GET" | "POST";
  body?: string;
  contentType?: string;
}
export interface ConfirmCard {
  paymentId: string;
  payee: string; // "@ada · Summarize a URL" or a host
  input: string;
  amountUsdc: number;
  leftTodayAfterUsdc: number;
  confirmUrl: string;
}
export type PayResult =
  | { status: "done"; paymentId: string; amountUsdc: number; payTo: string; spendTx: string | null; settleTx: string | null; result: string; httpStatus: number }
  | { status: "awaiting_confirm"; card: ConfirmCard }
  | { status: "refused"; reason: string }
  | { status: "failed"; paymentId: string; reason: string };

const EXCERPT = 4096;
const TIMEOUT_MS = 25_000;

export const parseEmberUrl = (raw: string) => parseEmberUrlFor(raw, env.appUrl);
export const emberServiceUrl = (handle: string, slug: string) => serviceUrl(env.appUrl, handle, slug);

async function loadUser(userId: string) {
  const u = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!u) throw new Error("unknown user");
  return u;
}

function request(url: string, init: PayInit, headers: Record<string, string> = {}) {
  return fetch(url, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    body: init.body,
    headers: { ...(init.body ? { "content-type": init.contentType ?? "application/json" } : {}), ...headers },
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

async function setStatus(id: string, patch: Partial<typeof schema.payments.$inferInsert>) {
  await db.update(schema.payments).set(patch).where(eq(schema.payments.id, id));
}

/**
 * pay(userId, url, init, { purpose }) — probe, policy, threshold, fund, pay.
 * `confirmedPaymentId` resumes a held payment after the owner pressed Confirm.
 */
export async function pay(
  userId: string,
  url: string,
  init: PayInit,
  opts: { purpose: string; via: Via; confirmedPaymentId?: string },
): Promise<PayResult> {
  if (env.killSwitch) return { status: "refused", reason: "Payments are paused by the operator." };
  const user = await loadUser(userId);
  const owner = new PublicKey(user.address);

  // 1. host check
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return { status: "refused", reason: "That is not a valid URL." };
  }
  const ember = parseEmberUrl(url);
  let newSeller = false;
  let service: typeof schema.services.$inferSelect | undefined;
  let serviceOwner: typeof schema.users.$inferSelect | undefined;
  if (ember) {
    serviceOwner = await db.query.users.findFirst({ where: eq(schema.users.handle, ember.handle) });
    service = serviceOwner
      ? await db.query.services.findFirst({
          where: and(eq(schema.services.userId, serviceOwner.id), eq(schema.services.slug, ember.slug), eq(schema.services.active, true)),
        })
      : undefined;
    if (!service || !serviceOwner) return { status: "refused", reason: `No active EmberSign service at /x/${ember.handle}/${ember.slug}.` };
    if (serviceOwner.id === userId) return { status: "refused", reason: "An agent never hires itself." };
  } else {
    if (target.protocol !== "https:") return { status: "refused", reason: "Only https sellers can be paid." };
    if (!(await isPublicHost(target.hostname))) return { status: "refused", reason: "That host is not a public website." };
    const allowed = await db.query.allowlist.findFirst({
      where: and(eq(schema.allowlist.userId, userId), eq(schema.allowlist.host, target.host.toLowerCase())),
    });
    // a seller the owner hasn't used before (e.g. found by web search) is always held for the owner's Confirm;
    // confirming adds it to the allowlist
    newSeller = !allowed;
  }

  // 2. probe
  let probe: Response;
  try {
    probe = await request(url, init);
  } catch (e) {
    return { status: "refused", reason: `The seller did not answer (${(e as Error).name}).` };
  }
  if (probe.status !== 402) {
    if (probe.ok) return { status: "refused", reason: "The seller did not ask for payment; use a normal fetch." };
    return { status: "refused", reason: `The seller answered ${probe.status} instead of a payment request.` };
  }
  const pr = await readPaymentRequired(probe);
  const req = pr && pickRequirement(pr);
  if (!pr || !req) return { status: "refused", reason: `The seller does not accept USDC on ${env.network} with the exact scheme.` };
  const amount = BigInt(req.amount);

  // 3. policy
  if (service && serviceOwner && req.payTo !== serviceOwner.address) {
    return { status: "refused", reason: "Refused: this EmberSign URL asks to be paid at an address that is not the service owner's." };
  }
  if (service && amount !== usdToUnits(service.priceUsd)) {
    return { status: "refused", reason: "Refused: the price asked does not match the listed price." };
  }
  const agentAddr = await getAgentAddress(userId);
  if (!agentAddr) return { status: "refused", reason: "No agent wallet yet. Finish setup first." };
  if (req.payTo === agentAddr.toBase58() || req.payTo === user.address) return { status: "refused", reason: "Refused: the payee is your own wallet." };
  const b = await budget(owner);
  if (!b.active) return { status: "refused", reason: "Your budget is not active (limits not set, approval missing, or revoked)." };
  if (amount > b.perTxCap) return { status: "refused", reason: `${fmtUsd(amount)} is above your per-payment cap of ${fmtUsd(b.perTxCap)}. Nothing was paid.` };
  if (amount > b.leftToday) return { status: "refused", reason: `${fmtUsd(amount)} is more than what is left today (${fmtUsd(b.leftToday)}). Nothing was paid.` };

  const payee = service && serviceOwner ? `@${serviceOwner.handle} · ${service.name}` : target.host;
  const kind = service ? "agent" : "seller";
  const requestRecord = { method: init.method ?? (init.body ? "POST" : "GET"), body: init.body?.slice(0, 2000) ?? null, purpose: opts.purpose.slice(0, 300), newSeller };

  // 4. threshold
  let paymentId = opts.confirmedPaymentId;
  if (paymentId) {
    const held = await db.query.payments.findFirst({ where: and(eq(schema.payments.id, paymentId), eq(schema.payments.userId, userId)) });
    if (!held || held.status !== "awaiting_confirm") return { status: "refused", reason: "That payment is not waiting for confirmation." };
    if (BigInt(held.amountUsdc) < amount) {
      await setStatus(paymentId, { status: "cancelled", reason: "price went up after it was held" });
      return { status: "refused", reason: `The price rose to ${fmtUsd(amount)} after you saw it. Nothing was paid; ask again.` };
    }
    if (newSeller) await db.insert(schema.allowlist).values({ userId, host: target.host.toLowerCase() }).onConflictDoNothing();
  } else {
    const [row] = await db
      .insert(schema.payments)
      .values({
        userId,
        kind,
        via: opts.via,
        url,
        host: target.host,
        serviceId: service?.id ?? null,
        amountUsdc: Number(amount),
        payTo: req.payTo,
        status: newSeller || amount > usdToUnits(user.askAboveUsd) ? "awaiting_confirm" : "funding",
        request: requestRecord,
      })
      .returning({ id: schema.payments.id, status: schema.payments.status });
    paymentId = row.id;
    if (row.status === "awaiting_confirm") {
      return {
        status: "awaiting_confirm",
        card: {
          paymentId,
          payee: newSeller ? `${payee} (new seller: confirming adds it to your allowlist)` : payee,
          input: (init.body ?? url).slice(0, 500),
          amountUsdc: Number(amount),
          leftTodayAfterUsdc: Number(b.leftToday - amount),
          confirmUrl: `${env.appUrl}/chat?confirm=${paymentId}`,
        },
      };
    }
  }

  // 5. fund
  let spendTx: string | null = null;
  try {
    await setStatus(paymentId, { status: "funding" });
    spendTx = await fundAgent(userId, owner, amount, paymentId, b.perTxNow);
    await setStatus(paymentId, { status: "paying", spendTx });
  } catch (e) {
    return fail(userId, owner, paymentId, `Funding failed: ${short(e)}`);
  }

  // 6. pay
  try {
    const payload = await withAgentKey(userId, (agent) => signPayment(agent, pr, req));
    const res = await request(url, init, { [H.signature]: encodePaymentSignatureHeader(payload) });
    const text = (await res.text()).slice(0, EXCERPT);
    const pResp = res.headers.get(H.response);
    const settle = pResp ? safeDecode(pResp) : null;
    if (!res.ok || !settle?.success) {
      // the seller may or may not have settled; never pay again automatically
      return fail(userId, owner, paymentId, `Seller returned ${res.status}${settle?.errorReason ? ` (${settle.errorReason})` : ""}.`, settle?.transaction);
    }
    await setStatus(paymentId, { status: "done", settleTx: settle.transaction, resultExcerpt: text });
    return { status: "done", paymentId, amountUsdc: Number(amount), payTo: req.payTo, spendTx, settleTx: settle.transaction, result: text, httpStatus: res.status };
  } catch (e) {
    return fail(userId, owner, paymentId, `Payment failed: ${short(e)}`);
  }
}

function safeDecode(h: string) {
  try {
    return decodePaymentResponseHeader(h);
  } catch {
    return null;
  }
}
const short = (e: unknown) => String((e as Error)?.message ?? e).replace(/\s+/g, " ").slice(0, 200);

async function fail(userId: string, owner: PublicKey, paymentId: string, reason: string, settleTx?: string): Promise<PayResult> {
  await setStatus(paymentId, { status: "failed", reason, settleTx: settleTx ?? null });
  try {
    await sweep(userId, owner);
  } catch {
    /* sweep is retried from the dashboard */
  }
  return { status: "failed", paymentId, reason };
}

export async function cancelPayment(userId: string, paymentId: string): Promise<boolean> {
  const r = await db
    .update(schema.payments)
    .set({ status: "cancelled" })
    .where(and(eq(schema.payments.id, paymentId), eq(schema.payments.userId, userId), eq(schema.payments.status, "awaiting_confirm")))
    .returning({ id: schema.payments.id });
  return r.length === 1;
}

/** Resume a held payment after the owner pressed Confirm. */
export async function confirmPayment(userId: string, paymentId: string, via: Via): Promise<PayResult> {
  const p = await db.query.payments.findFirst({ where: and(eq(schema.payments.id, paymentId), eq(schema.payments.userId, userId)) });
  if (!p || p.status !== "awaiting_confirm") return { status: "refused", reason: "That payment is not waiting for confirmation." };
  const r = (p.request ?? {}) as { method?: "GET" | "POST"; body?: string | null; purpose?: string };
  return pay(userId, p.url!, { method: r.method, body: r.body ?? undefined }, { purpose: r.purpose ?? "", via, confirmedPaymentId: paymentId });
}
