import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_ENDPOINT, callBackend, resolveEndpoint } from './backend.js'
import {
  REMOTE_MARKER,
  closedEndpoint,
  remotePanel,
  startFakeBackend,
  type FakeBackend,
  type ProgressStep,
} from './backend.testkit.js'
import { PANEL_SIZE } from './contract.js'

const dispute = {
  title: 'Airline refused compensation for a cancelled flight',
  content: 'Flight cancelled four hours before departure; the airline refused to pay.',
} as const

let backend: FakeBackend | undefined
afterEach(async () => {
  await backend?.close()
  backend = undefined
})

describe('resolveEndpoint', () => {
  it('defaults to the deployed backend, so a judge is never told a URL', () => {
    expect(resolveEndpoint(undefined).toString()).toBe(DEFAULT_ENDPOINT)
    expect(DEFAULT_ENDPOINT).toMatch(/^https:\/\//)
  })

  it('takes the environment override, so a dead deployment can be swapped mid-demo', () => {
    expect(resolveEndpoint('https://elsewhere.example/mcp').toString()).toBe(
      'https://elsewhere.example/mcp',
    )
  })

  it('treats an empty value as unset rather than as an unusable URL', () => {
    expect(resolveEndpoint('').toString()).toBe(DEFAULT_ENDPOINT)
  })

  it('rejects a value that is not a URL, naming the variable that carries it', () => {
    expect(() => resolveEndpoint('not-a-url')).toThrow(/ASK_TRIVIUM_ENDPOINT/)
  })

  it('rejects a host and port with the scheme left off', () => {
    // The likeliest typo, and the one `new URL` does not catch: it reads this as the scheme
    // `localhost:` with the path `8080` and returns a URL nothing can connect to.
    expect(() => resolveEndpoint('localhost:8080')).toThrow(/ASK_TRIVIUM_ENDPOINT/)
    expect(() => resolveEndpoint('ask-trivium-mcp.fly.dev/mcp')).toThrow(/ASK_TRIVIUM_ENDPOINT/)
  })

  it('rejects a scheme that Streamable HTTP cannot speak', () => {
    expect(() => resolveEndpoint('ws://localhost:8080/mcp')).toThrow(/http/)
    expect(() => resolveEndpoint('file:///tmp/mcp')).toThrow(/http/)
  })
})

describe('callBackend against a real HTTP MCP server', () => {
  it('returns the panel the backend computed, validated against the wire schema', async () => {
    backend = await startFakeBackend()
    const result = await callBackend({ ...dispute, mode: 'mainnet' }, { endpoint: backend.url })

    expect(result.panel).toHaveLength(PANEL_SIZE)
    expect(result.decision).toBe('escalate')
    expect(result.mode).toBe('mainnet')
    // The panel came off the wire, not out of the embedded fixture.
    expect(result.rationale).toContain(REMOTE_MARKER)
  })

  it('sends the resolved mode on the wire, which the backend requires', async () => {
    backend = await startFakeBackend()
    await callBackend({ ...dispute, mode: 'testnet' }, { endpoint: backend.url })

    expect(backend.calls).toHaveLength(1)
    expect(backend.calls[0]?.mode).toBe('testnet')
    expect(backend.calls[0]?.title).toBe(dispute.title)
    expect(backend.calls[0]?.content).toBe(dispute.content)
  })

  it('passes an idempotency key through, so a retry is not a second payment', async () => {
    backend = await startFakeBackend()
    const key = '3f1a7c88-2d64-4a1e-9b6f-0c5d8e2a4b71'
    await callBackend(
      { ...dispute, mode: 'mainnet', idempotency_key: key },
      { endpoint: backend.url },
    )

    expect(backend.calls[0]?.idempotency_key).toBe(key)
  })

  it('omits the key entirely when there is none, rather than sending an empty one', async () => {
    backend = await startFakeBackend()
    await callBackend({ ...dispute, mode: 'mainnet' }, { endpoint: backend.url })

    expect(backend.calls[0]).not.toHaveProperty('idempotency_key')
  })
})

/**
 * Wire contract §3: progress is a hard requirement on both legs. This is the outbound one — the
 * bridge's own client receiving what the backend emits. `remote.test.ts` covers the other half,
 * where the same notifications have to reach the agent.
 */
describe('progress on the outbound leg', () => {
  const steps: ProgressStep[] = [
    { progress: 1, total: PANEL_SIZE, message: 'stand-in-model-a · strict' },
    { progress: 2, total: PANEL_SIZE, message: 'stand-in-model-a · consumer-aware' },
    { progress: 3, total: PANEL_SIZE, message: 'stand-in-model-a · precedent-focused' },
  ]

  it('forwards every notification the backend emits to its listener', async () => {
    backend = await startFakeBackend({ progress: steps })
    const seen: ProgressStep[] = []
    await callBackend(
      { ...dispute, mode: 'mainnet' },
      { endpoint: backend.url, onProgress: (e) => seen.push(e) },
    )

    expect(seen.map((e) => e.progress)).toEqual([1, 2, 3])
    expect(seen[0]?.total).toBe(PANEL_SIZE)
    expect(seen[0]?.message).toContain('strict')
  })

  it('completes normally when nobody is listening for progress', async () => {
    backend = await startFakeBackend({ progress: steps })
    const result = await callBackend({ ...dispute, mode: 'mainnet' }, { endpoint: backend.url })

    expect(result.panel).toHaveLength(PANEL_SIZE)
  })

  it('survives a call held open past its timeout, because progress resets it', async () => {
    // A unit test cannot wait out 90s, but it does not have to: what has to hold is that the
    // request outlives a window *shorter than the call*, which happens only if the notifications
    // are resetting it. Three notifications ~150ms apart, plus a fourth wait before the response,
    // against a 400ms window.
    //
    // Deliberately with no listener attached. That is the case that breaks: the SDK looks up a
    // progress handler before resetting anything, so a call nobody is watching keeps
    // `resetTimeoutOnProgress` and silently loses it. Passing a listener here would test the easy
    // half and leave the CLI's plain `analyze` — which has none — unprotected.
    backend = await startFakeBackend({ progress: steps, stepDelayMs: 150 })
    const result = await callBackend(
      { ...dispute, mode: 'mainnet' },
      { endpoint: backend.url, timeoutMs: 400 },
    )

    expect(result.panel).toHaveLength(PANEL_SIZE)
  })
})

/**
 * Wire contract §6 / ADR-0012. Every one of these must end as a refusal, never as fixture data
 * wearing a paying mode's label.
 */
describe('callBackend fails hard rather than falling back to mock', () => {
  it('fails when nothing is listening, naming mock as the working path', async () => {
    const endpoint = await closedEndpoint()
    await expect(callBackend({ ...dispute, mode: 'mainnet' }, { endpoint })).rejects.toThrow(/mock/)
  })

  it('says plainly that an unreachable backend charged nobody', async () => {
    const endpoint = await closedEndpoint()
    await expect(callBackend({ ...dispute, mode: 'mainnet' }, { endpoint })).rejects.toThrow(
      /NOT charged/i,
    )
  })

  it('never leaks the embedded fixture into a failure message', async () => {
    const endpoint = await closedEndpoint()
    await expect(callBackend({ ...dispute, mode: 'mainnet' }, { endpoint })).rejects.not.toThrow(
      /failing screen/,
    )
  })

  it('fails when the backend reports the call as an error', async () => {
    backend = await startFakeBackend({ toolError: 'Payment required: 1000000 atomic units' })
    await expect(
      callBackend({ ...dispute, mode: 'mainnet' }, { endpoint: backend.url }),
    ).rejects.toThrow(/Payment required/)
  })

  it('fails when the payload does not satisfy the wire schema', async () => {
    backend = await startFakeBackend({ payload: () => ({ decision: 'user_wins' }) })
    await expect(
      callBackend({ ...dispute, mode: 'mainnet' }, { endpoint: backend.url }),
    ).rejects.toThrow(/schema|shape|contract/i)
  })

  it('fails when the backend sends no structured payload at all', async () => {
    backend = await startFakeBackend({ payload: () => undefined })
    await expect(
      callBackend({ ...dispute, mode: 'mainnet' }, { endpoint: backend.url }),
    ).rejects.toThrow()
  })

  it('fails when the payload is labelled with a mode other than the one that ran', async () => {
    // The lie that matters: a caller who asked for mainnet being handed something stamped `mock`.
    // `mode` in the payload is where honesty about real-vs-canned lives (§2), so a payload that
    // disagrees with the call is not repairable by relabelling it.
    backend = await startFakeBackend({ payload: () => remotePanel('mock') })
    await expect(
      callBackend({ ...dispute, mode: 'mainnet' }, { endpoint: backend.url }),
    ).rejects.toThrow(/mode/i)
  })

  it('refuses to put mock on the wire at all', async () => {
    backend = await startFakeBackend()
    await expect(
      // @ts-expect-error mock is excluded from the request type — this is the runtime backstop.
      callBackend({ ...dispute, mode: 'mock' }, { endpoint: backend.url }),
    ).rejects.toThrow(/mock/)
    expect(backend.calls).toHaveLength(0)
  })
})
