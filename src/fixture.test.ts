/**
 * Structural guards on the embedded fixture.
 *
 * Ticket 07 replaces the contents of `fixture.ts` with a panel captured from a real mainnet run.
 * These tests are what that replacement has to keep true — and the fixture is exactly the kind of
 * file that quietly acquires things it should not have (wire contract §6).
 */
import { describe, expect, it } from 'vitest'
import { PANEL_SIZE, PERSONAS, PanelResponse } from './contract.js'
import { MOCK_DISPUTE_TITLE, MOCK_PANEL } from './fixture.js'

describe('the embedded mock panel', () => {
  it('validates against the wire contract', () => {
    expect(() => PanelResponse.parse(MOCK_PANEL)).not.toThrow()
  })

  it('is a complete panel of three models across three personas', () => {
    expect(MOCK_PANEL.panel).toHaveLength(PANEL_SIZE)
    expect(MOCK_PANEL.analysesCompleted).toBe(PANEL_SIZE)
    expect(MOCK_PANEL.analysesRequested).toBe(PANEL_SIZE)
    for (const persona of PERSONAS)
      expect(MOCK_PANEL.panel.filter((c) => c.persona === persona)).toHaveLength(3)
  })

  it('declares itself mock and unpaid', () => {
    expect(MOCK_PANEL.mode).toBe('mock')
    expect(MOCK_PANEL.settled).toBe(false)
    expect(MOCK_PANEL.settlementTx).toBeUndefined()
  })

  it('names the case it is a panel for, so a reader knows what they are looking at', () => {
    expect(MOCK_DISPUTE_TITLE.length).toBeGreaterThan(0)
  })

  it('shows real disagreement rather than nine copies of one number', () => {
    const scores = MOCK_PANEL.panel.map((c) => c.score)
    expect(new Set(scores).size).toBeGreaterThan(5)
    expect(Math.max(...scores) - Math.min(...scores)).toBeGreaterThan(10)
  })

  it('carries substantive prose in every cell', () => {
    for (const cell of MOCK_PANEL.panel) expect(cell.reasoning.length).toBeGreaterThan(80)
  })

  it('contains nothing shaped like a private key', () => {
    expect(JSON.stringify(MOCK_PANEL)).not.toMatch(/0x[a-fA-F0-9]{64}/)
  })
})
