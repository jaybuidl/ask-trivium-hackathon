# ask-trivium

The open-source half of Ask Trivium: a CLI that bridges any MCP agent to a paid dispute-analysis
backend and pays for the call with x402.

## Everything committed here is public, forever

This repo gets published, and its git history is published with it. A secret removed in a later
commit is still disclosed. There is no "clean it up before release" step.

The analysis engine lives in a separate closed repo. You cannot see it, and you must not
reconstruct it here. Never write into this repo:

- **Prompt text** of any kind — persona system prompts, analysis-framework prose, scoring
  instructions. Persona *ids* (`strict`, `consumer-aware`, `precedent-focused`) are part of the
  wire schema and are fine. The line is **names yes, instructions never**.
- **Threshold constants** — the numbers that turn a score into a decision.
- **Aggregation or decision logic.** The bridge renders what the backend returns. It never computes
  a verdict, never averages the nine cells, never derives `decision` or `agreement` itself.
- **Provider API keys or provider SDK dependencies.** No `@anthropic-ai/*`, no `openai`, no
  `@google/*`. Reaching for one means you are building the backend in the wrong repo.
- **A funded private key** — ever, including in examples, tests, and fixtures.
- **Fault-injection switches.** Forcing a settlement failure is a backend-only capability.
- **Unit economics** — cost per call, margin, how often calls are given away free.

`docs/wire-contract.md` §6 is the checkable version of this list. Diff against it before every push.

When in doubt, it stays out. Asking costs a minute; a disclosure is permanent.

## Where things are

- `docs/handover.md` — what this CLI is, its two roles, the modes, and which slice to pick up
  first. **Read this before anything else.**
- `docs/wire-contract.md` — the schemas, progress contract, and error behaviour you code against.
  Self-contained: it is a hand-copied duplicate of the backend's copy, deliberately not a shared
  package. If it changes, both copies change by hand.
- `CONTEXT.md` — the vocabulary. Use these words; the backend uses them too.
- `.scratch/ask-trivium/` — the tickets. `README.md` there is the map.

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/` in this repo. See
`docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, used verbatim as `Status:` values. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` at the repo root. See `docs/agents/domain.md`.
