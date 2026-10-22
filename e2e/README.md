# Recipe Box end-to-end suite

Playwright + TypeScript. Projects: `api` (request fixtures, typed client in `support/api-client.ts`), `web-desktop`,
`web-ipad` (iPad Pro 11 landscape), `web-phone` (iPhone 15), and `compose` (restart persistence; compose stack only).

```sh
npm ci
npm test                    # native stack: throwaway database on local Postgres + cargo-built API + next start
E2E_STACK=compose npm test  # docker-compose.e2e.yml (what CI runs)
```

Native mode needs Postgres reachable as `E2E_PG_ADMIN_URL` (default `postgres://recipes:recipes@127.0.0.1:5432/postgres`),
`psql`, Rust and `frontend/node_modules`. Logs of the stack go to `e2e/.stack/`. Chromium comes from
`npx playwright install chromium` (or `PLAYWRIGHT_BROWSERS_PATH`).

Rules (see issue #52): no retries, fixed clock/timezone/locale, nothing leaves 127.0.0.1/localhost/the fixture site,
every test creates its own user and data (`member`, `makeUser`, `unique()` in `support/fixtures.ts`), no sleeps.
Link import reaches the fixture site (`backend/tests/fixtures/`) through `IMPORT_ALLOW_HOST` (test stacks only).
