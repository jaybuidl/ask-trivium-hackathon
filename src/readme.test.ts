/**
 * The two commands the README hands a stranger, run against the artifact it names.
 *
 * Everything else in this suite drives `src/bin.ts` through tsx, which is fast and is not what
 * anybody following the README executes — they run `npm run build` and then `node dist/bin.js`, and
 * they paste that same path into an agent's MCP config. A build that emits something subtly
 * unrunnable would pass every other test in this repo and fail the only reader who matters.
 *
 * This is the durability guarantee under test (ADR-0012): the quickstart works on a judge's laptop
 * with nothing running and no wallet.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { execFileSync, spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const built = resolve(root, 'dist/bin.js')

beforeAll(() => {
  // The README's step, not a shortcut around it: whatever `npm run build` produces is what gets
  // tested. Compiling here rather than trusting a stale `dist/` is the whole point of the file.
  execFileSync(resolve(root, 'node_modules/.bin/tsc'), ['-p', 'tsconfig.build.json'], { cwd: root })
}, 120_000)

/** The dispute from the README's quickstart, verbatim. */
const quickstart = [
  'Refund refused on a faulty laptop',
  'Bought on 3 March, screen failed in May, retailer blamed accidental damage.',
]

describe('the README quickstart, run against the built binary', () => {
  it('renders a full nine-cell panel with no wallet, no network and no configuration', async () => {
    const child = spawn('node', [built, 'analyze', ...quickstart, '--panel'], {
      cwd: root,
      env: { PATH: process.env['PATH'] ?? '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    child.stdout.on('data', (c) => {
      stdout += String(c)
    })
    const code = await new Promise<number>((ok) => child.on('close', (c) => ok(c ?? 0)))

    expect(code).toBe(0)
    expect(stdout).toMatch(/VERDICT/)
    expect(stdout.match(/confidence (high|medium|low)/g)).toHaveLength(9)
    // The banner the README promises: a canned panel must never be mistaken for the reader's own
    // dispute, however impressive it looks.
    expect(stdout).toMatch(/canned example panel/)
    expect(stdout).toMatch(/NOT CHARGED/)
  }, 120_000)
})

describe('the MCP registration the README tells an agent to use', () => {
  let client: Client | undefined
  afterEach(async () => {
    await client?.close()
    client = undefined
  })

  it('serves the tool when spawned exactly as the documented config spawns it', async () => {
    // `"command": "node", "args": ["<path>/dist/bin.js", "--mcp"], "env": {"ASK_TRIVIUM_MODE": "mock"}`
    client = new Client({ name: 'readme-config-test', version: '0' })
    await client.connect(
      new StdioClientTransport({
        command: 'node',
        args: [built, '--mcp'],
        env: { PATH: process.env['PATH'] ?? '', ASK_TRIVIUM_MODE: 'mock' },
      }),
    )

    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name)).toContain('analyze_dispute')

    const result = await client.callTool({
      name: 'analyze_dispute',
      arguments: { title: quickstart[0]!, content: quickstart[1]! },
    })
    const structured = result.structuredContent as Record<string, unknown>
    expect(structured['panel']).toHaveLength(9)
    expect(structured['mode']).toBe('mock')
  }, 120_000)
})
