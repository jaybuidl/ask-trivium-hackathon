/**
 * The human CLI driven the way a cold reader actually drives it: a real subprocess with a piped
 * stdout.
 *
 * These are the four cold-start traps from ticket 02, pinned as tests. Every one of them is
 * invisible once you know the answer, which is exactly why they belong here rather than only in the
 * README — a README can drift away from the binary, a subprocess test cannot.
 *
 * Note that a spawned process never has a TTY on stdout, so every case below is the *piped* path.
 * That is the point: it is the path nobody tests by hand and the one the README's readers hit.
 */
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { cellCount } from './cli.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

type Run = { stdout: string; stderr: string; code: number }

/** Run the CLI as a subprocess with stdin closed, so a missing argument fails instead of hanging. */
async function run(args: string[], env: Record<string, string> = {}): Promise<Run> {
  const child = spawn(resolve(root, 'node_modules/.bin/tsx'), [resolve(root, 'src/bin.ts'), ...args], {
    cwd: root,
    // A cold reader's environment does not have ASK_TRIVIUM_MODE set, and neither does this test.
    env: { PATH: process.env['PATH'] ?? '', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (c) => {
    stdout += String(c)
  })
  child.stderr.on('data', (c) => {
    stderr += String(c)
  })
  const code = await new Promise<number>((ok) => child.on('close', (c) => ok(c ?? 0)))
  return { stdout, stderr, code }
}

const dispute = ['Warranty repair refused', 'The retailer refused to repair a failing screen.']

describe('trap 3 — piping changes the output format', () => {
  it('gives an agent the structured envelope when stdout is piped', async () => {
    const { stdout, code } = await run(['analyze', ...dispute])
    expect(code).toBe(0)
    // The machine form: flat keys, no rendering. This is deliberate and is what an agent shelling
    // out to the CLI needs; the test exists so that changing it is a decision, not an accident.
    expect(stdout).toMatch(/decision: user_wins/)
    expect(stdout).not.toMatch(/VERDICT/)
  }, 30_000)

  it('gives a human the rendered panel through a pipe when --panel asks for it', async () => {
    const { stdout, code } = await run(['analyze', ...dispute, '--panel'])
    expect(code).toBe(0)
    expect(stdout).toMatch(/VERDICT/)
    expect(stdout).toMatch(/THE PANEL/)
  }, 30_000)

  it('prints the panel INSTEAD of the envelope, not on top of it', async () => {
    // Without this, `--panel | less` shows the rendering followed by a wall of TOON, which is a
    // worse first contact than the surprise the flag exists to fix.
    const { stdout } = await run(['analyze', ...dispute, '--panel'])
    expect(stdout).not.toMatch(/^decision: /m)
    expect(stdout).not.toMatch(/panel\[9\]/)
  }, 30_000)

  it('flushes the whole panel down a pipe, including the last line', async () => {
    // Exiting the process early truncates a piped write on Node unless the write is flushed first.
    // The settlement line is the last thing rendered, so its absence is how that bug would show up.
    const { stdout } = await run(['analyze', ...dispute, '--panel'])
    expect(stdout).toMatch(/NOT CHARGED/)
    expect(stdout.match(/confidence (high|medium|low)/g)).toHaveLength(9)
  }, 30_000)
})

describe('trap 2 — content is required, and the failure must say both ways to give it', () => {
  it('names the argument and the stdin form when content is missing', async () => {
    const { stdout, stderr, code } = await run(['analyze', 'A title on its own'])
    expect(code).not.toBe(0)
    const output = stdout + stderr
    expect(output).toMatch(/NO_DISPUTE_CONTENT/)
    expect(output).toMatch(/second argument/)
    expect(output).toMatch(/stdin/)
  }, 30_000)
})

describe('trap 4 — a misspelled mode names the modes that exist', () => {
  it('lists all three modes when --mode is misspelled', async () => {
    const { stdout, stderr, code } = await run(['analyze', ...dispute, '--mode', 'mocck'])
    expect(code).not.toBe(0)
    const output = stdout + stderr
    expect(output).toMatch(/mock/)
    expect(output).toMatch(/testnet/)
    expect(output).toMatch(/mainnet/)
  }, 30_000)

  it('lists all three modes when ASK_TRIVIUM_MODE is misspelled', async () => {
    const { stdout, stderr, code } = await run(['analyze', ...dispute], {
      ASK_TRIVIUM_MODE: 'production',
    })
    expect(code).not.toBe(0)
    const output = stdout + stderr
    expect(output).toMatch(/ASK_TRIVIUM_MODE/)
    expect(output).toMatch(/mock, testnet, mainnet/)
  }, 30_000)
})

describe('naming both output forms at once', () => {
  it('lets an explicit --format win over --panel, rather than silently dropping it', async () => {
    // These two contradict, and whichever loses must lose visibly. `--format` names an exact
    // encoding; `--panel` only says "a human is reading", so the specific request wins — the same
    // precedence incur applies when an explicit --format overrides an attached terminal.
    const { stdout, code } = await run(['analyze', ...dispute, '--panel', '--format', 'json'])
    expect(code).toBe(0)
    expect(JSON.parse(stdout)).toMatchObject({ mode: 'mock', analysesCompleted: 9 })
    expect(stdout).not.toMatch(/VERDICT/)
  }, 30_000)

  it('applies that precedence to --json too, in either order', async () => {
    // `--json` is an undocumented incur alias for `--format json` — absent from --help, but it sets
    // the same `formatExplicit` the precedence above keys on. Pinned because the alias is the
    // shorter thing a caller reaches for, and because incur could drop it without telling us.
    for (const args of [
      ['--panel', '--json'],
      ['--json', '--panel'],
    ]) {
      const { stdout, code } = await run(['analyze', ...dispute, ...args])
      expect(code).toBe(0)
      expect(JSON.parse(stdout)).toMatchObject({ mode: 'mock' })
      expect(stdout).not.toMatch(/VERDICT/)
    }
  }, 30_000)
})

describe('the help text a cold reader copies from', () => {
  it('quotes multi-word arguments in every example, so a copied line runs as written', async () => {
    // An unquoted example silently splits into the wrong positionals: `analyze Refund refused on a
    // faulty laptop` analyses a dispute titled "Refund" with content "refused" and drops the rest.
    // In mock mode the canned panel hides it; in mainnet it costs a dollar to analyse nonsense.
    const { stdout } = await run(['analyze', '--help'])
    // Only the Examples block. The Usage block above it uses <placeholders>, which nobody copies
    // verbatim and which would not be clearer quoted.
    const examples = (stdout.split(/^Examples:$/m)[1] ?? '')
      .split(/\n\s*\n/)[0]!
      .split('\n')
      .filter((line) => line.includes('ask-trivium analyze'))
    expect(examples.length).toBeGreaterThan(0)
    for (const line of examples) {
      // Strip the trailing `# description` comment before checking the command itself.
      const command = line.split('#')[0] ?? ''
      const positionals = command.replace(/^\s*(cat \S+ \| )?ask-trivium analyze\s*/, '')
      const words = positionals.replace(/"[^"]*"/g, '').replace(/--\S+(\s+\S+)?/g, '')
      expect(words.trim()).toBe('')
    }
  }, 30_000)
})

/**
 * The one piece of this module worth testing in-process rather than through a subprocess: the
 * progress line only renders when stderr is a TTY, and a spawned test process never has one.
 */
describe('the progress count a human watches', () => {
  it('shows whole analyses, not the cadence between them', () => {
    // §3 fixes `total` at nine while requiring `progress` to rise with *every* notification, so
    // the backend moves a fraction of the way towards the next cell when it emits on a cadence
    // rather than because a cell landed. Printed raw that reads `2.3333333333333335/9` at the
    // exact moment a judge is watching the terminal.
    expect(cellCount(2.3333333333333335)).toBe(2)
    expect(cellCount(0.5)).toBe(0)
    expect(cellCount(9)).toBe(9)
  })
})
