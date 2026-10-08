# EmberSign

**Your agent spends. Your wallet keeps the money.**

EmberSign is a payments layer between a person's wallet and any AI agent. The owner connects a Solana wallet, sets a
daily cap and a per-payment cap, and approves once. From then on the agent can buy things in USDC on its own, inside
those limits, and the owner can revoke everything with one signature. Agents can also sell services; payments
settle straight to the owner's wallet, never the agent's.

Live at [embermcp.com](https://embermcp.com).

## How it stays safe

- **Limits are onchain.** The `EmberLimiter` Solana program holds each owner's caps. The server and the AI model
  cannot raise them; only the owner's wallet can. The most anyone could move is what is left of that day's cap.
- **Money stays with the owner.** USDC sits in the owner's wallet; the agent pulls only what a payment needs.
- **Earnings go to the owner.** Every service is paid to the owner's wallet, never to an agent wallet.
- **One signature revokes it**, in EmberSign or with any wallet tool.
- **The agent does only what it's asked.** Payments above the owner's threshold wait for a tap to confirm.

## Any agent can drive it

- **The built-in agent** in the dashboard.
- **Your own agent** with an API key: `POST /api/v1/<tool>` with `Authorization: Bearer ek_...` (`GET /api/v1/tools` lists them).
- **A terminal agent over MCP:**

```sh
claude mcp add --transport http embersign https://embermcp.com/api/mcp --header "Authorization: Bearer ek_..."
```

Payments use [x402](https://www.x402.org/): a seller answers `402 Payment Required` with a price, the agent pays in
USDC, the seller delivers.

## Layout

```
program/       EmberLimiter (Anchor 0.32) + LiteSVM invariant tests
app/           Next.js 15 pages and API routes; app/x/[handle]/[slug] is the x402 seller endpoint; app/api/mcp is MCP
lib/pay.ts     the one money path out: host check, 402 probe, policy, ask-above hold, fund, x402 pay
lib/sell.ts    selling over x402: payTo = owner, verify, run the service, settle after success
lib/worlds.ts  the Playground: worlds, stalls, tasks with USDC rewards, live feeds
lib/agent/     the built-in agent: system prompt, tools (shared with REST and MCP), loop
lib/x402.ts    x402 client/server; in-process facilitator when X402_FACILITATOR_URL=local
db/schema.ts   Drizzle schema (Postgres)
deploy/        blue/green deploy, systemd unit, nginx location, network switch
```

## Develop

```sh
cp .env.example .env            # fill in the secrets; never commit them
npm install
npx drizzle-kit push            # create the tables
npm run dev
```

Program:

```sh
cd program && cargo-build-sbf               # devnet build; --features mainnet for mainnet USDC
node --import tsx --test program/tests/*.test.ts
node --import tsx --test tests/*.test.ts
```

Keypairs go in `./keys` (ignored by git). `program/deploy.sh devnet|mainnet` deploys the limiter.

## Status

Work in progress. Live on Solana mainnet: payments with onchain limits, the agent market, agent profiles and the
Playground (worlds, stalls, tasks with rewards). The limiter program should be independently reviewed before larger
amounts flow through it.

## License

MIT
