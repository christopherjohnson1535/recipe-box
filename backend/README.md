# Recipe Box API

Rust (axum 0.8, sqlx 0.9, tokio) API for Recipe Box. Contract: [`docs/API.md`](../docs/API.md); plan and module
map: [`docs/SPEC.md`](../docs/SPEC.md).

## Run locally

Needs Rust (stable) and Postgres 16. The role must be allowed to create the `citext` extension (or create it
once yourself: `create extension citext;`). Migrations in `migrations/` run on start.

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

```sh
cargo fmt --check
cargo clippy --all-targets -- -D warnings
TEST_DATABASE_URL=postgres://recipes:recipes@127.0.0.1:5432/recipes_test cargo test
```

Integration tests (`tests/api.rs`) give each test its own schema in `TEST_DATABASE_URL` and drop it afterwards; the
role needs `create` on that database (and the `citext` extension, created in `public` on first run). Without
`TEST_DATABASE_URL` they print a note and pass, so `cargo test` alone runs only the unit tests.

## Layout

- `src/main.rs` — config, tracing, pool, migrations, purge task, graceful shutdown (SIGTERM / Ctrl-C).
- `src/lib.rs` — module tree, `migrate`, hourly `purge` (recipes deleted > 1 day, expired sessions).
- `src/routes/*` — one file per area; `router()` in `routes/mod.rs`.
- `src/auth/*` — argon2id passwords, DB sessions (cookie `rb_session`, SHA-256 of the token stored),
  `CurrentUser` / `AdminUser` extractors.
- `src/import/*` — link/text/photo import: stubs with docs on what each feature issue must build.
- `src/error.rs` — `AppError` (the API error table) and `AppJson` / `AppQuery` / `AppPath` extractors that answer
  rejections in the same JSON shape.

## Docker

`docker build -t recipe-box-api backend` — `rust:1-bookworm` builder with a cached dependency layer →
`debian:bookworm-slim`, non-root user `app` (uid 10001), `/data/media` volume, port 8080, `HEALTHCHECK` on
`/api/health`.
