/**
 * Terminal rendering of a panel.
 *
 * This module renders what the backend decided. It never averages the nine cells, never derives
 * `decision` or `agreement`, and never turns a number into an outcome (wire contract §6).
 *
 * The one thing it does derive is *why a call was free*, which §4 explicitly defines as derivable
 * from `analysesCompleted` and `settled`. That is a caption on the payload, not a verdict.
 */
import { PERSONAS, type Mode, type PanelEntry, type PanelResponse } from './contract.js'
import { MOCK_DISPUTE_TITLE } from './fixture.js'

const WIDTH = 84

const DECISION_LABEL = {
  user_wins: 'User wins',
  company_wins: 'Company wins',
  escalate: 'Escalate to a jury',
} as const

const FLAG_LABEL = {
  fraud: 'possible fraud',
  missingEvidence: 'missing evidence',
  policyGap: 'policy gap',
  technicalComplexity: 'technical complexity',
} as const

/** Break `text` on spaces to fit `width`, indenting every line. Never hyphenates, never truncates. */
function wrap(text: string, width: number, indent: string): string[] {
  const limit = Math.max(20, width - indent.length)
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line === '') line = word
    else if (line.length + 1 + word.length <= limit) line += ` ${word}`
    else {
      lines.push(indent + line)
      line = word
    }
  }
  if (line !== '') lines.push(indent + line)
  return lines
}

const rule = (char = '─') => char.repeat(WIDTH)

/** The banner that keeps a canned panel from being mistaken for an analysis of the caller's dispute. */
function header(mode: Mode): string[] {
  if (mode !== 'mock') return [`ASK TRIVIUM  ·  ${mode}`, rule()]
  return [
    'ASK TRIVIUM  ·  mock',
    rule(),
    'This is a canned example panel shipped with the CLI, not an analysis of the dispute',
    'you submitted. Run with --mode mainnet for a real, paid analysis of your own dispute.',
    `Example dispute: ${MOCK_DISPUTE_TITLE}`,
    rule(),
  ]
}

function renderCell(cell: PanelEntry): string[] {
  const score = `${String(cell.score).padStart(3)}/100`
  return [
    `  ${cell.model.padEnd(20)} ${score}   confidence ${cell.confidence}`,
    ...wrap(cell.reasoning, WIDTH, '      '),
    '',
  ]
}

/**
 * Say plainly whether money moved, and why not when it did not.
 *
 * A mock run and a failed settlement are both `settled: false`, and conflating them would tell a
 * mock user their payment failed. `mode` is what separates them.
 */
function settlementLines(r: PanelResponse): string[] {
  if (r.settled) {
    return [
      `Charged $1 USDC. Settlement ${r.settlementTx ?? '(transaction hash not reported)'}`,
    ]
  }
  if (r.mode === 'mock') {
    return ['NOT CHARGED — mock runs are free by design and never reach the backend.']
  }
  if (r.analysesCompleted < r.analysesRequested) {
    return [
      `NOT CHARGED — the panel was incomplete ` +
        `(${r.analysesCompleted} of ${r.analysesRequested} analyses returned), so this call was free.`,
    ]
  }
  return [
    'NOT CHARGED — the panel is complete and correct, but settlement did not go through,',
    'so this analysis was given away. Nothing is owed and nothing will be billed later.',
  ]
}

/** Render a panel for a human reading a terminal. */
export function renderPanel(r: PanelResponse): string {
  const raised = (Object.keys(FLAG_LABEL) as (keyof typeof FLAG_LABEL)[]).filter((k) => r.flags[k])

  const out: string[] = [
    '',
    ...header(r.mode),
    '',
    `VERDICT    ${DECISION_LABEL[r.decision]}`,
    `SCORE      ${r.score}/100 user win probability`,
    `AGREEMENT  ${r.agreement}  ·  ${r.analysesCompleted} of ${r.analysesRequested} analyses returned`,
    '',
    ...wrap(r.rationale, WIDTH, '  '),
    '',
  ]

  if (raised.length > 0) out.push(`FLAGS      ${raised.map((k) => FLAG_LABEL[k]).join(', ')}`, '')

  out.push(rule(), `THE PANEL  ·  ${r.panel.length} analyses`, rule(), '')

  // Grouped by persona so the spread between perspectives is legible, which is the thing a
  // reader can actually act on. Any cell whose persona is unrecognised still gets rendered.
  const seen = new Set<PanelEntry>()
  for (const persona of PERSONAS) {
    const cells = r.panel.filter((c) => c.persona === persona)
    if (cells.length === 0) continue
    out.push(`${persona}`)
    for (const cell of cells) {
      seen.add(cell)
      out.push(...renderCell(cell))
    }
  }
  const ungrouped = r.panel.filter((c) => !seen.has(c))
  if (ungrouped.length > 0) {
    out.push('other')
    for (const cell of ungrouped) out.push(...renderCell(cell))
  }

  out.push(rule(), ...settlementLines(r), rule(), '')
  return out.join('\n')
}
