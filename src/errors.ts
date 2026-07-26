/**
 * Failure vocabulary, in its own module so the two halves of the bridge can share it.
 *
 * `analyze` dispatches to `backend`, and `backend` has to raise the same error `analyze` raises,
 * so putting this in either one makes them import each other.
 */

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
 * The message to show a caller for a thrown value, whatever was thrown.
 *
 * Follows `cause`, because the failure this bridge hits most is a network one and Node reports all
 * of them as `TypeError: fetch failed` with the actual reason — refused, DNS, TLS — one level down.
 * Shown alone, those two words tell someone whose endpoint is wrong nothing they can act on.
 */
export function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error)

  const parts: string[] = []
  const seen = new Set<Error>()
  let current: unknown = error
  // `seen` guards a cause chain that loops. Contrived, but it costs one Set and the alternative is
  // an error handler that hangs — which would be a spectacular way to lose a demo.
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current)
    if (current.message && !parts.includes(current.message)) parts.push(current.message)
    current = current.cause
  }
  return parts.join(': ')
}

/**
 * Build the one message a caller sees when a paying mode fails, from the reason it failed.
 *
 * Centralised because every clause is load-bearing and each one was getting retyped slightly
 * differently at each throw site: what went wrong, that **no money moved** — the first question a
 * caller has, and the one they cannot answer for themselves — and the mode that does work. An error
 * that omits the last one reads as "this product is broken" rather than "this tier is".
 */
export function unavailable(mode: string, reason: string): UnavailableError {
  return new UnavailableError(
    `Mode "${mode}" could not be served: ${reason} ` +
      `This call was NOT charged and no analysis was run. ` +
      `Use mode: "mock" for a complete offline example panel.`,
  )
}
