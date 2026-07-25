/**
 * The bridge driven the way an agent actually drives it: a real subprocess, real stdio framing.
 *
 * `mcp.test.ts` covers behaviour over an in-process transport, which is fast but cannot catch the
 * things that only break at a process boundary — `--mcp` not being intercepted in `bin.ts`, or
 * anything writing to stdout and corrupting the JSON-RPC stream. This is the durability guarantee
 * (ADR-0012) under test: it must work on a judge's laptop with nothing running.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

let client: Client | undefined
afterEach(async () => {
  await client?.close()
  client = undefined
})

async function spawnBridge(env: Record<string, string> = {}): Promise<Client> {
  const transport = new StdioClientTransport({
    command: resolve(root, 'node_modules/.bin/tsx'),
    args: [resolve(root, 'src/bin.ts'), '--mcp'],
    cwd: root,
    env: { PATH: process.env['PATH'] ?? '', ...env },
  })
  const c = new Client({ name: 'stdio-test-agent', version: '0' })
  await c.connect(transport)
  return c
}

const dispute = {
  title: 'Airline refused compensation for a cancelled flight',
  content: 'Flight cancelled four hours before departure; the airline refused to pay.',
}

describe('the bridge as a spawned stdio subprocess', () => {
  it('completes an MCP handshake and advertises the tool', async () => {
    client = await spawnBridge()
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name)).toContain('analyze_dispute')
  }, 30_000)

  it('serves a complete panel over real stdio framing, with nothing corrupting the stream', async () => {
    client = await spawnBridge()
    const result = await client.callTool({ name: 'analyze_dispute', arguments: dispute })
    const structured = result.structuredContent as Record<string, unknown>
    expect(structured['panel']).toHaveLength(9)
    expect(structured['mode']).toBe('mock')
    expect(structured['settled']).toBe(false)
    expect((result.content as { text: string }[])[0]?.text).toMatch(/VERDICT/)
  }, 30_000)

  it('takes its default mode from the registration environment', async () => {
    client = await spawnBridge({ ASK_TRIVIUM_MODE: 'mock' })
    const result = await client.callTool({ name: 'analyze_dispute', arguments: dispute })
    expect((result.structuredContent as Record<string, unknown>)['mode']).toBe('mock')
  }, 30_000)

  it('refuses to start at all when the registration environment is unreadable', async () => {
    await expect(spawnBridge({ ASK_TRIVIUM_MODE: 'production' })).rejects.toThrow()
  }, 30_000)
})
