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
  Inside it, each of those is behind a port trait (see *Backend: ports and adapters*).

### Backend: ports and adapters (docs/adr/0008)
The API is a Cargo workspace rooted at `backend/Cargo.toml`. Dependencies point inward only:

```
adapters/*  →  app  →  ports  →  domain          the server crate (backend/src) depends on all of them and wires them
```

| Crate (package) | Path | Holds | Must not depend on |
|---|---|---|---|
| `recipe-box-domain` (`domain`) | `backend/crates/domain` | Types (`Recipe`, `RecipeDraft`, `User`…), `DomainError`, `Secret`, `validate`, constants (`RESTORE_WINDOW_MINUTES`, `PURGE_AFTER`) | web, database, async runtime, OpenAPI |
| `recipe-box-ports` (`ports`) | `backend/crates/ports` | Outbound traits: `RecipeRepo`, `ImageRepo`, `UserRepo`, `SessionRepo`, `SettingsRepo`, `TagRepo`, `StorageHealth`, `Clock`, `MediaStore`, `PasswordHasher`, `SessionTokens`, `ImageCodec`, `RecipeExtractor`, `PageFetcher`, `PageReader`, `TaskSpawner`, `GoogleTasks`, `TokenCipher`, `GoogleConnectionRepo`; feature `contract` adds `ports::contract`, the storage contract suite | as `domain`, plus anything an adapter would pull in |
| `recipe-box-app` (`app`) | `backend/crates/app` | Use-case services built from `Deps` into `Services` (recipes, users, auth, media, imports, maintenance), each holding `Arc<dyn Port>` | `axum`, `sqlx`, `reqwest`, `tokio`, `utoipa`, `hyper`, and `image`/`argon2`/`rand`/`sha2`/`base64` |
| `recipe-box-adapter-http` (`adapter_http`) | `backend/crates/adapters/http` | Inbound axum adapter: `routes/*`, `extract.rs` (`CurrentUser`, `AdminUser`), `error.rs` (`AppError`), `dto.rs`, OpenAPI | `sqlx`, `reqwest`, `image`, `argon2`, the server crate |
| `recipe-box-adapter-postgres` (`adapter_postgres`) | `backend/crates/adapters/postgres` | `Pg*` repositories, `migrations/`, `migrate()` | |
| `recipe-box-adapter-memory` (`adapter_memory`) | `backend/crates/adapters/memory` | In-memory ports for service tests; the contract suite reference | |
| `recipe-box-adapter-fs-media` (`adapter_fs_media`) | `backend/crates/adapters/fs-media` | `FsMediaStore`: `MediaStore` on a directory | |
| `recipe-box-adapter-http-fetch` (`adapter_http_fetch`) | `backend/crates/adapters/http-fetch` | `HttpPageFetcher` and `safe_fetch` (SSRF guard) | `app`, the server, other adapters, `axum`, `sqlx` |
| `recipe-box-adapter-html` (`adapter_html`) | `backend/crates/adapters/html` | `HtmlPageReader`: JSON-LD, microdata, readable text | same as `http-fetch` |
| `recipe-box-adapter-anthropic` (`adapter_anthropic`) | `backend/crates/adapters/anthropic` | `AnthropicProvider`: `RecipeExtractor` on the Messages API | same as `http-fetch` |
| `recipe-box-adapter-google` (`adapter_google`) | `backend/crates/adapters/google` | `GoogleTasksClient`: `GoogleTasks` on Google's OAuth and Tasks APIs | same as `http-fetch` |
| `recipe-box-api` | `backend/src` | The server: config, wiring, process start. `crypto.rs` is the `TokenCipher` (ChaCha20-Poly1305). Still holds the adapters that have no crate of their own: `auth/` (argon2id `PasswordHasher`, `SessionTokens`), `media.rs` (`ImageCodec` on the `image` crate), `plate.rs`, `import/photo.rs` (HEIC via `heif-convert`), `clock.rs`, `import/ai.rs` (picks the extractor) | `reqwest` as a direct dependency |

CI enforces the rule with `cargo tree` (`.github/workflows/ci.yml`, backend job): `domain`, `ports` and `app` may not
pull in `axum`, `sqlx`, `reqwest`, `tokio`, `utoipa` or `hyper`; `app` also stays free of `image`, `argon2`, `rand`,
`sha2` and `base64`; `adapter-http` may not reach `sqlx`, `reqwest`, `image`, `argon2` or the server crate; only
`http-fetch`, `anthropic`, `google` and the server crate may have `reqwest` in their tree; the four outbound adapters may not
depend on `app`, the server, another adapter, `axum` or `sqlx`.

## How we write code
- Ponytail rules: smallest complete change, no speculative options, no new dependency for a few lines, one small
  test for non-trivial logic, `// shortcut: <limit>, <when to upgrade>` for known limits.
  Never cut: input validation, auth checks, SSRF protection, data-loss safety, accessibility.
- **Backend (Rust):** stable Rust, edition 2024, `axum` 0.8, `tokio`, `sqlx` 0.9 (Postgres, runtime queries with
  `query_as` + `FromRow`; no compile-time `query!` macros so builds don't need a live DB), migrations in
  `backend/crates/adapters/postgres/migrations/` run on start. Services return `DomainError`; `AppError` (in `adapters/http/src/error.rs`) maps it to JSON `{ "error": { "code", "message" } }`.
  `cargo fmt`, `cargo clippy -- -D warnings`, `cargo test` must pass.
- **Frontend:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4, `output: "standalone"`.
  Read `frontend/node_modules/next/dist/docs/` before using an API you're unsure of — this Next version differs
  from training data (async `params`, etc.). Self-hosted fonts only (`@fontsource-variable/*`).
  `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build` must pass.
- UI: the Riviera look, Charcoal & Saffron (requirements → Visual style; ADR 0009): cool paper, charcoal ink, one
  saffron accent, a day and an evening appearance. Defined in `docs/UI.md` and `.tastemaker/style-lock.md`;
  tastemaker rules apply. Pages compose `src/components/ui/*` only. Open-licensed, self-hosted fonts only; never
  imitate a specific publication's logo, masthead or proprietary typeface.
- Every API route except `GET /api/health`, `GET /api/setup`, `POST /api/setup`, `POST /api/auth/login`,
  `GET /api/auth/providers` and the Google sign-in pair (`GET /api/auth/google/start`, `GET /api/auth/google/callback`;
  the start's `link=1` mode and the callback's link mode need a session) requires a session. Admin-only routes check `role = 'admin'`.
- Link import fetches go through `safe_fetch` only (public IPs, re-checked on every redirect, 15 s timeout, 5 MB cap).
- Uploaded images are decoded and re-encoded (never stored as sent), max 15 MB in, long edge ≤ 2400 px out.
- Secrets only in env vars; AI keys never reach the browser.

## Dependencies (allowed list)
Backend, per crate (the `Cargo.toml` files and the CI `cargo tree` guard are the source of truth):
| Crate | Normal dependencies | Dev |
|---|---|---|
| `domain` | chrono, thiserror, url, uuid | |
| `ports` | async-trait, `domain` | |
| `app` | async-trait, `domain`, `ports` | `adapter-memory`, `ports` (feature `contract`), tokio |
| `adapter-http` | axum (macros, multipart), axum-extra (cookie), cookie, tower-http (trace), utoipa, serde, serde_json, chrono, uuid, thiserror, anyhow, tracing, `app`, `domain` | `adapter-memory`, `ports` (feature `contract`), tokio, tracing-subscriber, async-trait |
| `adapter-postgres` | sqlx (the workspace feature set, see `[workspace.dependencies]`), serde, async-trait, `domain`, `ports` | `ports` (feature `contract`), tokio |
| `adapter-memory` | async-trait, `domain`, `ports` | `ports` (feature `contract`), tokio |
| `adapter-fs-media` | tokio (fs), async-trait, `domain`, `ports` | `ports` (feature `contract`), tokio |
| `adapter-http-fetch` | reqwest (rustls, stream, json), tokio (net, time), url, async-trait, `domain`, `ports` | tokio |
| `adapter-html` | scraper, serde_json, url, tokio, async-trait, `domain`, `ports` | tokio |
| `adapter-google` | reqwest (rustls, json, form), tokio (time), serde, serde_json, tracing, anyhow, async-trait, `domain`, `ports` | tokio |
| `adapter-anthropic` | reqwest (rustls, stream, json), image, base64, serde_json, tokio, tracing, anyhow, async-trait, `domain`, `ports` | tokio |
| `recipe-box-api` (server) | all of the above crates except `adapter-memory`, axum, sqlx, tokio, argon2, rand, sha2, base64, image, chrono, uuid, anyhow, async-trait, tracing, tracing-subscriber | serde_json, url, futures-util, http-body-util, tower (util), testcontainers-modules (postgres) |

Shared versions (`sqlx`, `chrono`, `serde`, `thiserror`, `url`, `uuid`) are pinned once in `[workspace.dependencies]`.
`domain` re-exports `chrono`, `url` and `uuid`, so ports and adapters name them through it. `async-trait` is there
because the port traits must be dyn-compatible: services hold `Arc<dyn Port>`.

Frontend: next, react, react-dom, tailwindcss, @fontsource-variable/*, vitest, @testing-library/react, jsdom,
eslint-config-next, serwist + @serwist/turbopack + esbuild (service worker, KIT-5; build-time only).
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
| `MAX_BACKUP_MB` | api | `512` | largest backup zip `POST /api/import/export` accepts; spooled to a temp file |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PUBLIC_URL`, `TOKEN_ENCRYPTION_KEY` | api | — | Google Tasks export (GRO-5) and Sign in with Google (ACC-6), one OAuth client for both: all four or none, else the API refuses to start. `TOKEN_ENCRYPTION_KEY` is 32 random bytes in base64 |
| `HEIF_CONVERT` | api | `heif-convert` | libheif CLI used to read HEIC photos (installed in the API image) |
| `API_INTERNAL_URL` | web | `http://api:8080` | runtime proxy target |
| `PUBLIC_HOSTNAME` | caddy | — | deployed HTTPS |

## Data model (Postgres, `backend/crates/adapters/postgres/migrations/0001_init.sql`)
- `users(id uuid pk, username citext unique, display_name text, password_hash text, role text check in
  ('admin','member'), created_at timestamptz)`
- Sign in with Google (`0005_google_sign_in.sql`, ACC-6): `users.email citext unique null` (set by an admin; the match
  key for a first Google sign-in) and `user_identities(id uuid pk, user_id fk → users on delete cascade, provider text,
  subject text, email citext, created_at, unique(provider, subject))`. A link is the Google `sub`, so a later change of
  email on either side does not break it. Only a member can get a link; Google never creates a user.
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
- Groceries (`0003_grocery.sql`, GRO): `grocery_list(id uuid pk, created_at, updated_at)` (one row: the household's
  active list), `grocery_list_recipe(list_id fk cascade, recipe_id fk recipes cascade, scale double precision, added_at, pk both)`,
  `grocery_item(id uuid pk, list_id fk cascade, key text, name text, amounts jsonb, section text, checked bool,
  cleared bool, manual bool, recipe_ids uuid[])` (`key` is the merge key of a generated item, unique per list among
  generated items), `grocery_section_override(key text pk, section text)`, `grocery_staple(key text pk)`.
- Google Tasks (`0004_google.sql`, GRO-5): `google_connection(user_id uuid pk fk users on delete cascade,
  refresh_token bytea null (nonce ‖ ciphertext; null once Google refused it: the row then only remembers the list),
  tasklist_id text null, connected_at timestamptz, export_started_at timestamptz null (the lease of a running
  export: one per user at a time, taken by a conditional update, stale after 2 minutes))`. "Connected" = a token is stored.
- Made-it log (`0006_cook_log.sql`, REC-6): `cook_log(id uuid pk, recipe_id fk recipes on delete cascade, user_id fk users
  on delete set null, cooked_on date (the cook's own calendar day), note text default '', created_at timestamptz)` + index
  `(recipe_id, cooked_on desc, created_at desc)`. Entries stay hidden with a soft-deleted recipe, return on restore and go
  with the purge; a removed member's entries stay with `user_id` null.
- Favourites (`0007_favourites.sql`, REC-5): `favourites(user_id fk users on delete cascade, recipe_id fk recipes on
  delete cascade, created_at timestamptz, pk (user_id, recipe_id))` + index `(recipe_id)`. Per member, never shared. A star
  stays hidden with a soft-deleted recipe (its routes answer 404), returns on restore and goes with the purge; a removed
  member's stars go with them. Not in the export zip (format v1 is recipes only); `scripts/backup.sh` has them.
- Soft delete: `DELETE /api/recipes/:id` sets `deleted_at`; `POST /api/recipes/:id/restore` clears it within 10 min
  (REC-2); a periodic task purges rows deleted > 1 day.

## API (summary — full shapes in `docs/API.md`)
| Method & path | Auth | Req | Status in scaffold |
|---|---|---|---|
| GET `/api/health` | — | — | done (checks DB) |
| GET `/api/setup` → `{ needsSetup }` | — | — | done |
| POST `/api/setup` `{username, displayName, password}` | — | ACC-2 | done (only when no users) |
| POST `/api/auth/login` / POST `/api/auth/logout` / GET `/api/auth/me` | —/s/s | ACC-1/3 | done |
| GET `/api/auth/providers` → `{google}`, GET `/api/auth/google/start`, GET `/api/auth/google/callback` | — | ACC-6 | #26 |
| GET `/api/auth/identities`, DELETE `/api/auth/identities/:id` | s | ACC-6 | #26 |
| GET `/api/recipes?q=&tag=&favourite=&sort=&limit=&offset=` | s | FND-1–4, REC-5 | list + paging done; `q` full-text and `sort` → issue |
| POST `/api/recipes`, GET/PUT/DELETE `/api/recipes/:id`, POST `/api/recipes/:id/restore` | s | REC-1/2 | done |
| GET/POST `/api/recipes/:id/cook-log`, DELETE `/api/recipes/:id/cook-log/:entryId` | s | REC-6 | #23 |
| PUT/DELETE `/api/recipes/:id/favourite` | s | REC-5 | #22 |
| GET `/api/tags` → `[{name, count}]` | s | FND-3 | done |
| POST `/api/media` (multipart `file`) → image | s | PHO-1 | done (re-encode, resize) |
| GET `/media/:file` | s | — | done |
| POST `/api/import/url` `{url}` → `RecipeDraft` | s | LNK-1/2/5/7 | done |
| POST `/api/import/text` `{text, sourceUrl?}` → `RecipeDraft` | s | LNK-3/4 | done (#12; also the AI fallback of `import/url`) |
| POST `/api/import/photo` (multipart `files[]`, `mode=recipe\|dish`) → `RecipeDraft` | s | PHO-1–5, PHO-7 | done (#11) |
| GET `/api/import/capabilities` → `{ ai: bool, provider }` | s | PHO-5/6 | done |
| GET/POST `/api/users`, DELETE `/api/users/:id`, PUT `/api/users/:id/password` | admin | ACC-2 | **501 stub** → issue |
| GET `/api/export`, POST `/api/import/export` | admin | ACC-5 | done (#20); archive format in API.md |

| GET `/api/grocery`, POST `/api/grocery/recipes`, DELETE `/api/grocery/recipes/:id`, POST `/api/grocery/items`, PATCH/DELETE `/api/grocery/items/:id`, POST `/api/grocery/clear-checked`, DELETE `/api/grocery` | s | GRO-1–4 | #79 |
| GET/DELETE `/api/integrations/google`, GET `/api/integrations/google/connect`, GET `/api/integrations/google/callback`, POST `/api/grocery/export/google-tasks` | s | GRO-5 | #81 |
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
| `/groceries` | household shopping list: recipes on it, items by store section, tick/move/staple/add, polled every 20 s (GRO-1–4) | working |
| `/settings` | account, household members (admin), AI status, export | placeholder |
- Signed-out users are redirected to `/login` (or `/setup` when the API says `needsSetup`), via `src/proxy.ts`
  (Next 16's middleware) checking for the `rb_session` cookie, and server-side `GET /api/auth/me`.

## Repository layout and file ownership
- **Orchestrator**: `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/**`, `.claude/**`, `.github/**`,
  `docker-compose.yml`, `deploy/**`, `.env.example`, `.gitignore`, `scripts/**`.
- **Backend**: `backend/**` (workspace `Cargo.toml`, `crates/**`, `src/`, `tests/`, `benches/`, Dockerfile).
- **Frontend**: `frontend/**` (Next app, Dockerfile, .dockerignore).
- Feature issues name their owned paths inside these trees, by crate (e.g. `backend/crates/app/src/imports.rs`,
  `backend/crates/adapters/http/src/routes/recipes.rs`).

## Backend module map
```
backend/Cargo.toml                         // server package recipe-box-api + the workspace member list
backend/src/main.rs                        // config, tracing, pool, migrations, router, purge task, graceful shutdown
backend/src/lib.rs                         // module tree, hourly purge, display-rendition backfill
backend/src/config.rs                      // Config::from_env()
backend/src/state.rs                       // AppState (also TokioSpawner, the TaskSpawner impl): builds the Pg*/fs/AI adapters, deps() -> app::Deps, services()
backend/src/routes/{mod,openapi}.rs        // router(): adapter_http routes + HttpState; OpenAPI json
backend/src/auth/{password,session}.rs     // Argon2Hasher (PasswordHasher), RandomTokens (SessionTokens)
backend/src/media.rs                       // ImageCrateCodec (ImageCodec)
backend/src/plate.rs                       // print-style rendition of recipe photos
backend/src/clock.rs                       // Clock (system or fixed) implementing ports::Clock
backend/src/import/{ai,photo,safe_fetch}.rs // extractor selection, HEIC converter, FetchPolicy re-export
backend/src/{models,error}.rs              // re-exports of adapter_http::dto / ::error
backend/src/bin/openapi.rs                 // prints the OpenAPI spec (just openapi)
backend/tests/*.rs, tests/common/          // HTTP integration tests against TEST_DATABASE_URL (skipped when unset)

backend/crates/domain/src/{model,error,validate,source,secret}.rs
backend/crates/ports/src/{lib,repos}.rs    // traits
backend/crates/ports/src/contract/         // storage contract suite (feature "contract")
backend/crates/app/src/{auth,imports,maintenance,media,recipes,users}.rs   // services; tests in app/tests/
backend/crates/adapters/http/src/{routes/*,extract,error,dto}.rs
backend/crates/adapters/postgres/{src,migrations,tests/contract.rs}
backend/crates/adapters/memory/{src,tests/contract.rs}
backend/crates/adapters/fs-media/{src,tests/contract.rs}
backend/crates/adapters/{http-fetch,html,anthropic}/src
```
Where new code goes: `CLAUDE.md` → *Where new backend code goes*.

## Feature notes
- **Link import (LNK):** find `<script type="application/ld+json">`, walk `@graph`/arrays for `@type` containing
  `Recipe`; map `name, description, recipeIngredient, recipeInstructions (string | HowToStep | HowToSection →
  section), recipeYield, prepTime/cookTime/totalTime (ISO 8601 → minutes), image (string | ImageObject |
  array → first), author, keywords/recipeCategory/recipeCuisine → tags`. Fall back to microdata. Duplicate check by
  normalised `source_url`. Fetch failures with 401/403/429/503 return code `site_blocked` so the UI offers paste-text.
- **AI (PHO/LNK-3):** port `ports::RecipeExtractor` (`extract_images(images, mode)`, `extract_text(text)`, both
  returning a `RecipeDraft`) with `app::NoneExtractor` (returns `ai_disabled`) and
  `adapter_anthropic::AnthropicProvider` (Messages API via reqwest, images resized to ≤ 1568 px long edge, JSON
  output schema). The server picks one in `backend/src/import/ai.rs`.
  Dish mode adds warning "Guessed from a photo of the dish".
- **Search (FND-2):** `websearch_to_tsquery('simple', q)` on `search` + `ILIKE` fallback on title for short prefixes.
- **Offline (KIT-5):** Serwist service worker `src/app/sw.ts`, bundled by esbuild through the Turbopack route
  `src/app/serwist/[path]/route.ts` and served at `/serwist/sw.js` (production builds only). Rules in
  `src/components/offline/rules.ts`.
  - Precache (app shell): `.next/static` (scripts, styles, fonts), `public/` icons and the static `/offline` page.
  - Runtime, allowlist only: recipe pages `/recipes/:id` and `/recipes/:id/cook` and the grocery list page `/groceries` (network-first, 5 s timeout, keyed
    by path; kept only when 200, not redirected and marked by `KeepOffline`, so the server-error page never replaces a
    good copy; after an in-app navigation the page asks the worker to fetch it with `CACHE_URLS`; a kept recipe
    page also keeps the photos it names and its cooking mode), `GET /api/recipes/:id` and `GET /api/grocery` (network-first; grocery writes are never kept, and the page ignores a kept copy older than the list it already shows), `/media/*` (cache-first: names
    are content ids). Everything else is network-only; a document with no copy falls back to `/offline`, which lists
    the recipes kept on the device.
  - Favourites (#22): after the app loads, the reader's 30 newest favourites are asked for with `CACHE_URLS` (four at a
    time, skipping pages already kept), so they read offline without being opened first, with their photos and cooking
    mode; a page whose star changes is fetched again so its kept copy shows the star as it is. A starred page carries a
    second marker (`rb-favourite`) and `/offline` lists those first. Starring needs the server: offline the star is off,
    with the reason, and nothing is queued.
  - Caps: 100 pages, 30 API responses, 300 photos, 30 days since last use, purge on quota error.
  - Signed out never comes from cache: a GET answered 401, a page navigation answered with a redirect (the sign-in
    gate, `/setup`) or a redirect to `/login` wipes the `rb-*` caches (the worker does not see POSTs, so a wrong
    password does not); Sign out and a successful sign-in wipe them too; `/login`, `/setup`, lists, search and
    settings are never cached. A wipe bumps a generation: a fetch that started before it is not stored, is checked
    again right before the put and removed if a wipe landed in between (`worker-plugins.ts`).
  - `Cache-Control: no-store` is deliberately not honoured: Next.js sends it on every dynamic page and the API on
    recipe JSON, and keeping exactly those is the feature. Responses that are not a plain 200, are redirected or set a
    cookie are skipped. The protection is the allowlist above plus the wipes.
  - A new worker re-fetches the kept pages on activate so they point at the new build's chunks.
  - UI: `OfflineBanner` in the app layout; Save (recipe form), Delete and the import buttons are disabled offline with the
    reason beside them (`OfflineNote`, tied to the button with `aria-describedby`). Edits are blocked, not queued. iOS may evict caches; the server stays the
    source of truth.
- **Groceries (GRO):** the parser, merge key, amount arithmetic/formatting and the section dictionary are pure code in
  `domain::grocery` (table-driven tests over `backend/crates/domain/tests/fixtures/ingredient-lines.json`, which the
  frontend scaler test also reads so both sides agree on quantities and units). `ports::GroceryRepo` stores the list;
  `app::GroceryService` does recompute (in one repo call, under a lock on the list row) and the item rules. Behaviour:
  `docs/API.md` → *Grocery list*.
- **Google Tasks (GRO-5):** ports `GoogleTasks` (consent URL, code exchange, access token from refresh token, revoke,
  `ensure_list` to find or make the task list and `fill_list` to empty and refill it, so the service can store the
  list id between the two) and `TokenCipher` (seal/open), storage port `GoogleConnectionRepo`. Adapter crate
  `adapters/google` (reqwest, fixed Google hosts; base URLs injectable for tests); the cipher lives in the server crate;
  `app::GoogleTasksService` reads the grocery list through `GroceryService`. With Google not configured the server wires
  a disabled `GoogleTasks` that answers `google_disabled`. Tests use a local stub of Google's OAuth and Tasks endpoints
  (`backend/tests/common/google.rs`). Behaviour: `docs/API.md` → *Google Tasks export*.
- **Sign in with Google (ACC-6):** the API runs an OpenID Connect authorization-code flow with PKCE (confidential
  client; the browser never sees the secret or a token). It reuses the Google Tasks settings
  (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PUBLIC_URL`, `TOKEN_ENCRYPTION_KEY`): the feature is on whenever they
  are set, with no new variables, and one OAuth client serves both. The owner adds a second redirect URI,
  `${PUBLIC_URL}/api/auth/google/callback`, and the scopes `openid`, `userinfo.email`, `userinfo.profile`.
  1. `start` seals `state`, `nonce`, the PKCE verifier, the safe `next` path and the time into the `rb_oauth` cookie
     (HttpOnly, SameSite=Lax, Path `/api/auth/google`, 10 minutes; sealed with the token cipher, no server-side
     record) and redirects to Google with `prompt=select_account`.
  2. `callback` always clears `rb_oauth`, then checks `state`, the cookie's age, exchanges the code, and validates the
     ID token: signature (Google's JWKS), `iss`, `aud` = our client ID, `exp`, `nonce`, and `email_verified = true`.
  3. A link on `(google, sub)` signs that user in. Otherwise a user whose `email` equals the verified Google email gets
     a link and is signed in. Otherwise nothing is created and the browser goes to `/login?error=google_not_member`.
     Any other failure goes to `/login?error=google_failed`.
  4. Success starts the normal `rb_session` (`SESSION_DAYS`) and redirects to `next` (same-origin path only, else `/`).
  A signed-in member can also link with `start?link=1` (**Connect Google** in Settings), which skips the email rule,
  and remove a link with `DELETE /api/auth/identities/:id`. Google's endpoints are fixed hosts (never taken from the
  request, never through `safe_fetch`); the redirect URI comes from `PUBLIC_URL`, never the Host header.
  Password sign-in is unchanged. Behaviour: `docs/API.md`; guide: wiki *Google Sign-In*.
- **Cooking mode (KIT-2/3):** `navigator.wakeLock.request('screen')`, re-acquire on `visibilitychange`.

## Containers and deploy
- `backend/Dockerfile`: `rust:1-bookworm` builder (cargo-chef style dependency caching) → `debian:bookworm-slim`
  runtime with ca-certificates, non-root user, `/data/media`, `HEALTHCHECK` hitting `/api/health`.
- `frontend/Dockerfile`: `node:22-bookworm-slim` deps → build → standalone runner, non-root, port 3000.
- `docker-compose.yml`: `db` (postgres:16, volume `pgdata`, healthcheck), `api` (depends on db healthy, volume
  `media`), `web` (depends on api, port `${WEB_PORT:-3000}:3000`). Optional profile `https` adds `caddy`
  (`deploy/Caddyfile`, ports 80/443, volume for certs).
- `deploy/compose.prod.yml`: uses `ghcr.io/<owner>/recipe-box-{api,web}:<tag>` images instead of building.
- `scripts/backup.sh` / `scripts/restore.sh` (+ `scripts/backup-lib.sh`): `pg_dump` + tar of the media volume, checksummed, retention, safe restore; tested by `e2e/tests/backup` (CI job `backup`, `docker-compose.backup-e2e.yml`). See `docs/DEPLOY.md`.
- CI (`.github/workflows/ci.yml`): backend fmt/clippy/test with a postgres service; frontend lint/tsc/vitest/
  build; on `main` and tags, buildx multi-arch images pushed to GHCR.

## Definition of done (every issue)
Backend: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` (with
`TEST_DATABASE_URL`). Frontend: `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build`.
`docker compose build` succeeds in CI. Docs updated (README / wiki page for the feature). The issue's acceptance
checklist ticked.
