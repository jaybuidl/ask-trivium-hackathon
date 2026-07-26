# 06 — One $1 mainnet call, end to end, captured

**What to build:** A real caller pays $1 USDC on Base mainnet through this bridge, the panel comes
back, and the payment settles on chain. The money path works.

This is the client half. The backend side of the same milestone — running real models, emitting
progress, skipping settlement on an incomplete panel — is tracked in the backend repo.

**Blocked by:** 04, and the backend serving real panels with progress.

**Decides:** wire contract §7 items 2 (`idempotency_key`'s source) and **4** (what the bridge does
with a panel whose `mode` disagrees with the call). Item 4 arrived with ticket 04 and is the one
that can destroy a paid panel — read it before writing the settlement path, not after.

**Status:** ready-for-agent

## Notes

**Capture the response.** It is simultaneously the mock fixture (ticket 07), the render-iteration
fixture, and the recorded demo's source material. One run closes all three; skipping it means doing
the run twice.

The traps, all of which cost real money if hit. `docs/wire-contract.md` §5 has the detail:

- Set the payment timeout well above 180s. Every spec example uses 60, and the worst case here is
  180 — copy the example and the authorization expires mid-flight *after* nine frontier calls have
  succeeded. **Verify this rather than assuming it.**
- Build against x402 **v2** (scoped packages), never the unscoped v1 — incompatible wire format.
  Confirm the facilitator speaks v2 via `GET /supported` before wiring anything.
- Never hand a zod-4 schema to anything under the x402 packages; they pin zod 3 and the schema
  objects are not interchangeable.
- Register no recovering `onPaymentResponse` hook. It signs a fresh authorization and re-runs the
  whole call — a second $1 and a second set of nine model calls, for one panel.

**This forces an open question**: `idempotency_key`, client-supplied or derived from the payment
nonce (`docs/wire-contract.md` §7 item 2). Decide it here — a retry after a dropped connection is
exactly the scenario this ticket creates.

**Grep the captured panel's nine reasoning strings** for `instruct`, `perspective`, `persona`,
`my role`, `standards`. Zero hits passes. The reasoning strings ship unsanitised and this capture is
about to be embedded in a public package, so this is the last checkpoint before prompt phrasing
becomes permanently public. It is a review step, not a mechanism — it only happens if someone does
it.

The wallet is funded to run this. Whatever holds that key, it is not this repo — not in a fixture,
not in an example, not in a test, not in a commit that gets amended later.

- [ ] A $1 USDC payment settles on Base mainnet and the panel returns in the same call
- [ ] The full response is saved to disk, unedited
- [ ] `settled: true` and the settlement transaction appear in the payload, and the bridge renders
      both
- [ ] The payment timeout is set above the worst case, and this is verified rather than assumed
- [ ] The nine reasoning strings are grepped and the result recorded
- [ ] `idempotency_key`'s source is decided and recorded in `docs/wire-contract.md`
- [ ] §7 item 4 is decided and recorded: what the bridge does with a panel whose `mode` disagrees
      with the call, now that a discarded panel can be one the caller paid for

## Comments

### The zod 3 / zod 4 trap, verified against the published packages (from ticket 02)

`incur` puts **zod 4.4.3** at this repo's root. The x402 packages pin **zod ^3.24.2**. Probed the
real packages rather than reasoning from the pin, and the trap is narrower than §5 trap (c) reads:

- **Not a resolution conflict.** `zod` is a regular dependency of `@x402/{core,mcp,evm}`, not a peer.
  npm nests it: zod 4.4.3 at the root, zod 3.25.76 under each x402 package, side by side and quiet.
  No `overrides`, no `resolutions`, nothing to configure. Do not "fix" this.
- **zod never crosses the boundary in the bridge's direction.** It appears nowhere in
  `@x402/mcp`'s public type signatures — the only occurrence in the whole `.d.ts` is inside a
  doc-comment example. `wrapMCPClientWithPayment(mcpClient, paymentClient, options)` and
  `createx402MCPClient(config)` take an MCP SDK `Client` and an `x402Client`. We pass plain JSON
  objects; x402's zod parses its own payment payloads, never our schemas.
- **The shared type dedupes.** `@x402/mcp` wants `@modelcontextprotocol/sdk ^1.12.1`; this repo is
  on `^1.29.0`, which satisfies it, so exactly one SDK copy resolves. That was the actual risk —
  two copies would make our `Client` and its `Client` two nominally distinct types — and it is
  absent today.
- `zod@3.25.76` is the transitional release shipping **both** v3 and v4 APIs (a `zod/v4` subpath),
  so "they pin zod 3" is imprecise. Immaterial here, but do not expect classic-zod-3 internals.

**Where the trap is actually live: the backend, not here.** The API that takes zod schemas is
`createPaymentWrapper(resourceServer, config)` — the server-side helper, whose doc example is
`mcpServer.tool("search", "...", { query: z.string() }, ...)`. That is the resource server, which
is the backend's job; §5 says the bridge uses the client-side wrapper. **In this repo the only way
to reach the zod trap is to be writing backend code in the wrong repo** — treat reaching for
`createPaymentWrapper` here as the boundary alarm it is, not as a dependency puzzle to solve.

**Plan for this ticket:** change nothing about zod. No overrides. Keep this repo's schemas on root
zod 4, never import from `@x402/*/node_modules/zod`, and pass only plain objects across the x402
boundary.

**One cheap guard worth adding when x402 lands:** assert exactly one `@modelcontextprotocol/sdk`
resolves. If a future x402 release moves its SDK pin outside this repo's range, the SDK forks into
two copies and the `Client` type identity breaks — which surfaces as baffling structural type
errors, at whatever hour this gets wired up. Failing loudly at install time is much cheaper.

**Proposed contract change, NOT made — needs the backend's agreement.** §5 trap (c) is correct for
the backend's copy and misleading for this one. It would be worth annotating with which side it
binds, but the contract is hand-copied and neither side may change it unilaterally.

**The mismatch check ticket 04 left you (§7 item 4).** `backend.ts` rejects a panel whose `mode`
disagrees with the mode the call ran in. That is safe only while nothing charges — and this ticket
is what makes it charge. ADR-0014 forbids its shape once money moves: *"marking a complete, correct
panel as an error invites the agent to discard or retry it, re-creating the double-charge path from
the client side"*, and ADR-0007 has already ruled out refunds, so a discarded paid panel is gone.

Do not reach for the obvious fix of reading `settled` and delivering anything that was paid for: it
trusts one field of a payload the same branch has just decided is untrustworthy. Once this ticket
lands the bridge holds the wallet and knows whether **it** paid, from its own payment response,
without asking the backend. That is the information the decision was waiting for.
