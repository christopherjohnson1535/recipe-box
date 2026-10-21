---
name: factory
description: Run the PhotoFlow software factory end to end — requirements, plan, build with an agent team, verify, test, design QA, ship. Use when starting a new feature or project phase, or when asked "build X end to end", "run the factory", or "what's the next step".
---

# Software factory (orchestrator)

You are the orchestrator. Once the plan is approved you do not write feature code yourself: you brief agents,
route their findings, keep the ledger, and check the result with your own eyes (screenshots, smoke runs).

## Stages and gates

| # | Stage | Skill | Output (in repo) | Gate to pass before the next stage |
|---|---|---|---|---|
| 1 | Requirements | `factory-requirements` | `docs/REQUIREMENTS.md` (IDs like IMP-1, MoSCoW) | Owner confirms; open questions answered or defaulted |
| 2 | Plan | `factory-plan` | `docs/SPEC.md` (+ `docs/THEMING.md`/`docs/UI.md` when UI architecture changes) | Environment check passed (installs + build work where agents will run); file-ownership table has no overlaps |
| 3 | Build | `factory-build` | Commits per agent; feature code + unit tests | Each agent: tsc/eslint clean on its paths, full vitest green |
| 4 | Verify | `factory-verify` | `docs/review/<slug>.md` per reviewer, `docs/review/FIXES.md` ledger | Every Must fixed; every Should fixed or skipped with a reason |
| 5 | Test | `factory-test` | `docs/review/FINAL*.md` smoke table; screenshots folder | tsc, lint, vitest, build pass; smoke table all green; orchestrator looked at screenshots |
| 6 | Design QA (UI work only) | `factory-design-qa` | `docs/review/design-audit.md` + after-screenshots | P0/P1 done; before/after compared page by page |
| 7 | Ship | `factory-ship` | Synced to the owner's machine; pushed when GitHub is connected | Clean `git status`; owner told what's open |

Loop back freely: a verify or test failure sends you to a fix wave (stage 4 rules), then re-test.

## Orchestrator rules (learned the hard way)

- **Check the environment before planning work.** Package registry, font CDNs and GitHub may be blocked in one
  sandbox and open in another. Run a one-line `npm view next version` (and a build) where agents will work first.
- **Agents get a written preamble, not memory.** Every brief starts with "Read `<preamble file>`". Preambles live
  in `.claude/skills/factory-plan/templates/`. Keep each brief to the job, its owned paths, and its report format.
- **File ownership is the concurrency model.** Parallel agents only edit the files they own; nobody runs
  `npm install` / `npm run build` / `next dev` except the one agent you name per round; commits use
  `git add <own paths>` with retry on `index.lock`. Cross-owner needs go in the report, never in the code.
- **One report line in, one decision out.** When an agent reports a gap in someone else's files, route it
  (SendMessage to a running agent, or queue it for the next wave). Keep a running list; don't lose items.
- **Reviewers never fix; fixers never review their own work.** Fresh agents for each.
- **Look at it yourself.** After any UI change, screenshot every page × theme × size (`factory-test`) and open a
  few. This caught a 250px scroll-on-load bug that every type check and unit test missed.
- **Model choice:** use the model the owner asked for (this project: Haiku agents). Escalate only if asked.
- **Tell the owner the state after each stage** in one or two sentences; drafts and docs as soon as useful.

## Status board

Use the task list: one task per stage plus one per agent wave. Mark done only when the gate passed.
