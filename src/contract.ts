/**
 * The wire contract, hand-copied from `docs/wire-contract.md` §1–§2.
 *
 * Deliberately NOT a shared package with the backend (ADR-0006). The backend holds its own
 * hand-written copy. If this file changes, that one changes by hand, and neither side may change
 * it unilaterally.
 *
 * **Changing anything here means bumping the `contract-rev` marker in `docs/wire-contract.md`.**
 * That marker is the whole signal the backend gets that there is something to carry across; a
 * change made here and not marked there reaches nobody.
 */
import { z } from 'zod'

/** The three analytical perspectives. Names are public; the prompts behind them are not (ADR-0009). */
export const PERSONAS = ['strict', 'consumer-aware', 'precedent-focused'] as const

/** Which tier a call runs against (ADR-0011). */
export const MODES = ['mock', 'testnet', 'mainnet'] as const

/** The advertised panel size: three models x three personas. Public — it is what is being sold. */
export const PANEL_SIZE = 9

export type Mode = (typeof MODES)[number]

/**
 * §1. Tool input.
 *
 * `mode` is optional here but required on the wire. The bridge resolves it: an explicit per-call
 * value wins, else `ASK_TRIVIUM_MODE` from the MCP registration environment, else `"mock"`.
 * Leaving it optional is what lets one registration serve both "show me the mock" and "now do a
 * real one" without restarting the agent.
 */
export const AnalyzeDisputeInput = z.object({
  title: z
    .string()
    .min(1)
    .max(200)
    .describe('Short title of the consumer dispute, e.g. "Refund refused on a faulty laptop".'),
  content: z
    .string()
    .min(1)
    .max(50_000)
    .describe(
      'The full dispute: what was bought, what went wrong, what each side has said and done. ' +
        'More specific detail produces a sharper panel.',
    ),
  mode: z
    .enum(MODES)
    .optional()
    .describe(
      'Which tier to run against. ' +
        '"mock" returns a canned example panel entirely offline — no backend, no payment, free; ' +
        'use it to see the shape of a result. ' +
        '"testnet" runs a real panel against Base Sepolia, paid in faucet USDC. ' +
        '"mainnet" runs a real panel against Base and CHARGES $1 USDC of real money. ' +
        'Omit to use the mode this server was registered with (default "mock"). ' +
        'Do not choose "mainnet" on the user\'s behalf without them asking for a real, paid analysis.',
    ),
  idempotency_key: z
    .string()
    .uuid()
    .optional()
    .describe(
      'Optional UUID. Resend the same key to safely retry after a dropped connection without ' +
        'paying twice; the server returns the cached result for a repeated key.',
    ),
})

export type AnalyzeDisputeInput = z.infer<typeof AnalyzeDisputeInput>

/** §2. Dispute-level signals the panel raises. */
export const Flags = z.object({
  fraud: z.boolean().describe('The panel saw indications of fraud.'),
  missingEvidence: z.boolean().describe('A material fact is unevidenced either way.'),
  policyGap: z.boolean().describe('No policy or term squarely covers the situation.'),
  technicalComplexity: z.boolean().describe('Resolving this needs domain expertise.'),
})

/**
 * §2. The aggregated outcome of a panel. Computed by the backend — the bridge only renders it.
 * Never derive any of these fields here.
 */
export const Verdict = z.object({
  decision: z
    .enum(['user_wins', 'company_wins', 'escalate'])
    .describe(
      'How the panel predicts Kleros jurors would rule. "escalate" means the panel declines to ' +
        'auto-resolve and refers the dispute to a jury — a legitimate outcome, not a failure.',
    ),
  score: z.number().min(0).max(100).describe('User win probability, 0-100.'),
  agreement: z
    .enum(['strong', 'moderate', 'weak'])
    .describe('How much the nine cells concur. Arrives already collapsed to a word.'),
  rationale: z.string().describe('One human sentence explaining the decision.'),
  flags: Flags,
  analysesCompleted: z
    .number()
    .int()
    .describe('How many of the nine analyses returned. Fewer than nine means the call was free.'),
  analysesRequested: z.number().int().describe('How many analyses were requested — nine.'),
  mode: z
    .enum(MODES)
    .describe(
      'Which tier produced this. "mock" means a canned example panel, not an analysis of the ' +
        'submitted dispute — say so if you relay it.',
    ),
  settled: z
    .boolean()
    .describe(
      'Whether the caller was actually charged. Always false in "mock", which is free by design. ' +
        'In a paying mode, false means this panel was given away.',
    ),
  settlementTx: z
    .string()
    .optional()
    .describe('On-chain transaction hash of the USDC transfer. Present if and only if settled.'),
})

/** §2. One analysis of the dispute by one model under one persona. Nine cells form a panel. */
export const PanelEntry = z.object({
  model: z.string().describe('The model that produced this cell.'),
  persona: z.enum(PERSONAS).describe('The analytical perspective the model was asked to adopt.'),
  score: z.number().min(0).max(100).describe('This cell’s user win probability, 0-100.'),
  confidence: z.enum(['high', 'medium', 'low']).describe('How sure this cell is of its own score.'),
  reasoning: z.string().describe('The model’s own prose. Rendered verbatim, never rewritten.'),
})

export type PanelEntry = z.infer<typeof PanelEntry>

/**
 * §2. The single response shape.
 *
 * `detail` collapsed to one shape rather than three (§7 item 1, decided in ticket 02). It never
 * changed what the backend computes — all nine cells run regardless — so it was a response-size
 * lever only, and MCP exposes exactly one `outputSchema` per tool. Three shapes would have made
 * every field below `Verdict` optional, so an agent could never rely on `panel` being present.
 */
export const PanelResponse = Verdict.extend({
  panel: z.array(PanelEntry).describe('The nine cells: three models x three personas.'),
})

export type PanelResponse = z.infer<typeof PanelResponse>
