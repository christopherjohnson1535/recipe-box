# Recipe Box — build spec for the agent team

Source of truth for requirements: `docs/REQUIREMENTS.md` (IDs like LNK-1 refer to it).
This file is the plan. Agents do not change it; if something here is wrong, say so in your report.
API contract details: `docs/API.md`. Work is tracked as GitHub issues — one issue per feature slice.

## What it is
A household recipe website: recipes come in from links, photos or typing, and are read and cooked from on an
iPad (PWA) or any browser. It is three containers — a **Rust API** (`backend/`), a **Next.js frontend**
(`frontend/`) and **Postgres** — started with one `docker compose up`, and deployable unchanged to a home
server, a VPS or a managed container host (images published to GHCR for amd64 + arm64).

## Architecture
```
 browser / iPad PWA
        │  https (Caddy in deployed setups; plain :3000 locally)
        ▼
 ┌──────────────┐   /api/*, /media/*  (runtime proxy route handlers, same origin)
 │ web (Next.js)│ ───────────────────────────────▶ ┌──────────────┐     ┌──────────┐
 │  :3000       │                                  │ api (axum)   │ ──▶ │ postgres │
 └──────────────┘                                  │  :8080       │     │  :5432   │
                                                   └──────┬───────┘     └──────────┘
                                                          │ media volume (/data/media)
                                                          └──▶ outbound: recipe sites, AI provider (optional)
```
- The browser only ever talks to the web origin. Route handlers `frontend/src/app/api/[...path]` and
  `frontend/src/app/media/[...path]` stream requests to `API_INTERNAL_URL` (read per request, default
  `http://api:8080`), keeping method, query, cookie, content-type, body and every `Set-Cookie`. Rewrites were not
  used because their destination is fixed at build time. Server components may call the API directly with the same URL,
  forwarding the session cookie.
- The API is the only thing that touches the database, the media volume, external websites and the AI provider.

## How we write code
- Ponytail rules: smallest complete change, no speculative options, no new dependency for a few lines, one small
  test for non-trivial logic, `// shortcut: <limit>, <when to upgrade>` for known limits.
  Never cut: input validation, auth checks, SSRF protection, data-loss safety, accessibility.
- **Backend (Rust):** stable Rust, edition 2024, `axum` 0.8, `tokio`, `sqlx` 0.9 (Postgres, runtime queries with
  `query_as` + `FromRow`; no compile-time `query!` macros so builds don't need a live DB), migrations in
  `backend/migrations/` run on start. Errors via one `AppError` → JSON `{ "error": { "code", "message" } }`.
  `cargo fmt`, `cargo clippy -- -D warnings`, `cargo test` must pass.
- **Frontend:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4, `output: "standalone"`.
  Read `frontend/node_modules/next/dist/docs/` before using an API you're unsure of — this Next version differs
  from training data (async `params`, etc.). Self-hosted fonts only (`@fontsource-variable/*`).
  `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build` must pass.
- UI: editorial magazine style (requirements → Visual style), defined in `docs/UI.md` and
  `.tastemaker/style-lock.md`; tastemaker rules apply. Pages compose `src/components/ui/*` only. Open-licensed,
  self-hosted fonts only; never imitate a specific publication's logo, masthead or proprietary typeface.
- Every API route except `GET /api/health`, `GET /api/setup`, `POST /api/setup`, `POST /api/auth/login` requires a
  session. Admin-only routes check `role = 'admin'`.
- Link import fetches go through `safe_fetch` only (public IPs, re-checked on every redirect, 15 s timeout, 5 MB cap).
- Uploaded images are decoded and re-encoded (never stored as sent), max 15 MB in, long edge ≤ 2400 px out.
- Secrets only in env vars; AI keys never reach the browser.

## Dependencies (allowed list)
- Backend: axum, axum-extra (cookies), tokio, tower-http (trace, limit, cors not needed), sqlx (postgres, uuid,
  chrono, json, migrate, runtime-tokio, tls-rustls), serde, serde_json, uuid, chrono, argon2, rand, thiserror,
  anyhow, tracing, tracing-subscriber, reqwest (rustls, stream), scraper, url, image, base64, sha2 (session token
  hashing). Dev: tokio test, tower (ServiceExt), http-body-util.
- Frontend: next, react, react-dom, tailwindcss, @fontsource-variable/*, vitest, @testing-library/react, jsdom,
  eslint-config-next, serwist (PWA, when KIT-4/5 land).
Anything else needs a one-line reason in the agent's report.

## Configuration (env)
| Var | Used by | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | api | `postgres://recipes:recipes@db:5432/recipes` | |
| `MEDIA_DIR` | api | `/data/media` | volume |
| `BIND_ADDR` | api | `0.0.0.0:8080` | |
| `COOKIE_SECURE` | api | `false` | `true` behind HTTPS |
| `SESSION_DAYS` | api | `30` | ACC-3 |
| `AI_PROVIDER` | api | `none` | `none` \| `anthropic` (PHO-6) |
| `ANTHROPIC_API_KEY` | api | — | only when provider = anthropic |
| `AI_MODEL` | api | `claude-sonnet-5-5` | |
| `MAX_UPLOAD_MB` | api | `15` | per file; photo import allows 6 files per request |
| `HEIF_CONVERT` | api | `heif-convert` | libheif CLI used to read HEIC photos (installed in the API image) |
| `API_INTERNAL_URL` | web | `http://api:8080` | runtime proxy target |
| `PUBLIC_HOSTNAME` | caddy | — | deployed HTTPS |

## Data model (Postgres, `backend/migrations/0001_init.sql`)
- `users(id uuid pk, username citext unique, display_name text, password_hash text, role text check in
  ('admin','member'), created_at timestamptz)`
- `sessions(id uuid pk, user_id fk → users on delete cascade, token_hash bytea unique, created_at, expires_at)` —
  cookie `rb_session` holds a random 32-byte token (base64url); only its SHA-256 is stored.
- `images(id uuid pk, file_name text, width int, height int, bytes int, created_by fk users, created_at)` —
  file at `MEDIA_DIR/<file_name>`, served at `/media/<file_name>`.
- `recipes(id uuid pk, title text not null, description text default '', ingredients jsonb default '[]',
  steps jsonb default '[]', servings text, prep_minutes int, cook_minutes int, total_minutes int, notes text
  default '', source_url text, source_name text, source_type text check in ('manual','link','photo','text'),
  image_id fk images null, created_by fk users, updated_by fk users, created_at, updated_at, deleted_at null,
  search tsvector generated from title/description/notes/ingredients)` + GIN index on `search`, index on
  `source_url`.
  - `ingredients`: `[{ "text": "2 cups flour", "section": "Dough" | null }]`
  - `steps`: `[{ "text": "Preheat oven…", "section": null }]`
- `tags(id serial pk, name citext unique)`, `recipe_tags(recipe_id fk cascade, tag_id fk cascade, pk both)`.
- `recipe_photos(recipe_id fk cascade, image_id fk, position int)` — original import photos (PHO-7).
- Soft delete: `DELETE /api/recipes/:id` sets `deleted_at`; `POST /api/recipes/:id/restore` clears it within 10 min
  (REC-2); a periodic task purges rows deleted > 1 day.

## API (summary — full shapes in `docs/API.md`)
| Method & path | Auth | Req | Status in scaffold |
|---|---|---|---|
| GET `/api/health` | — | — | done (checks DB) |
| GET `/api/setup` → `{ needsSetup }` | — | — | done |
| POST `/api/setup` `{username, displayName, password}` | — | ACC-2 | done (only when no users) |
| POST `/api/auth/login` / POST `/api/auth/logout` / GET `/api/auth/me` | —/s/s | ACC-1/3 | done |
| GET `/api/recipes?q=&tag=&sort=&limit=&offset=` | s | FND-1–4 | list + paging done; `q` full-text and `sort` → issue |
| POST `/api/recipes`, GET/PUT/DELETE `/api/recipes/:id`, POST `/api/recipes/:id/restore` | s | REC-1/2 | done |
| GET `/api/tags` → `[{name, count}]` | s | FND-3 | done |
| POST `/api/media` (multipart `file`) → image | s | PHO-1 | done (re-encode, resize) |
| GET `/media/:file` | s | — | done |
| POST `/api/import/url` `{url}` → `RecipeDraft` | s | LNK-1/2/5/7 | done |
| POST `/api/import/text` `{text, sourceUrl?}` → `RecipeDraft` | s | LNK-3/4 | done (#12; also the AI fallback of `import/url`) |
| POST `/api/import/photo` (multipart `files[]`, `mode=recipe\|dish`) → `RecipeDraft` | s | PHO-1–5, PHO-7 | done (#11) |
| GET `/api/import/capabilities` → `{ ai: bool, provider }` | s | PHO-5/6 | done |
| GET/POST `/api/users`, DELETE `/api/users/:id`, PUT `/api/users/:id/password` | admin | ACC-2 | **501 stub** → issue |
| GET `/api/export`, POST `/api/import/export` | admin | ACC-5 | **501 stub** → issue |

`RecipeDraft` = recipe fields without id/timestamps + `warnings: string[]` + `duplicateOf: uuid|null` +
`imageId` (already stored) + `photoImageIds`. Drafts are never saved by the import endpoints — the client POSTs the
reviewed draft to `/api/recipes`.

## Pages (frontend)
| Route | Content | Scaffold |
|---|---|---|
| `/setup` | create first admin (shown when `needsSetup`) | working |
| `/login` | sign in | working |
| `/` | recipe cards, search box, tag chips | basic list |
| `/recipes/new` | blank form; tabs/links to import by link, photo, text | placeholder form |
| `/recipes/[id]` | read view: photo, meta, ingredients, steps, notes, source | basic |
| `/recipes/[id]/edit` | edit form | placeholder |
| `/recipes/[id]/cook` | cooking mode (KIT-2/3) | placeholder |
| `/import` | link / photo / text import → draft review → save | placeholder |
| `/settings` | account, household members (admin), AI status, export | placeholder |
- Signed-out users are redirected to `/login` (or `/setup` when the API says `needsSetup`), via `src/proxy.ts`
  (Next 16's middleware) checking for the `rb_session` cookie, and server-side `GET /api/auth/me`.

## Repository layout and file ownership
- **Orchestrator**: `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/**`, `.claude/**`, `.github/**`,
  `docker-compose.yml`, `deploy/**`, `.env.example`, `.gitignore`, `scripts/**`.
- **Backend scaffold (B0)**: `backend/**` (Cargo.toml, src, migrations, tests, Dockerfile, .dockerignore).
- **Frontend scaffold (F0)**: `frontend/**` (Next app, Dockerfile, .dockerignore).
- Feature issues later name their owned paths inside these trees (e.g. `backend/src/import/**`).

## Backend module map (B0 creates; features fill in)
```
backend/src/main.rs          // config, tracing, pool, migrations, router, purge task, graceful shutdown
backend/src/config.rs        // Config::from_env()
backend/src/error.rs         // AppError + IntoResponse
backend/src/state.rs         // AppState { pool, config, http: reqwest::Client }
backend/src/auth/{mod,password,session,extract}.rs   // argon2, tokens, CurrentUser / AdminUser extractors
backend/src/routes/{mod,health,setup,auth,recipes,tags,media,imports,users,export}.rs
backend/src/import/{mod,safe_fetch,jsonld,ai}.rs      // stubs + trait AiProvider; feature issues fill in
backend/src/models.rs        // Recipe, RecipeInput, RecipeDraft, Ingredient, Step, User… (serde camelCase)
backend/tests/api.rs         // integration tests against TEST_DATABASE_URL (skipped when unset)
```

## Feature notes
- **Link import (LNK):** find `<script type="application/ld+json">`, walk `@graph`/arrays for `@type` containing
  `Recipe`; map `name, description, recipeIngredient, recipeInstructions (string | HowToStep | HowToSection →
  section), recipeYield, prepTime/cookTime/totalTime (ISO 8601 → minutes), image (string | ImageObject |
  array → first), author, keywords/recipeCategory/recipeCuisine → tags`. Fall back to microdata. Duplicate check by
  normalised `source_url`. Fetch failures with 401/403/429/503 return code `site_blocked` so the UI offers paste-text.
- **AI (PHO/LNK-3):** `trait AiProvider { async fn recipe_from_images(&self, imgs, mode) -> Result<RecipeDraft>;
  async fn recipe_from_text(&self, text) -> Result<RecipeDraft>; }` with `NoneProvider` (returns `ai_disabled`)
  and `AnthropicProvider` (Messages API via reqwest, images resized to ≤ 1568 px long edge, JSON output schema).
  Dish mode adds warning "Guessed from a photo of the dish".
- **Search (FND-2):** `websearch_to_tsquery('simple', q)` on `search` + `ILIKE` fallback on title for short prefixes.
- **Offline (KIT-5):** serwist service worker; cache app shell + `GET /api/recipes/:id` + images for recipes
  opened; network-first with cache fallback; writes disabled offline with a banner.
- **Cooking mode (KIT-2/3):** `navigator.wakeLock.request('screen')`, re-acquire on `visibilitychange`.

## Containers and deploy
- `backend/Dockerfile`: `rust:1-bookworm` builder (cargo-chef style dependency caching) → `debian:bookworm-slim`
  runtime with ca-certificates, non-root user, `/data/media`, `HEALTHCHECK` hitting `/api/health`.
- `frontend/Dockerfile`: `node:22-bookworm-slim` deps → build → standalone runner, non-root, port 3000.
- `docker-compose.yml`: `db` (postgres:16, volume `pgdata`, healthcheck), `api` (depends on db healthy, volume
  `media`), `web` (depends on api, port `${WEB_PORT:-3000}:3000`). Optional profile `https` adds `caddy`
  (`deploy/Caddyfile`, ports 80/443, volume for certs).
- `deploy/compose.prod.yml`: uses `ghcr.io/<owner>/recipe-box-{api,web}:<tag>` images instead of building.
- `scripts/backup.sh` / `scripts/restore.sh`: `pg_dump` + tar of the media volume.
- CI (`.github/workflows/ci.yml`): backend fmt/clippy/test with a postgres service; frontend lint/tsc/vitest/
  build; on `main` and tags, buildx multi-arch images pushed to GHCR.

## Definition of done (every issue)
Backend: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` (with
`TEST_DATABASE_URL`). Frontend: `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build`.
`docker compose build` succeeds in CI. Docs updated (README / wiki page for the feature). The issue's acceptance
checklist ticked.
