# Architecture

```
 browser / iPad PWA ──https──▶ caddy (optional) ──▶ web (Next.js :3000) ──/api, /media──▶ api (Rust axum :8080) ──▶ postgres
                                                                                         └─▶ media volume, recipe sites, AI provider
```

- **web** — Next.js 16 frontend. Serves pages and proxies `/api/*` and `/media/*` to the API at runtime
  (`API_INTERNAL_URL`), so the browser only ever talks to one origin and the session cookie just works.
- **api** — Rust (axum + sqlx). The only component that touches the database, stored photos, outside websites and
  the AI provider. Migrations run on start.
- **db** — Postgres 16 with full-text search over titles, ingredients and notes.
- **caddy** — optional HTTPS front door with automatic certificates.

Data model, API and design decisions: `docs/SPEC.md` and `docs/API.md` in the repo.

## Security in one paragraph
Accounts with argon2-hashed passwords and DB-backed sessions (httpOnly cookie, only a hash stored). Link import
fetches only public internet addresses, re-checked on every redirect. Uploaded images are decoded and re-encoded.
AI keys live only on the server. No telemetry.
