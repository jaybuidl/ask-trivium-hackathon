# 02 — Mock mode end to end

**What to build:** An agent points at the published CLI, calls `analyze_dispute` with
`mode: "mock"`, and gets back a rendered nine-cell panel with a verdict. No network, no backend, no
wallet, no payment. A human running the CLI directly sees the same panel rendered for a terminal.

This is the submission's durability guarantee (ADR-0012): it works offline, on a judge's laptop,
with the backend down. It is also the cheapest complete path through the system, which is why it
comes first rather than last.

**Blocked by:** Nothing. This is the frontier.

**Status:** ready-for-agent

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

- [ ] The CLI runs as a stdio MCP server and advertises `analyze_dispute` with a tool description an
      agent can act on unaided
- [ ] `mode: "mock"` returns a complete panel entirely from an embedded fixture, with no network
      access of any kind
- [ ] Both `content` (human-readable) and `structuredContent` (schema-valid) are returned
- [ ] `mode` and `settled` appear in the payload — an agent relaying the result can tell it was mock
      and unpaid without reading terminal output or `_meta`
- [ ] Rendering is legible in a terminal: nine cells with model, persona, score and reasoning, plus
      the verdict and agreement
- [ ] The fixture is embedded in the published package, not read from disk at runtime
- [ ] `detail` is decided and the decision recorded in `docs/wire-contract.md`
