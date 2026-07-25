# 09 — README and cold-start quickstart

**What to build:** Someone who has never seen this repo gets a rendered panel on their own machine
by following the README, without asking anyone a question.

**Blocked by:** 02.

**Status:** ready-for-agent

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

- [ ] A reader who has never seen the repo reaches a rendered panel in mock mode from the README
      alone
- [ ] The quickstart is verified on a clean environment, not the development machine
- [ ] Installing and running requires no repo checkout — it works from the published package
- [ ] Configuring an agent to use the CLI as an MCP server is documented and tested
- [ ] The paid path, including funding, is documented once 06 lands
- [ ] Nothing in the README reveals anything on `docs/wire-contract.md` §6
