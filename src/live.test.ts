/**
 * The real deployment, opt-in.
 *
 * ```
 * ASK_TRIVIUM_LIVE=1 npm test
 * ```
 *
 * Skipped by default and deliberately so. The rest of the suite runs against a stand-in backend on
 * the loopback, which keeps it hermetic: a judge cloning this repo on a hotel wifi has to be able
 * to run `npm test` and see green, and a suite that fails when someone else's host is rebooting
 * teaches everyone to ignore it.
 *
 * What this file adds that the hermetic tests cannot: proof that the wire contract we hold matches
 * the one actually deployed. The stand-in agrees with `contract.ts` by construction — it was
 * written from it — so it can never catch the two copies drifting apart. This can, and that is the
 * failure the mirror ledger in `docs/wire-contract.md` exists to make visible.
 *
 * Run it before a demo, and after any contract change on either side.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { afterAll, describe, expect, it } from 'vitest'
import { DEFAULT_ENDPOINT, callBackend, resolveEndpoint } from './backend.js'
import { PANEL_SIZE } from './contract.js'
import { renderPanel } from './render.js'

const live = process.env['ASK_TRIVIUM_LIVE'] === '1'
const endpoint = process.env['ASK_TRIVIUM_ENDPOINT'] ?? DEFAULT_ENDPOINT

const dispute = {
  title: 'Retailer refused a refund on a laptop that failed in month three',
  content: 'Bought on 3 March, the screen failed in May, and the retailer blamed accidental damage.',
} as const

describe.skipIf(!live)('the deployed backend', () => {
  it('serves a contract-shaped panel that this repo can render', async () => {
    const result = await callBackend({ ...dispute, mode: 'mainnet' }, { endpoint })

    // `callBackend` has already validated the payload against `PanelResponse` and rejected a
    // mismatched mode, so arriving here at all is most of the assertion. What is left is that the
    // panel is a panel and that the renderer survives real data.
    expect(result.panel).toHaveLength(PANEL_SIZE)
    expect(result.mode).toBe('mainnet')
    expect(renderPanel(result)).toMatch(/VERDICT/)
  }, 240_000)

  /**
   * Progress across the outbound leg, against the deployment.
   *
   * `_probe_hold_open` is a diagnostic the backend exposes precisely because the stub answers
   * `analyze_dispute` instantly and so cannot exercise §3's progress path. It is called here and
   * nowhere else in this repo, and it disappears from the endpoint before payment is switched on —
   * at which point this test goes with it, and the engine's own progress replaces it.
   */
  it('emits progress that reaches this client, via the hold-open diagnostic', async () => {
    const client = new Client({ name: 'ask-trivium-live-test', version: '0' })
    await client.connect(new StreamableHTTPClientTransport(resolveEndpoint(endpoint)))
    try {
      const seen: number[] = []
      await client.callTool(
        { name: '_probe_hold_open', arguments: { hold_seconds: 6, heartbeat_seconds: 2 } },
        undefined,
        {
          onprogress: (p) => seen.push(p.progress),
          resetTimeoutOnProgress: true,
          timeout: 4_000,
        },
      )

      // Three heartbeats over a six-second hold, against a four-second window. The count proves
      // the notifications arrived; the call completing at all proves they reset the timeout.
      expect(seen.length).toBeGreaterThanOrEqual(2)
    } finally {
      await client.close()
    }
  }, 120_000)
})

afterAll(() => {
  if (!live) {
    // eslint-disable-next-line no-console
    console.info(`  ↳ live deployment tests skipped — set ASK_TRIVIUM_LIVE=1 to run them`)
  }
})
