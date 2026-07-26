#!/usr/bin/env node
/**
 * Entry point for both roles.
 *
 * `--mcp` is intercepted before the CLI framework loads, because the bridge's MCP surface is
 * hand-rolled rather than generated: the wire contract is specific about what `tools/call` returns
 * (a human rendering in `content` alongside the structured payload, §2) and about progress
 * notifications carrying `{ progress, total: 9, message }` on both legs (§3). A generated MCP
 * surface gives neither.
 */
import { errorMessage } from './errors.js'
import { startStdioServer } from './mcp.js'

if (process.argv.includes('--mcp')) {
  try {
    await startStdioServer()
  } catch (error) {
    // stderr, never stdout — stdout is the JSON-RPC channel, and a stray byte there desynchronises
    // the agent's parser. A misconfigured bridge should report "not configured" before a dispute
    // has been typed, rather than "the analysis failed" after one has.
    process.stderr.write(`ask-trivium could not start: ${errorMessage(error)}\n`)
    process.exit(1)
  }
} else {
  const { cli } = await import('./cli.js')
  cli.serve()
}
