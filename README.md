# Ask Trivium

<img width="1235" height="2054" alt="image" src="https://github.com/user-attachments/assets/842a02ba-b286-40fd-97e9-3b987399444c" />


**Predict how a neutral adjudicator would rule on a consumer dispute — from your
terminal, or from any MCP agent.**

You describe a dispute. Nine independent LLM analyses — three models, each asked to reason from
three different perspectives — score it separately. You get back one verdict *and* all nine
analyses, so you can check the reasoning instead of trusting a number.

It runs two ways: as a plain CLI, and as a local [MCP](https://modelcontextprotocol.io) server that
any agent can call as a tool. Real analyses cost **$1 USDC**, paid automatically over
[x402](https://x402.org) — no account, no API key, no signup. **Mock mode is free, offline, and
needs no wallet**, and it is where you should start.

```
VERDICT    User wins
SCORE      72/100 user win probability
AGREEMENT  moderate  ·  9 of 9 analyses returned

  The retailer classified a progressive display fault as accidental damage without
  producing an inspection report, and the timeline points to a manufacturing defect.

FLAGS      missing evidence

────────────────────────────────────────────────────────────────────────────────────
THE PANEL  ·  9 analyses
────────────────────────────────────────────────────────────────────────────────────

strict
  claude-opus-4.6       58/100   confidence medium
      The buyer cannot show the condition of the machine between delivery and the
      first fault report, and a vertical line defect is consistent with both panel
      failure and a pressure impact. The retailer is entitled to inspect before
      paying. What weakens its position is that it asserted accidental damage
      without documenting an inspection.
```

That spread is the point. A single model returning "user wins, 72" tells you nothing about how
close the call was. Nine analyses that land between 58 and 84 tell you it is arguable; nine that
land within three points of each other tell you it is not.

---

## Quickstart

**Requirements:** Node.js 22 or newer. Nothing else — no wallet, no funds, no signup, no checkout.

```bash
npx ask-trivium analyze "Refund refused on a faulty laptop" \
  "Bought on 3 March, screen failed in May, retailer blamed accidental damage."
```

That is the whole quickstart. You should see a full nine-cell panel.

To keep it around, install it with `npm install -g ask-trivium`. The examples below use the short
`ask-trivium` form that gives you; without the global install, prefix each one with `npx`.

> **What you just saw is a canned example.** Mock mode ships a real panel captured from the engine
> and replays it offline — it is not an analysis of the dispute you typed, and the banner at the top
> of the output says so every time. It exists so this repo demonstrates itself on a laptop with no
> wallet and no connectivity.

### Things worth knowing in the first five minutes

**Both arguments are required.** `analyze` takes a title *and* the dispute content. A title on its
own fails with `NO_DISPUTE_CONTENT`. Real disputes are usually too long for a shell argument, so
pipe them in instead:

```bash
cat complaint.txt | ask-trivium analyze "Refund refused on a faulty laptop"
```

**Piping changes what you get, and it looks like a bug.** This CLI has two output forms: a rendered
panel for people, and a structured envelope for machines. It picks between them by asking whether
stdout is a terminal — which is why the quickstart above renders, and why the moment you pipe or
redirect, you get the machine form instead:

```bash
ask-trivium analyze "..." "..."          # terminal → rendered panel
ask-trivium analyze "..." "..." | less   # piped    → structured envelope, no panel
ask-trivium analyze "..." "..." --panel | less   # piped → rendered panel anyway
ask-trivium analyze "..." "..." --format json    # terminal → JSON, no panel
ask-trivium analyze "..." "..." --json           # the same, in short
```

That is deliberate — an agent shelling out to this CLI should get parseable data without being told
to ask. But it surprises everyone the first time, so `--panel` and `--format json` let you name the
form you want and stop guessing. If you pass both, the format wins: it names an exact encoding,
where `--panel` only says a person is reading.

Other machine formats are available through `--format` (`toon`, `yaml`, `md`, `jsonl`), and `--json`
is a shorthand for `--format json`. Run `ask-trivium analyze --help` for the full list.

**In a checkout, don't reach for `npm run`.** `npm run dev analyze "..." --mode mock` fails inside
npm itself with `EUNKNOWNCONFIG: Unknown cli flag: --mode`, because `npm run` eats flags before your
program sees them. Insert `--` (`npm run dev -- analyze "..." --mode mock`), or skip npm entirely
with `npx tsx src/bin.ts analyze ...`.

### Running it from a checkout

If you want to read or change the code rather than just use it:

```bash
git clone https://github.com/jaybuidl/ask-trivium-hackathon.git
cd ask-trivium-hackathon
npm install
npm run build
node dist/bin.js analyze "Refund refused" "Screen failed after two months."
```

`npm link` from the repo root puts your build on `PATH` as `ask-trivium`, shadowing any published
copy.

---

## Using it from an agent

The same binary is an MCP server. Add it to any MCP-capable agent:

```jsonc
{
  "mcpServers": {
    "ask-trivium": {
      "command": "npx",
      "args": ["-y", "ask-trivium", "--mcp"],
      "env": { "ASK_TRIVIUM_MODE": "mock" }
    }
  }
}
```

For Claude Code:

```bash
claude mcp add ask-trivium --env ASK_TRIVIUM_MODE=mock -- npx -y ask-trivium --mcp
```

If you installed it globally, `"command": "ask-trivium", "args": ["--mcp"]` avoids the npx lookup on
every start. From a checkout, use `"command": "node"` with an absolute path to `dist/bin.js`.

The server exposes one tool, `analyze_dispute`, which returns both a rendered panel (for the agent
to show you) and the structured payload (for the agent to reason over). Ask your agent something
like *"use ask-trivium to analyse this complaint"* and it will find it.

`ASK_TRIVIUM_MODE` sets the default mode for that registration; a caller can still override it per
call. **Leave it on `mock` unless you mean to spend money** — an agent that reaches for `mainnet`
unprompted spends a real dollar. If you set it to anything that isn't a mode, the server refuses to
start rather than failing later, mid-dispute. `ASK_TRIVIUM_ENDPOINT` belongs in the same `env` block
if you need to point at a different backend, and is checked the same way.

---

## Modes

| Mode | Network | Cost | Needs |
|---|---|---|---|
| `mock` | none | free | nothing — runs entirely offline |
| `testnet` | Base Sepolia | free test USDC | a funded test wallet |
| `mainnet` | Base | **$1 USDC, real money** | a funded wallet |

Mode is chosen per call (`--mode`, or the `mode` argument to the tool), not per deployment, so one
installation serves all three. It defaults to `ASK_TRIVIUM_MODE`, and to `mock` when that is unset.

`mock` is served from the panel embedded in this package and never opens a socket. `testnet` and
`mainnet` cross to the Trivium backend, which is where the analyses actually run.

**Mock is never a fallback.** If a paying mode cannot reach the backend, the call fails loudly and
tells you to use `mock` — it does not quietly hand you fixture data. Being served a canned panel
while believing you bought an analysis is the one failure this design refuses to risk, so the
fallback that would cause it does not exist anywhere in the code.

### Pointing at a different backend

`testnet` and `mainnet` reach `https://ask-trivium-mcp.fly.dev/mcp` by default, so there is nothing
to configure. `ASK_TRIVIUM_ENDPOINT` overrides it:

```bash
ASK_TRIVIUM_ENDPOINT=http://localhost:8787/mcp ask-trivium analyze "..." "..." --mode testnet
```

It is checked when the MCP server starts rather than when a dispute arrives, so a typo is reported
before you have typed anything. Mock ignores it entirely.

### Funding a paying mode

`testnet` and `mainnet` need a wallet. It is read from `ASK_TRIVIUM_PRIVATE_KEY`, and only from
there — never a flag, because a flag lands in your shell history. The key is read once, on demand,
kept in memory as an account, and written nowhere.

```bash
export ASK_TRIVIUM_PRIVATE_KEY=0x...   # the 0x is optional
ask-trivium analyze "Refund refused on a faulty laptop" \
  "Screen failed after two months; the seller blames liquid damage." --mode testnet
```

**The wallet needs USDC and nothing else — no ETH, on either network.** Payment is an EIP-3009
authorization: this CLI *signs* it, and the facilitator broadcasts the transfer. Gas is never yours
to pay, so a wallet holding nothing but USDC is fully able to pay.

| Mode | Where the funds come from | Cost per call |
|---|---|---|
| `testnet` | Base Sepolia test USDC, free from [Circle's faucet](https://faucet.circle.com) | nothing real |
| `mainnet` | USDC on Base, bought or bridged like any other | **$1, real money** |

**Start on `testnet`.** It exercises the entire path — the same signing code, the same facilitator,
the same backend, the same nine analyses — for nothing. That way the first time you spend a real
dollar is not also the first time your wallet has been used.

With no key set, a paying mode refuses **at startup**, not after nine analyses have already run.
`mock` never looks for a key at all.

---

## What you are actually buying

Nine analyses, and **all nine must succeed or the call is free**. Nine independent analyses is what
is advertised; delivering six and charging for it would be selling something that wasn't delivered.
When a panel comes back incomplete, the output says so and says you weren't charged.

Payment and delivery are also decoupled in your favour. Settlement happens after the work, and it
can fail on its own — an expired authorization, an unreachable facilitator. When that happens **you
get the complete panel anyway**, marked `NOT CHARGED`, and it is never billed to you later. The
last line of every run tells you plainly whether money moved:

```
NOT CHARGED — mock runs are free by design and never reach the backend.
```

There is no refund path, and that is deliberate rather than an omission: x402 has no refund
primitive, so the only honest lever is not to charge in the first place.

---

## How it works

```
  your agent  ──MCP/stdio──▶  ask-trivium (this repo)  ──MCP/HTTP + x402──▶  Trivium backend
                              renders · pays · never                        nine analyses,
                              computes a verdict                            one verdict
```

No MCP client in circulation speaks x402 — none of them will answer a `PaymentRequired` and retry.
So this CLI stands in the middle: it is a local MCP server to your agent, and a payment-aware MCP
client of the backend. It holds the wallet so your agent doesn't have to.

Payment rides *inside* the JSON-RPC layer rather than as an HTTP paywall, because one Streamable
HTTP session carries the handshake and the tool call over the same endpoint — charging at the HTTP
layer would charge for the handshake too. Verification happens before the work and settlement after,
both within one request, so **paying never gates the stream**: progress notifications arrive while
the nine analyses run.

This repo renders and pays. It never averages the nine cells, never derives the verdict, and never
sees the prompts behind the three perspectives — that is the closed engine's job, and
`docs/wire-contract.md` §6 is the checkable list of what must never appear here.

---

## Status

This is a hackathon build, and honesty about what runs matters more than a tidy feature list:

- ✅ **Mock mode works end to end**, as a CLI and as an MCP server, offline.
- ✅ **The MCP surface is real** — one tool, published input and output schemas, rendered and
  structured output on every call.
- ✅ **Published to npm**, so the quickstart needs no checkout and no build.
- ✅ **The outbound leg is live.** `--mode testnet` and `--mode mainnet` reach the deployed backend
  over MCP, render through the same renderer as mock, and report progress while the call runs. An
  unreachable backend fails loudly and names `mock`; it never falls back to fixture data.
- ✅ **The nine analyses are real.** The backend runs the engine, not a stub — nine independent
  analyses across three model families, each streaming progress as it lands. A full panel takes
  roughly 70–110 seconds, which is why the progress contract exists rather than being a nicety.
- ✅ **Payment works, with real money.** A `mainnet` call has settled **$1 USDC on Base**:
  transaction
  [`0x68651e31…13d88c5`](https://basescan.org/tx/0x68651e3122b89fcb839e8c611e9c04143d68744f85477fdd63705df0213d88c5),
  block 49126264, nine cells in 67 seconds. See [funding a paying mode](#funding-a-paying-mode) to
  run one yourself.
- 🚧 **The settlement-failure path is built but not yet exercised end to end.** The code delivers
  the panel and marks it `NOT CHARGED` when settlement fails, and that is the behaviour described
  above — but forcing a real settlement failure needs a fault-injection switch that has not been
  run against the deployment. It is the one path here that has never executed. Said plainly because
  a reader deciding whether to trust the not-charged guarantee deserves to know which parts of it
  have actually happened.

---

## Repository

| Path | What it is |
|---|---|
| `src/cli.ts` | the human CLI |
| `src/mcp.ts` | the stdio MCP server an agent connects to |
| `src/backend.ts` | the MCP client that calls the Trivium backend |
| `src/analyze.ts` | mode dispatch — mock is served here, paying modes forward to the backend |
| `src/render.ts` | terminal rendering of a panel |
| `src/contract.ts` | the wire schemas, shared by both surfaces |
| `src/fixture.ts` | the captured panel that mock mode replays |
| `src/errors.ts` | how a failed call explains itself |
| `docs/wire-contract.md` | the schemas, progress contract, and error behaviour, in full |
| `docs/backend-endpoint.md` | what is deployed behind the paying modes, and what it measures |
| `CONTEXT.md` | the vocabulary — dispute, cell, panel, verdict, giveaway |

### Development

```bash
npm install
npm run typecheck
npm test          # unit tests, plus the CLI and the MCP server driven as real subprocesses
npm run build

ASK_TRIVIUM_LIVE=1 npm test   # additionally hit the deployed backend
```

The test suite drives the built binary the way an agent and a cold reader actually drive it —
spawned as a subprocess with piped stdio — because the failures that matter here (a stray byte on
stdout corrupting the JSON-RPC stream, a truncated panel through a pipe) only appear at a process
boundary.

`npm test` needs no network. The backend leg is tested against a stand-in MCP server started on the
loopback, so both legs are exercised over real transports without depending on a deployment being
up. `ASK_TRIVIUM_LIVE=1` adds the tests that call the real one — worth running before a demo and
after any change to `docs/wire-contract.md`, since that is what catches the two copies of the
contract drifting apart.

## License

MIT — see [LICENSE](LICENSE).
