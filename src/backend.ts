/**
 * The outbound leg: this bridge, as an MCP client, talking to the deployed Trivium backend.
 *
 * `mcp.ts` is the inbound half — the agent connects to it over stdio. This is the other half, and
 * together they are what makes this a bridge rather than one end of one. Everything here concerns
 * getting a `PanelResponse` off the wire and refusing to invent one; the rendering of that response
 * is `render.ts`'s job, and is deliberately identical whether the panel arrived from here or from
 * the embedded fixture. A second rendering path would mean the seam was cut in the wrong place.
 *
 * Payment is not here yet (ticket 06). Wire contract §5 puts it *inside* the JSON-RPC layer as a
 * client-side wrapper around this call, so it lands as a wrapper around the `Client` below rather
 * than as a rewrite of it.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { PanelResponse, type Mode } from './contract.js'
import { errorMessage, unavailable } from './errors.js'
import { VERSION } from './version.js'

/**
 * Where the panel comes from unless told otherwise.
 *
 * A default, not a required setting: someone running `npx ask-trivium` should never have to be
 * handed a URL first. The override exists so that deployment dying does not end a demo.
 */
export const DEFAULT_ENDPOINT = 'https://ask-trivium-mcp.fly.dev/mcp'

/** The environment variable that overrides it. */
export const ENDPOINT_ENV_VAR = 'ASK_TRIVIUM_ENDPOINT'

/**
 * How long to wait with no word from the backend before giving up, in ms.
 *
 * This is a gap-between-notifications budget, not a total: `resetTimeoutOnProgress` restarts it
 * every time progress arrives, and the backend emits every 5–10s regardless of whether a cell
 * landed (§3). The SDK's own default is 60s, which is under this call's p95 of ~180s — copying it
 * is the documented way to have nine analyses succeed and the client hang up before they arrive.
 */
export const DEFAULT_TIMEOUT_MS = 90_000

/**
 * The ceiling `resetTimeoutOnProgress` cannot push past, in ms.
 *
 * Without it, a backend that keeps emitting progress and never finishes holds the caller forever.
 * Set above the ~180s worst case with room to spare, because cutting off a call that was about to
 * return means the caller may have paid for a panel they will never see.
 */
export const MAX_TOTAL_TIMEOUT_MS = 420_000

/** §3's notification payload, as it reaches a listener. */
export type ProgressEvent = {
  progress: number
  total?: number | undefined
  message?: string | undefined
}

export type ProgressListener = (event: ProgressEvent) => void

/**
 * A call to the backend.
 *
 * `mode` is required and cannot be `mock`: mock is served entirely by the bridge and never reaches
 * the backend (ADR-0012), and the backend's own schema requires the field (§1). The bridge has
 * already resolved it by the time a request gets here.
 */
export type BackendRequest = {
  title: string
  content: string
  mode: Exclude<Mode, 'mock'>
  idempotency_key?: string | undefined
}

export type BackendCallOptions = {
  /** Overrides `ASK_TRIVIUM_ENDPOINT`. */
  endpoint?: string | undefined
  /** Called for every progress notification the backend emits. */
  onProgress?: ProgressListener | undefined
  /** Overrides {@link DEFAULT_TIMEOUT_MS}. Tests use it; nothing else should need to. */
  timeoutMs?: number | undefined
}

/**
 * Resolve the endpoint from an environment value, falling back to the deployment.
 *
 * Parsed rather than passed through as a string, so `ASK_TRIVIUM_ENDPOINT=localhost:3000` fails
 * here — naming the variable — instead of surfacing later as an unexplained connection error.
 */
export function resolveEndpoint(env: string | undefined): URL {
  const raw = env === undefined || env === '' ? DEFAULT_ENDPOINT : env
  const reject = () => {
    throw new Error(
      `${ENDPOINT_ENV_VAR} is set to ${JSON.stringify(raw)}, which is not an http(s) URL. ` +
        `Expected something like ${DEFAULT_ENDPOINT}.`,
    )
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return reject()
  }

  // The protocol check is the load-bearing half. `new URL` accepts `localhost:8080` quite happily —
  // as the scheme `localhost:` with path `8080` — so a forgotten `http://`, which is the likeliest
  // way to mistype this, parses cleanly and then fails much later as an unexplained transport
  // error. Streamable HTTP is http(s) or nothing.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return reject()
  return url
}

/**
 * Run one analysis against the backend and return the panel it computed.
 *
 * Every failure below leaves by the same door — `UnavailableError` — because from the caller's
 * position, "the host is down", "the response was malformed" and "the backend refused" are the same
 * event: no panel, no charge, and mock is the way to see one. The alternative, a partial or guessed
 * result, is the failure mode this whole product cannot survive (§6).
 */
export async function callBackend(
  request: BackendRequest,
  options: BackendCallOptions = {},
): Promise<PanelResponse> {
  const { mode } = request

  // A runtime backstop under a type-level guarantee. Mock reaching the wire would mean the offline
  // promise had quietly become a network call, so it is worth catching even where the types say it
  // cannot happen — this is the kind of thing a stray `as Mode` reintroduces.
  if ((mode as Mode) === 'mock') {
    throw new Error(
      'mock never reaches the backend: it is served from the embedded fixture (ADR-0012). ' +
        'Reaching this line means mode dispatch has a hole in it.',
    )
  }

  // The single place the endpoint is decided: an explicit option, else the environment, else the
  // default. Callers forward `endpoint` straight through without deciding anything themselves —
  // the resolution rule living in two files is how one of them ends up ignoring the variable.
  const endpoint = resolveEndpoint(options.endpoint ?? process.env[ENDPOINT_ENV_VAR])
  const client = new Client({ name: 'ask-trivium-bridge', version: VERSION })

  try {
    try {
      await client.connect(new StreamableHTTPClientTransport(endpoint))
    } catch (error) {
      throw unavailable(
        mode,
        `the Trivium backend at ${endpoint.href} could not be reached (${errorMessage(error)}).`,
      )
    }

    const result = await callTool(client, request, options)

    // An `isError` result is a normal tool result, not a transport failure — which is also how a
    // `PaymentRequired` will arrive once §5 is wired up. Surfacing the backend's own words matters:
    // "payment required" and "the models are down" need different things from the caller.
    if (result.isError) {
      throw unavailable(mode, `the Trivium backend refused the call: ${resultText(result)}.`)
    }

    const parsed = PanelResponse.safeParse(result.structuredContent)
    if (!parsed.success) {
      throw unavailable(
        mode,
        `the Trivium backend returned a payload that does not match the wire contract's schema ` +
          `(${parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}).`,
      )
    }

    // §2 puts the tier in the payload precisely so a caller can relay "this was real" without
    // reading terminal chrome. A payload disagreeing with the call makes that field untrustworthy,
    // and relabelling it here would be the bridge asserting something it did not witness.
    if (parsed.data.mode !== mode) {
      throw unavailable(
        mode,
        `the Trivium backend labelled the panel "${parsed.data.mode}", which is not the mode this ` +
          `call ran in. The panel is being discarded rather than shown under the wrong tier.`,
      )
    }

    return parsed.data
  } finally {
    // Best-effort: the panel is already in hand by this point, and a socket that will not close
    // tidily is not a reason to fail a call that succeeded.
    await client.close().catch(() => {})
  }
}

/** The `tools/call` itself, kept separate so the timeout policy reads in one piece. */
async function callTool(
  client: Client,
  request: BackendRequest,
  options: BackendCallOptions,
): Promise<Awaited<ReturnType<Client['callTool']>>> {
  const { onProgress } = options
  try {
    return await client.callTool(
      {
        name: 'analyze_dispute',
        // Spread rather than naming the key, so an absent idempotency key is an absent field
        // rather than an explicit `undefined` — the backend's schema validates the difference.
        arguments: {
          title: request.title,
          content: request.content,
          mode: request.mode,
          ...(request.idempotency_key === undefined
            ? {}
            : { idempotency_key: request.idempotency_key }),
        },
      },
      undefined,
      {
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxTotalTimeout: MAX_TOTAL_TIMEOUT_MS,
        resetTimeoutOnProgress: true,
        // Registered unconditionally, even with nobody listening. `resetTimeoutOnProgress` is not
        // self-sufficient: the SDK looks up a progress handler first and bails out before the reset
        // if there is none, so a call made without a listener keeps the flag and loses the
        // behaviour — and times out at 90s on exactly the long analyses the flag exists for. The
        // listener is optional; registering is not.
        onprogress: (p) => onProgress?.({ progress: p.progress, total: p.total, message: p.message }),
      },
    )
  } catch (error) {
    throw unavailable(
      request.mode,
      `the call to the Trivium backend did not complete (${errorMessage(error)}).`,
    )
  }
}

/** The backend's own error text, for passing on verbatim. */
function resultText(result: object): string {
  const raw = 'content' in result ? result.content : undefined
  const content = Array.isArray(raw) ? raw : []
  const text = content
    .map((part: unknown) =>
      typeof part === 'object' && part !== null && 'text' in part ? String(part.text) : '',
    )
    .filter(Boolean)
    .join(' ')
  return text || 'no reason given'
}
