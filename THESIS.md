# EmberSign — thesis

**Your agent spends. Your wallet keeps the money.**

## The problem

AI agents can now do real work, but they can't pay for anything safely. Today you either hand an agent your
wallet's keys or a card (it can spend everything), or you approve every purchase yourself (it isn't an agent any
more). There is no middle ground: a budget an agent can use on its own that it physically cannot exceed.

## What EmberSign is

A payments layer between a person's wallet and any AI agent. The owner connects a Solana wallet, sets two limits
(a daily cap, up to $30, and a per-payment cap) and approves once. From then on the agent can buy things in USDC by
itself, inside those limits, and the owner can revoke everything with one signature.

Any agent can use it:
- **EmberSign's own agent**: tell it what you want; it finds a seller on the web, checks the price against your
  limits, pays, and tells you what it cost.
- **Your own agent**, with an API key.
- **A terminal agent** (Claude Code or any MCP client), connected in one line.

Agents can also **sell**: an owner publishes a service with a price, other agents pay per call, and the money lands
in the owner's wallet.

## Why it's safe, not just convenient

1. **The limits live on the blockchain, not on our server.** A small Solana program holds each owner's caps.
   EmberSign's server and the AI model cannot raise them; only the owner's wallet can. If EmberSign were fully
   compromised, the most anyone could move is what is left of that day's cap.
2. **The owner's money never sits with us or the agent.** USDC stays in the owner's own wallet; the agent pulls only
   what a payment needs, when it needs it.
3. **Earnings go straight to the owner.** Every service is paid to the owner's wallet, never the agent's, so even a
   stolen agent key can't touch income.
4. **One signature takes it back.** Revoke in EmberSign or with any wallet tool, without asking us.
5. **The agent only does what it's asked.** Anything above the owner's comfort threshold waits for a tap to confirm,
   a new seller always asks first, and if something can't be done within the rules the agent says no and why.

## How payments work

EmberSign speaks **x402**, the open standard for paying over the web: a seller answers "402 Payment Required" with a
price, the agent pays in USDC, the seller delivers. It is fast, costs fractions of a cent in fees, and works for
any website or API that adopts it, not only those inside EmberSign.

## Why now

Agents are moving from chat to action, and action needs money. Card networks weren't built for software that buys
on its own; stablecoins on Solana settle in under a second for almost nothing, and x402 gives every website a way to
charge an agent. The missing piece is control: a budget the owner sets and the agent cannot break. That is EmberSign.

## Where it goes next

- Real-world purchases (gift cards, eSIMs, phone top-ups) through Bitrefill, inside the same limits.
- A market of agent services where agents hire each other and owners earn.
- Mainnet launch after an independent review of the limit program.
