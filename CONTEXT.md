# Ask Trivium

A paid analysis service for consumer disputes. A caller submits a dispute; a panel of nine
independent LLM analyses predicts how a neutral adjudicator would rule. Sold at $1 USDC per call
over x402, reached through this open-source CLI, which bridges any MCP agent to a closed backend.

This repo is the CLI. The engine that produces the analysis is closed and lives elsewhere — see
`AGENTS.md`.

Decisions below are cited as `ADR-NNNN` for traceability. Those records live in the closed backend
repo; every one of them that binds this repo is restated in full in `docs/handover.md` or
`docs/wire-contract.md`, so nothing here depends on reading them.

## Language

### The analysis

**Dispute**:
The consumer complaint being analysed — a title and a body of case content.
_Avoid_: case, claim, ticket

**Cell**:
One analysis of the dispute by one model under one persona. Nine cells form a panel.
_Avoid_: run, sample, analysis (ambiguous — an analysis is the whole thing)

**Panel**:
The full set of nine cells for a dispute. What the caller is buying.
_Avoid_: matrix, grid, jury

**Persona**:
An analytical perspective a model is asked to adopt — `strict`, `consumer-aware`,
`precedent-focused`. The names are public; the prompt text behind them is not (ADR-0009), and never
appears in this repo.
_Avoid_: lens, role, character

**Verdict**:
The aggregated outcome of a panel: a decision, a user-win score, and a one-sentence rationale.
Always singular — the nine cells have scores, not verdicts. Computed by the backend; the bridge
only renders it.
_Avoid_: result, judgement, ruling

**Agreement**:
The qualitative collapse of a panel's statistical dispersion into `strong | moderate | weak`. How
much the nine cells concur. Arrives on the wire already collapsed.
_Avoid_: consensus, confidence (confidence is a per-cell property)

**Escalate**:
The decision value meaning the panel declines to auto-resolve and refers the dispute to a jury. A
legitimate outcome, not a failure.

### The service

**Bridge**:
This CLI, which is simultaneously a local stdio MCP server for an agent and a payment-aware MCP
client of the backend. It renders and pays; it never computes a verdict.
_Avoid_: client, proxy, wrapper

**Mode**:
Which tier a call runs against — `mock` (offline fixture, no backend, no payment), `testnet` (Base
Sepolia), `mainnet` (Base, real $1). Chosen per call (ADR-0011).
_Avoid_: network (mock is not a network), tier, environment

**Mock**:
A captured real panel, shipped inside the published package and served entirely offline. The
submission's durability guarantee, never a fallback (ADR-0012).
_Avoid_: stub, fixture, demo mode

**Settlement**:
The on-chain USDC transfer that completes a paid call. Distinct from verification, which happens up
front, costs nothing, and proves nothing about the future — settlement happens 90–180 seconds later
and can fail on its own. A panel can be delivered and never settled (ADR-0014).
_Avoid_: payment (that's the whole flow, verify through settle), charge, billing

**Giveaway**:
A panel delivered without revenue. Two causes: an incomplete panel (ADR-0007) and a failed
settlement (ADR-0014). Always final — a giveaway is never billed retroactively.
_Avoid_: refund (there is no refund path, and the word implies one exists), comp. Note **`mock` is
not a giveaway** — it is free by design and runs no cells.
