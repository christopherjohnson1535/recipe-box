# Software factory (Recipe Box)

This process and its skills come from the owner's PhotoFlow project. Recipe Box adds Rust checks for `backend/`
and slices work into GitHub issues — see `CLAUDE.md`.

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
| 2 Plan | `factory-plan` | `docs/SPEC.md`, agent preambles (`.claude/skills/factory-plan/templates/`) |
| 3 Build | `factory-build` | code + tests, one commit set per agent |
| 4 Verify | `factory-verify` | `docs/review/<slug>.md`, `docs/review/FIXES.md` |
| 5 Test | `factory-test` | `docs/review/FINAL*.md`, screenshots |
| 6 Design QA | `factory-design-qa` | `docs/review/design-audit.md`, before/after screenshots |
| 7 Ship | `factory-ship` | synced copy, GitHub push, owner report |

## Setup
1. `sh scripts/factory/fetch-skills.sh` — puts ponytail, tastemaker, impeccable and refactoring-ui-skill in
   `.factory/vendor/` (gitignored). In the preambles, `<SKILLS_DIR>` = `.factory/vendor`.
2. Python Playwright + Chromium for screenshots (see `scripts/factory/README.md`).

## Principles
- The orchestrator plans, briefs, routes and checks; agents write code.
- File ownership is how agents work in parallel without collisions; one named builder per round.
- Reviewers and fixers are different agents; every finding ends in the FIXES.md ledger.
- Look at the rendered app before calling anything done.

## Example run (how PhotoFlow v1 was built)
Requirements doc → SPEC with 7 owners → scaffold → design system (tastemaker) → 5 feature agents in parallel →
5 reviewers (3 ponytail-review, 1 tastemaker UI audit, 1 build + smoke) → fix waves A (3) and B (2) → final
smoke → theming system (3 token layers, 3 themes, guard tests) → Vercel guidelines audit (2) → fixes (2) →
design QA (impeccable + Refactoring UI audit → implementation → screenshot check → scroll bug fix) → ship.
