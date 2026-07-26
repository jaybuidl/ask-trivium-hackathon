/**
 * Mode dispatch: turn a validated dispute into a panel.
 *
 * The one place that decides where a panel comes from. Mock is served here from the embedded
 * fixture, entirely offline; the paying modes cross to the deployed backend through `backend.ts`.
 * Both return the same `PanelResponse` to the same renderer — the split is in where the data comes
 * from, never in what the caller gets back.
 */
import { callBackend, type ProgressListener } from './backend.js'
import { AnalyzeDisputeInput, MODES, type Mode, type PanelResponse } from './contract.js'
import { MOCK_PANEL } from './fixture.js'

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

export type AnalyzeOptions = {
  /** The mode this server was registered with, normally `process.env.ASK_TRIVIUM_MODE`. */
  envMode?: string | undefined
  /** The backend URL, normally `process.env.ASK_TRIVIUM_ENDPOINT`. Ignored in mock. */
  endpoint?: string | undefined
  /**
   * Called for each progress notification from the backend. Never fires in mock, which has no
   * work to report on: it returns in microseconds and a progress bar for it would be theatre.
   */
  onProgress?: ProgressListener | undefined
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
    // Returned before anything touches the endpoint or the network — the offline guarantee is this
    // early return and nothing else (ADR-0012). Structurally cloned so a caller mutating the result
    // cannot poison the next call.
    return structuredClone(MOCK_PANEL)
  }

  return callBackend(
    {
      title: input.title,
      content: input.content,
      mode,
      idempotency_key: input.idempotency_key,
    },
    {
      // Forwarded by key rather than spread, so adding an option to `AnalyzeOptions` cannot
      // accidentally start meaning something to the backend call. Passed straight through when
      // absent: `callBackend` owns the endpoint / environment / default order, and second-guessing
      // it here is what would make one caller quietly ignore `ASK_TRIVIUM_ENDPOINT`.
      endpoint: options.endpoint,
      onProgress: options.onProgress,
    },
  )
}
