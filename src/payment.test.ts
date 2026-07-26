import { afterEach, describe, expect, it, vi } from 'vitest'
import { callBackend } from './backend.js'
import { remotePanel, startFakeBackend, type FakeBackend } from './backend.testkit.js'
import { NETWORK_BY_MODE, PAYER_KEY_ENV_VAR, paymentChallengeIn, resolvePayer, settlementFrom } from './payment.js'

/**
 * A throwaway key, in the source on purpose.
 *
 * It funds nothing and never will — its only job is to make `privateKeyToAccount` produce a real
 * account so the signing path is exercised for real rather than stubbed. The funded key lives in
 * the environment and is never committed anywhere, which is the rule this file must not look like
 * an exception to.
 */
const THROWAWAY_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001'

let backend: FakeBackend | undefined

afterEach(async () => {
  await backend?.close()
  backend = undefined
})

describe('resolvePayer', () => {
  it('is absent when no key is configured, because a mock-only bridge is a valid bridge', () => {
    expect(resolvePayer('mainnet', {})).toBeUndefined()
    expect(resolvePayer('mainnet', { [PAYER_KEY_ENV_VAR]: '' })).toBeUndefined()
  })

  it('derives the payer address from the key', () => {
    const payer = resolvePayer('mainnet', { [PAYER_KEY_ENV_VAR]: THROWAWAY_KEY })

    expect(payer?.address).toBe('0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf')
  })

  // A key pasted out of a .env file often loses its prefix, and the failure without this is an
  // opaque throw from inside viem at the exact moment a paid call is being signed.
  it('accepts a key with no 0x prefix', () => {
    const payer = resolvePayer('mainnet', { [PAYER_KEY_ENV_VAR]: THROWAWAY_KEY.slice(2) })

    expect(payer?.address).toBe('0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf')
  })

  it('uses CAIP-2 network ids, never v1 short names', () => {
    expect(NETWORK_BY_MODE.mainnet).toBe('eip155:8453')
    expect(NETWORK_BY_MODE.testnet).toBe('eip155:84532')
  })
})

describe('paymentChallengeIn', () => {
  it('recognises §5 challenge: an isError result whose payload lists what it accepts', () => {
    const challenge = { x402Version: 2, accepts: [{ scheme: 'exact' }] }

    expect(paymentChallengeIn({ isError: true, structuredContent: challenge })).toBe(challenge)
  })

  // An ordinary backend failure is not a challenge, and treating it as one would make the bridge
  // sign an authorization against a payload that never quoted a price.
  it('is not fooled by an ordinary error result', () => {
    expect(paymentChallengeIn({ isError: true, structuredContent: { message: 'models down' } }))
      .toBeUndefined()
    expect(paymentChallengeIn({ isError: true })).toBeUndefined()
    expect(paymentChallengeIn({ structuredContent: { accepts: [] } })).toBeUndefined()
    expect(paymentChallengeIn(undefined)).toBeUndefined()
  })
})

describe('settlementFrom', () => {
  it('reads the receipt the backend returned on the call this bridge signed', () => {
    expect(settlementFrom({ 'x402/payment-response': { success: true, transaction: '0xabc' } }))
      .toEqual({ settled: true, transaction: '0xabc' })
  })

  it('treats a failed or missing receipt as unsettled', () => {
    expect(settlementFrom({ 'x402/payment-response': { success: false } })).toEqual({ settled: false })
    expect(settlementFrom({})).toEqual({ settled: false })
    expect(settlementFrom(undefined)).toEqual({ settled: false })
  })
})

describe('paying a challenge end to end', () => {
  const request = { title: 'A dispute', content: 'The facts.', mode: 'mainnet' as const }

  it('signs the challenge and retries the same call with the authorization attached', async () => {
    backend = await startFakeBackend({ requirePayment: true })
    const payer = resolvePayer('mainnet', { [PAYER_KEY_ENV_VAR]: THROWAWAY_KEY })

    const panel = await callBackend(request, { endpoint: backend.url, payer })

    expect(panel.panel).toHaveLength(9)
    expect(backend.calls).toHaveLength(2)
    // The first call must be unpaid: the backend quotes the price, the bridge does not assert it.
    expect(backend.calls[0]?.payment).toBeUndefined()
    expect(backend.calls[1]?.payment).toBeDefined()
  })

  // The whole call is re-sent, not a different one. A retry that changed the dispute would be
  // paying for one analysis and receiving another.
  it('sends identical arguments on the paid retry', async () => {
    backend = await startFakeBackend({ requirePayment: true })
    const payer = resolvePayer('mainnet', { [PAYER_KEY_ENV_VAR]: THROWAWAY_KEY })

    await callBackend(request, { endpoint: backend.url, payer })

    const [first, second] = backend.calls
    expect(second?.title).toBe(first?.title)
    expect(second?.content).toBe(first?.content)
    expect(second?.mode).toBe(first?.mode)
  })

  // One signature per call. Signing again on any failure would be a second $1 and a second set of
  // nine model calls for one panel — the trap ticket 06 names explicitly.
  it('signs exactly once', async () => {
    backend = await startFakeBackend({ requirePayment: true })
    const payer = resolvePayer('mainnet', { [PAYER_KEY_ENV_VAR]: THROWAWAY_KEY })
    const sign = vi.spyOn(payer!, 'sign')

    await callBackend(request, { endpoint: backend.url, payer })

    expect(sign).toHaveBeenCalledTimes(1)
  })

  it('refuses a paid tier with no wallet, rather than calling and failing', async () => {
    backend = await startFakeBackend({ requirePayment: true })

    await expect(callBackend(request, { endpoint: backend.url, payer: null })).rejects.toThrow(
      /no wallet is configured/,
    )
  })

  // Progress has to survive the payment round trip. The paid call is the slow one — nine frontier
  // models — so losing the cadence here would time out exactly the call that was paid for.
  it('still reports progress on the paid attempt', async () => {
    backend = await startFakeBackend({
      requirePayment: true,
      progress: [{ progress: 1, total: 9, message: 'first cell' }],
    })
    const payer = resolvePayer('mainnet', { [PAYER_KEY_ENV_VAR]: THROWAWAY_KEY })
    const seen: string[] = []

    await callBackend(request, {
      endpoint: backend.url,
      payer,
      onProgress: (event) => seen.push(event.message ?? ''),
    })

    expect(seen).toContain('first cell')
  })
})

describe('§7 item 4 — a panel labelled with a mode the call did not run in', () => {
  const request = { title: 'A dispute', content: 'The facts.', mode: 'mainnet' as const }
  const mislabelled = () => ({ ...remotePanel('testnet'), mode: 'testnet' as const })

  // ADR-0014: once money has moved, a complete correct panel must not be failed. Doing so invites
  // the agent to discard or retry it, which re-creates the double-charge path from the client side
  // — and ADR-0007 has already ruled out refunds, so the discarded panel is simply gone.
  it('delivers the panel when this bridge paid for it, and warns', async () => {
    backend = await startFakeBackend({ requirePayment: true, payload: mislabelled })
    const payer = resolvePayer('mainnet', { [PAYER_KEY_ENV_VAR]: THROWAWAY_KEY })
    const seen: string[] = []

    const panel = await callBackend(request, {
      endpoint: backend.url,
      payer,
      onProgress: (event) => seen.push(event.message ?? ''),
    })

    expect(panel.panel).toHaveLength(9)
    expect(seen.join(' ')).toMatch(/warning/i)
    expect(seen.join(' ')).toMatch(/already paid/i)
  })

  // Nothing is at stake on a free call, and a bridge that relabels a free panel as a paid tier is
  // worse than one that refuses.
  it('still rejects it when nothing was paid', async () => {
    backend = await startFakeBackend({ payload: mislabelled })

    await expect(
      callBackend(request, { endpoint: backend.url, payer: null }),
    ).rejects.toThrow(/not the mode/)
  })
})
