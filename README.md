# Ask Trivium

**Predict how [Kleros](https://kleros.io) jurors would rule on a consumer dispute — from your
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

**Requirements:** Node.js 22 or newer. Nothing else — no wallet, no funds, no network.

```bash
git clone https://github.com/jaybuidl/ask-trivium-hackathon.git
cd ask-trivium-hackathon
npm install
npm run build
```

Then run it:

```bash
node dist/bin.js analyze "Refund refused on a faulty laptop" \
  "Bought on 3 March, screen failed in May, retailer blamed accidental damage." --panel
```

You should see a full nine-cell panel. That is the whole quickstart.

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

**`--panel` is why the output above is readable.** This CLI has two output forms: a rendered panel
for people, and a structured envelope for machines. It picks between them by asking whether stdout
is a terminal — so the moment you pipe or redirect, you get the machine form:

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

**Don't use `npm run` for this.** `npm run dev analyze "..." --mode mock` fails inside npm itself
with `EUNKNOWNCONFIG: Unknown cli flag: --mode`, because `npm run` eats flags before your program
sees them. If you want the TypeScript sources without a build step, `npx tsx src/bin.ts analyze ...`
works, or insert `--`: `npm run dev -- analyze "..." --mode mock`.

### Installing it as a command

To get `ask-trivium` on your `PATH`, from the repo root after `npm run build`:

```bash
npm link                 # or: npm install -g .
ask-trivium analyze "Refund refused" "Screen failed after two months."
```

Every example below uses the short `ask-trivium` form. Without this step, substitute
`node dist/bin.js`.

A no-checkout install (`npx ask-trivium ...`) is not available yet — see [Status](#status).

---

## Using it from an agent

The same binary is an MCP server. Add it to any MCP-capable agent:

```jsonc
{
  "mcpServers": {
    "ask-trivium": {
      "command": "node",
      "args": ["/absolute/path/to/ask-trivium-hackathon/dist/bin.js", "--mcp"],
      "env": { "ASK_TRIVIUM_MODE": "mock" }
    }
  }
}
```

With `npm link` done, `"command": "ask-trivium", "args": ["--mcp"]` works too. For Claude Code:

```bash
claude mcp add ask-trivium --env ASK_TRIVIUM_MODE=mock -- ask-trivium --mcp
```

The server exposes one tool, `analyze_dispute`, which returns both a rendered panel (for the agent
to show you) and the structured payload (for the agent to reason over). Ask your agent something
like *"use ask-trivium to analyse this complaint"* and it will find it.

`ASK_TRIVIUM_MODE` sets the default mode for that registration; a caller can still override it per
call. **Leave it on `mock` unless you mean to spend money** — an agent that reaches for `mainnet`
unprompted spends a real dollar. If you set it to anything that isn't a mode, the server refuses to
start rather than failing later, mid-dispute.

---

## Modes

| Mode | Network | Cost | Needs |
|---|---|---|---|
| `mock` | none | free | nothing — runs entirely offline |
| `testnet` | Base Sepolia | free test USDC | a funded test wallet |
| `mainnet` | Base | **$1 USDC, real money** | a funded wallet |

Mode is chosen per call (`--mode`, or the `mode` argument to the tool), not per deployment, so one
installation serves all three. It defaults to `ASK_TRIVIUM_MODE`, and to `mock` when that is unset.

**Mock is never a fallback.** If a paying mode cannot reach the backend, the call fails loudly and
tells you to use `mock` — it does not quietly hand you fixture data. Being served a canned panel
while believing you bought an analysis is the one failure this design refuses to risk, so the
fallback that would cause it does not exist anywhere in the code.

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
- 🚧 **`testnet` and `mainnet` are not wired up yet.** They fail with a clear error naming `mock` as
  the working path. The outbound leg to the backend, the x402 payment client, and wallet
  configuration land next; funding instructions arrive with them.
- 🚧 **Not published to npm yet**, so installation needs a checkout for now.

---

## Repository

| Path | What it is |
|---|---|
| `src/cli.ts` | the human CLI |
| `src/mcp.ts` | the stdio MCP server an agent connects to |
| `src/analyze.ts` | mode dispatch — mock is served here, paying modes forward to the backend |
| `src/render.ts` | terminal rendering of a panel |
| `src/contract.ts` | the wire schemas, shared by both surfaces |
| `src/fixture.ts` | the captured panel that mock mode replays |
| `docs/wire-contract.md` | the schemas, progress contract, and error behaviour, in full |
| `CONTEXT.md` | the vocabulary — dispute, cell, panel, verdict, giveaway |

### Development

```bash
npm install
npm run typecheck
npm test          # unit tests, plus the CLI and the MCP server driven as real subprocesses
npm run build
```

The test suite drives the built binary the way an agent and a cold reader actually drive it —
spawned as a subprocess with piped stdio — because the failures that matter here (a stray byte on
stdout corrupting the JSON-RPC stream, a truncated panel through a pipe) only appear at a process
boundary.

## License

MIT — see [LICENSE](LICENSE).
