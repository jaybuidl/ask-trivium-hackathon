# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`AGENTS.md`** at the repo root — the publication rule and the must-not-contain list.
- **`CONTEXT.md`** at the repo root — the glossary.
- **`docs/wire-contract.md`** — the contract this repo codes against.

## Architecture decisions live in the closed repo

There is no `docs/adr/` here. The decision records sit in the closed backend repo, because their
rationale routinely discusses the engine. Decisions are cited by number (`ADR-0012`) for
traceability, and every one that binds this repo is restated in full in `docs/handover.md` or
`docs/wire-contract.md`. Those restatements are the authority here — do not treat a bare ADR number
as a document you are expected to find.

If your work needs a decision that is *not* restated, that is a real gap: raise it rather than
inferring the decision, and rather than writing a local ADR that could drift from the closed one.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a
test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly
avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing
language the project doesn't use (reconsider) or there's a real gap (add it, in the same shape as
the entries already there).

## Flag contract conflicts

If your output contradicts `docs/wire-contract.md`, surface it explicitly rather than silently
overriding. The contract is hand-duplicated on both sides of a trust boundary, so a unilateral
change here desynchronises the backend without telling anyone.
