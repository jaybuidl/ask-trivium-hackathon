import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { analyze, resolveMode } from './analyze.js'
import {
  REMOTE_MARKER,
  closedEndpoint,
  startFakeBackend,
  type FakeBackend,
} from './backend.testkit.js'
import { PanelResponse } from './contract.js'
import { MOCK_DISPUTE_TITLE, MOCK_PANEL } from './fixture.js'

const dispute = {
  title: 'Airline refused compensation for a cancelled flight',
  content: 'My flight was cancelled four hours before departure and the airline refused to pay.',
}

describe('resolveMode', () => {
  it('defaults to mock when nothing is configured', () => {
    expect(resolveMode(undefined, undefined)).toBe('mock')
  })

  it('takes the registration environment when no per-call value is given', () => {
    expect(resolveMode(undefined, 'mainnet')).toBe('mainnet')
  })

  it('lets an explicit per-call value win over the environment', () => {
    expect(resolveMode('mock', 'mainnet')).toBe('mock')
    expect(resolveMode('mainnet', 'mock')).toBe('mainnet')
  })

  it('rejects an unreadable environment value rather than guessing', () => {
    expect(() => resolveMode(undefined, 'production')).toThrow(/ASK_TRIVIUM_MODE/)
  })
})

describe('analyze in mock mode', () => {
  it('returns a complete nine-cell panel', async () => {
    const result = await analyze({ ...dispute, mode: 'mock' })
    expect(result.panel).toHaveLength(9)
    expect(result.analysesCompleted).toBe(9)
    expect(result.analysesRequested).toBe(9)
  })

  it('returns a payload that validates against the wire schema', async () => {
    const result = await analyze({ ...dispute, mode: 'mock' })
    expect(() => PanelResponse.parse(result)).not.toThrow()
  })

  it('says in the payload that it was mock and unpaid', async () => {
    const result = await analyze({ ...dispute, mode: 'mock' })
    expect(result.mode).toBe('mock')
    expect(result.settled).toBe(false)
    expect(result.settlementTx).toBeUndefined()
  })

  it('covers all three personas across three models', async () => {
    const { panel } = await analyze({ ...dispute, mode: 'mock' })
    const personas = new Set(panel.map((c) => c.persona))
    const models = new Set(panel.map((c) => c.model))
    expect(personas).toEqual(new Set(['strict', 'consumer-aware', 'precedent-focused']))
    expect(models.size).toBe(3)
  })

  it('does not echo the submitted dispute back — the canned panel is its own case', async () => {
    const result = await analyze({ ...dispute, mode: 'mock' })
    expect(JSON.stringify(result)).not.toContain('Airline')
    expect(MOCK_DISPUTE_TITLE).not.toContain('Airline')
  })

  it('hands out a fresh copy, so one caller cannot poison the next', async () => {
    const first = await analyze({ ...dispute, mode: 'mock' })
    first.panel[0]!.reasoning = 'tampered'
    first.decision = 'company_wins'
    const second = await analyze({ ...dispute, mode: 'mock' })
    expect(second.panel[0]!.reasoning).not.toBe('tampered')
    expect(second.decision).toBe(MOCK_PANEL.decision)
  })

  it('applies the registration default when no mode is given', async () => {
    const result = await analyze(dispute, { envMode: undefined })
    expect(result.mode).toBe('mock')
  })
})

/**
 * ADR-0012 property 1: mock is fully offline. A mock that fetches anything shares the failure mode
 * of the thing it insures against, so this guards the promise against a future edit rather than
 * trusting that nobody adds a network call.
 */
describe('mock makes no network call of any kind', () => {
  const fetchSpy = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchSpy)
    fetchSpy.mockClear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('never reaches for the network', async () => {
    await analyze({ ...dispute, mode: 'mock' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('still works when the network is unavailable', async () => {
    fetchSpy.mockRejectedValue(new Error('offline'))
    const result = await analyze({ ...dispute, mode: 'mock' })
    expect(result.panel).toHaveLength(9)
  })
})

describe('analyze input validation', () => {
  it('rejects an empty title', async () => {
    await expect(analyze({ ...dispute, title: '', mode: 'mock' })).rejects.toThrow()
  })

  it('rejects content beyond the 50k ceiling', async () => {
    await expect(
      analyze({ ...dispute, content: 'x'.repeat(50_001), mode: 'mock' }),
    ).rejects.toThrow()
  })

  it('rejects an unknown mode', async () => {
    await expect(analyze({ ...dispute, mode: 'staging' })).rejects.toThrow()
  })
})

/**
 * These predate ticket 04, when a paying mode failed because nothing was wired up. The wire is in
 * now, so the failure has to be manufactured — an endpoint nothing answers on — but the assertions
 * are unchanged on purpose. They describe the promise, not the reason it is being kept
 * (ADR-0012, wire contract §6), and they should go on passing untouched when payment lands too.
 */
describe('paying modes never fall back to mock', () => {
  let endpoint: string
  beforeAll(async () => {
    endpoint = await closedEndpoint()
  })

  for (const mode of ['testnet', 'mainnet'] as const) {
    it(`fails hard in ${mode} rather than serving fixture data`, async () => {
      await expect(analyze({ ...dispute, mode }, { endpoint })).rejects.toThrow()
    })

    it(`names mock as the working path when ${mode} is unavailable`, async () => {
      await expect(analyze({ ...dispute, mode }, { endpoint })).rejects.toThrow(/mock/)
    })

    it(`never leaks the fixture into a ${mode} result`, async () => {
      await expect(analyze({ ...dispute, mode }, { endpoint })).rejects.not.toThrow(/failing screen/)
    })
  }
})

/**
 * Mode dispatch, from the outside: which source of truth a mode reaches, proven by watching the
 * backend rather than by reading the code that is supposed to decide.
 */
describe('analyze routes each mode to the right source', () => {
  let backend: FakeBackend
  beforeEach(async () => {
    backend = await startFakeBackend()
  })
  afterEach(async () => {
    await backend.close()
  })

  it('serves a paying mode from the backend, not the fixture', async () => {
    const result = await analyze({ ...dispute, mode: 'mainnet' }, { endpoint: backend.url })
    expect(result.rationale).toContain(REMOTE_MARKER)
    expect(result.mode).toBe('mainnet')
    expect(backend.calls).toHaveLength(1)
  })

  it('leaves the backend untouched in mock, even with one configured and reachable', async () => {
    const result = await analyze({ ...dispute, mode: 'mock' }, { endpoint: backend.url })
    expect(result.rationale).not.toContain(REMOTE_MARKER)
    expect(backend.calls).toHaveLength(0)
  })

  it('carries an idempotency key across to the backend', async () => {
    const key = '9c2f4d10-7b3e-4a58-8d61-2e0f7a9c4b3d'
    await analyze(
      { ...dispute, mode: 'mainnet', idempotency_key: key },
      { endpoint: backend.url },
    )
    expect(backend.calls[0]?.idempotency_key).toBe(key)
  })

  it('reports progress from a paying call and stays silent in mock', async () => {
    await backend.close()
    backend = await startFakeBackend({
      progress: [{ progress: 1, total: 9, message: 'stand-in-model-a · strict' }],
    })

    const paying: number[] = []
    await analyze(
      { ...dispute, mode: 'mainnet' },
      { endpoint: backend.url, onProgress: (e) => paying.push(e.progress) },
    )
    expect(paying).toEqual([1])

    const mocked: number[] = []
    await analyze(
      { ...dispute, mode: 'mock' },
      { endpoint: backend.url, onProgress: (e) => mocked.push(e.progress) },
    )
    expect(mocked).toEqual([])
  })
})
