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

## Stages and gates

| # | Stage | Skill | Output | Gate to pass before the next stage |
|---|---|---|---|---|
| 1 | Requirements | `factory-requirements` | `docs/REQUIREMENTS.md` (IDs like LNK-1, MoSCoW) | Owner confirms; open questions answered or defaulted |
| 2 | Plan | `factory-plan` | `docs/SPEC.md`, `docs/API.md` (+ `docs/UI.md` when UI architecture changes) | Environment check passed; file-ownership table has no overlaps |
| 3 | Build | `factory-build` | Commits per agent; feature code + tests | Each agent: checks clean on its paths (see below), full test suites green |
| 4 | Verify | `factory-verify` | `<SCRATCH_DIR>/<slug>.md` per reviewer, `<SCRATCH_DIR>/FIXES.md` ledger (not committed) | Every Must fixed; every Should fixed or skipped with a reason |
| 5 | Test | `factory-test` | `<SCRATCH_DIR>/FINAL.md` smoke table; screenshots (not committed) | All checks pass; smoke table green; orchestrator looked at screenshots |
| 6 | Design QA (UI work only) | `factory-design-qa` | `<SCRATCH_DIR>/design-audit.md` + after-screenshots (not committed) | P0/P1 done; before/after compared page by page |
| 7 | Ship | `factory-ship` | PR merged / pushed to GitHub; owner's copy updated | Clean `git status`; CI green; owner told what's open |

Checks: backend `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`;
frontend `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build`.

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
- **Reviewers never fix; fixers never review their own work.** Fresh agents for each.
- **Look at it yourself.** After any UI change, screenshot every page × light/dark × iPad/phone/desktop
  (`factory-test`) and open a few. Type checks and unit tests miss layout bugs.
- **Model choice:** the owner wants stage agents (builders, reviewers, fixers, testers, design QA) on a cheaper
  model: Sonnet unless the owner says otherwise. The orchestrator stays on the session model. Escalate only if asked.
- **Tell the owner the state after each stage** in one or two sentences; drafts and docs as soon as useful.

## Status board

Use the task list: one task per stage plus one per agent wave. Mark done only when the gate passed.
