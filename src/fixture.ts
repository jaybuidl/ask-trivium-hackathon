/**
 * The embedded mock panel.
 *
 * This is a TypeScript module, not a data file read at runtime, so it ships inside the npm tarball
 * and `mode: "mock"` works with no filesystem and no network of any kind (ADR-0012).
 *
 * REAL, NOT INVENTED. Every field below is a verbatim capture of what the deployed engine returned
 * for a `mainnet` call that really happened and was really paid for:
 *
 *   captured   2026-07-26T04:57:54Z
 *   settled    $1 USDC on Base, tx 0x68651e3122b89fcb839e8c611e9c04143d68744f85477fdd63705df0213d88c5
 *   block      49126264
 *   elapsed    67.2s for nine cells
 *
 * The transaction hash lives in this comment and not in the panel below, deliberately. A mock run
 * settles nothing, so a payload carrying a settlement hash would be claiming a payment that this
 * particular run never made — the same lie as a canned panel pretending to be analysis, pointed the
 * other way. `mode` and `settled` are therefore the only two fields altered from the capture, and
 * they are altered to stay truthful about the run being served rather than the run being quoted.
 * Provenance is checkable in the comment; the wire payload describes only itself.
 *
 * It describes its own dispute, not the caller's. Mock never echoes the submitted title back, which
 * would fake personalisation; the renderer and `mode: "mock"` both say plainly that this is a canned
 * example.
 */
import type { PanelResponse } from './contract.js'

/** The dispute this panel was really produced for. Shown so a reader knows what they are looking at. */
export const MOCK_DISPUTE_TITLE = "Refund refused for a laptop that failed 5 weeks after delivery"

export const MOCK_PANEL: PanelResponse = {
  decision: "escalate",
  score: 58.1,
  agreement: "weak",
  rationale:
    "High overall variance: all 9 analyses put the user's chance of winning at 58.1 out of 100, with " +
    "weak agreement across the panel.",
  flags: {
    fraud: false,
    missingEvidence: true,
    policyGap: true,
    technicalComplexity: true,
  },
  analysesCompleted: 9,
  analysesRequested: 9,
  mode: 'mock',
  settled: false,
  panel: [
    {
      model: "gemini-3.6-flash",
      persona: "strict",
      score: 20,
      confidence: "high",
      reasoning:
        "Kleros jurors operating under strict evidentiary standards evaluate cases based on documented " +
        "proof rather than unverified assertions. The buyer claims the failure is a warranty issue, but " +
        "has not provided a diagnostic teardown showing a manufacturing defect. The buyer's admission of " +
        "being caught in the rain, combined with an inconclusive diagnostic note, leaves the claim " +
        "unsupported by strict evidence, leading jurors to vote in favor of the seller.",
    },
    {
      model: "gemini-3.6-flash",
      persona: "consumer-aware",
      score: 75,
      confidence: "medium",
      reasoning:
        "Kleros jurors generally penalize sellers who advertise explicit warranties but refuse basic " +
        "diagnostic inspection when an issue arises shortly after purchase. Because the seller refused to " +
        "inspect the unit or prove liquid damage, jurors are likely to view the seller's claim as " +
        "speculative and rule in favor of the consumer.",
    },
    {
      model: "gemini-3.6-flash",
      persona: "precedent-focused",
      score: 85,
      confidence: "high",
      reasoning:
        "From a consistency and precedent perspective, Kleros jurors consistently favor buyers when " +
        "sellers advertise express warranties but refuse to honor or even investigate claims without " +
        "objective proof of user abuse. Allowing sellers to evade 12-month warranties via unverified " +
        "assumptions would incentivize bad faith listing practices across the ecosystem.",
    },
    {
      model: "claude-sonnet-5",
      persona: "strict",
      score: 58,
      confidence: "low",
      reasoning:
        "Under a strict evidentiary standard, neither party has proven the actual cause of the charging " +
        "failure, which is the central factual question. This leaves jurors to weigh procedural conduct " +
        "and credibility: the seller's citation of an inapplicable return-window policy and refusal to " +
        "engage with a low-cost inspection offer are unfavorable to their position, while the buyer's own " +
        "words ('caught in the rain') provide a documented basis for the seller's damage theory that " +
        "cannot be dismissed outright. Given the genuine evidentiary gap on causation, the case is closer " +
        "to a coin-flip than a clear-cut result, with a modest tilt toward the buyer due to the seller's " +
        "procedural missteps and unwillingness to verify their claim when given the opportunity.",
    },
    {
      model: "claude-sonnet-5",
      persona: "consumer-aware",
      score: 62,
      confidence: "medium",
      reasoning:
        "This case hinges on an unresolved technical question that neither party has definitively " +
        "answered. However, procedural and behavioral signals favor the buyer: they disclosed the rain " +
        "incident unprompted (suggesting honesty rather than concealment), offered a reasonable path to " +
        "resolution (self-funded inspection), and their timeline (device functioning normally for six " +
        "days post-rain) creates reasonable doubt about the seller's liquid-damage theory. The seller, by " +
        "contrast, has not substantiated their claim with any inspection and has ignored the buyer's " +
        "good-faith offer, which is likely to be read by jurors as evasive or overconfident in an " +
        "unproven theory. Kleros jurors, who favor clear, well-documented positions and penalize parties " +
        "who avoid low-cost verification, would likely lean toward the buyer, though not overwhelmingly " +
        "given the genuine ambiguity in causation. A moderate majority ruling for the buyer, possibly " +
        "with a recommendation tied to the diagnostic outcome, is the most probable result.",
    },
    {
      model: "claude-sonnet-5",
      persona: "precedent-focused",
      score: 68,
      confidence: "medium",
      reasoning:
        "This case fits a recognizable pattern: a warranty claim denied primarily on inference rather " +
        "than forensic evidence, where the seller has both mischaracterized the applicable policy and " +
        "failed to pursue an available verification path. Kleros jurors, who tend to favor clear, " +
        "well-documented positions and penalize parties who ignore reasonable resolution offers, would " +
        "likely lean toward the buyer. However, the genuine physical ambiguity (rain exposure did occur, " +
        "cause is technically undetermined) prevents this from being a clean unanimous ruling, hence a " +
        "moderate-majority split is expected rather than a landslide.",
    },
    {
      model: "gpt-5.6-terra",
      persona: "strict",
      score: 54,
      confidence: "low",
      reasoning:
        "A narrowly buyer-favorable result is plausible because the seller advertised a 12-month " +
        "warranty, received a claim within that period, and rejected the matter without substantiating " +
        "the asserted liquid-damage exclusion or inspecting the device after the buyer offered to send it " +
        "in. However, the evidence does not prove that the defect was present at delivery or covered by " +
        "the warranty, and the rain statement provides a credible competing explanation. Strict jurors " +
        "may deny a full refund because technical causation and the contractual remedy are unproven. The " +
        "likely outcome is therefore close rather than decisive.",
    },
    {
      model: "gpt-5.6-terra",
      persona: "consumer-aware",
      score: 58,
      confidence: "low",
      reasoning:
        "A consumer-aware jury is likely to view the seller's blanket refusal as weak because an " +
        "advertised warranty should ordinarily involve an opportunity to inspect a timely claim. The " +
        "seller's reliance on a rain-related message is insufficient without evidence that liquid entered " +
        "the laptop or caused the board failure. Nevertheless, the buyer cannot conclusively prove that " +
        "the failure was an inherent defect, and jurors may hesitate to order a full refund rather than " +
        "require warranty inspection, repair, or replacement. The result is therefore close, with a " +
        "modest lean toward the buyer.",
    },
    {
      model: "gpt-5.6-terra",
      persona: "precedent-focused",
      score: 43,
      confidence: "low",
      reasoning:
        "In comparable disputes, jurors commonly reject a full-refund claim when causation is unproven " +
        "and there is credible evidence of possible user-caused damage. The buyer's early failure " +
        "timeline and willingness to submit the device for inspection make the seller's blanket refusal " +
        "appear weak, but those facts do not establish entitlement to EUR 890. A consistency-focused " +
        "panel is likely to avoid creating a precedent under which any post-return-window electronics " +
        "failure produces an automatic refund despite an unresolved accidental-damage issue. The likely " +
        "result is narrowly favorable to the seller on the current full-refund request, although the " +
        "seller's refusal to inspect substantially reduces confidence.",
    },
  ],
}
