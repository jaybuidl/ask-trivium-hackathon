/**
 * A real HTTP MCP server standing in for the deployed backend.
 *
 * Not a mock of the client: an actual `node:http` server speaking Streamable HTTP through the same
 * SDK transport the deployment uses. The outbound leg is the thing ticket 04 adds, so testing it
 * against a stubbed-out `callTool` would test nothing — session negotiation, SSE framing and
 * progress delivery are exactly where this can break. This costs a few milliseconds per test and
 * keeps the suite hermetic: no deployment, no network, works on a plane (ADR-0012).
 *
 * `live.test.ts` covers the real deployment, opt-in.
 *
 * Not shipped — `*.testkit.ts` is excluded from the build and the published package alongside
 * `*.test.ts`. It is a separate suffix only because vitest would collect a `.test.ts` file and
 * complain that it declares no tests.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer as createHttpServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { z } from 'zod'
import { MODES, PANEL_SIZE, PERSONAS, type Mode, type PanelResponse } from './contract.js'

/**
 * Stamped through every field this server invents.
 *
 * Two different tests lean on it: one asserts a remote panel reached the renderer, and one asserts
 * the *fixture* did not. Neither is meaningful unless remote data is distinguishable from mock data
 * on sight, which is also why this text looks nothing like the fixture's.
 */
export const REMOTE_MARKER = '[STAND-IN BACKEND]'

/** Text the fake puts in `content`, which the bridge must ignore in favour of rendering its own. */
export const REMOTE_RENDERED_TEXT = `${REMOTE_MARKER} the backend's own text rendering`

/** A contract-shaped panel that is visibly not the embedded fixture. */
export function remotePanel(mode: Mode): PanelResponse {
  const models = ['stand-in-model-a', 'stand-in-model-b', 'stand-in-model-c']
  const panel = models.flatMap((model, m) =>
    PERSONAS.map((persona, p) => ({
      model,
      persona,
      score: 10 * (m * 3 + p) + 5,
      confidence: 'medium' as const,
      reasoning: `${REMOTE_MARKER} cell ${m * 3 + p + 1} of ${PANEL_SIZE}, served over the wire.`,
    })),
  )
  return {
    decision: 'escalate',
    score: 54,
    agreement: 'weak',
    rationale: `${REMOTE_MARKER} fixed data proving the endpoint and the schema, not an analysis.`,
    flags: { fraud: false, missingEvidence: true, policyGap: false, technicalComplexity: false },
    analysesCompleted: PANEL_SIZE,
    analysesRequested: PANEL_SIZE,
    mode,
    settled: false,
    panel,
  }
}

/** One `notifications/progress` payload, shaped as wire contract §3 requires. */
export type ProgressStep = { progress: number; total?: number; message?: string }

/** What the analyze_dispute handler received, so a test can assert on what crossed the wire. */
export type RecordedCall = {
  title: string
  content: string
  mode: string
  idempotency_key?: string
}

export type FakeBackendOptions = {
  /** Progress notifications to emit before responding, in order. */
  progress?: ProgressStep[]
  /** Milliseconds to wait between progress steps, and before responding. */
  stepDelayMs?: number
  /** Replace the structured payload. Return anything — the point is usually that it is malformed. */
  payload?: (call: RecordedCall) => unknown
  /** Respond the way a backend reporting a failed call does: `isError` with text, not a throw. */
  toolError?: string
}

export type FakeBackend = {
  /** The MCP endpoint, ready to hand to `ASK_TRIVIUM_ENDPOINT`. */
  url: string
  /** Every analyze_dispute call this server received, in order. Empty means nothing crossed. */
  calls: RecordedCall[]
  close: () => Promise<void>
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The tool input the *backend* publishes.
 *
 * `mode` is required here, unlike the bridge's own tool schema where it is optional — that
 * asymmetry is the wire contract's (§1), and the bridge resolving the default before forwarding is
 * the whole reason it exists. Hand-written rather than imported from `contract.ts` so a test that
 * stops sending `mode` fails here instead of quietly agreeing with itself.
 */
const BackendInput = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50_000),
  mode: z.enum(MODES),
  idempotency_key: z.string().uuid().optional(),
})

/** Start the stand-in backend on an ephemeral port. Always `close()` it, normally in `afterEach`. */
export async function startFakeBackend(options: FakeBackendOptions = {}): Promise<FakeBackend> {
  const calls: RecordedCall[] = []

  function buildMcpServer(): McpServer {
    const server = new McpServer(
      { name: 'stand-in-trivium', version: '0' },
      { capabilities: { tools: {} } },
    )
    server.registerTool(
      'analyze_dispute',
      {
        description: 'Stand-in for the deployed backend.',
        inputSchema: BackendInput.shape,
        // Deliberately no `outputSchema`: the SDK validates `structuredContent` against one, which
        // would stop this server from serving the malformed payload the hard-failure test needs.
      },
      async (args, extra) => {
        const call = args as RecordedCall
        calls.push(call)

        const token = extra._meta?.['progressToken']
        for (const step of options.progress ?? []) {
          if (options.stepDelayMs) await sleep(options.stepDelayMs)
          if (token === undefined) continue
          await extra.sendNotification({
            method: 'notifications/progress',
            params: { progressToken: token, ...step },
          })
        }
        if (options.stepDelayMs) await sleep(options.stepDelayMs)

        if (options.toolError !== undefined) {
          return { content: [{ type: 'text' as const, text: options.toolError }], isError: true }
        }
        const structured = options.payload
          ? options.payload(call)
          : remotePanel(call.mode as Mode)
        return {
          content: [{ type: 'text' as const, text: REMOTE_RENDERED_TEXT }],
          structuredContent: structured as Record<string, unknown>,
        }
      },
    )
    return server
  }

  // Stateless: a fresh server and transport per request, torn down when the response closes. It is
  // the SDK's documented shape for a server with no session state, and it means a test never has to
  // think about session ids.
  const http = createHttpServer((req, res) => {
    void (async () => {
      const mcpServer = buildMcpServer()
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
      res.on('close', () => {
        void transport.close()
        void mcpServer.close()
      })
      await mcpServer.connect(transport)
      await transport.handleRequest(req, res)
    })().catch(() => {
      if (!res.headersSent) res.writeHead(500).end()
    })
  })

  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
  const { port } = http.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}/mcp`,
    calls,
    close: () => closeServer(http),
  }
}

/**
 * An endpoint nothing is listening on, for the unreachable-backend tests.
 *
 * A port that was bound and released, rather than a hardcoded one: hardcoding risks a real service
 * answering on a developer's machine, and a test that passes because something unexpected replied
 * is worse than one that fails.
 */
export async function closedEndpoint(): Promise<string> {
  const server = createHttpServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  await closeServer(server)
  return `http://127.0.0.1:${port}/mcp`
}

function closeServer(server: Server): Promise<void> {
  return new Promise<void>((resolve) => {
    server.closeAllConnections()
    server.close(() => resolve())
  })
}
