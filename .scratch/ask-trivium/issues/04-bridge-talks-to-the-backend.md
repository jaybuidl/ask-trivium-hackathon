# 04 — The bridge talks to the deployed backend

**What to build:** An agent calls `analyze_dispute` through the CLI with a non-mock mode, the call
crosses to the deployed backend, and the response renders exactly as mock does. Both MCP legs —
agent-to-bridge over stdio, bridge-to-backend over HTTP — proven end to end against something real.

Still free: no payment, no wallet. The backend is serving canned data at this point.

**Blocked by:** nothing — 02 is resolved and the backend URL has arrived.

**`https://ask-trivium-mcp.fly.dev/mcp`** — see `docs/backend-endpoint.md`, which also covers what
is behind it (a stub serving canned data), why the binding timeout is the client's and not the
host's, and the diagnostic tool for proving progress crosses both legs while the stub still answers
instantly.

**Status:** in-review

## Notes

This is the first slice where the bridge is actually a bridge. Everything before it was one half or
the other.

Rendering must not fork. Mock and remote responses satisfy the same schema, so they go through the
same renderer — if this ticket adds a second rendering path, the slice was built wrong.

Failure is hard and loud (ADR-0012): if the backend is unreachable in a non-mock mode, the call
fails. It must never silently fall back to the mock fixture. A judge who thinks they are watching a
live call must actually be watching one.

- [x] A non-mock call reaches the deployed backend and renders through the same renderer as mock
- [x] Backend unreachable produces a clear hard failure, never a silent fallback to mock
- [x] The mode reported in the payload matches the mode actually used
- [x] The backend URL is configurable without editing code

## Comments

**Resolved.** `src/backend.ts` is the outbound leg; `src/analyze.ts` dispatches to it for the paying
modes and still serves mock from the fixture without opening a socket. Verified against the real
deployment, not only against the stand-in: `ASK_TRIVIUM_LIVE=1 npm test`, and the CLI driven by hand
in `--mode mainnet`, which returns the stub's canned panel through the ordinary renderer.

**Same renderer, proven rather than asserted.** Two tests compare the tool's `content` text to
`renderPanel(structuredContent)` byte for byte, one in-process and one across a spawned subprocess.
A second rendering path fails them, and so does passing the backend's own text through — the
stand-in returns a distinctive string in `content` that must not appear in the output.

**Progress crosses both legs.** The bridge registers an `onprogress` handler on its outbound call
and re-emits each notification upstream against the agent's `progressToken`. `remote.test.ts` proves
a notification emitted by an HTTP backend reaches an agent on the far side of stdio, and that a call
slower than the agent's own timeout survives because of it.

### Things found on the way

- **`resetTimeoutOnProgress` does nothing on its own.** The SDK looks up a progress *handler* before
  resetting the timer and returns early when there is none, so a call made without a listener keeps
  the flag and loses the behaviour — and then times out at 90s on exactly the long analyses the flag
  exists for. The bridge now always registers a handler and treats the listener as optional. Worth
  carrying to the backend's copy of §3: configuring the option is not the same as getting it.
- **`new URL("localhost:8080")` succeeds**, as the scheme `localhost:` with the path `8080`. A
  forgotten `http://` is the likeliest way to mistype this variable and it parses cleanly, failing
  much later as an unexplained transport error. `resolveEndpoint` checks the protocol, not just
  parseability.
- **Node reports every network failure as `TypeError: fetch failed`** and hides the reason in
  `cause`. `errorMessage` now follows the chain, so a wrong endpoint says `connect ECONNREFUSED
  127.0.0.1:49999` rather than two words that diagnose nothing.
- **The endpoint is validated at startup, in every mode** — including mock, which never uses it. The
  test is not "will this run need it" but "did somebody set it"; and checking only in a paying mode
  would miss it anyway, since a mock-registered bridge can be asked for mainnet per call (ADR-0011).

### A contract question this raised, for whoever picks up 05/06

The bridge rejects a panel whose `mode` disagrees with the mode the call ran in, rather than
relabelling it — §2 puts the tier in the payload so a caller can relay "this was real" without
reading terminal chrome, and a payload that contradicts the call makes that field worthless. The
backend currently echoes `mode` faithfully, so nothing hits this. It is not written down in §1–§6
as an obligation, though, and it is now load-bearing on this side.

### Not in this slice

No payment, by design — ticket 06. Wire contract §5 puts x402 *inside* the JSON-RPC layer as a
client-side wrapper around the tool call, so it lands as a wrapper around the `Client` in
`backend.ts` rather than as a rewrite of it. `_probe_hold_open` is called from `live.test.ts` and
nowhere else, and that test goes when the diagnostic does.
