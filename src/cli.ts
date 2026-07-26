/**
 * The human-facing CLI.
 *
 * The same binary is also the stdio MCP server (`--mcp`, intercepted in `bin.ts` before this
 * module is even loaded). Both surfaces call the same `analyze` and the same `renderPanel`, so a
 * human and an agent are looking at the identical panel.
 */
import { Cli, z } from 'incur'
import { analyze } from './analyze.js'
import type { ProgressListener } from './backend.js'
import { MODES, PanelResponse } from './contract.js'
import { errorMessage } from './errors.js'
import { renderPanel } from './render.js'
import { VERSION } from './version.js'

/** Read piped stdin, so a long dispute can arrive as `cat complaint.txt | ask-trivium analyze "..."`. */
async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return ''
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8').trim()
}

/**
 * Write to stdout and resolve once the bytes have actually left the process.
 *
 * A pipe does not accept a large write synchronously, and `process.exit` does not drain what is
 * still buffered — exiting straight after a plain `write` truncates the panel at whatever the pipe
 * happened to swallow. The callback form is what makes the early exit below safe.
 */
function writeFlushed(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    process.stdout.write(text, (error) => (error ? reject(error) : resolve()))
  })
}

/**
 * The dispute shown in `--help`, quoted and complete because these lines get copied verbatim.
 *
 * An unquoted `analyze Refund refused on a faulty laptop` splits into a dispute titled "Refund"
 * with the content "refused" and silently drops the rest — mock hides that behind a canned panel,
 * and mainnet spends a dollar analysing it. A title-only example fails outright, because content is
 * required whether it comes from argv or from stdin.
 */
const EXAMPLE_DISPUTE = {
  title: '"Refund refused on a faulty laptop"',
  content: '"Bought on 3 March, screen failed in May, retailer blamed accidental damage."',
} as const

/**
 * Show a live count of the panel filling in, for a human watching a real analysis run.
 *
 * On **stderr**, always: stdout carries either the panel or the structured envelope, and a progress
 * line landing in the middle of piped JSON corrupts it. Gated on stderr being a terminal so that
 * `2> log` collects a log rather than a flipbook, and so a caller redirecting both streams gets
 * neither surprise.
 */
function terminalProgress(): ProgressListener | undefined {
  if (!process.stderr.isTTY) return undefined
  return ({ progress, total, message }) => {
    const count = total === undefined ? `${progress}` : `${progress}/${total}`
    process.stderr.write(`  ${count}  ${message ?? 'analysing'}\n`)
  }
}

export const cli = Cli.create('ask-trivium', {
  version: VERSION,
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
    panel: z
      .boolean()
      .optional()
      .describe(
        'Print the rendered panel even when output is piped or redirected. Without it, a ' +
          'non-terminal stdout is assumed to be an agent and gets the structured envelope ' +
          'instead. An explicit --format or --json wins over this.',
      ),
  }),
  output: PanelResponse,
  // The panel is rendered for humans by hand below; letting incur also dump the payload would
  // print it twice. Agents still get the full structured envelope via --json.
  outputPolicy: 'agent-only',
  usage: [
    { args: { title: true, content: true } },
    { args: { title: true, content: true }, options: { mode: true } },
    { prefix: 'cat complaint.txt |', args: { title: true } },
  ],
  examples: [
    {
      args: EXAMPLE_DISPUTE,
      options: { mode: 'mock' },
      description: 'See a canned example panel — free, offline, no backend',
    },
    {
      args: EXAMPLE_DISPUTE,
      options: { mode: 'mainnet' },
      description: 'Run a real analysis of your own dispute and pay $1 USDC',
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
      const result = await analyze(
        {
          title: c.args.title,
          content,
          mode: c.options.mode,
          idempotency_key: c.options.idempotencyKey,
        },
        { onProgress: terminalProgress() },
      )
      const rendered = `${renderPanel(result)}\n`

      // `--panel` is the explicit half of a selector that is otherwise invisible: the machine form
      // can be forced with `--format json`, and without this the human form could only be reached
      // by having a terminal attached. Exit here rather than falling through, so `--panel | less`
      // shows the panel alone and not the panel followed by the envelope.
      //
      // A caller who names a machine format outright has asked for something more specific than
      // "I am a human", so `--format` wins the contradiction — the same precedence incur itself
      // uses when an explicit `--format` overrides an attached terminal. Silently dropping either
      // half of `--panel --format json` would be worse; this at least drops the vaguer one.
      //
      // `formatExplicit` rather than a check on `--format`, because incur accepts `--json` as an
      // undocumented alias for `--format json` and sets this for both. Testing the flag by name
      // would let `--panel --json` through with the panel winning, which is the same silent drop.
      if (c.options.panel && !c.formatExplicit) {
        await writeFlushed(rendered)
        process.exit(0)
      }

      if (!c.agent) process.stdout.write(rendered)
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
