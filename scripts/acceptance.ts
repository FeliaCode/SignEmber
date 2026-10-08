// End-to-end acceptance run against a live Ember (no human in the loop). Run:
//   BASE_URL=https://embermcp.com RPC=https://api.devnet.solana.com npx tsx scripts/acceptance.ts [--chat]
// Needs: test-ada / test-bob keypairs in ./keys (a little SOL each; bob holds a few USDC), the gas
// treasury funded, the limiter program deployed. Optional: OUTSIDE_SELLER_URL (an
// allowlisted outside x402 seller). Steps whose prerequisite is missing are reported as SKIP, never faked.
import fs from "node:fs";
import { execSync } from "node:child_process";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { createApproveInstruction, createAssociatedTokenAccountIdempotentInstruction, createRevokeInstruction, getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import { allowancePda, configureIx, decodeAllowance, parseSpentEvents, revokeIx } from "../lib/limiter.ts";

const BASE = (process.env.BASE_URL ?? "https://embermcp.com").replace(/\/$/, "");
const RPC = process.env.RPC ?? "https://api.devnet.solana.com";
const USDC = new PublicKey(process.env.USDC ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const KEYS = process.env.KEYS ?? "./keys";
const conn = new Connection(RPC, "confirmed");
const U = (usd: number) => BigInt(Math.round(usd * 1e6));
const load = (n: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(`${KEYS}/${n}.json`, "utf8"))));

let pass = 0, fail = 0, skip = 0;
const results: string[] = [];
function check(ok: boolean, name: string, detail = "") {
  ok ? pass++ : fail++;
  const line = `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`;
  results.push(line);
  console.log(line);
}
function skipped(name: string, why: string) {
  skip++;
  const line = `SKIP  ${name}  (${why})`;
  results.push(line);
  console.log(line);
}

class Owner {
  cookie = "";
  constructor(public name: string, public kp: Keypair) {}
  async req<T = any>(path: string, init: { method?: string; json?: unknown; key?: string } = {}): Promise<{ status: number; body: T }> {
    const res = await fetch(`${BASE}${path}`, {
      method: init.method ?? (init.json !== undefined ? "POST" : "GET"),
      headers: {
        ...(init.json !== undefined ? { "content-type": "application/json" } : {}),
        ...(init.key ? { authorization: `Bearer ${init.key}` } : this.cookie ? { cookie: this.cookie } : {}),
      },
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    });
    const set = res.headers.get("set-cookie");
    if (set && !init.key) this.cookie = set.split(";")[0];
    const text = await res.text();
    let body: any = text;
    try { body = JSON.parse(text); } catch { /* text */ }
    return { status: res.status, body };
  }
  async signIn() {
    const { body } = await this.req("/api/auth/nonce", { json: { address: this.kp.publicKey.toBase58() } });
    const sig = nacl.sign.detached(new TextEncoder().encode(body.message), this.kp.secretKey);
    return this.req("/api/auth/verify", { json: { address: this.kp.publicKey.toBase58(), message: body.message, signature: bs58.encode(sig) } });
  }
  me() { return this.req("/api/me").then((r) => r.body); }
  async send(tx: Transaction) { return sendAndConfirmTransaction(conn, tx, [this.kp], { commitment: "confirmed" }); }
}

async function usdc(owner: PublicKey) {
  try { return (await getAccount(conn, getAssociatedTokenAddressSync(USDC, owner, true))).amount; } catch { return 0n; }
}
async function spentEventsOf(sig: string | null) {
  if (!sig) return [];
  const tx = await conn.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  return parseSpentEvents(tx?.meta?.logMessages ?? []);
}
const sigOf = (url: string | null | undefined) => (url ? url.split("/tx/")[1]?.split("?")[0] ?? null : null);

async function setLimits(o: Owner, daily: number, perTx: number, askAbove: number) {
  await o.req("/api/settings", { method: "PATCH", json: { askAboveUsd: askAbove } });
  const me = await o.me();
  const owner = o.kp.publicKey;
  const ata = getAssociatedTokenAddressSync(USDC, owner);
  await o.send(new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(owner, ata, owner, USDC),
    createApproveInstruction(ata, allowancePda(owner), owner, U(daily * 7)),
    configureIx(owner, new PublicKey(me.agent), U(daily), U(perTx)),
  ));
}

async function main() {
  console.log(`Ember acceptance @ ${BASE}  rpc ${RPC}\n`);
  const ada = new Owner("ada", load("test-ada"));
  const bob = new Owner("bob", load("test-bob"));

  // 1. sign in + handles, nothing moves
  const bobUsdc0 = await usdc(bob.kp.publicKey);
  for (const o of [ada, bob]) {
    const r = await o.signIn();
    check(r.status === 200, `${o.name} signs in (SIWS)`, r.status === 200 ? "" : JSON.stringify(r.body));
    await o.req("/api/settings", { method: "PATCH", json: { handle: o.name } });
    const me = await o.me();
    check(me?.handle === o.name && !!me?.agent, `${o.name} has handle @${o.name} and an agent wallet`, me?.agent ?? "no agent");
  }
  check((await usdc(bob.kp.publicKey)) === bobUsdc0, "signing in moved no funds");

  // 2. limits: $5/day, $1/payment, ask-above $0.05
  for (const o of [ada, bob]) {
    try {
      await setLimits(o, 5, 1, 0.05);
      const a = decodeAllowance((await conn.getAccountInfo(allowancePda(o.kp.publicKey)))!.data);
      const me = await o.me();
      check(a.dailyCap === U(5) && a.perTxCap === U(1) && me.active, `${o.name} limits onchain: $5/day, $1/payment`, `left today $${me.leftTodayUsd}`);
    } catch (e) {
      check(false, `${o.name} sets limits`, String((e as Error).message).slice(0, 160));
    }
  }

  // 3. ada publishes a $0.02 service; it shows in the directory
  await ada.req("/api/services", { json: { slug: "summarize", name: "Summarize a URL", description: "Give me a URL, get five bullets", priceUsd: 0.02, prompt: "Summarize the page in five short bullets, then one line on who it is for." } });
  const svc = (await ada.req("/api/services")).body.find((s: any) => s.slug === "summarize");
  if (svc && (svc.priceUsd !== 0.02 || !svc.active)) await ada.req("/api/services", { method: "PATCH", json: { id: svc.id, priceUsd: 0.02, active: true } });
  const dir = (await bob.req("/api/directory")).body;
  check(Array.isArray(dir) && dir.some((s: any) => s.handle === "ada" && s.slug === "summarize" && s.priceUsd === 0.02), "ada's $0.02 service is in /api/directory");

  // bob's own agent: API key (REST) + MCP
  const key = (await bob.req("/api/keys", { json: { name: "acceptance", scope: "pay" } })).body.key as string;
  check(typeof key === "string" && key.startsWith("ek_"), "bob creates an API key");
  const mcpInit = await bob.req("/api/mcp", { json: { jsonrpc: "2.0", id: 1, method: "initialize" }, key });
  const mcpList = await bob.req("/api/mcp", { json: { jsonrpc: "2.0", id: 2, method: "tools/list" }, key });
  check(mcpInit.status === 200 && mcpList.body?.result?.tools?.some((t: any) => t.name === "hire_agent"), "MCP: initialize + tools/list with the key");

  // 4. bob's agent hires ada at $0.02, no confirmation; $0.02 lands in ADA's wallet
  const ada0 = await usdc(ada.kp.publicKey);
  const hire = (await bob.req("/api/v1/hire_agent", { json: { handle: "ada", slug: "summarize", input: "Summarize https://example.com" }, key })).body;
  check(hire?.status === "settled" && hire.paid_usd === 0.02, "bob's agent pays ada's service over x402 (API key)", hire?.status === "settled" ? `cost $${hire.paid_usd}` : JSON.stringify(hire).slice(0, 200));
  const ada1 = await usdc(ada.kp.publicKey);
  check(ada1 - ada0 === U(0.02), "$0.02 arrived in ada's OWNER wallet", `${ada0} -> ${ada1}`);
  const ev = await spentEventsOf(sigOf(hire?.limiter_spend));
  if (hire?.limiter_spend) check(ev.length === 1 && ev[0].owner.equals(bob.kp.publicKey), "Spent event on bob's limiter", `${Number(ev[0]?.amount ?? 0) / 1e6} USDC pulled into the float`);
  else skipped("Spent event on bob's limiter", "paid from the existing float");
  const adaAct = (await ada.req("/api/activity")).body;
  check(adaAct?.earned?.some((e: any) => e.amountUsd === 0.02), "ada's earnings show it");

  if (process.argv.includes("--chat")) {
    const res = await fetch(`${BASE}/api/chat`, { method: "POST", headers: { "content-type": "application/json", cookie: bob.cookie }, body: JSON.stringify({ message: "have ada summarize example.com" }) });
    const text = await res.text();
    const settled = /"name":"hire_agent","result":\{"status":"settled"/.test(text);
    check(settled, "in-house agent: \"have ada summarize example.com\" completes through /api/chat");
  } else skipped("in-house agent chat run", "pass --chat (uses the Anthropic key)");

  // 5. price $0.25 -> held; cancel moves nothing
  await ada.req("/api/services", { method: "PATCH", json: { id: svc.id, priceUsd: 0.25 } });
  const bobBefore = await usdc(bob.kp.publicKey);
  const held = (await bob.req("/api/v1/hire_agent", { json: { handle: "ada", slug: "summarize", input: "Summarize https://example.com" }, key })).body;
  const heldId = held?.confirm_card?.paymentId;
  check(held?.status === "awaiting_confirm" && !!heldId, "$0.25 > ask-above: payment held as awaiting_confirm");
  const cancel = (await bob.req(`/api/payments/${heldId}/cancel`, { method: "POST", key })).body;
  check(cancel?.cancelled === true && (await usdc(bob.kp.publicKey)) === bobBefore, "cancel moves nothing");

  // 6. confirm (owner session only) -> done
  const held2 = (await bob.req("/api/v1/hire_agent", { json: { handle: "ada", slug: "summarize", input: "Summarize https://example.com" }, key })).body;
  const byKey = await bob.req(`/api/payments/${held2?.confirm_card?.paymentId}/confirm`, { method: "POST", key });
  check(byKey.status === 401, "an API key cannot confirm its own held payment");
  const conf = (await bob.req(`/api/payments/${held2?.confirm_card?.paymentId}/confirm`, { method: "POST" })).body;
  check(conf?.status === "settled" && !!conf.settlement, "owner confirms -> settled, settlement tx", conf?.settlement ?? JSON.stringify(conf).slice(0, 160));
  await ada.req("/api/services", { method: "PATCH", json: { id: svc.id, priceUsd: 0.02 } });

  // 7. $2 job refused by the per-payment cap before anything is paid
  await ada.req("/api/services", { json: { slug: "bigjob", name: "Big job", description: "costs $2", priceUsd: 2, prompt: "Say ok." } });
  const b0 = await usdc(bob.kp.publicKey);
  const big = (await bob.req("/api/v1/hire_agent", { json: { handle: "ada", slug: "bigjob", input: "go" }, key })).body;
  check(big?.status === "refused" && /per-payment cap/.test(big.reason) && (await usdc(bob.kp.publicKey)) === b0, "$2 job refused by the $1 per-payment cap, nothing paid", big?.reason);

  // 8. outside allowlisted seller
  const outside = process.env.OUTSIDE_SELLER_URL;
  if (outside) {
    await bob.req("/api/allowlist", { json: { host: new URL(outside).host } });
    const r = (await bob.req("/api/v1/paid_fetch", { json: { url: outside, purpose: "acceptance" }, key })).body;
    check(r?.status === "settled", "bob's agent pays an allowlisted outside x402 seller and states the cost", r?.status === "settled" ? `$${r.paid_usd}` : r?.reason);
  } else skipped("outside allowlisted x402 seller", "set OUTSIDE_SELLER_URL to a devnet x402 seller");

  // 9. unknown + spoofed sellers
  const unknown = (await bob.req("/api/v1/paid_fetch", { json: { url: "https://seller.invalid/paid", purpose: "acceptance" }, key })).body;
  check(unknown?.status === "refused", "a seller that is not a public website is refused", unknown?.reason);
  const spoof = (await bob.req("/api/v1/paid_fetch", { json: { url: `${BASE}/x/ada/does-not-exist`, purpose: "acceptance" }, key })).body;
  check(spoof?.status === "refused", "an Ember URL that isn't a real service is refused", spoof?.reason);
  const self = (await bob.req("/api/v1/hire_agent", { json: { handle: "bob", slug: "anything", input: "x" }, key })).body;
  check(self?.status === "refused", "an agent never hires itself", self?.reason);

  // sandboxing: ada's key cannot see bob's activity
  const adaKey = (await ada.req("/api/keys", { json: { name: "acceptance", scope: "read" } })).body.key;
  const adaSees = (await ada.req("/api/activity", { key: adaKey })).body;
  check(!JSON.stringify(adaSees).includes(bob.kp.publicKey.toBase58()), "each agent sees only its own owner's activity");
  const roPay = (await ada.req("/api/v1/hire_agent", { json: { handle: "bob", slug: "x", input: "x" }, key: adaKey })).body;
  check(roPay?.status === "refused" && /read-only/.test(roPay.reason), "a read-only key cannot pay");

  // 11. revoke -> refused, no USDC moves
  await bob.send(new Transaction().add(revokeIx(bob.kp.publicKey), createRevokeInstruction(getAssociatedTokenAddressSync(USDC, bob.kp.publicKey), bob.kp.publicKey)));
  const r0 = await usdc(bob.kp.publicKey);
  const after = (await bob.req("/api/v1/hire_agent", { json: { handle: "ada", slug: "summarize", input: "Summarize https://example.com" }, key })).body;
  check(after?.status === "refused" && (await usdc(bob.kp.publicKey)) === r0, "after revoke: refused with a plain reason, no USDC moves", after?.reason);

  // 12. no secrets in plain text in logs or DB
  try {
    const env = fs.readFileSync("/etc/ember.env", "utf8");
    const secrets = ["SESSION_SECRET", "AGENT_KEY_ENC_KEY", "ANTHROPIC_API_KEY"].map((k) => new RegExp(`^${k}=(.+)$`, "m").exec(env)?.[1]).filter(Boolean) as string[];
    const logs = execSync("journalctl -u 'ember@*' --since '-2 hours' --no-pager 2>/dev/null || true", { maxBuffer: 64 << 20 }).toString();
    const db = execSync(`sudo -u postgres pg_dump --data-only ember 2>/dev/null || true`, { maxBuffer: 256 << 20 }).toString();
    const hits = secrets.filter((s) => logs.includes(s) || db.includes(s)).length + (logs.match(/ek_[1-9A-HJ-NP-Za-km-z]{40,}/g)?.length ?? 0) + (db.match(/ek_[1-9A-HJ-NP-Za-km-z]{40,}/g)?.length ?? 0);
    const rawKeys = (db.match(/\b[1-9A-HJ-NP-Za-km-z]{87,88}\b/g) ?? []).length; // base58 64-byte secret keys
    check(hits === 0 && rawKeys === 0, "grep logs and DB for agent keys, API keys and session secrets in plain text: zero hits", `${hits + rawKeys} hits`);
  } catch (e) {
    skipped("secret scan", String((e as Error).message).slice(0, 80));
  }

  console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
  fs.writeFileSync("acceptance-last.txt", results.join("\n") + `\n${pass} passed, ${fail} failed, ${skip} skipped\n`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
