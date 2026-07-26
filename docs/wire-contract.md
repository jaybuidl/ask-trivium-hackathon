# The wire contract

**Status: partially frozen.** §1–§6 are decided and safe to build against. §7 lists the questions
still open — two, both assigned to ticket 06; each names the ticket that has to decide it, because
you cannot write that ticket's code without an answer.

This is the CLI's copy. The backend holds its own hand-written copy of the same contract —
deliberately no shared package, because a private dependency would break the open-source build and
a public one would drag contract changes into a release cycle nobody has time for (ADR-0006). About
a hundred lines of duplicated schema is the accepted price of the closed/open split. **If this file
changes, the other copy changes by hand, and neither side may change it unilaterally.**

Everything you need is in this file. It does not point into the closed repo for anything.

---

<!-- contract-rev: 5 -->

## Mirror state

The marker above is the whole mechanism: touch anything in §1–§6 and bump it. A hand-mirrored
comparison table used to live here instead and drifted within hours of being written — a check that
drifts is worse than none, because it reads as assurance. It has been replaced by this marker plus
executable checks that live in the backend's repo (closed; this repo cannot read it, only be read).

**Only the number has to match.** Nothing else in this section needs to be identical to the
backend's copy — said explicitly, so nobody reintroduces hand-mirrored prose to "help" it along.

Rev 2, in two sentences: ticket 02 removed `detail` and made `mode` optional at this repo's tool
boundary but required by the time it reaches the backend; the second half of that change was
recorded only in a commit message, and the backend served the superseded contract for hours until a
human happened to read that message.

Rev 4, in one sentence: ticket 05 closed §3's two open questions — progress names the cell that
landed and carries its score, both inside `message` — and, in the change this repo actually had to
code against, **`progress` is no longer an integer**, because the backend's cadence has to keep it
rising between cells while `total` stays at nine.

This repo's only obligation under this scheme is bumping the number above whenever §1–§6 change.
The backend repo carries the rest — it can reach into this one through a symlink; this one must
never reach into it.

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
  // twice. DECIDED (ticket 06): the CALLER generates it, once, before its first attempt,
  // and resends it unchanged. It cannot be derived from the payment nonce — a retry signs
  // a fresh authorization, so a derived key would never match. See §7 item 2, including
  // the note that server-side caching does not ship yet.
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

**`progress` is not an integer, and this is the part to code against.** `total` is nine, and MCP
requires `progress` to rise with *every* notification — so a cadence emission between cells cannot
repeat the cell count, and cannot count itself without making `total` a lie. The backend moves it a
fraction of the way towards the next cell instead: always increasing, never overtaking a cell that
has not landed. Take `Math.floor(progress)` for the count a human should read. This repo does
exactly that (`cellCount` in `src/cli.ts`), after `2.3333333333333335/9` turned up in a terminal.

**`message` names the cell that landed, and carries its score** — decided in ticket 05, closing
§7 item 3. It reads like `"3 of 9 analyses complete — claude-opus-5 / Strict scored 71"`, or
`"… / Strict did not return"` for a cell that failed. Naming the voice leaks nothing the panel does
not already carry (ADR-0009), and the terminal filling in live is the most watchable part of the
demo. The payload gains **no field** for the score: it stays exactly `{ progress, total, message }`,
which is what made this a decision about wording rather than a change to a frozen shape.

The exposure that question was about — a client disconnecting at 7 of 9 and keeping seven scores it
would otherwise have paid in full for — is accepted rather than prevented. By the time any cell
lands the caller has committed to pay, so leaving early buys a worse answer, not a cheaper one.
Note the string is not a boundary: a determined client can parse the scores out of it, and nothing
here pretends otherwise.

**Progress is a hard requirement on BOTH legs, not one.** The MCP SDK's default client request
timeout is 60,000ms — under the p95. Two MCP clients are in play: the bridge's client talking to the
remote server, and the upstream agent's client talking to the bridge over stdio. Both need
`resetTimeoutOnProgress: true` and a generous `maxTotalTimeout`, **and the bridge must actively
forward progress upstream**. Configure only its own leg and the agent still times out at 60s while
the bridge sits there waiting contentedly.

Cadence: the server emits every 5–10s regardless of whether a cell landed, so no gap looks idle to
an intermediary. Nine cells over 90s is not frequent enough on its own. The hosting proxy turned
out not to be the constraint — a silent 240s hold survived it — but the cadence stays, because the
MCP client's own 60s default is under the p95 and that is the timeout progress has to keep
resetting.

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

**(c) zod 3 vs zod 4 — and this one binds the two sides differently.** `@x402/core` and `@x402/mcp`
pin `zod: ^3.24.2`. zod 3 and zod 4 schema objects are not interchangeable, so **never hand a zod-4
schema to anything under `@x402/*`**.

Probed against the published packages (ticket 02), three things this is *not*:

- **Not a resolution conflict.** `zod` is a regular dependency of `@x402/*`, not a peer. npm nests
  it — zod 3.25.76 under each x402 package, the host's zod 4 at the root, side by side and quiet.
  No `overrides`, no `resolutions`. Do not "fix" it.
- **Not classic zod 3.** `zod@3.25.76` is the transitional release shipping *both* the v3 and v4
  APIs (a `zod/v4` subpath), so do not expect zod-3 internals.
- **Not, on the bridge side, a boundary that is ever crossed.** zod appears nowhere in
  `@x402/mcp`'s public signatures — one doc-comment, nothing else.
  `wrapMCPClientWithPayment(mcpClient, paymentClient, options)` and `createx402MCPClient(config)`
  take an MCP SDK `Client` and an `x402Client`. The bridge passes plain JSON objects; x402's zod
  parses its own payment payloads, never the caller's schemas.

**Which side this binds.** The API that takes zod schemas is `createPaymentWrapper(resourceServer,
config)` — the *server-side* helper, documented as `mcpServer.tool("search", "...", { query:
z.string() }, ...)`. That is the resource server, which is the **backend's** job; §5 above says the
bridge uses the client-side wrapper. So this trap is live for the backend's copy of this contract
and inert for the CLI's. **In the CLI repo, reaching for `createPaymentWrapper` is a boundary alarm
— it means backend code is being written in the wrong repo — not a dependency puzzle to solve.**

The residual hazard is shared, and it is about the MCP SDK rather than zod: if a future `@x402`
release moves its `@modelcontextprotocol/sdk` pin outside the host's range, the SDK forks into two
copies and `Client` becomes two nominally distinct types, which surfaces as baffling structural
type errors. Today they dedupe (x402 wants `^1.12.1`). Assert a single SDK copy resolves rather
than discovering this at 3am.

**Measured in ticket 06.** This repo resolves exactly one copy, which is the half that matters —
the client wrapper is the only x402 signature that names an SDK `Client`. The backend's tree does
nest a second copy under `@x402/mcp`, and it is harmless there for a reason worth writing down:
`createPaymentWrapper` returns `MCPToolCallback<TArgs> = (args, extra: unknown) => …`, so no SDK
type crosses the boundary on the server side at all.

**(e) `x402MCPClient.callTool` cannot be used by this bridge.** Its options are
`{timeout, signal, resetTimeoutOnProgress}` — no `onprogress`, no `maxTotalTimeout`. The MCP SDK
looks up a progress handler *before* honouring `resetTimeoutOnProgress` and returns early if there
is none, so the flag goes inert and a ~111s analysis times out at the base timeout. The convenience
wrapper would silently undo §3's cadence on precisely the calls the cadence exists for. Use
`@x402/mcp`'s exported primitives — `MCP_PAYMENT_META_KEY`, the `PaymentRequired` in the `isError`
result — and keep this repo's own call options. Discovered in ticket 06 by reading the signature,
not by a timeout at 3am.

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

Two questions remain — items 2 and 4, both assigned to ticket 06. Each is assigned to the ticket
that cannot be written without it: decide it there, record the decision in this file, and mirror it
to the backend's copy.

1. ~~**Does `detail` survive?**~~ **DECIDED (ticket 02): it does not.** One response shape,
   `PanelResponse`. Rationale in §2; `detail` is removed from §1 and `detail: "full"`'s per-cell
   flags and notes are dropped. The backend's copy needs the same change.
2. ~~**`idempotency_key`: client-supplied or derived from the payment nonce?**~~ **DECIDED (ticket
   06): client-supplied — and the answer is forced, not chosen.** Derived-from-the-nonce cannot
   work for the one scenario the key exists to cover. The EIP-3009 nonce prevents replay of *the
   same* authorization, but a client retrying after a dropped connection signs a **fresh** one with
   a fresh nonce — so a nonce-derived key would differ between the attempt and its retry and
   deduplicate nothing. The bridge generates it once, before the first attempt, and reuses it
   verbatim on the retry. See §1.

   §4's "a giveaway is final" rule keeps its teeth only once idempotency *caching* ships. Ticket 06
   sends and accepts the key but does **not** deduplicate on it yet, so today a retry is still a
   new paid run. Known gap, recorded rather than decided.
3. ~~**Does progress carry incremental scores?**~~ **DECIDED (ticket 05): yes, inside `message`,
   with no new field.** The landed cell's score rides in the sentence that names it. The 7-of-9
   partial-evidence exposure is accepted, not prevented — the caller has already committed to pay
   by the time any cell lands. Rationale and wording in §3.
4. **What does the bridge do with a panel whose `mode` disagrees with the mode the call ran in?**
   Nothing in §1–§6 obliges the backend to echo `mode` faithfully. It does today, and ticket 04
   started relying on it: the bridge rejects a mismatch outright rather than relabelling the panel,
   because §2 puts the tier in the payload so a caller can relay "this was real" without reading
   terminal chrome, and a payload contradicting the call makes that field worthless.

   That rejection is **provisional and safe only while nothing charges.** ADR-0014 forbids its
   shape once money moves — "marking a complete, correct panel as an error invites the agent to
   discard or retry it, re-creating the double-charge path from the client side" — and ADR-0007 has
   already ruled out a refund path, so a discarded paid panel is unrecoverable.

   Two things to settle together, not separately: whether the backend owes a faithful echo at all,
   and what the bridge does when it does not get one. Note that the obvious client-side fix — read
   `settled` and deliver anything that was paid for — is circular, since it trusts one field of a
   payload the same branch has just decided is untrustworthy. From ticket 06 the bridge holds the
   wallet and knows whether *it* paid without asking, which is the information this needs and the
   reason it waits. — **ticket 06**, alongside item 2.

   **DECIDED (ticket 06). Both halves:**

   - **The backend owes a faithful echo.** It takes `mode` straight from the request and must keep
     doing so. Nothing between the request and the payload may relabel a panel.
   - **The bridge splits on whether it paid**, which it knows first-hand from having signed the
     authorization — no field of the payload is consulted, so the circularity is gone. **Paid:**
     deliver the panel and warn that the tiers disagreed. **Not paid:** reject, exactly as ticket 04
     wrote it.

   The split is what lets both rules hold at once. ADR-0014's prohibition only ever applied once
   money had moved, and that is precisely the branch that now delivers; the free branch, where
   nothing is at stake and a silently relabelled panel would be the worse outcome, keeps refusing.
