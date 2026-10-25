# Recipe Box — context for Claude sessions

Read this first. It tells a fresh session everything it needs to pick up one GitHub issue and finish it.

## What this is
A household recipe website: import recipes from links and photos (cookbook pages, handwritten cards, screenshots,
dish photos), search them, and cook from an iPad (installable PWA, cooking mode, offline). Owner: Christopher
(GitHub `christopherjohnson1535`). Household members share one recipe box.

- Requirements (IDs like `LNK-1`, `PHO-2`, `KIT-3`): `docs/REQUIREMENTS.md`
- Plan, architecture, data model, file layout: `docs/SPEC.md`
- Exact API contract: `docs/API.md`
- Deploying: `docs/DEPLOY.md` · Wiki (user-facing guides): GitHub wiki, sources in `docs/wiki/`
- Work items: GitHub issues (labels `area:*`, `phase:*`, `priority:*`; milestones = phases)

## Stack
| Part | Tech | Folder | Checks (`just` recipe) |
|---|---|---|---|
| API | Rust, axum 0.8, sqlx 0.9 (Postgres), tokio | `backend/` | `just check-backend` |
| Web | Next.js 16 App Router, React 19, TS strict, Tailwind 4 | `frontend/` | `just check-frontend` |
| DB | Postgres 16 | container `db` | migrations in `backend/crates/adapters/postgres/migrations/`, run on API start |
| Containers | `docker-compose.yml` (db, api, web, optional caddy) | root, `deploy/` | CI `compose` job boots the stack |

`just check` runs both trees' format, lint, type and test checks plus `just audit` (cargo deny + npm audit; a tool
that is not installed is skipped with a message). It does not run the coverage ratchet, zizmor, CodeQL, the image
scan or the compose smoke test: those are CI-only. The frontend CI job calls the same `just` recipes. `just bench` runs the FND-2 search benchmark (`backend/benches/search.rs`; needs Postgres); the weekly
`flake-hunt` workflow runs the backend suite 20 times plus that benchmark. `just` lists
everything else (`setup`, `fmt`, `up`, `down`, `logs`, `e2e`, `openapi`, `db`). Without `just`, run the raw commands:
- API (`cd backend`): `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`
- Web (`cd frontend`): `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build`
- E2E (`just e2e`, or `cd e2e && npm ci && npm test`): Playwright against a throwaway stack (native: local Postgres +
  cargo-built API; `E2E_STACK=compose` uses `docker-compose.e2e.yml`, which CI runs). It replaces `scripts/smoke.sh`.
  `IMPORT_ALLOW_HOST` is test-only and the API refuses it with `COOKIE_SECURE=true`. See `e2e/README.md`.

Toolchains are pinned: Rust in `rust-toolchain.toml` (rustup picks it up), Node in `.nvmrc` (22, same as the
Dockerfile). Bump them in one place. Optional git hooks: `lefthook.yml` (format and lint staged files; `just setup`
installs them when lefthook is present).

Frontend tests: `frontend/vitest.setup.ts` pins the clock, blocks unmocked network (MSW) and fails a test on
unexpected `console.error`/`warn` (use `expectConsole()` if intended). CI also has a coverage ratchet
(`coverage-baseline.json`, `scripts/coverage-ratchet.mjs`): coverage may not drop. Workflows are hardened (zizmor):
`permissions: {}` at top, per-job `contents: read`, actions pinned by full SHA, `persist-credentials: false`.

The browser only talks to the web container; the web container proxies `/api/*` and `/media/*` to the API at
runtime (`API_INTERNAL_URL`). Session cookie `rb_session`.

## How to work on an issue (the software factory)
This repo is built with the software factory skills in `.claude/skills/`.
For an issue:
1. Read the issue, then the requirement IDs it cites in `docs/REQUIREMENTS.md`, the SPEC section it names, and
   `docs/API.md` for any endpoint it touches.
2. Work on a branch `issue-<number>-<slug>`. Stay inside the "Owned paths" the issue lists; if you must change
   something else, say why in the PR.
3. Follow `docs/agents/agent-preamble.md` (ponytail coding rules, scoped checks, commit hygiene). Fetch the vendor
   skills once with `sh scripts/factory/fetch-skills.sh`.
4. Run every issue through the full factory loop (`.claude/skills/factory`) with **subagents on a cheaper model
   (Sonnet)** doing the stages, while the session's main model orchestrates: briefs agents, routes findings, keeps
   the ledger, looks at screenshots and opens the PR. Stages: `factory-plan` (short plan in the PR description),
   `factory-build` (builder agents, split by owned files), `factory-verify` (independent reviewer agents, then
   separate fixer agents; always for auth, uploads, outbound fetches or data deletion), `factory-test` (all checks +
   a smoke run; UI changes get screenshots the orchestrator actually looks at), `factory-design-qa` for UI work.
5. Run every check for the tree you touched (`just check-backend` / `just check-frontend`, table above). Backend tests need Postgres:
   `TEST_DATABASE_URL=postgres://recipes:recipes@127.0.0.1:5432/recipes_test`.
6. Update docs: `docs/API.md` if a contract changed, the matching wiki page in `docs/wiki/`, and README if setup changed.
7. Open a PR that says `Closes #<n>`, ticks the issue's acceptance checklist, and lists checks run.

## Where new backend code goes
The API is a Cargo workspace in `backend/` (ADR `docs/adr/0008-hexagonal-backend.md`). Dependencies point inward:
adapters → `app` → `ports` → `domain`; the server crate (`backend/src`) wires them. Crate table: `docs/SPEC.md`.

| You are adding… | It goes in |
|---|---|
| A data shape, a business rule, input validation, an error variant | `backend/crates/domain` |
| A new outbound need (storage, clock, network, AI, files) | A trait in `backend/crates/ports`, an adapter implementing it, and the wiring. For storage, add cases to `ports::contract` (feature `contract`) so every adapter is held to them |
| A use case or workflow | A method on a service in `backend/crates/app/src`, with a unit test on `adapter-memory` in `app/tests/` |
| SQL, a table, a migration | `backend/crates/adapters/postgres` (`src`, `migrations/`); never in `app` or the HTTP adapter |
| An endpoint | `backend/crates/adapters/http/src/routes/*` + DTO in `dto.rs` + a service method; handlers parse, call one service, map. Then `just openapi` to regenerate `docs/openapi.json` |
| Wiring, config, process start, adapters with no crate of their own (argon2, image codec, HEIC) | `backend/src` (`state.rs` builds `Deps`) |

Never let `sqlx`, `axum`, `reqwest` (or `utoipa`, `tokio`, `hyper`) into `domain`, `ports` or `app`. CI checks it with
`cargo tree` in the backend job of `.github/workflows/ci.yml`; it also keeps `reqwest` to the `http-fetch` and
`anthropic` adapters and the HTTP adapter off `sqlx`, `image` and `argon2`. Guides: `docs/STORAGE-ADAPTERS.md`
(adding a storage adapter), `docs/SDK.md` (adding a client SDK).

## Rules that never bend
- Link import only fetches public addresses through `backend/crates/adapters/http-fetch/src/safe_fetch.rs` (re-checked per redirect).
- Uploaded images are decoded and re-encoded; never served as uploaded.
- Every API route except health/setup/login requires a session; admin routes check the role.
- Secrets live in env vars only (`.env` is gitignored; document new vars in `.env.example`).
- AI is optional: everything must work with `AI_PROVIDER=none`.
- Imports return drafts; nothing is saved until the user reviews and saves.
- Accessibility: labels, visible focus, contrast ≥ 4.5:1, 44 px touch targets (iPad).

## Next.js 16 gotchas
`params`/`searchParams` are Promises; middleware lives in `src/proxy.ts`; read `frontend/node_modules/next/dist/docs/`
before using an unfamiliar API; fonts via `@fontsource-variable/*` only.

## Running locally
```sh
cp .env.example .env
docker compose up -d --build        # http://localhost:3000
# or natively: backend `cargo run` (needs DATABASE_URL), frontend `npm run dev` (API_INTERNAL_URL=http://localhost:8080)
```
