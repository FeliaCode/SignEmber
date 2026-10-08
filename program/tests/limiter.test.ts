// EmberLimiter invariants, in-process with LiteSVM against the compiled program.
// Each spec invariant has a fixed test plus a randomized run (seeded, reproducible: FUZZ_SEED, FUZZ_RUNS).

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { LiteSVM, FailedTransactionMetadata } from "litesvm";
import { address, lamports, getTransactionDecoder } from "@solana/kit";
import { Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import {
  ACCOUNT_SIZE,
  TOKEN_PROGRAM_ID,
  AccountLayout,
  createApproveInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createRevokeInstruction,
  getAssociatedTokenAddressSync,
  MintLayout,
} from "@solana/spl-token";
import {
  allowancePda,
  configureIx,
  decodeAllowance,
  parseSpentEvents,
  revokeIx,
  spendIx,
  LIMITER_PROGRAM_ID,
} from "../../lib/limiter.ts";

const SO = process.env.LIMITER_SO ?? new URL("../target/deploy/ember_limiter.so", import.meta.url).pathname;
const USDC = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const RUNS = Number(process.env.FUZZ_RUNS ?? 60);
const DAY = 86_400n;
const T0 = 1_791_000_000n - (1_791_000_000n % DAY) + 3600n; // 01:00 UTC on some day

// ---------------------------------------------------------------- harness
const decoder = getTransactionDecoder();
const A = (pk: PublicKey) => address(pk.toBase58());
let svm: LiteSVM;
let mintAuthority: Keypair;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x1_0000_0000;
  };
}
const seed = Number(process.env.FUZZ_SEED ?? 20261006);

function setTime(ts: bigint) {
  const c = svm.getClock();
  c.unixTimestamp = ts;
  c.slot = c.slot + 1n;
  svm.setClock(c);
  svm.expireBlockhash();
}
const now = () => svm.getClock().unixTimestamp;

type Sent = { ok: true; logs: string[] } | { ok: false; err: string; logs: string[] };
function send(ixs: TransactionInstruction[], signers: Keypair[], { sameBlock = false } = {}): Sent {
  const tx = new Transaction().add(...ixs);
  tx.recentBlockhash = svm.latestBlockhash();
  tx.feePayer = signers[0].publicKey;
  tx.sign(...signers);
  const r = svm.sendTransaction(decoder.decode(tx.serialize()) as never);
  if (!sameBlock) svm.expireBlockhash();
  if (r instanceof FailedTransactionMetadata) {
    const logs = r.meta().logs();
    return { ok: false, err: logs.find((l) => /Error Code|failed|insufficient/i.test(l)) ?? String(r.err()), logs };
  }
  return { ok: true, logs: r.logs() };
}
const fund = (kp: Keypair, sol = 10) => svm.airdrop(A(kp.publicKey), lamports(BigInt(sol * 1e9)));

function usdcBalance(owner: PublicKey): bigint {
  const acc = svm.getAccount(A(getAssociatedTokenAddressSync(USDC, owner, true)));
  if (!acc.exists) return 0n;
  return AccountLayout.decode(Buffer.from(acc.data)).amount;
}

function allowance(owner: PublicKey) {
  const acc = svm.getAccount(A(allowancePda(owner)));
  return acc.exists ? decodeAllowance(acc.data) : null;
}

/** A USDC holder with an ATA, `usdc` base units, the limiter PDA approved as delegate. */
function newOwner(usdc = 1_000_000_000n, approve = usdc): Keypair {
  const o = Keypair.generate();
  fund(o);
  const ata = getAssociatedTokenAddressSync(USDC, o.publicKey);
  const r = send(
    [
      createAssociatedTokenAccountInstruction(o.publicKey, ata, o.publicKey, USDC),
      createMintToInstruction(USDC, ata, mintAuthority.publicKey, usdc),
      createApproveInstruction(ata, allowancePda(o.publicKey), o.publicKey, approve),
    ],
    [o, mintAuthority],
  );
  assert.ok(r.ok, `owner setup: ${!r.ok && r.err}`);
  return o;
}

function newAgent(): Keypair {
  const a = Keypair.generate();
  fund(a, 1);
  const ata = getAssociatedTokenAddressSync(USDC, a.publicKey);
  assert.ok(send([createAssociatedTokenAccountInstruction(a.publicKey, ata, a.publicKey, USDC)], [a]).ok);
  return a;
}

function configure(owner: Keypair, agent: PublicKey, daily: bigint, perTx: bigint) {
  return send([configureIx(owner.publicKey, agent, daily, perTx)], [owner]);
}

let refCounter = 0;
function ref(): Uint8Array {
  const r = new Uint8Array(32);
  new DataView(r.buffer).setUint32(0, ++refCounter);
  return r;
}
function spend(agent: Keypair, owner: PublicKey, amount: bigint, extra: Partial<Parameters<typeof spendIx>[0]> = {}) {
  return send([spendIx({ agent: agent.publicKey, owner, mint: USDC, amount, ref: ref(), ...extra })], [agent]);
}

before(() => {
  svm = new LiteSVM();
  svm.addProgramFromFile(A(LIMITER_PROGRAM_ID), SO);
  mintAuthority = Keypair.generate();
  fund(mintAuthority);
  // USDC lives at a fixed address the program compiles in; place a 6-decimal mint there.
  const data = Buffer.alloc(MintLayout.span);
  MintLayout.encode(
    {
      mintAuthorityOption: 1,
      mintAuthority: mintAuthority.publicKey,
      supply: 0n,
      decimals: 6,
      isInitialized: true,
      freezeAuthorityOption: 0,
      freezeAuthority: PublicKey.default,
    },
    data,
  );
  svm.setAccount({
    address: A(USDC),
    lamports: lamports(svm.minimumBalanceForRentExemption(BigInt(MintLayout.span))),
    data: Uint8Array.from(data),
    programAddress: A(TOKEN_PROGRAM_ID),
    executable: false,
    space: BigInt(MintLayout.span),
  } as never);
  void ACCOUNT_SIZE;
  setTime(T0);
});

// ---------------------------------------------------------------- 1. only the registered agent can spend
test("invariant 1: nobody but the registered agent can spend; not even the owner", () => {
  const owner = newOwner();
  const agent = newAgent();
  assert.ok(configure(owner, agent.publicKey, 5_000_000n, 1_000_000n).ok);

  const ownerAta = getAssociatedTokenAddressSync(USDC, owner.publicKey);
  // owner signs as "agent", sending to itself
  const r1 = spend(owner, owner.publicKey, 1n, { destination: ownerAta });
  assert.equal(r1.ok, false);
  // a stranger with its own token account
  const stranger = newAgent();
  assert.equal(spend(stranger, owner.publicKey, 1n).ok, false);
  // the real agent works
  assert.ok(spend(agent, owner.publicKey, 1n).ok);

  const rand = rng(seed + 1);
  for (let i = 0; i < RUNS; i++) {
    const who = rand() < 0.5 ? newAgent() : agent;
    const r = spend(who, owner.publicKey, 1n + BigInt(Math.floor(rand() * 10)));
    assert.equal(r.ok, who === agent, `run ${i}`);
  }
});

// ---------------------------------------------------------------- 2. daily total never exceeds dailyCap
test("invariant 2: Spent amounts within one UTC day never exceed dailyCap", () => {
  const rand = rng(seed + 2);
  for (let run = 0; run < Math.max(8, RUNS / 6); run++) {
    const owner = newOwner();
    const agent = newAgent();
    const daily = 1n + BigInt(Math.floor(rand() * 5_000_000));
    const perTx = 1n + BigInt(Math.floor(rand() * Number(daily)));
    assert.ok(configure(owner, agent.publicKey, daily, perTx).ok);
    const dayStart = now() - (now() % DAY);
    let sum = 0n;
    for (let i = 0; i < 25; i++) {
      // move forward inside the same UTC day
      const t = dayStart + BigInt(Math.floor(rand() * Number(DAY - 1n)));
      if (t > now()) setTime(t);
      const amt = 1n + BigInt(Math.floor(rand() * Number(perTx)));
      const r = spend(agent, owner.publicKey, amt);
      if (r.ok) {
        for (const e of parseSpentEvents(r.logs)) sum += e.amount;
      } else {
        assert.ok(sum + amt > daily, `refused although it fits: ${r.err}`);
      }
      assert.ok(sum <= daily, `run ${run}: ${sum} > ${daily}`);
    }
    assert.equal(allowance(owner.publicKey)!.spentToday, sum);
    setTime(dayStart + DAY + 60n); // next day for the next run
  }
});

// ---------------------------------------------------------------- 3. no single spend above perTxCap
test("invariant 3: no single spend exceeds perTxCap", () => {
  const owner = newOwner();
  const agent = newAgent();
  assert.ok(configure(owner, agent.publicKey, 30_000_000n, 1_000_000n).ok);
  assert.equal(spend(agent, owner.publicKey, 1_000_001n).ok, false);
  assert.equal(spend(agent, owner.publicKey, 0n).ok, false);
  assert.ok(spend(agent, owner.publicKey, 1_000_000n).ok);

  const rand = rng(seed + 3);
  for (let i = 0; i < RUNS; i++) {
    const amt = BigInt(Math.floor(rand() * 2_000_000));
    const r = spend(agent, owner.publicKey, amt);
    if (r.ok) for (const e of parseSpentEvents(r.logs)) assert.ok(e.amount <= 1_000_000n && e.amount > 0n);
    else assert.ok(amt === 0n || amt > 1_000_000n || /AboveDaily/.test(r.logs.join(" ")), `run ${i}: ${r.err}`);
  }
});

// ---------------------------------------------------------------- 4. revoke stops everything, same block too
test("invariant 4: after revoke, every spend reverts, including in the same block and same transaction", () => {
  const owner = newOwner();
  const agent = newAgent();
  assert.ok(configure(owner, agent.publicKey, 5_000_000n, 1_000_000n).ok);
  assert.ok(spend(agent, owner.publicKey, 10n).ok);

  // same transaction: revoke then spend (both signers) must fail as a whole
  const both = send(
    [revokeIx(owner.publicKey), spendIx({ agent: agent.publicKey, owner: owner.publicKey, mint: USDC, amount: 1n, ref: ref() })],
    [owner, agent],
  );
  assert.equal(both.ok, false);

  // same block: revoke, then spend without advancing the blockhash
  assert.ok(send([revokeIx(owner.publicKey)], [owner], { sameBlock: true }).ok);
  assert.equal(spend(agent, owner.publicKey, 1n).ok, false);

  const rand = rng(seed + 4);
  const before = usdcBalance(owner.publicKey);
  for (let i = 0; i < RUNS / 4; i++) {
    setTime(now() + BigInt(Math.floor(rand() * 200_000)));
    assert.equal(spend(agent, owner.publicKey, 1n + BigInt(Math.floor(rand() * 1_000_000))).ok, false);
  }
  assert.equal(usdcBalance(owner.publicKey), before);
  const a = allowance(owner.publicKey)!;
  assert.ok(a.revoked && a.agent.equals(PublicKey.default));
});

// ---------------------------------------------------------------- 5. owners are isolated
test("invariant 5: configure by owner A never changes owner B's allowance", () => {
  const b = newOwner();
  const bAgent = newAgent();
  assert.ok(configure(b, bAgent.publicKey, 7_000_000n, 2_000_000n).ok);
  assert.ok(spend(bAgent, b.publicKey, 123n).ok);
  const snapshot = JSON.stringify(allowance(b.publicKey), (_, v) => (typeof v === "bigint" ? v.toString() : v));

  const rand = rng(seed + 5);
  for (let i = 0; i < RUNS / 4; i++) {
    const a = newOwner();
    const daily = BigInt(Math.floor(rand() * 9_000_000));
    configure(a, newAgent().publicKey, daily, daily / 2n);
    // A tries to pass B's PDA with A as signer: seeds bind it to the signer, so this must fail
    const forged = configureIx(a.publicKey, a.publicKey, 1n, 1n);
    forged.keys[1].pubkey = allowancePda(b.publicKey);
    assert.equal(send([forged], [a]).ok, false);
  }
  const after = JSON.stringify(allowance(b.publicKey), (_, v) => (typeof v === "bigint" ? v.toString() : v));
  assert.equal(after, snapshot);
});

// ---------------------------------------------------------------- 6. USDC lands only at the agent
test("invariant 6: USDC only ever lands at the agent's token account", () => {
  const owner = newOwner();
  const agent = newAgent();
  const stranger = newAgent();
  assert.ok(configure(owner, agent.publicKey, 30_000_000n, 5_000_000n).ok);
  const strangerAta = getAssociatedTokenAddressSync(USDC, stranger.publicKey);
  const ownerAta = getAssociatedTokenAddressSync(USDC, owner.publicKey);
  assert.equal(spend(agent, owner.publicKey, 1n, { destination: strangerAta }).ok, false);
  assert.equal(spend(agent, owner.publicKey, 1n, { destination: ownerAta }).ok, false);
  // source must be the owner's own account: another owner's delegated account cannot be swapped in
  const other = newOwner();
  assert.equal(
    spend(agent, owner.publicKey, 1n, { source: getAssociatedTokenAddressSync(USDC, other.publicKey) }).ok,
    false,
  );

  const rand = rng(seed + 6);
  for (let i = 0; i < RUNS; i++) {
    const o0 = usdcBalance(owner.publicKey);
    const a0 = usdcBalance(agent.publicKey);
    const s0 = usdcBalance(stranger.publicKey);
    const amt = 1n + BigInt(Math.floor(rand() * 5_000_000));
    const dest = rand() < 0.3 ? strangerAta : undefined;
    const r = spend(agent, owner.publicKey, amt, dest ? { destination: dest } : {});
    const moved = o0 - usdcBalance(owner.publicKey);
    assert.equal(usdcBalance(agent.publicKey) - a0, moved, `run ${i}: agent got != owner lost`);
    assert.equal(usdcBalance(stranger.publicKey), s0, `run ${i}: stranger balance changed`);
    assert.equal(moved, r.ok ? amt : 0n);
    if (dest) assert.equal(r.ok, false);
  }
});

// ---------------------------------------------------------------- 7. configure validation
test("invariant 7: configure reverts when perTxCap > dailyCap, agent is zero, agent is the owner, or daily > $30", () => {
  const owner = newOwner();
  const agent = newAgent();
  assert.equal(configure(owner, agent.publicKey, 30_000_001n, 1n).ok, false);
  assert.ok(configure(owner, agent.publicKey, 30_000_000n, 30_000_000n).ok);
  assert.equal(configure(owner, agent.publicKey, 1_000_000n, 1_000_001n).ok, false);
  assert.equal(configure(owner, PublicKey.default, 1_000_000n, 1n).ok, false);
  assert.equal(configure(owner, owner.publicKey, 1_000_000n, 1n).ok, false);

  const rand = rng(seed + 7);
  for (let i = 0; i < RUNS; i++) {
    const daily = BigInt(Math.floor(rand() * 40_000_000));
    const perTx = BigInt(Math.floor(rand() * 40_000_000));
    const r = configure(owner, agent.publicKey, daily, perTx);
    assert.equal(r.ok, perTx <= daily && daily <= 30_000_000n, `run ${i}: daily ${daily} perTx ${perTx}`);
    if (r.ok) {
      const a = allowance(owner.publicKey)!;
      assert.equal(a.dailyCap, daily);
      assert.equal(a.perTxCap, perTx);
    }
  }
});

// ---------------------------------------------------------------- behaviour the UI and pay.ts rely on
test("day resets at 00:00 UTC; reconfigure keeps today's spend; SPL revoke alone stops spends; wrong mint refused", () => {
  const owner = newOwner();
  const agent = newAgent();
  assert.ok(configure(owner, agent.publicKey, 2_000_000n, 2_000_000n).ok);
  const dayStart = now() - (now() % DAY);
  setTime(dayStart + DAY - 10n);
  assert.ok(spend(agent, owner.publicKey, 2_000_000n).ok);
  assert.equal(spend(agent, owner.publicKey, 1n).ok, false);
  // reconfigure the same day does not reset the total
  assert.ok(configure(owner, agent.publicKey, 2_000_000n, 1_000_000n).ok);
  assert.equal(spend(agent, owner.publicKey, 1n).ok, false);
  // midnight: the known, accepted edge (up to 2x across midnight)
  setTime(dayStart + DAY + 1n);
  assert.ok(spend(agent, owner.publicKey, 1_000_000n).ok);
  assert.equal(allowance(owner.publicKey)!.spentToday, 1_000_000n);

  // SPL revoke on the token account (works without Ember)
  const ata = getAssociatedTokenAddressSync(USDC, owner.publicKey);
  assert.ok(send([createRevokeInstruction(ata, owner.publicKey)], [owner]).ok);
  assert.equal(spend(agent, owner.publicKey, 1n).ok, false);

  // a different mint is refused even with a matching delegate
  const fakeMint = Keypair.generate().publicKey;
  assert.equal(spend(agent, owner.publicKey, 1n, { mint: fakeMint }).ok, false);
});
