/**
 * The embedded mock panel.
 *
 * This is a TypeScript module, not a data file read at runtime, so it ships inside the npm tarball
 * and `mode: "mock"` works with no filesystem and no network of any kind (ADR-0012).
 *
 * HAND-WRITTEN AND PLAUSIBLE, NOT REAL. Ticket 07 replaces the contents of this file with a panel
 * captured from an actual mainnet run, preserving its genuine settlement transaction hash. Only the
 * *contents* here depend on that capture — no code path does.
 *
 * It describes its own dispute, not the caller's. Mock never echoes the submitted title back, which
 * would fake personalisation; the renderer and `mode: "mock"` both say plainly that this is a canned
 * example.
 */
import type { PanelResponse } from './contract.js'

/** The dispute this canned panel was produced for. Shown so a reader knows what they are looking at. */
export const MOCK_DISPUTE_TITLE = 'Warranty repair refused on a laptop with a failing screen'

export const MOCK_PANEL: PanelResponse = {
  decision: 'user_wins',
  score: 72,
  agreement: 'moderate',
  rationale:
    'The retailer classified a progressive display fault as accidental damage without producing ' +
    'an inspection report, and the timeline points to a manufacturing defect.',
  flags: {
    fraud: false,
    missingEvidence: true,
    policyGap: false,
    technicalComplexity: false,
  },
  analysesCompleted: 9,
  analysesRequested: 9,
  mode: 'mock',
  settled: false,
  panel: [
    {
      model: 'claude-opus-4.6',
      persona: 'strict',
      score: 58,
      confidence: 'medium',
      reasoning:
        'The buyer cannot show the condition of the machine between delivery and the first fault ' +
        'report, and a vertical line defect is consistent with both panel failure and a pressure ' +
        'impact. The retailer is entitled to inspect before paying. What weakens its position is ' +
        'that it asserted accidental damage without documenting an inspection.',
    },
    {
      model: 'gpt-5.1',
      persona: 'strict',
      score: 61,
      confidence: 'medium',
      reasoning:
        'Refusal rests on an unevidenced assertion. A seller may reject a warranty claim on ' +
        'accidental-damage grounds, but the burden of showing that damage sits with the party ' +
        'asserting it once the goods failed inside the warranty term. No photographs, no ' +
        'technician notes, no report were produced.',
    },
    {
      model: 'gemini-3-pro',
      persona: 'strict',
      score: 55,
      confidence: 'low',
      reasoning:
        'The record is thin on both sides. The buyer describes the fault appearing gradually over ' +
        'two weeks, which cuts against a single impact event, but there is no independent ' +
        'diagnostic to rely on. On this material alone the outcome is close.',
    },
    {
      model: 'claude-opus-4.6',
      persona: 'consumer-aware',
      score: 84,
      confidence: 'high',
      reasoning:
        'A display fault emerging eleven months into a twenty-four month warranty, on a device the ' +
        'buyer says was never dropped, is the ordinary shape of a manufacturing defect. The ' +
        'retailer declined the claim in a phone call and never put its reasoning in writing, ' +
        'leaving the buyer nothing to answer.',
    },
    {
      model: 'gpt-5.1',
      persona: 'consumer-aware',
      score: 88,
      confidence: 'high',
      reasoning:
        'The asymmetry here is stark: the seller had the device in hand and the means to diagnose ' +
        'it, and chose not to. Consumers are not expected to retain forensic evidence of the ' +
        'absence of an accident. The gradual onset the buyer describes is difficult to reconcile ' +
        'with impact damage.',
    },
    {
      model: 'gemini-3-pro',
      persona: 'consumer-aware',
      score: 79,
      confidence: 'medium',
      reasoning:
        'The buyer acted promptly and kept the original documentation, and the fault is within the ' +
        'warranty window. The one thing that gives pause is a two week delay between noticing the ' +
        'first line and contacting support, which the retailer has leaned on more heavily than it ' +
        'can really bear.',
    },
    {
      model: 'claude-opus-4.6',
      persona: 'precedent-focused',
      score: 71,
      confidence: 'medium',
      reasoning:
        'Comparable disputes over display defects inside a warranty term have generally turned on ' +
        'whether the seller documented its inspection. Where it did not, the claim has usually ' +
        'succeeded. The absence of a written refusal is the detail that most often decides these.',
    },
    {
      model: 'gpt-5.1',
      persona: 'precedent-focused',
      score: 74,
      confidence: 'medium',
      reasoning:
        'The pattern in similar consumer-electronics claims is that an undocumented ' +
        'accidental-damage classification does not survive scrutiny. Sellers that produced a dated ' +
        'inspection report have defended these successfully; those that relied on a verbal ' +
        'determination generally have not.',
    },
    {
      model: 'gemini-3-pro',
      persona: 'precedent-focused',
      score: 68,
      confidence: 'medium',
      reasoning:
        'Prior outcomes lean toward the buyer, though less strongly than the consumer-aware reading ' +
        'suggests. Cases where the fault appeared progressively have been treated more favourably ' +
        'than sudden-failure claims, but the reporting delay is the kind of fact that has cut ' +
        'against buyers before.',
    },
  ],
}
