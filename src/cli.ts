/**
 * The human-facing CLI.
 *
 * The same binary is also the stdio MCP server (`--mcp`, intercepted in `bin.ts` before this
 * module is even loaded). Both surfaces call the same `analyze` and the same `renderPanel`, so a
 * human and an agent are looking at the identical panel.
 */
import { Cli, z } from 'incur'
import { analyze, errorMessage } from './analyze.js'
import { MODES, PanelResponse } from './contract.js'
import { renderPanel } from './render.js'

/** Read piped stdin, so a long dispute can arrive as `cat complaint.txt | ask-trivium analyze "..."`. */
async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return ''
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8').trim()
}

export const cli = Cli.create('ask-trivium', {
  version: '0.1.0',
  description:
    'Predict how Kleros jurors would rule on a consumer dispute, using a panel of nine ' +
    'independent LLM analyses. Also runs as a local MCP server with --mcp.',
})

cli.command('analyze', {
  description: 'Analyze a consumer dispute and print the nine-cell panel and its verdict.',
  args: z.object({
    title: z.string().describe('Short title of the dispute.'),
    content: z
      .string()
      .optional()
      .describe('The full dispute. If omitted, it is read from piped stdin.'),
  }),
  options: z.object({
    mode: z
      .enum(MODES)
      .optional()
      .describe(
        'Which tier to run against. "mock" is free and offline and returns a canned example ' +
          'panel. "mainnet" runs a real analysis and charges $1 USDC. ' +
          'Defaults to $ASK_TRIVIUM_MODE, else "mock".',
      ),
    idempotencyKey: z
      .string()
      .uuid()
      .optional()
      .describe('UUID for safely retrying a paid call after a dropped connection.'),
  }),
  output: PanelResponse,
  // The panel is rendered for humans by hand below; letting incur also dump the payload would
  // print it twice. Agents still get the full structured envelope via --json.
  outputPolicy: 'agent-only',
  usage: [
    { args: { title: true, content: true } },
    { args: { title: true }, options: { mode: true } },
    { prefix: 'cat complaint.txt |', args: { title: true } },
  ],
  examples: [
    {
      args: { title: 'Refund refused on a faulty laptop' },
      options: { mode: 'mock' },
      description: 'See a canned example panel — free, offline, no backend',
    },
    {
      args: { title: 'Refund refused on a faulty laptop', content: 'Bought on 3 March...' },
      options: { mode: 'mainnet' },
      description: 'Run a real analysis and pay $1 USDC',
    },
  ],
  hint:
    'mock is free and needs no network. testnet and mainnet need a funded wallet and reach the ' +
    'Trivium backend; mainnet spends real money.',
  async run(c) {
    const content = c.args.content ?? (await readStdin())
    if (!content)
      return c.error({
        code: 'NO_DISPUTE_CONTENT',
        message:
          'No dispute content. Pass it as the second argument, or pipe it in on stdin.',
        retryable: false,
      })

    try {
      const result = await analyze({
        title: c.args.title,
        content,
        mode: c.options.mode,
        idempotency_key: c.options.idempotencyKey,
      })
      if (!c.agent) process.stdout.write(`${renderPanel(result)}\n`)
      return c.ok(result)
    } catch (error) {
      return c.error({
        code: 'ANALYSIS_UNAVAILABLE',
        message: errorMessage(error),
        retryable: false,
      })
    }
  },
})

export default cli
