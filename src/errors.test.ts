import { describe, expect, it } from 'vitest'
import { UnavailableError, errorMessage, unavailable } from './errors.js'

describe('errorMessage', () => {
  it('reads the message off an Error', () => {
    expect(errorMessage(new Error('nothing listening'))).toBe('nothing listening')
  })

  it('describes a thrown non-Error rather than printing [object Object]', () => {
    expect(errorMessage('a bare string')).toBe('a bare string')
    expect(errorMessage(42)).toBe('42')
  })

  /**
   * The one that earns its keep. Node's fetch reports every network failure as the same four
   * useless words and hides the reason in `cause`, so a judge who mistyped the endpoint is told
   * "fetch failed" and learns nothing about what to fix.
   */
  it('follows the cause chain, because "fetch failed" on its own diagnoses nothing', () => {
    const wrapped = new TypeError('fetch failed', {
      cause: new Error('connect ECONNREFUSED 127.0.0.1:1'),
    })
    expect(errorMessage(wrapped)).toBe('fetch failed: connect ECONNREFUSED 127.0.0.1:1')
  })

  it('does not repeat a cause that says the same thing as its wrapper', () => {
    const wrapped = new Error('fetch failed', { cause: new Error('fetch failed') })
    expect(errorMessage(wrapped)).toBe('fetch failed')
  })

  it('terminates on a cause chain that loops back on itself', () => {
    const outer = new Error('outer')
    const inner = new Error('inner', { cause: outer })
    outer.cause = inner
    expect(errorMessage(outer)).toBe('outer: inner')
  })

  it('ignores a cause that is not an Error', () => {
    expect(errorMessage(new Error('failed', { cause: 'context' }))).toBe('failed')
  })
})

describe('unavailable', () => {
  it('answers the three questions a caller has, in one message', () => {
    const error = unavailable('mainnet', 'the backend was unreachable.')

    expect(error).toBeInstanceOf(UnavailableError)
    expect(error.message).toContain('mainnet') // which tier failed
    expect(error.message).toMatch(/NOT charged/i) // whether money moved
    expect(error.message).toMatch(/mock/) // what still works
    expect(error.message).toContain('the backend was unreachable.') // and why
  })
})
