import { test } from "node:test";
import assert from "node:assert/strict";
import { planPull, FLOAT_MAX, FLOAT_LOW, FLOAT_REFILL } from "../lib/float.ts";
import { parseEmberUrl } from "../lib/urls.ts";
import { isPrivate } from "../lib/net.ts";
import { remaining, SECONDS_PER_DAY, type Allowance } from "../lib/limiter.ts";
import { PublicKey, Keypair } from "@solana/web3.js";

const U = (usd: number) => BigInt(Math.round(usd * 1e6));

test("float: covered payments pull nothing; small ones refill $0.25; big ones are just in time", () => {
  assert.equal(planPull(U(0.3), U(0.02), U(5)), 0n);
  // float would drop under $0.05 -> pull missing + refill, float ends <= $0.50
  const p = planPull(U(0.06), U(0.02), U(5));
  assert.equal(p, FLOAT_REFILL);
  assert.ok(U(0.06) + p - U(0.02) <= FLOAT_MAX);
  // empty float, $0.02 payment -> $0.27 (0.02 + 0.25)
  assert.equal(planPull(0n, U(0.02), U(5)), U(0.27));
  // payment above the float max -> exact missing amount
  assert.equal(planPull(U(0.1), U(2), U(5)), U(1.9));
  // refill never exceeds the limiter's room, but always covers the payment
  assert.equal(planPull(0n, U(0.02), U(0.05)), U(0.05));
  assert.equal(planPull(0n, U(0.04), U(0.01)), U(0.04));
  // invariant over a grid: the result always covers the payment and keeps the float <= max when refilling
  for (let f = 0n; f <= U(0.6); f += U(0.03))
    for (let a = U(0.01); a <= U(1); a += U(0.07)) {
      const pull = planPull(f, a, U(5));
      assert.ok(f + pull >= a, `covers ${f}/${a}`);
      if (a <= FLOAT_MAX && pull > 0n) assert.ok(f + pull - a <= FLOAT_MAX || f > FLOAT_MAX, `float cap ${f}/${a}`);
      if (pull === 0n && a <= FLOAT_MAX) assert.ok(f - a >= FLOAT_LOW, `zero ${f}/${a}`);
    }
});

test("ember URLs: only this app's /x/{handle}/{slug}", () => {
  const app = "https://example.com/ember";
  assert.deepEqual(parseEmberUrl("https://example.com/ember/x/ada/summarize", app), { handle: "ada", slug: "summarize" });
  assert.equal(parseEmberUrl("https://example.com/x/ada/summarize", app), null, "outside the base path");
  assert.equal(parseEmberUrl("https://evil.example/ember/x/ada/summarize", app), null, "other origin");
  assert.equal(parseEmberUrl("https://example.com/ember/x/ada/summarize?payTo=me", app), null, "query not allowed");
  assert.equal(parseEmberUrl("https://example.com/ember/x/ADA/summarize", app), null, "handles are lowercase");
  assert.equal(parseEmberUrl("https://example.com/ember/x/ada/summarize/../../admin", app), null);
  assert.deepEqual(parseEmberUrl("http://localhost:8195/x/bob/report", "http://localhost:8195"), { handle: "bob", slug: "report" });
});

test("SSRF guard: private and special addresses are rejected", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])
    assert.equal(isPrivate(ip), true, ip);
  for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700::1111"]) assert.equal(isPrivate(ip), false, ip);
});

test("remaining(): same arithmetic as the program, including the UTC day roll and revoke", () => {
  const agent = Keypair.generate().publicKey;
  const day = 20_700n;
  const a: Allowance = { agent, dailyCap: U(5), perTxCap: U(1), spentToday: U(4.5), day, revoked: false, bump: 255 };
  const now = day * SECONDS_PER_DAY + 100n;
  assert.deepEqual(remaining(a, now), { today: U(0.5), perTx: U(0.5), active: true });
  assert.deepEqual(remaining(a, now + SECONDS_PER_DAY), { today: U(5), perTx: U(1), active: true });
  assert.deepEqual(remaining({ ...a, revoked: true }, now).active, false);
  assert.deepEqual(remaining({ ...a, agent: PublicKey.default }, now).active, false);
  assert.deepEqual(remaining(null, now), { today: 0n, perTx: 0n, active: false });
});
