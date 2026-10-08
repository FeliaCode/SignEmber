# EmberSign — design brief

0. **Conceit.** On the welcome page the visitor drags a daily cap and watches an agent's purchases burn down an
   ember bar until the next one is refused, which is exactly what EmberSign's limiter does to an agent's spending.
   The demo runs the same `remaining()` arithmetic as the onchain program (labelled "demo, no money moves").
1. **Evokes.** Calm, exact, warm, trustworthy. A ledger kept in daylight.
2. **References.**
   - Mercury-style banking dashboards: generous white space, numbers set large in a serif, small quiet labels.
   - Stripe docs code blocks for the API key / MCP snippets: one muted panel, copy button, nothing else.
   - Linear's settings pages: one column, sections separated by hairlines, the destructive action last and alone.
3. **Palette** (HSL tokens in `app/globals.css`). Light: paper `36 33% 97%`, ink `24 18% 12%`, ember primary
   `14 82% 48%`, settled accent `158 46% 32%`, muted `34 18% 92%`, border `30 14% 85%`. Dark is designed, not
   inverted: charcoal `20 10% 8%`, warm ink `36 25% 92%`, ember `16 88% 58%`.
4. **Type.** Fraunces (display, 500–600, sentence case) + Rethink Sans (UI/body); IBM Plex Mono only for
   addresses, amounts in tables and code. Scale 13 / 15 / 17 / 22 / 30 / 44 / 60.
5. **Signature move.** The ember bar: the budget meter is a strip that glows from ember to ash as today's cap is
   spent. It's the conceit on the welcome page and the budget card on Home.
6. **Motion moments** (motion tokens only): bar burn-down (`--dur-slow`), confirm card → status strip morph,
   reveal on scroll for welcome sections, number tick on settled payments. Reduced motion is honoured globally.
7. **Imagery.** The mascot: **Salo**, a small salamander (the creature that lives in fire and isn't burned,
   i.e. it handles money without getting burned), hand-drawn SVG. Poses: hero (holding a lantern),
   working (carrying a coin), resting (empty states). An OG image comes later from the same SVG.
8. **v1 scope.** Welcome, Setup (sign in, handle, limits), Home, Chat with Confirm cards, Market, My services,
   Activity, Settings (limits, ask-above, allowlist, API keys + MCP,
   sweep, revoke). Light and dark.
