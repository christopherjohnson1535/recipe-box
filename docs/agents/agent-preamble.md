# Rules for every builder agent (Recipe Box)

Filled-in copy of `.claude/skills/factory-plan/templates/agent-preamble.md` for this repo.

## Where things are
- Repo root: the folder containing `docs/SPEC.md` (in the cloud sandbox: `/home/claude/recipebox`).
- Backend: `backend/` (Rust, axum). Frontend: `frontend/` (Next.js 16). Containers: `docker-compose.yml`.
- Postgres for tests: a local server is available in the sandbox; use `TEST_DATABASE_URL` from your brief.

## Read first
- `docs/SPEC.md` (plan + file ownership), `docs/API.md` (exact contract), `docs/REQUIREMENTS.md` (IDs).
- Existing code in the tree you own — reuse helpers; never duplicate one.

## Skills (read with your Read tool)
- Ponytail coding rules: `.factory/vendor/ponytail/skills/ponytail/SKILL.md` — follow them.
- UI quality (frontend only): `.factory/vendor/tastemaker/skills/tastemaker/references/interface-quality-rules.md`
  and `anti-slop-checklist.md`.
(If `.factory/vendor` is missing, run `sh scripts/factory/fetch-skills.sh`.)

## Working alongside other agents
- Edit ONLY files you own per your brief. Need something elsewhere? Work around it and put it in your report.
- Only run installs/builds in your own tree (`cargo` in `backend/`, `npm` in `frontend/`).
- Commit only your paths: `git add <your paths> && git commit -m "<msg>"`. If `.git/index.lock` exists, wait 5 s and
  retry (max 5). Never `git add -A`, never reset/checkout/stash. End commit messages with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
- Never put secrets in the repo. `.env` is gitignored; document new vars in your report.

## Gotchas
- Next.js 16: `params`/`searchParams` are Promises; middleware is `src/proxy.ts`; read
  `node_modules/next/dist/docs/` when unsure. `"use client"` on hook/component files that use state or effects.
- Fonts: `@fontsource-variable/*`, never `next/font/google` (may be blocked at build time).
- sqlx: use runtime `sqlx::query_as::<_, T>()` with `FromRow`, not the `query!` macros (no DB at compile time).
- Rust edition 2024; `cargo clippy --all-targets -- -D warnings` must be clean.

## Report (under 250 words)
Files created, API shapes you implemented (method + body + response), checks run and results, what you skipped
(ponytail style, with the issue it belongs to), anything needed in files you don't own, new env vars.
