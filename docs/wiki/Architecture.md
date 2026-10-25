# Architecture

```
 browser / iPad PWA ──https──▶ caddy (optional) ──▶ web (Next.js :3000) ──/api, /media──▶ api (Rust axum :8080) ──▶ postgres
                                                                                         └─▶ media volume, recipe sites, AI provider
```

- **web** — Next.js 16 frontend. Serves pages and proxies `/api/*` and `/media/*` to the API at runtime
  (`API_INTERNAL_URL`), so the browser only ever talks to one origin and the session cookie just works.
- **api** — Rust (axum + sqlx). The only component that touches the database, stored photos, outside websites and
  the AI provider. Migrations run on start. Built in layers, see below.
- **db** — Postgres 16 with full-text search over titles, ingredients and notes.
- **caddy** — optional HTTPS front door with automatic certificates.

## How the backend is layered
The backend is a Cargo workspace in `backend/`. Code points inward only: adapters use the app, the app uses ports,
ports use the domain. The compiler and a CI check enforce it.

| Layer | Crate | What it holds |
|---|---|---|
| Domain | `domain` | Recipes, users, validation, time rules, `DomainError` |
| Ports | `ports` | Traits for what the app needs: storage, media, clock, AI, page fetching |
| App | `app` | The use cases (recipes, imports, media, sign-in; export is a stub) |
| Adapters | `adapters/*` | `http` (routes), `postgres`, `memory`, `fs-media`, `anthropic`, `http-fetch`, `html` |
| Server | `recipe-box-api` | Config, wiring and start-up |

So a new database, photo storage or SDK is a new adapter, not a rewrite. Guides:
[[Extending the Backend]] and, in the repo,
[Adding a storage adapter](https://github.com/christopherjohnson1535/recipe-box/blob/main/docs/STORAGE-ADAPTERS.md),
[Client SDKs](https://github.com/christopherjohnson1535/recipe-box/blob/main/docs/SDK.md) and
[ADR 0008](https://github.com/christopherjohnson1535/recipe-box/blob/main/docs/adr/0008-hexagonal-backend.md).

Data model, API and design decisions: `docs/SPEC.md` and `docs/API.md` in the repo.

## Security in one paragraph
Accounts with argon2-hashed passwords and DB-backed sessions (httpOnly cookie, only a hash stored). Link import
fetches only public internet addresses, re-checked on every redirect. Uploaded images are decoded and re-encoded.
AI keys live only on the server. No telemetry.
