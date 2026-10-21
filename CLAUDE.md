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
| Part | Tech | Folder | Checks |
|---|---|---|---|
| API | Rust, axum 0.8, sqlx 0.9 (Postgres), tokio | `backend/` | `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` |
| Web | Next.js 16 App Router, React 19, TS strict, Tailwind 4 | `frontend/` | `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build` |
| DB | Postgres 16 | container `db` | migrations in `backend/migrations/`, run on API start |
| Containers | `docker-compose.yml` (db, api, web, optional caddy) | root, `deploy/` | CI `compose` job boots the stack |

The browser only talks to the web container; the web container proxies `/api/*` and `/media/*` to the API at
runtime (`API_INTERNAL_URL`). Session cookie `rb_session`.

## How to work on an issue (the software factory)
This repo is built with the software factory skills in `.claude/skills/` (from the owner's photoflow project).
For an issue:
1. Read the issue, then the requirement IDs it cites in `docs/REQUIREMENTS.md`, the SPEC section it names, and
   `docs/API.md` for any endpoint it touches.
2. Work on a branch `issue-<number>-<slug>`. Stay inside the "Owned paths" the issue lists; if you must change
   something else, say why in the PR.
3. Follow `docs/agents/agent-preamble.md` (ponytail coding rules, scoped checks, commit hygiene). Fetch the vendor
   skills once with `sh scripts/factory/fetch-skills.sh`.
4. For bigger issues use the factory stages: `factory-plan` (short plan in the PR description), `factory-build`
   (agents only if the issue splits cleanly by files), `factory-verify` (an independent reviewer for anything
   touching auth, uploads, outbound fetches or data deletion), `factory-test` (all checks + a smoke run; UI changes
   get screenshots that you actually look at).
5. Run every check for the tree you touched (table above). Backend tests need Postgres:
   `TEST_DATABASE_URL=postgres://recipes:recipes@127.0.0.1:5432/recipes_test`.
6. Update docs: `docs/API.md` if a contract changed, the matching wiki page in `docs/wiki/`, and README if setup changed.
7. Open a PR that says `Closes #<n>`, ticks the issue's acceptance checklist, and lists checks run.

## Rules that never bend
- Link import only fetches public addresses through `backend/src/import/safe_fetch.rs` (re-checked per redirect).
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
