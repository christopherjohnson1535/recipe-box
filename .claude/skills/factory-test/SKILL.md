---
name: factory-test
description: Stage 5 of the software factory — prove the build works - unit and integration tests, a smoke run on seeded data, and screenshots of every page in light and dark at iPad, phone and desktop size that the orchestrator actually looks at. Use before shipping, after any fix wave, and after any UI change.
---

# Test

## 1. Static and unit
Backend: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` (with
`TEST_DATABASE_URL`). Frontend: `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build`.
Required test kinds:
- Data-safety tests for every write path (save, soft delete/restore, import never half-saves, backup/restore).
- Security tests: unauthenticated and non-admin access refused; SSRF attempts refused (`127.0.0.1`, `10.x`,
  `169.254.169.254`, `::1`, redirects to them); oversized and non-image uploads refused.
- Integration tests with a local test server or mocked HTTP for external sites and the AI provider (timeouts,
  retries only where safe, AI-off behaviour).
- UI guard tests once the design system lands: token contract + contrast, no page-level styling.

## 2. Smoke run on seeded data
Start Postgres, the API (`backend/target/release/recipe-box-api` or `cargo run`) and the built frontend
(standalone: copy `public` and `.next/static` into `.next/standalone`, then `node server.js` with
`API_INTERNAL_URL`), or `docker compose up -d --build` where Docker is available.
Seed: `POST /api/setup`, then a handful of recipes with photos, tags, sections and long text.
Exercise through the web port with curl and record a table (request · status · note) in `docs/review/FINAL*.md`:
health; setup once then 403; login/logout; recipe CRUD, delete + restore, restore after the window → 409; tags;
media upload + auth on `/media`; each import endpoint (success, `site_blocked`, `blocked_address`,
`ai_disabled`); admin routes as a member → 403; unknown pages 404; signed-out pages redirect to `/login`.
`docs/review/SCAFFOLD.md` is an example.

## 3. Screenshots — and look at them
`python3 scripts/factory/shoot.py <base-url> <out-dir> <recipe-id>` signs in (`SHOOT_USER`/`SHOOT_PASSWORD`) and
captures every page × light/dark × desktop 1440 / iPad 820 / phone 390, warning about any page that is scrolled
on load or overflows horizontally. Then:
- Open at least: every page in light at iPad size, the busiest page (home, recipe) in dark and on the phone.
- Check: editorial style per `docs/UI.md`, nothing scrolled on load, nothing overflowing at 390 px, focus
  visible, headers not hidden behind sticky bars, empty/error/offline states present.

## Gate
All checks green, smoke table green, screenshots reviewed by the orchestrator with any issue sent to a fix agent.
