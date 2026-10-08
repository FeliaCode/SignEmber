// The agent wallet's float rule (pure, unit-tested).
export const FLOAT_MAX = 500_000n; // $0.50
export const FLOAT_LOW = 50_000n; // $0.05
export const FLOAT_REFILL = 250_000n; // $0.25

/**
 * How much to spend() before paying `amount` with `float` in hand (USDC base units).
 * Fits in the float -> 0. Small payment that would leave the float under $0.05 -> pull what's missing plus a $0.25
 * refill, capped so the float stays at or under $0.50 and never above `maxPull` (the limiter's per-spend room).
 * Payment larger than the float maximum -> exactly what's missing, just in time.
 */
export function planPull(float: bigint, amount: bigint, maxPull: bigint): bigint {
  if (float >= amount && float - amount >= FLOAT_LOW) return 0n;
  const need = amount > float ? amount - float : 0n;
  if (amount > FLOAT_MAX) return need;
  let pull = need + FLOAT_REFILL;
  const after = float + pull - amount;
  if (after > FLOAT_MAX) pull -= after - FLOAT_MAX;
  if (pull > maxPull) pull = maxPull;
  return pull < need ? need : pull;
}
