# Software factory (Recipe Box)

Work is sliced into GitHub issues; each issue goes through the stages below as far as it needs — see `CLAUDE.md`.

How this project is built, end to end, by an orchestrator and a team of agents. Each stage is a skill in
`.claude/skills/` — start with **`factory`**, which says which stage comes next and what its gate is.

```
 requirements ──▶ plan ──▶ build ──▶ verify ──▶ test ──▶ design QA ──▶ ship
 (factory-        (factory-  (agent    (review    (smoke +   (impeccable +   (sync,
  requirements)    plan)      waves)    agents →   screen-    Refactoring UI  GitHub)
                                        fix waves) shots)     audit → fix)
        ▲                                   │          │            │
        └──────── new phase ◀───────────────┴── fix wave ◀──────────┘
```

| Stage | Skill | Writes |
|---|---|---|
| 1 Requirements | `factory-requirements` | `docs/REQUIREMENTS.md` |
| 2 Plan | `factory-plan` | `docs/SPEC.md`, `docs/API.md`, agent preambles (`docs/agents/`) |
| 3 Build | `factory-build` | code + tests, one commit set per agent |
| 4 Verify | `factory-verify` | `docs/archive/factory-runs/<run>/<slug>.md`, `FIXES.md` |
| 5 Test | `factory-test` | `FINAL*.md` in the run folder, screenshots |
| 6 Design QA | `factory-design-qa` | `design-audit.md` in the run folder, before/after screenshots |
| 7 Ship | `factory-ship` | PR / push to GitHub, owner's copy updated, owner report |

## Setup
1. `sh scripts/factory/fetch-skills.sh` — puts ponytail, tastemaker, impeccable and refactoring-ui-skill in
   `.factory/vendor/` (gitignored). In the preambles, `<SKILLS_DIR>` = `.factory/vendor`.
2. Python Playwright + Chromium for screenshots (`scripts/factory/shoot.py`).
3. Postgres 16 for backend tests (`TEST_DATABASE_URL`).

## Where run notes go
Reviewer findings, the `FIXES.md` ledger, smoke tables and design audits are working notes, not documentation.
Write them to `docs/archive/factory-runs/<yyyy-mm>-<slug>/` (for example `2026-11-cook-mode/`), not to `docs/`.
The Phase 1 notes sit directly in `docs/archive/factory-runs/`; see its README. Keep `docs/` for current
documentation only. <!-- the factory skills in .claude/skills/ still say docs/review/; update them to match -->

## Principles
- The orchestrator plans, briefs, routes and checks; agents write code.
- File ownership is how agents work in parallel without collisions; one named builder per round.
- Reviewers and fixers are different agents; every finding ends in the FIXES.md ledger.
- Look at the rendered app before calling anything done.

## Example run (how the scaffold was built)
Requirements doc → SPEC + API contract → two scaffold agents in parallel (Rust API, Next.js app; disjoint owned
trees) while the orchestrator wrote containers, CI and context docs → orchestrator check: all checks, smoke run of
the API behind the built frontend, 44 screenshots reviewed (`docs/archive/factory-runs/SCAFFOLD.md`) → editorial restyle agent →
GitHub repo, labels, milestones and one issue per feature slice.
