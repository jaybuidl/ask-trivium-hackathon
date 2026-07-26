# Start here

You are picking up a repo that has documents and tickets but no code yet. This file tells you what
is being built, why it takes the shape it does, and which slice to pick up first.

## What this is

Ask Trivium sells a $1 dispute analysis. A caller submits a consumer dispute; nine independent LLM
analyses — three models × three personas — predict how a neutral adjudicator would rule, and the
panel is aggregated into one verdict. That engine is closed and lives in another repo.

**This repo is the CLI, and the CLI is the submission.** Not a thin wrapper around an HTTP call: it
is the piece that makes a paid MCP tool reachable at all.

## Its two roles

No MCP client in circulation speaks x402 — Claude Code, Claude Desktop and Cursor will not pay a
`PaymentRequired` and retry. The CLI fills that gap. It runs as a local **stdio MCP server** that an
agent connects to, holds the wallet, handles the payment round trip, and forwards to the remote HTTP
MCP server. The same binary is also usable as a plain human CLI.

```
agent ──stdio MCP──▶ ask-trivium CLI ──HTTPS + x402──▶ Trivium MCP server
                     (this repo, wallet)               (closed, engine)
```

So there are **two MCP client legs**, and both need long-call handling — the bridge must actively
forward progress notifications upstream, or the agent times out at 60s while the bridge waits
contentedly for a 90-second call. `docs/wire-contract.md` §3 is the detail.

That dual role is also what makes this a real artifact rather than a demo shell: it is useful, it is
necessary, and it contains none of the engine.

Built with the `incur` framework, which targets exactly this agent-and-human dual audience. That's a
reversible choice, not a load-bearing one.

## The three modes

`mode` is an input to `analyze_dispute`, chosen per call — not bound at registration, not a
deployment flag. Its default comes from `ASK_TRIVIUM_MODE` set at MCP registration, falling back to
`"mock"`; an explicit per-call value always wins.

| Mode | What runs | Payment |
|---|---|---|
| `mock` | Nothing leaves the process. An embedded fixture is rendered. | None |
| `testnet` | Real backend, real panel, Base Sepolia | Faucet USDC |
| `mainnet` | Real backend, real panel, Base | Real $1 |

Why per-call: the primary consumer is an agent, not a human at a prompt. One install has to serve
"show me the mock" and "now do a real one" in the same session without re-registering and restarting
the agent. And the tool input schema is the only documentation an agent reliably reads — a `mode`
enum in `tools/list` reaches it; a README section does not.

Why the default is `mock`: an agent that reaches for `mainnet` on its own spends a real dollar.
Someone pasting the plain registration line cannot be charged without saying "do it for real", while
a paying customer sets `ASK_TRIVIUM_MODE` once and stops thinking about it.

If the bridge is configured for a paying network with no funded wallet, **fail at startup** with a
directive error — so the agent reports "not configured" before a dispute has been typed, not "the
analysis failed" after.

## Mock is the durability guarantee, and never a fallback

Judging happens asynchronously, after the hackathon, possibly after the deployment has gone quiet.
If `npx ask-trivium` is broken when a judge tries it, the submission is broken. Mock is what makes
this repo survive its author going to sleep, which imposes three properties:

1. **Fully offline.** No network call of any kind — not to the backend, not to a CDN, not to a gist.
   A mock that fetches anything shares the failure mode of the thing it insures against.
2. **Embedded in the published package**, shipped in the npm tarball. Not gitignored, not downloaded
   on first run.
3. **A captured real response** from an actual mainnet run: real prose, real disagreement, real
   spread across the nine cells, with the genuine settlement transaction hash preserved in it. Canned
   lorem ipsum makes a judge's "is this all fake?" instinct correct.

Property 3 arrives in ticket 07. Build against a hand-written fixture first (ticket 02) so the code
path does not wait on a real payment — only the fixture *contents* depend on the capture.

**It is never an automatic fallback.** Backend unreachable in a paying mode means a hard, loud
failure naming `mode: "mock"` as the working path. A paying caller silently receiving fixture data is
the one unrecoverable trust failure in this product.

## What arrives from the other side, and when

Almost nothing crosses, and nothing flows from here to the backend:

- **The backend URL** — after the backend's stub deploys. It is configuration, not code, and it must
  be settable without editing source.
- **The captured panel** — after the first mainnet call, and it becomes the embedded fixture.
- **The wire contract** — already here, hand-copied. If it changes, both copies change by hand.

## Where to start

`.scratch/ask-trivium/README.md` is the map, and **ticket 02 is the frontier**: mock mode end to
end. It needs no backend, no wallet, and no network, and it carries the CLI scaffolding, the
duplicated schemas, and all the rendering that every later ticket reuses. Ticket 09 — the README and
cold-start quickstart — unblocks the moment 02 works, and should be written then rather than last.

Two rules that outrank any ticket:

1. **Everything committed here is public forever.** `AGENTS.md`, then `docs/wire-contract.md` §6.
2. **The bridge renders; it never computes a verdict.** If you are writing an average, a threshold
   comparison, or anything that turns numbers into a decision, you are writing the backend in the
   wrong repo.
