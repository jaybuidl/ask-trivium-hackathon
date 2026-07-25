import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { analyze, resolveMode } from './analyze.js'
import { PanelResponse } from './contract.js'
import { MOCK_DISPUTE_TITLE } from './fixture.js'

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
    expect(second.decision).toBe('user_wins')
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

describe('paying modes never fall back to mock', () => {
  for (const mode of ['testnet', 'mainnet'] as const) {
    it(`fails hard in ${mode} rather than serving fixture data`, async () => {
      await expect(analyze({ ...dispute, mode })).rejects.toThrow()
    })

    it(`names mock as the working path when ${mode} is unavailable`, async () => {
      await expect(analyze({ ...dispute, mode })).rejects.toThrow(/mock/)
    })

    it(`never leaks the fixture into a ${mode} result`, async () => {
      await expect(analyze({ ...dispute, mode })).rejects.not.toThrow(/failing screen/)
    })
  }
})
