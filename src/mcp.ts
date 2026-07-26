/**
 * The local stdio MCP server.
 *
 * This is the half of the bridge that an agent connects to. No MCP client in circulation speaks
 * x402 — none of them will pay a `PaymentRequired` and retry — so the bridge stands in as a local
 * server, holds the wallet, and forwards to the remote Trivium server in `backend.ts`.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js'
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js'
import { analyze, resolveMode } from './analyze.js'
import { ENDPOINT_ENV_VAR, resolveEndpoint, type ProgressListener } from './backend.js'
import { AnalyzeDisputeInput, PanelResponse } from './contract.js'
import { errorMessage } from './errors.js'
import { renderPanel } from './render.js'
import { VERSION } from './version.js'

/**
 * The tool description is the only documentation an agent reliably reads, so it carries the whole
 * proposition: what it does, what it costs, and which mode is safe to pick unprompted.
 */
const TOOL_DESCRIPTION = [
  'Predict how a neutral adjudicator would rule on a consumer dispute.',
  '',
  'Nine independent LLM analyses — three models across three analytical perspectives (strict,',
  'consumer-aware, precedent-focused) — each score the dispute, and the panel is aggregated into',
  'one verdict: a decision (user wins / company wins / escalate to a jury), a user win probability,',
  'how strongly the nine analyses agreed, and a one-sentence rationale. All nine analyses and their',
  'reasoning are returned so the verdict can be checked rather than taken on trust.',
  '',
  'Use it to triage a complaint, to sanity-check a refund or warranty decision before acting on it,',
  'or to estimate whether a dispute is worth escalating.',
  '',
  'COST: mode "mock" is free and offline and returns a canned example panel — use it to see the',
  'shape of a result. Mode "mainnet" runs a real analysis and CHARGES $1 USDC of real money. Do not',
  'select "mainnet" unless the user has asked for a real, paid analysis.',
].join('\n')

/**
 * Relay the backend's progress on to the agent that asked for this analysis.
 *
 * The second half of wire contract §3, and the half that gets skipped: configuring the bridge's own
 * client is visible work, and with it the bridge waits happily through a 180s analysis — while the
 * agent, hearing nothing, gives up at the SDK's default 60s. Configuring one leg and not the other
 * looks like it works right up to the first slow call.
 *
 * Returns `undefined` when the agent sent no progress token, which is MCP's way of saying it does
 * not want notifications. Sending them anyway is a protocol error on some clients.
 */
function upstreamProgress(
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
): ProgressListener | undefined {
  const progressToken = extra._meta?.['progressToken']
  if (progressToken === undefined) return undefined

  return (event) => {
    // Fire and forget, and swallow the failure. A dropped notification is cosmetic; letting it
    // reject would turn a delivered panel — possibly a paid one — into a failed call over a
    // progress bar. The panel is the product; the progress is commentary on it.
    void extra
      .sendNotification({
        method: 'notifications/progress',
        params: { progressToken, ...event },
      })
      .catch(() => {})
  }
}

export function createServer(): McpServer {
  const server = new McpServer(
    { name: 'ask-trivium', version: VERSION },
    { capabilities: { tools: {} } },
  )

  server.registerTool(
    'analyze_dispute',
    {
      title: 'Analyze a consumer dispute',
      description: TOOL_DESCRIPTION,
      inputSchema: AnalyzeDisputeInput.shape,
      outputSchema: PanelResponse.shape,
    },
    async (args, extra) => {
      try {
        const result = await analyze(args, { onProgress: upstreamProgress(extra) })
        return {
          // Both forms, per wire contract §2: agents consume the structured payload, humans read
          // the rendering. `mode` and `settled` are inside the payload precisely so an agent
          // relaying this can say "mock, not charged" without parsing terminal text or _meta.
          content: [{ type: 'text' as const, text: renderPanel(result) }],
          structuredContent: result,
        }
      } catch (error) {
        // Never downgrade to the fixture. A hard, loud failure naming mock as the working path is
        // the required behaviour when a paying mode cannot be served (wire contract §6).
        return {
          content: [{ type: 'text' as const, text: errorMessage(error) }],
          isError: true,
        }
      }
    },
  )

  return server
}

/**
 * Start the bridge on stdio.
 *
 * Both settings are resolved once here so a misconfigured registration fails immediately, with the
 * agent reporting "not configured" before a dispute has been typed — rather than "the analysis
 * failed" after one has.
 *
 * The endpoint is checked in every mode, including mock, which never uses it. The test is not
 * "will this run need it" but "did somebody set it": an unset variable takes the default and says
 * nothing, while a malformed one is a typo its author wants to hear about now. Checking only in a
 * paying mode would miss it anyway, since any mock-registered bridge can be asked for mainnet on a
 * single call (ADR-0011).
 */
export async function startStdioServer(): Promise<void> {
  resolveMode(undefined, process.env['ASK_TRIVIUM_MODE'])
  resolveEndpoint(process.env[ENDPOINT_ENV_VAR])
  const server = createServer()
  await server.connect(new StdioServerTransport())
}
