# The backend endpoint

```
https://ask-trivium-mcp.fly.dev/mcp
```

This is the deployed backend the bridge talks to in `testnet` and `mainnet`. `mock` never reaches
it (ADR-0012) and must not start doing so.

Make it the **default**, overridable by an environment variable — ticket 04's "the backend URL is
configurable without editing code". Suggested name: `ASK_TRIVIUM_ENDPOINT`. The default matters as
much as the override: a judge running the published package should not have to be told a URL, and
the override is what lets them be pointed at a replacement if this deployment dies mid-demo.

A cheap liveness check that needs no MCP handshake:

```
curl https://ask-trivium-mcp.fly.dev/health
# {"status":"ok","stub":true}
```

## What is behind it right now

**A stub.** It answers `analyze_dispute` with fixed, contract-shaped data — no analysis is run.
Every free-text field it returns says so: `rationale` and all nine `reasoning` strings carry
`[CANNED STUB — NO ANALYSIS WAS RUN]`, and `settled` is always `false`.

This is exactly what ticket 04 needs — something real to cross the wire to, without payment in the
way. It is replaced by the real engine and by x402 in later backend tickets, at the same URL. When
that happens the marker disappears and `settled` starts telling the truth about money.

Do not build anything that keys off the marker text. It is there so a human is never fooled, not as
a protocol.

## Timeouts — what is actually binding

Measured against this deployment: a request held open for **240 seconds with no bytes on the wire
at all** was not cut, and returned normally. The analysis takes ~35s typically and ~180s worst case,
so the host's proxy is not the constraint.

**The binding timeout is the MCP client's**, exactly as §3 of the wire contract says: the SDK
default is 60,000ms, well under the p95. Both legs need `resetTimeoutOnProgress: true` and a
generous `maxTotalTimeout`, and the bridge has to forward progress upstream. Nothing about the
deployment lets you skip that.

Caveat: 240s is the longest hold tested, not a proven ceiling.

## Testing progress forwarding before the engine exists

The stub answers `analyze_dispute` instantly, so it cannot exercise §3's progress path. For that
the endpoint exposes a diagnostic tool:

```
_probe_hold_open { hold_seconds: number, heartbeat_seconds: number }
```

It holds the request open for `hold_seconds`, emitting a progress notification every
`heartbeat_seconds` (`0` = silent), then returns. It runs no analysis and costs nothing.

This is the instrument for proving ticket 04's hard requirement — that progress crosses *both* legs,
agent-to-bridge and bridge-to-backend — while the real thing still returns instantly. Use it for
that and nothing else; it disappears from the endpoint before payment is switched on.
