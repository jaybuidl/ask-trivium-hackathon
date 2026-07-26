import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ENDPOINT_ENV_VAR } from './backend.js'
import { closedEndpoint, startFakeBackend, type FakeBackend } from './backend.testkit.js'
import { PANEL_SIZE, PanelResponse } from './contract.js'
import { createServer } from './mcp.js'
import { renderPanel } from './render.js'

async function connect() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test-agent', version: '0' })
  await Promise.all([createServer().connect(serverTransport), client.connect(clientTransport)])
  return client
}

const dispute = {
  title: 'Airline refused compensation for a cancelled flight',
  content: 'My flight was cancelled four hours before departure and the airline refused to pay.',
}

let client: Client
beforeEach(async () => {
  client = await connect()
})

describe('tools/list', () => {
  it('advertises analyze_dispute', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name)).toContain('analyze_dispute')
  })

  it('describes what it does and what it costs, so an agent can act unaided', async () => {
    const { tools } = await client.listTools()
    const tool = tools.find((t) => t.name === 'analyze_dispute')
    const description = tool?.description ?? ''
    expect(description).toMatch(/dispute/i)
    expect(description).toMatch(/\$1/)
    expect(description).toMatch(/mock/)
  })

  it('exposes mode as an enum, which is the only documentation an agent reads', async () => {
    const { tools } = await client.listTools()
    const tool = tools.find((t) => t.name === 'analyze_dispute')
    const mode = (tool?.inputSchema?.properties as Record<string, { enum?: string[] }>)?.['mode']
    expect(mode?.enum).toEqual(['mock', 'testnet', 'mainnet'])
  })

  it('publishes an output schema, so structuredContent is a contract and not a surprise', async () => {
    const { tools } = await client.listTools()
    const tool = tools.find((t) => t.name === 'analyze_dispute')
    expect(Object.keys((tool?.outputSchema?.properties as object) ?? {})).toEqual(
      expect.arrayContaining(['decision', 'score', 'agreement', 'panel', 'mode', 'settled']),
    )
  })
})

describe('tools/call in mock mode', () => {
  it('returns both a human rendering and a structured payload', async () => {
    const result = await client.callTool({
      name: 'analyze_dispute',
      arguments: { ...dispute, mode: 'mock' },
    })
    const content = result.content as { type: string; text: string }[]
    expect(content[0]?.type).toBe('text')
    expect(result.structuredContent).toBeDefined()
  })

  it('renders the text form for a human rather than dumping JSON', async () => {
    const result = await client.callTool({
      name: 'analyze_dispute',
      arguments: { ...dispute, mode: 'mock' },
    })
    const text = (result.content as { text: string }[])[0]?.text ?? ''
    expect(text).toMatch(/VERDICT/)
    expect(text).toMatch(/THE PANEL/)
    expect(() => JSON.parse(text)).toThrow()
  })

  it('carries mode and settled in the payload, not only in the terminal chrome', async () => {
    const result = await client.callTool({
      name: 'analyze_dispute',
      arguments: { ...dispute, mode: 'mock' },
    })
    const structured = result.structuredContent as Record<string, unknown>
    expect(structured['mode']).toBe('mock')
    expect(structured['settled']).toBe(false)
    expect(structured['panel']).toHaveLength(9)
  })

  it('defaults to mock when the agent omits mode entirely', async () => {
    const result = await client.callTool({ name: 'analyze_dispute', arguments: dispute })
    expect((result.structuredContent as Record<string, unknown>)['mode']).toBe('mock')
  })
})

/**
 * The endpoint is stubbed at a dead address rather than left to default. Since ticket 04 a paying
 * mode is a real outbound call, so an unstubbed test here would reach the live deployment — making
 * the suite need a network, and making it pass or fail on someone else's uptime.
 */
describe('tools/call in a paying mode with the backend unreachable', () => {
  beforeEach(async () => {
    vi.stubEnv(ENDPOINT_ENV_VAR, await closedEndpoint())
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reports an error rather than serving the fixture', async () => {
    const result = await client.callTool({
      name: 'analyze_dispute',
      arguments: { ...dispute, mode: 'mainnet' },
    })
    expect(result.isError).toBe(true)
    expect(result.structuredContent).toBeUndefined()
  })

  it('names mock as the working path and says nothing was charged', async () => {
    const result = await client.callTool({
      name: 'analyze_dispute',
      arguments: { ...dispute, mode: 'mainnet' },
    })
    const text = (result.content as { text: string }[])[0]?.text ?? ''
    expect(text).toMatch(/mock/)
    expect(text).toMatch(/NOT charged/i)
    expect(text).not.toMatch(/failing screen/)
  })
})

describe('tools/call in a paying mode with the backend answering', () => {
  let backend: FakeBackend
  beforeEach(async () => {
    backend = await startFakeBackend({
      progress: Array.from({ length: PANEL_SIZE }, (_, i) => ({
        progress: i + 1,
        total: PANEL_SIZE,
        message: `cell ${i + 1}`,
      })),
    })
    vi.stubEnv(ENDPOINT_ENV_VAR, backend.url)
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await backend.close()
  })

  it('serves the remote panel through the same renderer mock uses', async () => {
    const result = await client.callTool({
      name: 'analyze_dispute',
      arguments: { ...dispute, mode: 'mainnet' },
    })
    const structured = PanelResponse.parse(result.structuredContent)
    const text = (result.content as { text: string }[])[0]?.text ?? ''

    // Byte-identical to what the renderer produces for this payload. Anything the remote path
    // formatted for itself — including the backend's own text, which is discarded — shows up here
    // as a mismatch, which is the whole point: one renderer or the slice was built wrong.
    expect(text).toBe(renderPanel(structured))
    expect(text).not.toContain("the backend's own text rendering")
    expect(structured.mode).toBe('mainnet')
  })

  /**
   * Wire contract §3's second leg. `backend.test.ts` proves the notifications arrive at the bridge;
   * this proves the bridge passes them on, which is the half that decides whether the *agent*
   * times out at 60s on a 180s analysis.
   */
  it('forwards the backend’s progress on to the agent', async () => {
    const seen: number[] = []
    await client.callTool(
      { name: 'analyze_dispute', arguments: { ...dispute, mode: 'mainnet' } },
      undefined,
      { onprogress: (p) => seen.push(p.progress), resetTimeoutOnProgress: true },
    )

    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('completes normally for an agent that asked for no progress', async () => {
    const result = await client.callTool({
      name: 'analyze_dispute',
      arguments: { ...dispute, mode: 'mainnet' },
    })
    expect(PanelResponse.parse(result.structuredContent).panel).toHaveLength(PANEL_SIZE)
  })

  it('reports the mode that actually ran, not the one it was asked for by default', async () => {
    const result = await client.callTool({
      name: 'analyze_dispute',
      arguments: { ...dispute, mode: 'testnet' },
    })
    expect(PanelResponse.parse(result.structuredContent).mode).toBe('testnet')
    expect(backend.calls[0]?.mode).toBe('testnet')
  })
})

describe('invalid input', () => {
  it('rejects a dispute over the 50k ceiling before any payment could be requested', async () => {
    const result = await client.callTool({
      name: 'analyze_dispute',
      arguments: { ...dispute, content: 'x'.repeat(50_001), mode: 'mock' },
    })
    expect(result.isError).toBe(true)
  })
})
