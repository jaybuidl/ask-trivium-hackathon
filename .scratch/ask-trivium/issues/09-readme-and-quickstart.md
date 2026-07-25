# 09 — README and cold-start quickstart

**What to build:** Someone who has never seen this repo gets a rendered panel on their own machine
by following the README, without asking anyone a question.

**Blocked by:** 02.

**Status:** in-review

## Notes

**It unblocks at 02, not at the end.** Mock mode is fully documentable the moment it works, and mock
mode is the path a cold reader should hit first — it needs no wallet, no funds, no network. Writing
the README last is how repos ship undocumented; writing it against the one path that already works
costs almost nothing.

This repo has no README yet, deliberately: this ticket owns it, and a placeholder that survives to
judging is worse than none. **The CLI is the submission** — an unrunnable repo is a non-submission,
so this ticket is on the must-not-cut list.

Test it cold, on a machine or container with none of the build state. The quickstart's failure mode
is silent: it always works for the person who wrote it.

Extend it with the paid path once 06 lands, including where funds come from and what a $1 call
costs. Do not block the mock quickstart on that.

- [x] A reader who has never seen the repo reaches a rendered panel in mock mode from the README
      alone
- [x] The quickstart is verified on a clean environment, not the development machine
- [ ] Installing and running requires no repo checkout — it works from the published package
- [x] Configuring an agent to use the CLI as an MCP server is documented and tested
- [ ] The paid path, including funding, is documented once 06 lands
- [x] Nothing in the README reveals anything on `docs/wire-contract.md` §6
- [x] The four cold-start traps found in 02 (below) are each either documented or designed out

## Comments

### Four cold-start traps, found by watching someone use the CLI for the first time

These came out of a real first contact with the CLI after ticket 02 landed, not from review. The
ticket's warning that "the quickstart's failure mode is silent — it always works for the person who
wrote it" is exactly right, and all four are invisible once you know the answer. In the order they
were hit:

1. **`npm run dev analyze "..." --mode mock` fails inside npm**, before the CLI ever runs:
   `EUNKNOWNCONFIG: Unknown cli flag: --mode`. `npm run` eats the flag without a `--` separator.
   The README should not put `npm run` on the quickstart path at all — `npx ask-trivium ...` has
   no separator problem and no banner noise. Worth one line anyway, because people reach for
   `npm run dev` in a checkout by reflex.

2. **`analyze` takes two positionals, title *and* content**, so the natural title-only attempt
   fails with `NO_DISPUTE_CONTENT` even once the `--` is fixed. Two failures stacked on one
   command is a bad first minute. Lead the quickstart with a complete, copy-pasteable invocation
   that includes content, and show the `cat complaint.txt | ...` stdin form right after it, since
   real disputes are too long to sit in an argv string.

3. **Piping changes the output format and looks like a bug.** The rendered panel only appears when
   stdout is a TTY; `| head` or `| less` silently yields the TOON envelope instead, because a
   non-TTY is treated as an agent reading the output. This is deliberate and correct, but the
   first person to pipe it into `less` will think the rendering broke. Document it next to the
   first example, with `--format json` / `--verbose` as the way to force either form.

4. **`--mode` typo handling is unverified.** `--mode mock` is accepted, but nobody has checked what
   a misspelled value prints, and whether it names the three valid modes. Cheap to check, and it
   is on the cold-start path.

Trap 3 is the one to think hardest about — it is the only one that is a *design* question rather
than a documentation gap, and documenting a surprise is the weaker fix.

### How the four were closed, and the one criterion still open

Trap 3 was designed out rather than documented. The CLI had **two output forms and only one
explicit selector**: `--format json` could force the machine form, but the human form could only be
reached by having a terminal attached. `--panel` is the missing half — it renders the panel through
a pipe or a redirect. `--format` wins when both are given, matching the precedence incur already
uses when an explicit `--format` overrides an attached terminal; the alternative is silently
discarding half of what the caller asked for. The behaviour is documented next to the first example
as the ticket asked, but the surprise is now escapable rather than merely explained.

Traps 1, 2 and 4 are documented; 4 was verified rather than assumed — a misspelled `--mode` and a
misspelled `ASK_TRIVIUM_MODE` both name all three modes, and both are pinned by tests.

**A fifth trap turned up while writing this, in the CLI's own `--help`.** incur does not quote
multi-word values in generated examples, so the first example read `ask-trivium analyze Refund
refused on a faulty laptop --mode mock`. Copy that and it analyses a dispute titled "Refund" with
the content "refused", silently dropping the rest — mock hides it behind a canned panel, and
mainnet would spend a dollar on it. Worse, the leading example was title-only, which fails outright
under trap 2. Both examples are now quoted and complete, and a test asserts every generated example
stays copy-pasteable.

Tests live in `src/cli.test.ts` (the traps, driven as real subprocesses) and `src/readme.test.ts`
(the two commands the README actually hands a stranger, driven against `dist/bin.js` after a build —
everything else drives `src/bin.ts` through tsx, which nobody following the README executes).

**Still open: the no-checkout install.** `ask-trivium` is not published to npm, so the README's
quickstart is a `git clone`. `npx github:jaybuidl/ask-trivium-hackathon` is not a substitute: npm 12
disables git-source installs by default (`EALLOWGIT`) *and* blocks lifecycle scripts, so a `prepare`
build would not run and the package would install with no `dist/`. `prepublishOnly` is wired up so a
publish builds cleanly whenever that call is made; until then the README says plainly that the
no-checkout path does not exist yet rather than documenting a command that fails.
