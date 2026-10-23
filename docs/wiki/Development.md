# Development

Start with `CONTRIBUTING.md` (people) or `CLAUDE.md` (a fresh Claude session) in the repo; both explain how to pick
up one issue and finish it. Testing is covered in `docs/TESTING.md`; security reports go through `SECURITY.md`.

## Quick commands
`just setup`, `just check` (lint, format, types, tests, audits; coverage and scans are CI-only), `just up` / `just down`, `just check-backend`, `just check-frontend`, `just test-backend`, `just test-frontend`,
`just e2e`, `just openapi`, `just audit`.

## The workflow
1. Pick an issue (start with the lowest open milestone; `good first session` issues are small).
2. Read the requirement IDs (`docs/REQUIREMENTS.md`), the SPEC section and `docs/API.md` the issue cites.
3. Branch `issue-<n>-<slug>`, stay inside the issue's **Owned paths**.
4. Run the checks for every tree you touched; UI work gets screenshots at iPad and desktop size.
5. PR titled as a Conventional Commit (`feat(frontend): ... (#n)`), body with `Closes #<n>`; CI must be green.

## The software factory
Built with the software factory process: requirements → plan → build (agent waves) → verify
(independent reviewers, fix waves, `FIXES.md` ledger) → test (smoke + screenshots) → design QA → ship.
Every issue goes through the whole loop, with the stages done by subagents on a cheaper model (Sonnet) and the main
session orchestrating. Skills: `.claude/skills/factory*`; overview: `docs/FACTORY.md`.

## UI work
Read `docs/UI.md` (the editorial look and the ui components) and `docs/THEMING.md` (the three token layers, how to
change a colour or add a theme). Pages only arrange `src/components/ui/*` components with layout utilities;
guard tests in `frontend/src/styles/` fail on page-level styling, a theme missing a token, or low contrast.

## Checks
| Tree | Commands |
|---|---|
| backend | `cargo fmt --check` · `cargo clippy --all-targets -- -D warnings` · `cargo test` (needs `TEST_DATABASE_URL`) |
| frontend | `npm run lint` · `npx tsc --noEmit` · `npx vitest run` · `npm run build` |

## Adding work
Add an entry to `scripts/github/backlog.py` and run `python3 scripts/github/sync_backlog.py christopherjohnson1535/recipe-box`,
or open an issue with the "Feature slice" template.

## Editing the wiki
The wiki is generated: edit the pages in `docs/wiki/` and push to `main`; the "Publish wiki" workflow mirrors them.
Edits made directly on the wiki website are overwritten on the next sync.
