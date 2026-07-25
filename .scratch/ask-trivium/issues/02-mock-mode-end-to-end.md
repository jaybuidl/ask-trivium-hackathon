# 02 — Mock mode end to end

**What to build:** An agent points at the published CLI, calls `analyze_dispute` with
`mode: "mock"`, and gets back a rendered nine-cell panel with a verdict. No network, no backend, no
wallet, no payment. A human running the CLI directly sees the same panel rendered for a terminal.

This is the submission's durability guarantee (ADR-0012): it works offline, on a judge's laptop,
with the backend down. It is also the cheapest complete path through the system, which is why it
comes first rather than last.

**Blocked by:** Nothing. This is the frontier.

**Status:** in-review

## Notes

The fixture here is hand-written and plausible, not real. Ticket 07 replaces it with a captured
mainnet panel, which is what ADR-0012 actually requires. Building against a hand-written fixture now
is what decouples this slice from the money path — the *code path* does not depend on the capture,
only the *fixture contents* do.

This slice carries the CLI scaffolding, the duplicated contract schemas (hand-copied, never a shared
package — ADR-0006), and all output rendering. Later tickets add transports, not renderers.

**This forces an open question.** You cannot render a panel without deciding whether `detail`
survives as three response shapes or collapses to one (`docs/wire-contract.md` §7 item 1). Decide it
here, and record the decision in the contract.

Read `docs/wire-contract.md` §1, §2 and §6 before starting. §6 is the list this repo is reviewed
against, and a fixture is exactly the kind of file that quietly acquires things it should not have.

- [x] The CLI runs as a stdio MCP server and advertises `analyze_dispute` with a tool description an
      agent can act on unaided
- [x] `mode: "mock"` returns a complete panel entirely from an embedded fixture, with no network
      access of any kind
- [x] Both `content` (human-readable) and `structuredContent` (schema-valid) are returned
- [x] `mode` and `settled` appear in the payload — an agent relaying the result can tell it was mock
      and unpaid without reading terminal output or `_meta`
- [x] Rendering is legible in a terminal: nine cells with model, persona, score and reasoning, plus
      the verdict and agreement
- [x] The fixture is embedded in the published package, not read from disk at runtime
- [x] `detail` is decided and the decision recorded in `docs/wire-contract.md`

## Comments

Built as `src/{contract,fixture,analyze,render,mcp,cli,bin}.ts`. 54 tests, typecheck clean.
`mcp.test.ts` drives the server over an in-process transport; `stdio.test.ts` spawns `src/bin.ts`
as a real subprocess over real stdio framing, which is what catches `--mcp` not being intercepted
and anything polluting stdout and desynchronising the JSON-RPC stream. The built `dist/bin.js` was
additionally driven by hand as a subprocess — that one is a manual check, not in the suite.

**`detail` is decided: it collapses to one shape.** Recorded in `docs/wire-contract.md` §2, with
§1 and §7 item 1 updated. **The backend's copy needs the same change.** Short version: `detail`
never changed what the backend computes (all nine cells run regardless), MCP publishes exactly one
`outputSchema` per tool so three shapes would force every field below `Verdict` to be optional, and
the token saving it bought is a fraction of a cent against a $1 call.

**A second contract correction fell out of the renderer.** §4's "why was it free" rule —
`analysesCompleted < 9` means incomplete, otherwise settlement failed — misreads a mock run, which
is also `settled: false` with nine cells, as a *failed payment*. Branch on `mode` first. Fixed in
§4 and in the `settled` comment in §2; the backend's copy needs this too.

**incur is the human CLI only; the MCP server is hand-rolled.** incur's built-in `--mcp` sets
`content` to `JSON.stringify(data)` — the same bytes as `structuredContent`, so no human rendering —
and its streaming progress emits `{progress: ++i, message}` with no `total`, against §3's
`{progress, total: 9, message}`. Since §3 progress forwarding is load-bearing for ticket 04, the
inbound leg is written against the MCP SDK directly. `--mcp` is intercepted in `bin.ts` before incur
loads. Both surfaces share one `analyze` and one `renderPanel`.

**Notes for the tickets downstream:**
- `incur` pulls zod **4.4.3**, and `@x402/*` pins zod **^3.24.2** (§5 trap c). This does **not**
  land in ticket 04 — 04 is payment-free and adds no x402 dependency. It belongs to ticket 06, and
  the finding is written up in that ticket's Comments: the packages coexist by nesting, zod never
  crosses the boundary in the bridge's direction, and the trap is live for the backend rather than
  for this repo.
- Ticket 07 replaces the *contents* of `src/fixture.ts` only. `src/fixture.test.ts` is the list of
  invariants that replacement has to keep — nine cells, three personas x three models, real spread,
  `mode: "mock"`, `settled: false`, nothing shaped like a private key.
- Paying modes currently throw `UnavailableError` from `analyze()`. Ticket 04 replaces that throw
  with the outbound leg; the "never fall back to mock" tests should keep passing untouched.
- `npm audit` reports 2 moderate advisories in `@hono/node-server`, reachable only through the MCP
  SDK's HTTP transport. This bridge is stdio-only, so nothing is exposed.
