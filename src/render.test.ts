import { describe, expect, it } from 'vitest'
import type { PanelResponse } from './contract.js'
import { MOCK_PANEL } from './fixture.js'
import { renderPanel } from './render.js'

/** Strip the box-drawing and wrapping so assertions test content, not layout. */
const flatten = (s: string) => s.replace(/\s+/g, ' ')

describe('renderPanel', () => {
  const out = renderPanel(MOCK_PANEL)

  it('names every cell with its model, persona and score', () => {
    const flat = flatten(out)
    for (const cell of MOCK_PANEL.panel) {
      expect(flat).toContain(cell.model)
      expect(flat).toContain(cell.persona)
      expect(flat).toContain(String(cell.score))
    }
  })

  it('renders all nine cells, not a collapsed summary', () => {
    for (const cell of MOCK_PANEL.panel) {
      expect(flatten(out)).toContain(flatten(cell.reasoning))
    }
  })

  it('reproduces each reasoning string verbatim, never truncated', () => {
    for (const cell of MOCK_PANEL.panel) {
      expect(flatten(out)).toContain(flatten(cell.reasoning))
      expect(out).not.toContain('…')
      expect(out).not.toContain('...')
    }
  })

  it('shows the verdict, score, agreement and rationale', () => {
    const flat = flatten(out)
    // Read these off the panel rather than hard-coding them. The fixture is a real capture and is
    // meant to be replaced by a later one; a recapture should not be able to fail this quietly on
    // numbers that were never the point of the test.
    expect(flat).toContain(String(MOCK_PANEL.score))
    expect(flat.toLowerCase()).toContain(MOCK_PANEL.agreement)
    expect(flat).toContain(flatten(MOCK_PANEL.rationale))
  })

  it('raises the flags the panel set, and not the ones it did not', () => {
    const flat = flatten(out).toLowerCase()
    expect(flat).toContain('missing evidence')
    expect(flat).not.toContain('fraud')
  })
})

describe('renderPanel says why a call was free', () => {
  it('calls a mock run free by design, never a failed settlement', () => {
    const flat = flatten(renderPanel(MOCK_PANEL)).toLowerCase()
    expect(flat).toContain('not charged')
    expect(flat).not.toContain('settlement failed')
  })

  it('calls an unsettled paid run a giveaway from a failed settlement', () => {
    const giveaway: PanelResponse = { ...MOCK_PANEL, mode: 'mainnet', settled: false }
    const flat = flatten(renderPanel(giveaway)).toLowerCase()
    expect(flat).toContain('not charged')
    expect(flat).toContain('settlement')
  })

  it('calls an incomplete panel free because of the incomplete panel', () => {
    const partial: PanelResponse = {
      ...MOCK_PANEL,
      mode: 'mainnet',
      settled: false,
      analysesCompleted: 6,
    }
    const flat = flatten(renderPanel(partial)).toLowerCase()
    expect(flat).toContain('not charged')
    expect(flat).toContain('6')
    expect(flat).not.toContain('settlement failed')
  })

  it('shows the settlement transaction when the call was paid', () => {
    const paid: PanelResponse = {
      ...MOCK_PANEL,
      mode: 'mainnet',
      settled: true,
      settlementTx: '0xabc123',
    }
    const flat = flatten(renderPanel(paid))
    expect(flat).toContain('0xabc123')
    expect(flat.toLowerCase()).not.toContain('not charged')
  })

  it('marks a mock panel as a canned example, not an analysis of the submitted dispute', () => {
    expect(flatten(renderPanel(MOCK_PANEL)).toLowerCase()).toContain('example')
  })
})
