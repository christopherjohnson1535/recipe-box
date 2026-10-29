# Rules for every builder agent (Recipe Box)

Filled-in copy of `.claude/skills/factory-plan/templates/agent-preamble.md` for this repo.

## Where things are
- Repo root: the folder containing `docs/SPEC.md` (your working directory is normally inside it; do not hard-code a path).
- Backend: `backend/` (Rust, axum; a Cargo workspace, see below). Frontend: `frontend/` (Next.js 16). Containers: `docker-compose.yml`.
- Postgres for tests: a local server is available in the sandbox; use `TEST_DATABASE_URL` from your brief.

## Backend layers
Dependencies point inward: adapters → `app` → `ports` → `domain`; the server crate `backend/src` wires them.
- Rule or validation → `backend/crates/domain`. Use case → a service in `backend/crates/app`. SQL and migrations →
  `backend/crates/adapters/postgres`. Endpoint → `backend/crates/adapters/http` (route + DTO + service method; then
  `just openapi`). Wiring → `backend/src`.
- A new port (trait in `backend/crates/ports`) needs an adapter and, for storage, contract tests in `ports::contract`.
- Never let `sqlx`, `axum` or `reqwest` into `domain`, `ports` or `app`; CI fails on it. Details: `CLAUDE.md`.

## Checks
While building or fixing, run scoped checks: `cargo clippy -p <crate> --all-targets -- -D warnings`,
`cargo test -p <crate>`, `npx vitest run <touched files>`, `npx tsc --noEmit`. Release builds (`cargo build --release`,
`npm run build`) and the full `just check` / `just e2e` belong to the tester; run them only if your brief says so.
Agents on one issue share one clone and one `backend/target/`. Raw commands are in `CLAUDE.md`; toolchains are
pinned by `rust-toolchain.toml` and `.nvmrc`.

## Read first
- The issue's `## Context pack` files first. Open `docs/SPEC.md` (plan + file ownership), `docs/API.md` (exact
  contract) and `docs/REQUIREMENTS.md` (IDs) only for the sections, endpoints and IDs it names.
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
  retry (max 5). Never `git add -A`, never reset/checkout/stash. Commit message: a subject line (imperative, under 72 characters, says what changes, e.g. `fix(backend): re-check redirects in safe_fetch`), then a blank line and a short body of 1-3 lines on what and why. No bullet lists or run summaries; longer detail goes in the PR description. After the body, add only the attribution trailer your session provides, for example:
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
