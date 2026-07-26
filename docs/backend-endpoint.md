# The backend endpoint

```
https://ask-trivium-mcp.fly.dev/mcp
```

This is the deployed backend the bridge talks to in `testnet` and `mainnet`. `mock` never reaches
it (ADR-0012) and must not start doing so.

It is the **default**, overridable by `ASK_TRIVIUM_ENDPOINT`. The default matters as much as the
override: a judge running the published package should not have to be told a URL, and the override
is what lets them be pointed at a replacement if this deployment dies mid-demo.

A cheap liveness check that needs no MCP handshake:

```
curl https://ask-trivium-mcp.fly.dev/health
# {"status":"ok"}
```

## What is behind it right now

**The real engine.** `analyze_dispute` runs nine independent analyses across three model families
and returns a genuine panel. No field is canned, and `settled` tells the truth about whether money
moved. A full panel takes roughly **70–110 seconds**, streaming a progress notification as each
cell lands.

x402 payment is switched on. A `testnet` call settles free Base Sepolia USDC; a `mainnet` call
settles **$1 USDC on Base**, and one has —
[`0x68651e31…13d88c5`](https://basescan.org/tx/0x68651e3122b89fcb839e8c611e9c04143d68744f85477fdd63705df0213d88c5),
block 49126264, nine cells in 67 seconds.

Two rules the backend enforces rather than merely intends:

- **Nine or free.** A panel that comes back short of nine cells is never settled. This is checked
  at the last gate before the facilitator, so no caller can route around it.
- **`mock` is served canned and never analysed** (ADR-0012). Free has to mean free to serve, so a
  `mock` request reaching the backend costs nothing to answer.

An earlier revision of this endpoint was a stub that stamped every free-text field
`[CANNED STUB — NO ANALYSIS WAS RUN]`. That marker is gone. Nothing should key off it — it existed
so a human was never fooled, not as a protocol.

## Timeouts — what is actually binding

Measured against this deployment: a request held open for **240 seconds with no bytes on the wire
at all** was not cut, and returned normally. A real panel takes 67–111 seconds measured, so the
host's proxy is not the constraint.

**The binding timeout is the MCP client's**, exactly as §3 of the wire contract says: the SDK
default is 60,000ms, well under the p95. Both legs need `resetTimeoutOnProgress: true` and a
generous `maxTotalTimeout`, and the bridge has to forward progress upstream. Nothing about the
deployment lets you skip that.

Caveat: 240s is the longest hold tested, not a proven ceiling.

## The progress probe is gone

While the backend was a stub it answered instantly and so could not exercise §3's progress path.
A diagnostic tool, `_probe_hold_open`, existed to hold a request open and emit heartbeats, purely
to prove progress crossed both legs — agent-to-bridge and bridge-to-backend.

**It was removed before payment was switched on**, as planned. The endpoint no longer lists it, and
the deployment's verification script fails if it ever reappears in the tool list. A real analysis
now takes 70–110 seconds and emits progress the whole way, so the instrument has nothing left to
prove.
