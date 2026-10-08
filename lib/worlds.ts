// Playground worlds: create a world, attach stalls (services), post tasks with USDC rewards, approve and pay.
// Rewards are real: the poster's agent pulls the reward through the poster's limiter (caps apply) and sends it to
// the solver's OWNER wallet, never to an agent.
import "server-only";
import { PublicKey } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { budget, explorerTx, fmtUsd, sendIxs, unitsToUsd, usdcMint, USDC_DECIMALS, usdToUnits } from "./chain";
import { fundAgent, sweep, withAgentKey } from "./agent-wallet";
import { emberServiceUrl } from "./pay";

export const WORLD_SLUG_RE = /^[a-z0-9-]{3,40}$/;
export const HARBOR = "harbor"; // the starter world: every service is a stall there

export async function logEvent(worldId: string, kind: string, text: string, usdc?: number | null, tx?: string | null) {
  await db.insert(schema.worldEvents).values({ worldId, kind, text: text.slice(0, 300), usdc: usdc ?? null, tx: tx ?? null });
}

export async function createWorld(userId: string, a: { slug: string; name: string; description?: string }) {
  const slug = a.slug.trim().toLowerCase();
  if (!WORLD_SLUG_RE.test(slug) || slug === HARBOR) throw new Error("address: 3-40 lowercase letters, digits or dashes");
  const name = a.name.trim().slice(0, 60);
  if (!name) throw new Error("a world needs a name");
  const [w] = await db.insert(schema.worlds).values({ userId, slug, name, description: (a.description ?? "").trim().slice(0, 600) }).returning();
  const u = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  await logEvent(w.id, "created", `@${u?.handle ?? "someone"} opened ${name}`);
  return w;
}

/** Public view of a world: stalls, tasks and the latest events. The Harbor lists every active service as a stall. */
export async function worldView(slug: string) {
  const w = await db.query.worlds.findFirst({ where: eq(schema.worlds.slug, slug) });
  if (!w) return null;
  const owner = w.userId ? await db.query.users.findFirst({ where: eq(schema.users.id, w.userId) }) : null;
  const stallRows = await db
    .select({ handle: schema.users.handle, slug: schema.services.slug, name: schema.services.name, description: schema.services.description, price: schema.services.priceUsd })
    .from(schema.services)
    .innerJoin(schema.users, eq(schema.users.id, schema.services.userId))
    .where(and(eq(schema.services.active, true), slug === HARBOR ? undefined : eq(schema.services.worldId, w.id)))
    .limit(50);
  const tasks = await db.query.worldTasks.findMany({ where: eq(schema.worldTasks.worldId, w.id), orderBy: desc(schema.worldTasks.createdAt), limit: 50 });
  const events = await db.query.worldEvents.findMany({ where: eq(schema.worldEvents.worldId, w.id), orderBy: desc(schema.worldEvents.createdAt), limit: 40 });
  return {
    slug: w.slug,
    name: w.name,
    description: w.description,
    owner: owner?.handle ?? null, // null = a system world (the Harbor)
    stalls: stallRows.filter((s) => s.handle).map((s) => ({ ...s, priceUsd: Number(s.price), price: undefined, url: emberServiceUrl(s.handle!, s.slug) })),
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, description: t.description, rewardUsd: unitsToUsd(t.rewardUsdc), status: t.status })),
    events: events.map((e) => ({ kind: e.kind, text: e.text, usd: e.usdc == null ? null : unitsToUsd(e.usdc), tx: e.tx ? explorerTx(e.tx) : null, at: e.createdAt })),
  };
}

export async function listWorlds() {
  const rows = await db
    .select({ slug: schema.worlds.slug, name: schema.worlds.name, description: schema.worlds.description, owner: schema.users.handle, createdAt: schema.worlds.createdAt })
    .from(schema.worlds)
    .leftJoin(schema.users, eq(schema.users.id, schema.worlds.userId))
    .orderBy(desc(schema.worlds.createdAt))
    .limit(100);
  return rows;
}

async function ownedWorld(userId: string, slug: string) {
  const w = await db.query.worlds.findFirst({ where: and(eq(schema.worlds.slug, slug), eq(schema.worlds.userId, userId)) });
  if (!w) throw new Error("not your world");
  return w;
}

export async function postTask(userId: string, slug: string, a: { title: string; description?: string; rewardUsd: number }) {
  const w = await ownedWorld(userId, slug);
  const title = a.title.trim().slice(0, 100);
  const reward = usdToUnits(a.rewardUsd);
  if (!title) throw new Error("a task needs a title");
  if (!(reward >= usdToUnits(0.01) && reward <= usdToUnits(30))) throw new Error("reward: between $0.01 and $30");
  const [t] = await db.insert(schema.worldTasks).values({ worldId: w.id, title, description: (a.description ?? "").trim().slice(0, 1000), rewardUsdc: Number(reward) }).returning();
  await logEvent(w.id, "task", `New task: ${title}`, Number(reward));
  return t;
}

/** An agent (any driver) submits a result for an open task. Nothing is paid until the world's owner approves. */
export async function submitTask(userId: string, taskId: string, result: string) {
  const t = await db.query.worldTasks.findFirst({ where: eq(schema.worldTasks.id, taskId) });
  if (!t || t.status !== "open") return { status: "refused" as const, reason: "That task is not open." };
  const w = await db.query.worlds.findFirst({ where: eq(schema.worlds.id, t.worldId) });
  if (w?.userId === userId) return { status: "refused" as const, reason: "You can't claim a reward from your own world." };
  const text = result.trim().slice(0, 4000);
  if (!text) return { status: "refused" as const, reason: "Submit a result." };
  const [s] = await db.insert(schema.worldSubmissions).values({ taskId, userId, result: text }).returning({ id: schema.worldSubmissions.id });
  const u = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  await logEvent(t.worldId, "submitted", `@${u?.handle ?? "an agent"} submitted work for “${t.title}”`);
  return { status: "submitted" as const, submissionId: s.id, note: `Waiting for the world's owner to approve. The reward is ${fmtUsd(t.rewardUsdc)}, paid to your owner's wallet.` };
}

/** The world's owner approves a submission: the reward moves on chain, within the owner's limits. */
export async function approveSubmission(userId: string, submissionId: string) {
  const s = await db.query.worldSubmissions.findFirst({ where: eq(schema.worldSubmissions.id, submissionId) });
  if (!s || s.status !== "submitted") throw new Error("that submission is not waiting");
  const t = await db.query.worldTasks.findFirst({ where: eq(schema.worldTasks.id, s.taskId) });
  if (!t || t.status !== "open") throw new Error("that task is closed");
  const w = await db.query.worlds.findFirst({ where: eq(schema.worlds.id, t.worldId) });
  if (!w || w.userId !== userId) throw new Error("not your world");
  const poster = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  const solver = await db.query.users.findFirst({ where: eq(schema.users.id, s.userId) });
  if (!poster || !solver) throw new Error("unknown user");
  const owner = new PublicKey(poster.address);
  const amount = BigInt(t.rewardUsdc);
  const b = await budget(owner);
  if (!b.active) throw new Error("your budget is not active");
  if (amount > b.perTxCap) throw new Error(`the reward is above your per-payment cap (${fmtUsd(b.perTxCap)})`);
  if (amount > b.leftToday) throw new Error(`the reward is more than what's left today (${fmtUsd(b.leftToday)})`);
  // claim the task first so a double click cannot pay twice
  const claimed = await db.update(schema.worldTasks).set({ status: "paying" }).where(and(eq(schema.worldTasks.id, t.id), eq(schema.worldTasks.status, "open"))).returning({ id: schema.worldTasks.id });
  if (claimed.length !== 1) throw new Error("already being paid");
  try {
    await fundAgent(userId, owner, amount, `reward:${s.id}`, b.perTxNow);
    const mint = usdcMint();
    const to = new PublicKey(solver.address);
    const tx = await withAgentKey(userId, async (agent) =>
      sendIxs(
        [
          createAssociatedTokenAccountIdempotentInstruction(agent.publicKey, getAssociatedTokenAddressSync(mint, to), to, mint),
          createTransferCheckedInstruction(getAssociatedTokenAddressSync(mint, agent.publicKey), mint, getAssociatedTokenAddressSync(mint, to), agent.publicKey, amount, USDC_DECIMALS),
        ],
        [agent],
      ),
    );
    await db.update(schema.worldSubmissions).set({ status: "paid", payTx: tx }).where(eq(schema.worldSubmissions.id, s.id));
    await db.update(schema.worldSubmissions).set({ status: "rejected" }).where(and(eq(schema.worldSubmissions.taskId, t.id), eq(schema.worldSubmissions.status, "submitted")));
    await db.update(schema.worldTasks).set({ status: "paid" }).where(eq(schema.worldTasks.id, t.id));
    await db.insert(schema.payments).values({ userId, kind: "reward", via: "chat", host: `world:${w.slug}`, amountUsdc: Number(amount), payTo: solver.address, status: "done", settleTx: tx, resultExcerpt: `Reward for “${t.title}” to @${solver.handle}` });
    await logEvent(w.id, "paid", `@${solver.handle} was paid for “${t.title}”`, Number(amount), tx);
    return { tx: explorerTx(tx) };
  } catch (e) {
    await db.update(schema.worldTasks).set({ status: "open" }).where(eq(schema.worldTasks.id, t.id));
    try {
      await sweep(userId, owner);
    } catch {
      /* retried from Settings */
    }
    throw e;
  }
}

export async function rejectSubmission(userId: string, submissionId: string) {
  const s = await db.query.worldSubmissions.findFirst({ where: eq(schema.worldSubmissions.id, submissionId) });
  if (!s) throw new Error("not found");
  const t = await db.query.worldTasks.findFirst({ where: eq(schema.worldTasks.id, s.taskId) });
  const w = t ? await db.query.worlds.findFirst({ where: eq(schema.worlds.id, t.worldId) }) : null;
  if (!w || w.userId !== userId) throw new Error("not your world");
  await db.update(schema.worldSubmissions).set({ status: "rejected" }).where(eq(schema.worldSubmissions.id, submissionId));
}

/** Everything an owner manages: their worlds with tasks and pending submissions. */
export async function myWorlds(userId: string) {
  const ws = await db.query.worlds.findMany({ where: eq(schema.worlds.userId, userId), orderBy: desc(schema.worlds.createdAt) });
  return Promise.all(
    ws.map(async (w) => {
      const tasks = await db.query.worldTasks.findMany({ where: eq(schema.worldTasks.worldId, w.id), orderBy: desc(schema.worldTasks.createdAt) });
      const subs = await Promise.all(
        tasks.map(async (t) => {
          const rows = await db
            .select({ id: schema.worldSubmissions.id, result: schema.worldSubmissions.result, status: schema.worldSubmissions.status, handle: schema.users.handle, payTx: schema.worldSubmissions.payTx })
            .from(schema.worldSubmissions)
            .innerJoin(schema.users, eq(schema.users.id, schema.worldSubmissions.userId))
            .where(eq(schema.worldSubmissions.taskId, t.id))
            .orderBy(desc(schema.worldSubmissions.createdAt));
          return { id: t.id, title: t.title, rewardUsd: unitsToUsd(t.rewardUsdc), status: t.status, submissions: rows.map((r) => ({ ...r, payTx: r.payTx ? explorerTx(r.payTx) : null })) };
        }),
      );
      return { slug: w.slug, name: w.name, description: w.description, tasks: subs };
    }),
  );
}

/** Log a stall sale into the world feed (called after a service settles). */
export async function logSale(serviceId: string, payerUserId: string | null, amountUsdc: number, tx: string) {
  const svc = await db.query.services.findFirst({ where: eq(schema.services.id, serviceId) });
  if (!svc) return;
  const harbor = await ensureHarbor();
  const payer = payerUserId ? await db.query.users.findFirst({ where: eq(schema.users.id, payerUserId) }) : null;
  const seller = await db.query.users.findFirst({ where: eq(schema.users.id, svc.userId) });
  const text = `${payer?.handle ? `@${payer.handle}` : "An agent"} bought ${svc.name} from @${seller?.handle ?? "someone"}`;
  const targets = [svc.worldId, harbor?.id].filter((x, i, a): x is string => !!x && a.indexOf(x) === i);
  for (const id of targets) await logEvent(id, "bought", text, amountUsdc, tx);
}

/** The Harbor is a system world (no owner): every service is a stall there. Created on first use. */
export async function ensureHarbor() {
  const h = await db.query.worlds.findFirst({ where: eq(schema.worlds.slug, HARBOR) });
  if (h) return h;
  await db
    .insert(schema.worlds)
    .values({ userId: null, slug: HARBOR, name: "The Harbor", description: "The starter world. Every EmberSign service is a stall here; any connected agent can buy from it." })
    .onConflictDoNothing();
  return (await db.query.worlds.findFirst({ where: eq(schema.worlds.slug, HARBOR) }))!;
}
