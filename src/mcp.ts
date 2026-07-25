/**
 * The local stdio MCP server.
 *
 * This is the half of the bridge that an agent connects to. No MCP client in circulation speaks
 * x402 — none of them will pay a `PaymentRequired` and retry — so the bridge stands in as a local
 * server, holds the wallet, and forwards to the remote Trivium server. Ticket 04 adds the outbound
 * leg; this file is the inbound one.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { analyze, errorMessage, resolveMode } from './analyze.js'
import { AnalyzeDisputeInput, PanelResponse } from './contract.js'
import { renderPanel } from './render.js'

/**
 * The tool description is the only documentation an agent reliably reads, so it carries the whole
 * proposition: what it does, what it costs, and which mode is safe to pick unprompted.
 */
const TOOL_DESCRIPTION = [
  'Predict how Kleros jurors would rule on a consumer dispute.',
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

export function createServer(): McpServer {
  const server = new McpServer(
    { name: 'ask-trivium', version: '0.1.0' },
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
    async (args) => {
      try {
        const result = await analyze(args)
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
 * The mode is resolved once here so a misconfigured registration fails immediately, with the agent
 * reporting "not configured" before a dispute has been typed — rather than "the analysis failed"
 * after one has.
 */
export async function startStdioServer(): Promise<void> {
  resolveMode(undefined, process.env['ASK_TRIVIUM_MODE'])
  const server = createServer()
  await server.connect(new StdioServerTransport())
}
