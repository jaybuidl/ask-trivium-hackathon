# 07 — Captured panel replaces the hand-written fixture

**What to build:** Mock mode stops serving a plausible invention and starts serving a real panel
that a real payment really produced.

**Blocked by:** 02, 06.

**Status:** ready-for-agent

## Notes

Small, and easy to skip — but ADR-0012 requires the mock be a *captured real* panel, not a
convincing imitation. The difference is the whole point: a judge running mock mode offline is seeing
genuine output of the real system, and the claim "this is what it actually produced" has to be true.

Check the boundary before committing: the captured panel goes into a public package, so its
reasoning strings must already have passed ticket 06's grep. If they did not, fix the prompt hygiene
on the backend and recapture rather than hand-editing the fixture — an edited fixture is no longer a
capture, and the claim stops being true.

- [ ] The embedded fixture is the response captured in ticket 06, unedited
- [ ] Mock mode renders it identically to how the live path renders a real panel
- [ ] The fixture's reasoning strings passed the grep
- [ ] `mode: "mock"` and `settled: false` are still correct in the served payload
