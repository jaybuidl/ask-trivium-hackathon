/**
 * The wallet half of the bridge (ticket 06).
 *
 * Wire contract §5 puts payment *inside* the JSON-RPC layer: an unpaid call comes back as an
 * ordinary tool result carrying `PaymentRequired`, the client signs, and the same call goes out
 * again with the signed payload in `_meta["x402/payment"]`. This file owns the signing; `backend.ts`
 * owns the two calls, because the timeout and progress policy on them is its business and must not
 * change just because money is involved.
 *
 * **Why this does not use `@x402/mcp`'s own `x402MCPClient.callTool`.** That helper does the 402
 * dance for you, but its options are `{timeout, signal, resetTimeoutOnProgress}` — there is no
 * `onprogress` and no `maxTotalTimeout`. Registering no progress handler is not a cosmetic loss
 * here: the MCP SDK looks up a handler *before* honouring `resetTimeoutOnProgress` and bails out
 * if there is none, so the flag goes inert and a 111s analysis times out at the base timeout. The
 * convenience wrapper would silently undo ticket 05's cadence, on exactly the calls it exists for.
 * `@x402/mcp` exports the primitives for this reason; we use those and keep our own call options.
 *
 * The key never leaves this process and is never written anywhere. It is read from the environment
 * once, on demand, and the account object is all that is kept.
 */
import { x402Client } from '@x402/core/client'
import type { PaymentPayload, PaymentRequired } from '@x402/core/types'
import { ExactEvmScheme } from '@x402/evm/exact/client'
import { MCP_PAYMENT_META_KEY, MCP_PAYMENT_RESPONSE_META_KEY } from '@x402/mcp'
import { privateKeyToAccount } from 'viem/accounts'
import type { Mode } from './contract.js'

/** Where the payer's key comes from. Never a flag — a flag lands in shell history. */
export const PAYER_KEY_ENV_VAR = 'ASK_TRIVIUM_PRIVATE_KEY'

/**
 * CAIP-2 per tier, and the reason `testnet` is worth having: it exercises this entire path for
 * nothing, against the same facilitator and the same code.
 */
export const NETWORK_BY_MODE = {
  mainnet: 'eip155:8453',
  testnet: 'eip155:84532',
} as const satisfies Record<Exclude<Mode, 'mock'>, string>

/** What `backend.ts` needs to pay a challenge, and the seam its tests replace. */
export type Payer = {
  /** The address that will be debited. Shown before a paid call, never after the fact. */
  address: string
  sign(paymentRequired: PaymentRequired): Promise<PaymentPayload>
}

/**
 * Build a payer for this tier, or `undefined` when no key is configured.
 *
 * `undefined` is not an error here. A bridge with no wallet is a perfectly good mock-only bridge
 * (ADR-0012), and the tier that needs a key is the one that should say so — which `cli.ts` does at
 * startup rather than after nine analyses have been computed.
 */
export function resolvePayer(
  mode: Exclude<Mode, 'mock'>,
  env: NodeJS.ProcessEnv = process.env,
): Payer | undefined {
  const key = env[PAYER_KEY_ENV_VAR]
  if (key === undefined || key === '') return undefined

  const account = privateKeyToAccount(normalizeKey(key))
  const client = new x402Client().register(NETWORK_BY_MODE[mode], new ExactEvmScheme(account))

  return {
    address: account.address,
    sign: (paymentRequired) => client.createPaymentPayload(paymentRequired),
  }
}

/**
 * `viem` wants `0x`-prefixed; a key pasted out of a `.env` often is not. Correcting it here is
 * worth more than being strict: the failure mode otherwise is an opaque throw from inside viem at
 * the moment of a paid call.
 */
function normalizeKey(key: string): `0x${string}` {
  const trimmed = key.trim()
  return (trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`) as `0x${string}`
}

/**
 * The payment challenge inside a tool result, if that is what this is.
 *
 * §5: an unpaid call is an ordinary `isError` result whose `structuredContent` is the
 * `PaymentRequired`. Deliberately duck-typed rather than schema-validated — the bridge does not
 * own this shape, it forwards it straight back to the library that built it, and a schema copy
 * here would be a third place for the contract to drift.
 */
export function paymentChallengeIn(result: unknown): PaymentRequired | undefined {
  if (typeof result !== 'object' || result === null) return undefined

  const record = result as Record<string, unknown>
  if (record.isError !== true) return undefined

  const structured = record.structuredContent
  if (typeof structured !== 'object' || structured === null) return undefined
  return 'accepts' in structured ? (structured as PaymentRequired) : undefined
}

/** The `_meta` a signed retry carries. */
export function paymentMeta(payload: PaymentPayload): Record<string, unknown> {
  return { [MCP_PAYMENT_META_KEY]: payload }
}

/**
 * What the backend said about settlement, read from the transport rather than the payload.
 *
 * This is the bridge's *own* view of whether money moved, and it is the reason §7 item 4 waited
 * for this ticket: it comes back on the response to the call this process signed and sent, so it
 * does not require trusting a payload the bridge may be about to call untrustworthy.
 */
export function settlementFrom(meta: unknown): { settled: boolean; transaction?: string } {
  if (typeof meta !== 'object' || meta === null) return { settled: false }
  const response = (meta as Record<string, unknown>)[MCP_PAYMENT_RESPONSE_META_KEY]
  if (typeof response !== 'object' || response === null) return { settled: false }

  const record = response as Record<string, unknown>
  if (record.success !== true) return { settled: false }

  const transaction = record.transaction
  return typeof transaction === 'string' && transaction !== ''
    ? { settled: true, transaction }
    : { settled: true }
}
