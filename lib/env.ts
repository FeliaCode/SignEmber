// Server-side configuration. Throws on first use of a missing required value,
// never prints values.
import "server-only";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

export const env = {
  get databaseUrl() { return req("DATABASE_URL"); },
  get sessionSecret() { return req("SESSION_SECRET"); },
  get agentKeyEncKey() { return req("AGENT_KEY_ENC_KEY"); },
  get gasTreasuryKey() { return req("GAS_TREASURY_KEY"); },
  get anthropicKey() { return req("ANTHROPIC_API_KEY"); },
  rpcUrl: process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
  network: (process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp") as `${string}:${string}`,
  usdcMint: process.env.NEXT_PUBLIC_USDC_MINT ?? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  facilitatorUrl: process.env.X402_FACILITATOR_URL ?? "local", // "local" = EmberSign's in-process facilitator
  appUrl: (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:8195").replace(/\/$/, ""),
  model: process.env.EMBER_MODEL ?? "claude-sonnet-5-5",
  explorerCluster: process.env.NEXT_PUBLIC_EXPLORER_CLUSTER ?? "mainnet-beta",
  killSwitch: process.env.EMBER_KILL_SWITCH === "1",
};
