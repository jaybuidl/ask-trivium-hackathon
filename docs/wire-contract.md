# The wire contract

**Status: partially frozen.** §1–§6 are decided and safe to build against. §7 lists the questions
still open; each names the ticket that has to decide it, because you cannot write that ticket's code
without an answer. **Item 1 (`detail`) was decided in ticket 02 and is recorded below** — the
backend's copy needs the same change.

This is the CLI's copy. The backend holds its own hand-written copy of the same contract —
deliberately no shared package, because a private dependency would break the open-source build and
a public one would drag contract changes into a release cycle nobody has time for (ADR-0006). About
a hundred lines of duplicated schema is the accepted price of the closed/open split. **If this file
changes, the other copy changes by hand, and neither side may change it unilaterally.**

Everything you need is in this file. It does not point into the closed repo for anything.

---

## 1. Tool input

One tool: `analyze_dispute`.

```ts
const AnalyzeDisputeInput = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50_000),

  // Which tier this call runs against. Per-call, not per-deployment (ADR-0011).
  // Default comes from ASK_TRIVIUM_MODE at MCP registration, else "mock".
  // "mock" is served entirely by the bridge and never reaches the server (ADR-0012).
  // Give each value a real description — tools/list is the only documentation an agent reads.
  // OPTIONAL at the bridge's tool boundary, required by the time it reaches the backend: the
  // bridge resolves explicit value -> ASK_TRIVIUM_MODE -> "mock" before forwarding.
  mode: z.enum(["mock", "testnet", "mainnet"]),

  // Paid API: lets a client safely retry after a dropped connection without paying
  // twice. The server returns the cached result for a repeated key. See §7 item 2.
  idempotency_key: z.string().uuid().optional(),
});
```

The 50k character ceiling stays — it is the input side of the cost model and it has been checked.
Do not raise it to be helpful.

## 2. Tool output

MCP tools return both a `content` array (human-readable) and `structuredContent` (machine-readable,
validated against `outputSchema`). Use both: agents consume the structured form, humans read the
text rendering. The bridge renders the text form itself when driven by a human.

### One response shape

**`detail` is gone** — decided in ticket 02, which could not render without an answer to §7 item 1.
There are no longer three response shapes; every successful call returns `PanelResponse` below.

The reasoning, so neither side reopens it casually:

- `detail` never changed what the backend computes. All nine cells run regardless (§4: nine or the
  call is free) and the price is a flat $1, so it was never a cost lever — only a response-size one.
- MCP exposes exactly **one `outputSchema` per tool**. Three shapes means either an unvalidatable
  union or making every field below `Verdict` optional, and then an agent can never rely on `panel`
  being present. A schema that cannot promise its own fields is not worth publishing.
- The only real argument for it was agent token cost. Nine `reasoning` strings run ~2k tokens —
  a fraction of a cent against a $1 call. The token argument is quantitatively dead at this price.
- Response trimming is a client concern and stays available client-side; it does not need to cross
  the wire.

`detail: "full"`'s per-cell flag booleans and free-text notes are dropped with it. Nothing rendered
them, and they can come back as a separate field if something ever needs them.

```ts
const Verdict = z.object({
  decision: z.enum(["user_wins", "company_wins", "escalate"]),
  score: z.number().min(0).max(100),        // user win probability
  agreement: z.enum(["strong", "moderate", "weak"]),
  rationale: z.string(),                    // one human sentence
  flags: z.object({
    fraud: z.boolean(),
    missingEvidence: z.boolean(),
    policyGap: z.boolean(),
    technicalComplexity: z.boolean(),
  }),
  analysesCompleted: z.number().int(),      // e.g. 9, or 6 on partial failure
  analysesRequested: z.number().int(),

  // Which tier produced this (ADR-0011). Honesty about mock vs real lives in the payload,
  // not in terminal chrome — agents relay structured data and ignore banners.
  mode: z.enum(["mock", "testnet", "mainnet"]),

  // Was the caller actually charged? (ADR-0014). Same principle as `mode`: an agent must be
  // able to relay "you weren't billed" without parsing _meta, which many clients never
  // surface. false in mock. The *reason* it was free is derivable, but branch on mode first:
  // mode === "mock" means free by design; otherwise analysesCompleted < analysesRequested
  // means an incomplete panel, and failing that, settlement failed. See §4.
  settled: z.boolean(),
  settlementTx: z.string().optional(),      // present iff settled
});
```

`agreement` arrives already collapsed to a word. Raw dispersion statistics are deliberately not on
the wire — not because they are secret, but because they are noise for the caller. **Do not compute
them, and do not compute anything else the backend already decided.** The bridge renders; it never
derives a verdict.

The nine cells always accompany it. They are the evidence that justifies the price, and the thing
worth rendering well.

```ts
const PanelEntry = z.object({
  model: z.string(),                        // e.g. "claude-opus-4.6" — real, it's marketing
  persona: z.enum(["strict", "consumer-aware", "precedent-focused"]),  // real names (ADR-0009)
  score: z.number().min(0).max(100),
  confidence: z.enum(["high", "medium", "low"]),
  reasoning: z.string(),                    // the model's own prose
});

const PanelResponse = Verdict.extend({
  panel: z.array(PanelEntry),
});
```

Persona ids carry their real names on the wire, decided (ADR-0009). Attributing each score to a
named perspective is what makes a panel readable rather than a column of nine numbers, and it is the
part a caller can act on. Render the name with the score; do not collapse the nine cells into
anonymous rows. The prompt text behind those names is a separate matter and never crosses — see
`AGENTS.md`.

All nine `reasoning` strings ship unsanitised (ADR-0010). The bridge must render them verbatim: no
truncation of the string it stores, no rewriting, no "cleaning up". Visual truncation for a narrow
terminal is fine as long as the full string survives in `structuredContent`.

## 3. Progress notifications

Blocking call, p50 ~35s, worst case ~180s. Progress is what stops client timeouts from firing.
Payload:

```ts
{ progress: number, total: 9, message: string }
```

`message` may name the model and persona of the cell that just landed — that leaks nothing the panel
already carries, and the terminal naming each voice as it arrives is the most watchable part of the
demo. Whether progress also carries incremental *scores* is still open; see §7 item 3.

**Progress is a hard requirement on BOTH legs, not one.** The MCP SDK's default client request
timeout is 60,000ms — under the p95. Two MCP clients are in play: the bridge's client talking to the
remote server, and the upstream agent's client talking to the bridge over stdio. Both need
`resetTimeoutOnProgress: true` and a generous `maxTotalTimeout`, **and the bridge must actively
forward progress upstream**. Configure only its own leg and the agent still times out at 60s while
the bridge sits there waiting contentedly.

Cadence: the server emits every 5–10s regardless of whether a cell landed, so no gap looks idle to
an intermediary. Nine cells over 90s is not frequent enough on its own. A hosting proxy's idle
timeout is the thing most likely to cut a long call — test it empirically before the demo rather
than trusting a documented number.

## 4. Errors, and when a call is free

Nine flaky LLM calls means partial failure is routine, not rare.

**All nine analyses must succeed, or the call is free** (ADR-0007). Nine independent analyses is
what is advertised; delivering six is selling something that wasn't delivered.

| Case | Wire behaviour | Charged? |
|---|---|---|
| All nine cells succeed | Success | **Yes** |
| All nine succeed, **settlement fails** | **Panel delivered anyway**, `settled: false` (ADR-0014) | No — giveaway |
| A partial panel, still enough to aggregate | Success, `analysesCompleted < 9` visible | No — free |
| Too few cells to aggregate | Hard error | No |
| Input invalid or too large | Error before payment is requested | n/a |
| Payment invalid or insufficient | `PaymentRequired`, standard x402 | n/a |

**There is no refund path**, and one must never be built here: x402 has no refund primitive, and
doing it by hand needs a return transfer, gas, and a funded hot wallet. Not settling is the only
lever, and it is the server's lever.

**The "why was it free" rule above applies only when `mode` is a paying tier.** A `mock` run is also
`settled: false` with all nine cells present, so reading the rule unconditionally tells a mock user
their *payment failed*, which is both false and alarming. `mock` is free by design and is not a
giveaway (`CONTEXT.md`). Branch on `mode` first, then on `analysesCompleted`. The bridge's renderer
does exactly this.

Two things the caller must always be able to tell apart: **"you paid and got a degraded answer"** —
which under this rule never happens — and **"you weren't charged, here's why."** `analysesCompleted`
and `analysesRequested` make degradation visible rather than silent; `settled` says whether money
moved.

**Do not use `_meta` presence as the test for whether you were charged.** A delivered-but-unsettled
run has `_meta["x402/payment-response"]` **present** with `success: false`, so a client testing
presence believes it paid every time settlement fails. The transport-level test is `_meta` absent
**or** `success !== true` — but prefer `settled` in the payload, which says the same thing without
reaching into the transport layer.

**A giveaway is final** (ADR-0014). An unsettled delivery is never billed retroactively, so the
bridge must never re-present a completed call for payment. Replaying an `idempotency_key` whose
original run was unsettled returns the cached panel as an error result, which skips settlement — if
the bridge "helpfully" retries it as a fresh call instead, that is a fresh authorization the chain
cannot deduplicate, and the customer can pay twice for one panel with no way to get it back.

## 5. Paying for the call

Payment rides **inside the JSON-RPC layer, not the HTTP layer**. Use `@x402/mcp`'s payment
client-side wrapper around the tool call, not an HTTP paywall: one Streamable HTTP session
multiplexes `initialize`, `tools/list`, and `tools/call` over the same endpoint, so anything
blanket-charging at the HTTP layer charges for handshake traffic too.

The round trip: an unpaid call returns a normal tool result with `isError: true` carrying
`PaymentRequired`; the client resends with the signed payload in `_meta["x402/payment"]`; the server
returns `_meta["x402/payment-response"]`. Verification happens before the work and settlement after,
both inside the same request/response cycle, so **payment does not gate the stream** — progress
notifications flow during the work, before settlement. There is no perceived-latency penalty to pay
for.

Facts worth having in one place:

- Base mainnet USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (`eip155:8453`)
- Base Sepolia USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (`eip155:84532`)
- $1 = `"1000000"` atomic units (6 decimals)
- x402's `accepts` is an array and the **client** picks which entry to sign, which is why one
  deployment serves both networks and `mode` never has to cross the wire.

### Four traps, each of which costs real money

**(a) `maxTimeoutSeconds` defaults to 60; the worst case here is 180.** Every spec example uses 60.
Copy it and the EIP-3009 authorization expires mid-flight: nine frontier-model calls run, succeed,
and settlement then fails. Set it well above 180, and verify it rather than assuming it.

**(b) Build against x402 v2 (`@x402/*`), never the unscoped v1.** The v1 packages (`x402`,
`x402-express`, `x402-fetch`) are pinned, patch-only, and use an incompatible wire format —
`X-PAYMENT` header, `maxAmountRequired`, short network names, against v2's `PAYMENT-SIGNATURE`,
`amount`, and CAIP-2 `eip155:8453`. Confirm the facilitator speaks v2 via its `GET /supported`
before wiring anything.

**(c) zod 3 vs zod 4.** `@x402/core` and `@x402/mcp` pin `zod: ^3.24.2`. If this repo is on zod 4,
both will install nested and it will probably work — but zod 3 and zod 4 schema objects are not
interchangeable, so **never hand a zod-4 schema to anything under `@x402/*`**. Budget an hour if
this goes wrong at 3am.

**(d) The recovering payment hook double-charges.** See §6 — it is a rule, not a caution.

### Settlement can fail after the work succeeded

Four cases, all of which end the same way from this side: **the panel is delivered with
`settled: false`.** The authorization expired; the payer's wallet drained between verify and settle;
the facilitator was unreachable; a compliance check declined. The server handles the retry and the
soft-fail. What the bridge must do is simply believe the payload.

**Bridge behaviour on `settled: false`: render the panel in full, plus an unmissable not-charged
line, and report success — exit 0.** Flagging a complete, correct panel as an error invites the
agent to discard it or, worse, retry it.

## 6. What this repo must NOT contain

The checkable list. Review a diff against it before every push.

- No prompt text, no persona system prompts, no fragments of the engine's prompt files. Persona
  *ids* (`strict` / `consumer-aware` / `precedent-focused`) are fine — they are part of the wire
  schema (ADR-0009). The line is **names yes, instructions never**.
- No threshold constants.
- No aggregation or decision logic — the bridge renders, it never computes a verdict.
- No provider API keys, no provider SDK dependencies.
- No funded private key, ever, including in examples and test fixtures.
- **No recovering `onPaymentResponse` hook.** `@x402/mcp`'s paying client signs a **fresh**
  authorization and re-runs the whole tool call when such a hook returns `{recovered: true}` and a
  `PaymentRequired` is present — a second $1, a second set of nine model calls, and exactly the
  double-charge §4 exists to prevent. It is opt-in, so the rule is simply: don't register one. If
  one is ever needed for a genuinely corrective `PaymentRequired`, it must never recover on a
  settlement failure.
- **No fault-injection flag.** Forcing a settlement failure is a backend-only capability.
- No unit economics — cost per call, margin, or how often calls are given away free.

Never fall back to mock. If the backend is unreachable in `testnet` or `mainnet`, the call **fails
hard** with an actionable error naming `mode: "mock"` as the working path. A paying caller receiving
fixture data and believing it to be analysis is the one unrecoverable trust failure in this product
— worse than any outage, and worse for being invisible (ADR-0012).

The legitimate contents of this repo: MCP stdio server, MCP HTTP client, x402 payment handling,
wallet management, output rendering, this contract's schemas, and the embedded mock fixture.

## 7. Still open

Two questions remain. Each is assigned to the ticket that cannot be written without it — decide it
there, record the decision in this file, and mirror it to the backend's copy.

1. ~~**Does `detail` survive?**~~ **DECIDED (ticket 02): it does not.** One response shape,
   `PanelResponse`. Rationale in §2; `detail` is removed from §1 and `detail: "full"`'s per-cell
   flags and notes are dropped. The backend's copy needs the same change.
2. **`idempotency_key`: client-supplied or derived from the payment nonce?** It stays either way:
   the EIP-3009 nonce prevents replay of *the same* authorization, but a client retrying after a
   dropped connection signs a fresh one and pays twice, and only an application-level key closes
   that. The source of the value is unspecified. — ticket 06. Note that §4's "a giveaway is final"
   rule only has teeth if idempotency caching actually ships; cut the key and a retry is just a new
   paid run.
3. **Does progress carry incremental scores?** Better demo — the terminal fills in live — but it
   streams the evidence incrementally, so a client can disconnect at 7/9 holding partial data it
   would otherwise have paid in full for. Probably fine; decide it rather than discover it. —
   ticket 05 on the server side, but the bridge renders it, so agree it before building the
   renderer.
