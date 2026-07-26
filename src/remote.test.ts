/**
 * The bridge being a bridge: an agent on one side, a backend on the other, and two real transports
 * in between.
 *
 * `backend.test.ts` proves the outbound leg and `mcp.test.ts` the inbound one, both in-process.
 * Neither can catch what only breaks when they are joined across a process boundary — progress
 * notifications that arrive at the bridge and stop there, an endpoint read from the wrong place in
 * a child process, or a panel that renders differently once it has crossed a wire.
 *
 * The stand-in backend runs in this process and is reached over real HTTP on the loopback, so both
 * legs are genuine: JSON-RPC over stdio to a spawned binary, Streamable HTTP out the other side.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { ENDPOINT_ENV_VAR } from './backend.js'
import {
  REMOTE_MARKER,
  REMOTE_RENDERED_TEXT,
  closedEndpoint,
  startFakeBackend,
  type FakeBackend,
} from './backend.testkit.js'
import { PANEL_SIZE, PanelResponse } from './contract.js'
import { MOCK_DISPUTE_TITLE } from './fixture.js'
import { renderPanel } from './render.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const dispute = {
  title: 'Retailer refused a refund on a laptop that failed in month three',
  content: 'Bought on 3 March, the screen failed in May, and the retailer blamed accidental damage.',
}

let client: Client | undefined
let backend: FakeBackend | undefined

afterEach(async () => {
  await client?.close()
  client = undefined
  await backend?.close()
  backend = undefined
})

async function spawnBridge(env: Record<string, string>): Promise<Client> {
  const transport = new StdioClientTransport({
    command: resolve(root, 'node_modules/.bin/tsx'),
    args: [resolve(root, 'src/bin.ts'), '--mcp'],
    cwd: root,
    env: { PATH: process.env['PATH'] ?? '', ...env },
  })
  const c = new Client({ name: 'remote-test-agent', version: '0' })
  await c.connect(transport)
  return c
}

const panelProgress = Array.from({ length: PANEL_SIZE }, (_, i) => ({
  progress: i + 1,
  total: PANEL_SIZE,
  message: `stand-in-model · cell ${i + 1}`,
}))

describe('a paying call across both legs', () => {
  it('crosses to the backend and comes back as a panel', async () => {
    backend = await startFakeBackend()
    client = await spawnBridge({ [ENDPOINT_ENV_VAR]: backend.url })

    const result = await client.callTool({
      name: 'analyze_dispute',
      arguments: { ...dispute, mode: 'mainnet' },
    })
    const structured = PanelResponse.parse(result.structuredContent)

    expect(structured.panel).toHaveLength(PANEL_SIZE)
    expect(structured.mode).toBe('mainnet')
    // It came off the wire: the backend stamps everything it invents, and the fixture is a
    // different dispute entirely.
    expect(structured.rationale).toContain(REMOTE_MARKER)
    expect(JSON.stringify(structured)).not.toContain(MOCK_DISPUTE_TITLE)
    expect(backend.calls).toHaveLength(1)
    expect(backend.calls[0]?.title).toBe(dispute.title)
  }, 30_000)

  it('renders a remote panel through the same renderer as a mock one', async () => {
    backend = await startFakeBackend()
    client = await spawnBridge({ [ENDPOINT_ENV_VAR]: backend.url })

    const result = await client.callTool({
      name: 'analyze_dispute',
      arguments: { ...dispute, mode: 'mainnet' },
    })
    const text = (result.content as { text: string }[])[0]?.text ?? ''

    // Byte-identical to `renderPanel` on the same payload. A second rendering path for remote
    // results — or the backend's own text being passed through — fails here, and that is the
    // ticket's structural requirement rather than a cosmetic one.
    expect(text).toBe(renderPanel(PanelResponse.parse(result.structuredContent)))
    expect(text).not.toContain(REMOTE_RENDERED_TEXT)
    expect(text).toMatch(/VERDICT/)
    // The mock-only banner must not appear on a real panel; it would tell a paying caller their
    // analysis was canned.
    expect(text).not.toContain('canned example panel')
  }, 30_000)

  /**
   * Wire contract §3, end to end. This is the assertion the `_probe_hold_open` diagnostic exists to
   * make against the live deployment: notifications emitted by the backend reach the *agent*, not
   * merely the bridge. Configure one leg and not the other and this is the test that fails.
   */
  it('carries the backend’s progress the whole way to the agent', async () => {
    backend = await startFakeBackend({ progress: panelProgress })
    client = await spawnBridge({ [ENDPOINT_ENV_VAR]: backend.url })

    const seen: { progress: number; total?: number; message?: string }[] = []
    await client.callTool(
      { name: 'analyze_dispute', arguments: { ...dispute, mode: 'mainnet' } },
      undefined,
      { onprogress: (p) => seen.push(p), resetTimeoutOnProgress: true },
    )

    expect(seen.map((p) => p.progress)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(seen[0]?.total).toBe(PANEL_SIZE)
    expect(seen[8]?.message).toContain('cell 9')
  }, 30_000)

  it('holds a call open longer than the agent’s own timeout while progress flows', async () => {
    // The failure §3 is about, in miniature: a call slower than the client's timeout survives only
    // because notifications keep resetting it. 1.2s of work against a 500ms window.
    backend = await startFakeBackend({ progress: panelProgress.slice(0, 4), stepDelayMs: 240 })
    client = await spawnBridge({ [ENDPOINT_ENV_VAR]: backend.url })

    const result = await client.callTool(
      { name: 'analyze_dispute', arguments: { ...dispute, mode: 'mainnet' } },
      undefined,
      { onprogress: () => {}, resetTimeoutOnProgress: true, timeout: 500 },
    )

    expect(PanelResponse.parse(result.structuredContent).panel).toHaveLength(PANEL_SIZE)
  }, 30_000)
})

describe('the endpoint is configuration, not code', () => {
  it('reaches whichever backend the environment names', async () => {
    // Two backends, one process, and only the environment telling them apart. If the URL were
    // baked in, the second call would land on the first server or on the deployment.
    const first = await startFakeBackend()
    const second = await startFakeBackend()
    try {
      client = await spawnBridge({ [ENDPOINT_ENV_VAR]: second.url })
      await client.callTool({
        name: 'analyze_dispute',
        arguments: { ...dispute, mode: 'mainnet' },
      })

      expect(second.calls).toHaveLength(1)
      expect(first.calls).toHaveLength(0)
    } finally {
      await first.close()
      await second.close()
    }
  }, 30_000)

  it('refuses to start when the endpoint is not a URL, rather than at the first analysis', async () => {
    const transport = new StdioClientTransport({
      command: resolve(root, 'node_modules/.bin/tsx'),
      args: [resolve(root, 'src/bin.ts'), '--mcp'],
      cwd: root,
      // No ASK_TRIVIUM_MODE, so this registration defaults to mock — which never uses the
      // endpoint. It still has to refuse: the variable was set deliberately, any single call may
      // ask for mainnet, and a typo is worth hearing about at registration either way.
      env: { PATH: process.env['PATH'] ?? '', [ENDPOINT_ENV_VAR]: 'localhost:8080' },
      // Piped so a deliberate complaint does not print onto the runner's stderr and make a green
      // suite read as a broken one.
      stderr: 'pipe',
    })

    let stderr = ''
    transport.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    const drained = new Promise<void>((done) => {
      if (!transport.stderr) return done()
      transport.stderr.on('close', () => done())
      transport.stderr.on('end', () => done())
    })

    const c = new Client({ name: 'remote-test-agent', version: '0' })
    await expect(c.connect(transport)).rejects.toThrow()

    // The right refusal, not merely a refusal: asserting only that connect rejects would pass for
    // a missing binary.
    await Promise.race([drained, new Promise((r) => setTimeout(r, 5_000))])
    expect(stderr).toMatch(/ASK_TRIVIUM_ENDPOINT/)
    expect(stderr).toMatch(/localhost:8080/)
  }, 30_000)
})

describe('an unreachable backend fails hard across both legs', () => {
  it('reports an error to the agent rather than the fixture', async () => {
    client = await spawnBridge({ [ENDPOINT_ENV_VAR]: await closedEndpoint() })

    const result = await client.callTool({
      name: 'analyze_dispute',
      arguments: { ...dispute, mode: 'mainnet' },
    })
    const text = (result.content as { text: string }[])[0]?.text ?? ''

    expect(result.isError).toBe(true)
    expect(result.structuredContent).toBeUndefined()
    expect(text).toMatch(/NOT charged/i)
    expect(text).toMatch(/mock/)
    // The specific catastrophe this guards: fixture data delivered under a paying label.
    expect(text).not.toContain(MOCK_DISPUTE_TITLE)
  }, 30_000)

  it('still serves mock from the same process, with the endpoint dead', async () => {
    client = await spawnBridge({ [ENDPOINT_ENV_VAR]: await closedEndpoint() })

    const result = await client.callTool({
      name: 'analyze_dispute',
      arguments: { ...dispute, mode: 'mock' },
    })
    const structured = PanelResponse.parse(result.structuredContent)

    expect(structured.panel).toHaveLength(PANEL_SIZE)
    expect(structured.mode).toBe('mock')
  }, 30_000)
})
