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

**Status:** ready-for-agent

## Notes

This is the first slice where the bridge is actually a bridge. Everything before it was one half or
the other.

Rendering must not fork. Mock and remote responses satisfy the same schema, so they go through the
same renderer — if this ticket adds a second rendering path, the slice was built wrong.

Failure is hard and loud (ADR-0012): if the backend is unreachable in a non-mock mode, the call
fails. It must never silently fall back to the mock fixture. A judge who thinks they are watching a
live call must actually be watching one.

- [ ] A non-mock call reaches the deployed backend and renders through the same renderer as mock
- [ ] Backend unreachable produces a clear hard failure, never a silent fallback to mock
- [ ] The mode reported in the payload matches the mode actually used
- [ ] The backend URL is configurable without editing code
