# Development

Start with `CLAUDE.md` in the repo — it is written so a fresh Claude session (or a person) can pick up one issue
and finish it.

## The workflow
1. Pick an issue (start with the lowest open milestone; `good first session` issues are small).
2. Read the requirement IDs (`docs/REQUIREMENTS.md`), the SPEC section and `docs/API.md` the issue cites.
3. Branch `issue-<n>-<slug>`, stay inside the issue's **Owned paths**.
4. Run the checks for every tree you touched; UI work gets screenshots at iPad and desktop size.
5. PR with `Closes #<n>`; CI must be green.

## The software factory
Built with the software factory process: requirements → plan → build (agent waves) → verify
(independent reviewers, fix waves, `docs/review/FIXES.md`) → test (smoke + screenshots) → design QA → ship.
Skills: `.claude/skills/factory*`; overview: `docs/FACTORY.md`.

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
