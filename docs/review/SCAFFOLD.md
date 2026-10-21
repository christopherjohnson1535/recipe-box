# Scaffold check (2026-10-21)

Factory stage 5 run by the orchestrator on the scaffold (API release build + frontend standalone build, local
Postgres 16). No Docker daemon was available in the sandbox, so the images are not built yet — see the
"Verify the container stack" issue.

## Static
| Tree | Check | Result |
|---|---|---|
| backend | `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` | pass |
| backend | `cargo test` (9 unit, 7 integration against Postgres) | pass |
| frontend | `npm run lint`, `npx tsc --noEmit` | pass |
| frontend | `npx vitest run` (17 tests) | pass |
| frontend | `npm run build` (standalone) | pass |

## Smoke (all requests through the web server's runtime proxy)
| Request | Status | Note |
|---|---|---|
| GET /api/health | 200 | `{"db":"ok","status":"ok"}` |
| GET /api/setup | 200 | `needsSetup: true` before setup |
| POST /api/setup | 201 | admin created, cookie set; second setup → 403 `forbidden` |
| POST /api/recipes ×2 | 201 | with tags, source, image |
| POST /api/media (1600×1000 PNG) | 201 | re-encoded JPEG |
| GET /media/<file> | 401 / 200 | without / with session |
| GET /api/recipes, /api/tags | 200 | counts correct |
| POST /api/import/url | 501 | `not_implemented` stub |
| GET / signed out | 307 → /login | |
| GET / signed in | 200 | |

## Screenshots
Every page (home, recipe, new, import, settings, cook, not-found, login) × light/dark × desktop 1440, iPad 820,
phone 390 — 44 shots. No page scrolled on load; nothing overflowed horizontally. Looked at: home (iPad), recipe
(desktop), login (dark iPad), import (dark phone). Clean, warm, readable; placeholders name the issue that fills them.

## Known follow-ups (in the backlog)
- Startup prints a backtrace when the port is already in use — make it a one-line error (Phase 1 review issue).
- Photo import needs its own body limit and an error body that can carry `photoImageIds`.
