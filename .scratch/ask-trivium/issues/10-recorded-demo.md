# 10 — Recorded demo

**What to build:** A recording that shows the product working, which survives the backend being
down, the venue wifi being bad, and the judge running it a week later.

**Blocked by:** 07, and the backend's settlement-failure verification.

**Status:** ready-for-agent

## Notes

Blocked by 07 rather than 06 because the demo and the mock fixture should show the same panel — a
judge who watches the recording and then runs mock mode themselves sees the thing they were shown,
not a different one. That correspondence is the point of ADR-0012.

Blocked by the settlement-failure verification because that path is worth showing. A payment failing
and the analysis arriving anyway is a stronger story than a payment succeeding — it demonstrates a
deliberate decision rather than a happy path, which is the kind of thing that distinguishes a
submission. Forcing that failure is a backend capability; this repo only renders the result.

Include the faucet route and cold-start instructions alongside, so a judge can reproduce rather than
only watch.

Progress notifications are the most watchable part: nine cells landing live over ninety seconds is
the moment the panel stops being an abstraction. Do not cut to a finished result.

- [ ] The recording shows a real paid call, live progress, and the rendered panel
- [ ] The panel shown is the same one mock mode serves
- [ ] Reproduction instructions accompany it, tested by someone following them
- [ ] The recording is reachable without running anything
- [ ] Nothing on screen reveals anything on `docs/wire-contract.md` §6 — including terminal
      scrollback, environment variables, wallet keys, and editor tabs
