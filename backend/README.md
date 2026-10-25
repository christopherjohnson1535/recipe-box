# Recipe Box API

Rust (axum 0.8, sqlx 0.9, tokio) API for Recipe Box. Contract: [`docs/API.md`](../docs/API.md); crates and
dependency rule: [`docs/SPEC.md`](../docs/SPEC.md).

## Run locally

Needs Rust (pinned in `../rust-toolchain.toml`; rustup installs it on first `cargo` run) and Postgres 16. The role must be allowed to create the `citext` extension (or create it
once yourself: `create extension citext;`). Migrations in `crates/adapters/postgres/migrations/` run on start.

```sh
createdb recipes
DATABASE_URL=postgres://recipes:recipes@127.0.0.1:5432/recipes \
MEDIA_DIR=./data/media BIND_ADDR=127.0.0.1:8080 \
cargo run
curl http://127.0.0.1:8080/api/health
```

The first visit creates the admin (`POST /api/setup`). In the full stack the browser reaches the API through the
web container; the API port is not published.

## Environment

| Var | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `postgres://recipes:recipes@db:5432/recipes` | |
| `MEDIA_DIR` | `/data/media` | created on start; uploaded images as `<uuid>.jpg` |
| `BIND_ADDR` | `0.0.0.0:8080` | |
| `COOKIE_SECURE` | `false` | set `true` behind HTTPS |
| `SESSION_DAYS` | `30` | session cookie lifetime |
| `AI_PROVIDER` | `none` | `none` or `anthropic` (startup fails on anything else) |
| `ANTHROPIC_API_KEY` | — | required when `AI_PROVIDER=anthropic` |
| `AI_MODEL` | `claude-sonnet-5-5` | |
| `MAX_UPLOAD_MB` | `15` | request body limit and max upload size |
| `RUST_LOG` | `info` | tracing filter, e.g. `info,recipe_box_api=debug,tower_http=debug` |

## Test

From the repo root, `just check-backend` runs all of the below and `just test-backend` only the tests (`just db` shows how
to get Postgres). Raw commands:

```sh
cargo fmt --check
cargo clippy --all-targets -- -D warnings
TEST_DATABASE_URL=postgres://recipes:recipes@127.0.0.1:5432/recipes_test cargo test
```

Integration tests (`tests/*.rs`) give each test its own schema in `TEST_DATABASE_URL` and drop it afterwards; the
role needs `create` on that database (and the `citext` extension, created in `public` on first run). Without
`TEST_DATABASE_URL` they print a note and pass, so `cargo test` alone runs only the unit tests.

## Layout

A Cargo workspace (`Cargo.toml` here). The server package is `recipe-box-api`; the rest are in `crates/`.
Dependencies point inward: adapters → `app` → `ports` → `domain`. The server wires them.

| Path | Crate | What it holds |
|---|---|---|
| `crates/domain/` | `recipe-box-domain` | Types, `DomainError`, validation, constants. No web, database or OpenAPI crates. |
| `crates/ports/` | `recipe-box-ports` | The outbound traits, and with feature `contract` the storage contract suite (`ports::contract`). |
| `crates/app/` | `recipe-box-app` | Use-case services (`Services`, built from `Deps`). Tests in `crates/app/tests/` run on `adapter-memory`. |
| `crates/adapters/http/` | `recipe-box-adapter-http` | axum routes (`routes/*`), `extract.rs` (`CurrentUser` / `AdminUser`, cookie `rb_session`), `error.rs` (`AppError`, `AppJson` / `AppQuery` / `AppPath`), `dto.rs`, OpenAPI. Handlers parse, call one service, map. |
| `crates/adapters/postgres/` | `recipe-box-adapter-postgres` | Repositories, `migrations/`, `migrate()`. |
| `crates/adapters/memory/` | `recipe-box-adapter-memory` | In-memory ports for tests. |
| `crates/adapters/fs-media/` | `recipe-box-adapter-fs-media` | `MediaStore` on a directory. |
| `crates/adapters/http-fetch/` | `recipe-box-adapter-http-fetch` | The SSRF-guarded page fetcher (`safe_fetch.rs`). |
| `crates/adapters/html/` | `recipe-box-adapter-html` | Page reader: JSON-LD, microdata, readable text. |
| `crates/adapters/anthropic/` | `recipe-box-adapter-anthropic` | `RecipeExtractor` on the Anthropic Messages API. |

The server crate (`src/`):
- `main.rs` — config, tracing, pool, migrations, purge task, graceful shutdown (SIGTERM / Ctrl-C).
- `lib.rs` — module tree, hourly `purge` and the display backfill (both run `app::Maintenance` and log).
- `state.rs` — `AppState`: builds the adapters and `app::Deps`; `routes/mod.rs` builds the router from the HTTP adapter.
- `auth/*`, `media.rs`, `plate.rs`, `clock.rs` — adapters with no crate of their own: argon2id hashing, session
  tokens (SHA-256 stored), the image codec, the print-style rendition, the clock.
- `import/*` — extractor selection (`ai.rs`), HEIC converter (`photo.rs`).
- `error.rs`, `models.rs` — re-exports of the adapter's error and API types for the import code.
- `bin/openapi.rs` — prints the OpenAPI spec (`just openapi`).

`tests/` holds the HTTP integration tests. CI checks the dependency rule with `cargo tree`; see
"Where new backend code goes" in [`CLAUDE.md`](../CLAUDE.md).

## Docker

`docker build -t recipe-box-api backend` — `rust:1-bookworm` builder with a cached dependency layer →
`debian:bookworm-slim`, non-root user `app` (uid 10001), `/data/media` volume, port 8080, `HEALTHCHECK` on
`/api/health`.
