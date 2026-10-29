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
| 4 Verify | `factory-verify` | reviewer notes and the `FIXES.md` ledger in the run folder |
| 5 Test | `factory-test` | `FINAL*.md` in the run folder, screenshots |
| 6 Design QA | `factory-design-qa` | `design-audit.md` in the run folder, before/after screenshots |
| 7 Ship | `factory-ship` | PR / push to GitHub, owner's copy updated, owner report |

## Sizing the loop
The orchestrator picks a size before starting and states it in its first message and the PR: **S** (small, one
tree, no risky surface), **M** (a feature across both trees, a new endpoint, or any risky surface) or **L**
(architecture, design system, or ≥ 3 areas). Auth/sessions, uploads, outbound fetch, AI provider calls and data
deletion/restore/backup always get a security reviewer and a separate fixer. The size sets how many agents run and
how much is tested, not which model they use. `.claude/skills/factory/SKILL.md` is the source of truth.

| | S | M | L |
|---|---|---|---|
| Build | 1 builder | 1 per tree | Waves |
| Verify | 1 reviewer | ≤ 2 reviewers, one fixer per tree | R1–R5 + V1/V2, fix waves |
| Test | `just check-<tree>` | `just check` + `just e2e` | + curl smoke table |
| Screenshots | Changed page, iPad light | Changed pages, iPad + phone | Full matrix |
| Design QA | Skip | New page or shared component | Full |

## Setup
1. `sh scripts/factory/fetch-skills.sh` — puts ponytail, tastemaker, impeccable and refactoring-ui-skill in
   `.factory/vendor/` (gitignored). In the preambles, `<SKILLS_DIR>` = `.factory/vendor`.
2. Python Playwright + Chromium for screenshots (`scripts/factory/shoot.py`).
3. Postgres 16 for backend tests (`TEST_DATABASE_URL`).

## Where run notes go
Reviewer findings, the `FIXES.md` ledger, smoke tables and design audits are working notes, not documentation.
They are not committed: keep them out of the repo and paste the key findings into the PR description instead.
The run folder is `<SCRATCH_DIR>` in the skills and templates: the session's scratchpad, outside the repo.
Keep `docs/` for current documentation only; `docs/review/` is gitignored so stray notes can't be committed.

## Principles
- The orchestrator plans, briefs, routes and checks; agents write code.
- File ownership is how agents work in parallel without collisions; one named builder per round.
- Reviewers and fixers are different agents; every finding ends in the FIXES.md ledger and, if Must/Should, in the PR description.
- Look at the rendered app before calling anything done.

## Example run (how the scaffold was built)
Requirements doc → SPEC + API contract → two scaffold agents in parallel (Rust API, Next.js app; disjoint owned
trees) while the orchestrator wrote containers, CI and context docs → orchestrator check: all checks, smoke run of
the API behind the built frontend, 44 screenshots reviewed → editorial restyle agent →
GitHub repo, labels, milestones and one issue per feature slice.
