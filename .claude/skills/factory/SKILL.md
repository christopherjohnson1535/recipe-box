---
name: factory
description: Run the Recipe Box software factory end to end — requirements, plan, build with an agent team, verify, test, design QA, ship. Use when starting a new feature, issue or project phase, or when asked "build X end to end", "run the factory", or "what's the next step".
---

# Software factory (orchestrator)

You are the orchestrator. Once the plan is approved you do not write feature code yourself: you brief agents,
route their findings, keep the ledger, and check the result with your own eyes (screenshots, smoke runs).

Stack: Rust API in `backend/`, Next.js in `frontend/`, Postgres, Docker Compose. Work is sliced into GitHub issues
(`scripts/github/backlog.py`); one session usually takes one issue through plan → build → verify → test.
Filled-in builder rules: `docs/agents/agent-preamble.md`.

## Pick the size first

Before anything else, read the issue's Context pack and pick S, M or L. State the tier in your first message
and in the PR description (with the reason). Every stage skill says what it does per tier; this table is the
source of truth.

| | S | M | L |
|---|---|---|---|
| Fits | ≤ ~150 changed lines, one tree, no risky surface, no new endpoint | Anything that is neither S nor L: both trees, a new endpoint, a risky surface, or > ~150 lines | Architecture, the design system/tokens, or ≥ 3 areas |
| Plan | Five lines in the PR description, written by you from the Context pack | Same | `factory-plan` agent, SPEC/API changes |
| Build | 1 builder | 1 builder per tree, in parallel | Waves |
| Verify | 1 reviewer; the builder fixes its own findings in a second pass | ≤ 2 reviewers (security if risky, plus the changed tree's: UI if a page changed, else backend core; not risky: backend core for backend-only, UI if a page changed, both if both trees); one fixer per tree, single wave | R1–R5 + V1/V2, fix waves A/B |
| Test | `just check-<tree>`; `just e2e` only if a page changed | `just check` + `just e2e` | `just check`, `just e2e`, curl smoke table |
| Screenshots | Changed page, iPad light | Changed pages, iPad + phone light (+ dark if colours or tokens changed) | Full matrix; open at least every page in light at iPad, plus home and recipe in dark and on phone |
| Design QA | Skip | New page or shared UI component only | Full |

**Risky-surface override (any tier):** auth/sessions and data deletion/restore/backup (R1), uploads/media and
outbound fetch (R2), and AI provider calls (R3) always get that security reviewer. Their findings always go to a
separate fixer agent, never the builder, even at S: a risky surface makes the issue at least M.

**New endpoint (any size):** add an HTTP-level test for it (B3 per `docs/TESTING.md`, or an e2e spec). The curl
smoke table is L-only.

**Escalate** a tier mid-run if the change grows past its bounds. Never downgrade to skip a failing gate.

**Compile once per issue.** All agents in one issue share one clone and one `backend/target/` (sequential per
tree; use `sccache` or incremental builds when available). Release builds (`cargo build --release`,
`npm run build`) run once, in the test stage, by the one tester agent. At L, R5's build and smoke run count as
that build; after fix waves the tester re-runs the checks and rebuilds only if code changed since.

## Stages and gates

| # | Stage | Skill | Output | Gate to pass before the next stage |
|---|---|---|---|---|
| 1 | Requirements | `factory-requirements` | `docs/REQUIREMENTS.md` (IDs like LNK-1, MoSCoW) | Owner confirms; open questions answered or defaulted |
| 2 | Plan | `factory-plan` | `docs/SPEC.md`, `docs/API.md` (+ `docs/UI.md` when UI architecture changes) | Environment check passed; file-ownership table has no overlaps |
| 3 | Build | `factory-build` | Commits per agent; feature code + tests | Each agent: scoped checks clean on its paths (see below) |
| 4 | Verify | `factory-verify` | `<SCRATCH_DIR>/<slug>.md` per reviewer, `<SCRATCH_DIR>/FIXES.md` ledger (not committed) | Every Must fixed; every Should fixed or skipped with a reason (reviewers per tier) |
| 5 | Test | `factory-test` | `<SCRATCH_DIR>/FINAL.md` smoke table; screenshots (not committed) | Tier's checks pass (L: smoke table green); orchestrator opened every screenshot taken (L: the subset in `factory-test`) |
| 6 | Design QA (L; M for a new page or shared component) | `factory-design-qa` | `<SCRATCH_DIR>/design-audit.md` + after-screenshots (not committed) | P0/P1 done; before/after compared page by page |
| 7 | Ship | `factory-ship` | PR merged / pushed to GitHub; owner's copy updated | Clean `git status`; CI green; owner told what's open |

Checks, by whom: builders and fixers run scoped checks (`cargo clippy -p <crate> --all-targets -- -D warnings`,
`cargo test -p <crate>`, `npx vitest run <touched files>`, `npx tsc --noEmit`). The tester runs the full set once:
backend `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`; frontend `npm run lint`,
`npx tsc --noEmit`, `npx vitest run`, `npm run build` (`just check`, `just e2e`).

Loop back freely: a verify or test failure sends you to a fix wave (stage 4 rules), then re-test.

`<SCRATCH_DIR>` is the run folder: the session's scratchpad, outside the repo. Run notes never go in `docs/`
(`docs/review/` is gitignored). The PR description carries what matters: the plan, the Must/Should findings with
how each was fixed or why it was skipped, and the smoke table.

## Orchestrator rules

- **Check the environment before planning work.** Package registries, font CDNs, Docker Hub and GitHub may be
  blocked in one sandbox and open in another. Run `npm view next version`, `cargo search axum --limit 1` and a build
  where agents will work first.
- **Agents get a written preamble, not memory.** Every brief starts with "Read `docs/agents/agent-preamble.md`".
  Generic templates live in `.claude/skills/factory-plan/templates/`. Keep each brief to the job, its owned paths,
  and its report format.
- **File ownership is the concurrency model.** Parallel agents only edit the files they own; installs and builds
  happen only in an agent's own tree; commits use `git add <own paths>` with retry on `index.lock`. Cross-owner
  needs go in the report, never in the code.
- **One report line in, one decision out.** When an agent reports a gap in someone else's files, route it
  (SendMessage to a running agent, or queue it for the next wave / a new issue). Don't lose items.
- **Reviewers never fix; fixers never review their own work.** Fresh agents for each. (S: the builder fixes the
  reviewer's findings in a second pass, never on a risky surface; the reviewer is still a separate agent.)
- **Look at it yourself.** After any UI change, screenshot what the tier calls for (`factory-test`) and open every
  screenshot taken (L: the subset `factory-test` names). Type checks and unit tests miss layout bugs.
- **Model choice:** the owner wants stage agents (builders, reviewers, fixers, testers, design QA) on a cheaper
  model: Sonnet unless the owner says otherwise. The orchestrator stays on the session model. Escalate only if asked. The tier changes how many agents run, not which model they use.
- **Tell the owner the state after each stage** in one or two sentences; drafts and docs as soon as useful.

## Status board

Use the task list: one task per stage plus one per agent wave. Mark done only when the gate passed.
