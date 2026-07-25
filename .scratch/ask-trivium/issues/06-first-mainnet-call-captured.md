# 06 — One $1 mainnet call, end to end, captured

**What to build:** A real caller pays $1 USDC on Base mainnet through this bridge, the panel comes
back, and the payment settles on chain. The money path works.

This is the client half. The backend side of the same milestone — running real models, emitting
progress, skipping settlement on an incomplete panel — is tracked in the backend repo.

**Blocked by:** 04, and the backend serving real panels with progress.

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
