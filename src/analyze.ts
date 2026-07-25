/**
 * Mode dispatch: turn a validated dispute into a panel.
 *
 * Mock is served here, entirely from the embedded fixture. The paying modes are wired up in
 * ticket 04 and currently fail hard — deliberately, and see `UnavailableError` below.
 */
import { AnalyzeDisputeInput, MODES, type Mode, type PanelResponse } from './contract.js'
import { MOCK_PANEL } from './fixture.js'

/**
 * A paying mode could not be served.
 *
 * This is always an error and never a quiet downgrade to mock. A paying caller receiving fixture
 * data and believing it to be analysis is the one unrecoverable trust failure in this product
 * (ADR-0012, wire contract §6), so every path that cannot reach the backend ends up here.
 */
export class UnavailableError extends Error {
  override readonly name = 'UnavailableError'
  constructor(message: string) {
    super(message)
  }
}

/**
 * Resolve which mode a call runs in: an explicit per-call value wins, else the mode this server was
 * registered with, else mock (ADR-0011).
 *
 * Mock is the default because an agent that reaches for mainnet on its own spends a real dollar.
 */
export function resolveMode(explicit: Mode | undefined, env: string | undefined): Mode {
  if (explicit) return explicit
  if (env === undefined || env === '') return 'mock'
  if ((MODES as readonly string[]).includes(env)) return env as Mode
  throw new Error(
    `ASK_TRIVIUM_MODE is set to ${JSON.stringify(env)}, which is not a mode. ` +
      `Expected one of: ${MODES.join(', ')}.`,
  )
}

/** The message to show a caller for a thrown value, whatever was thrown. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export type AnalyzeOptions = {
  /** The mode this server was registered with, normally `process.env.ASK_TRIVIUM_MODE`. */
  envMode?: string | undefined
}

/**
 * Analyse a dispute. Validates the input against the wire contract first, so a bad request fails
 * identically in every mode and before any payment could be requested (§4).
 */
export async function analyze(raw: unknown, options: AnalyzeOptions = {}): Promise<PanelResponse> {
  // `in` rather than `??`, so a caller passing `{ envMode: undefined }` explicitly means "no
  // registration default" instead of silently falling through to the ambient environment. Tests
  // rely on that to stay independent of whatever ASK_TRIVIUM_MODE happens to be set to.
  const envMode = 'envMode' in options ? options.envMode : process.env['ASK_TRIVIUM_MODE']
  const input = AnalyzeDisputeInput.parse(raw)
  const mode = resolveMode(input.mode, envMode)

  if (mode === 'mock') {
    // Structurally cloned so a caller mutating the result cannot poison the next call.
    return structuredClone(MOCK_PANEL)
  }

  throw new UnavailableError(
    `Mode "${mode}" is not available in this build: the connection to the Trivium backend is not ` +
      `wired up yet. This call was NOT charged and no analysis was run. ` +
      `Use mode: "mock" for a complete offline example panel.`,
  )
}
