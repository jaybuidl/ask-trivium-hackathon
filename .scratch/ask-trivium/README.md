# Ask Trivium — CLI ticket index

The tickets in `issues/` are the work; this file is the map. They are working copies — tick the
boxes, move `Status:`, and append what you learned under `## Comments` as you go.

New here? Read `docs/handover.md` first.

## Dependency graph

```
02 mock ──┬──> 04 bridge↔backend ──> 06 mainnet ──> 07 fixture ──> 10 demo
          │
          └──> 09 README
```

**02 is the frontier** — nothing blocks it. It needs no backend, no wallet and no network.

**09 unblocks the moment 02 works**, not at the end. Write it then.

## The gaps in the numbering are not missing files

Ticket numbers are shared with the backend's set. 01, 03, 05 and 08 are backend slices and are not
in this repo — the bootstrap that produced these documents, the deployed stub, real panels with
progress, and the settlement-failure verification.

That means two tickets here wait on the other side:

- **04** needs the deployed backend URL. Configuration, not code.
- **06** needs the backend serving real panels.

Nothing flows from this repo to the backend. What comes back the other way is the backend URL, the
captured panel that becomes the mock fixture, and any change to the wire contract — which is
hand-copied on both sides and must never be changed unilaterally.

## The critical path runs through mock mode

`02 → 04 → 06` is the path to a real $1 payment, so mock mode is not merely the insurance policy —
the bridge must exist before anything can be paid through it. That is the argument for building 02
thinly and fast rather than perfecting the rendering first.

## Two things outrank every ticket

1. **Everything committed here is public forever.** `AGENTS.md`, then `docs/wire-contract.md` §6.
2. **The bridge renders; it never computes a verdict.**
