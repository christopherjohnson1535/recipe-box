# Phase 1 final check, R5 integration (2026-10-21)

Branch `issue-9-phase1-review`. Live stack: API release build + frontend standalone build from main (API :8080, web :3000),
local Postgres 16. Everything below went through the web port (:3000). Test data (`R5 Test Pie`, member `r5member`) was
created and removed again.

## Checks
| Tree | Check | Result |
|---|---|---|
| backend | `cargo fmt --check` | pass |
| backend | `cargo clippy --all-targets -- -D warnings` | pass |
| backend | `cargo test` (29 unit, 8 + 17 + 9 + 8 integration) | pass |
| frontend | `npm run lint` | pass |
| frontend | `npx tsc --noEmit` | pass |
| frontend | `npx vitest run` | pass |
| frontend | `npm run build` | not run (live server uses it) |

## Smoke (through :3000)
| Request | Status | Note |
|---|---|---|
| GET /api/health | 200 | db ok, version 0.1.0 |
| GET /api/setup; POST /api/setup | 200; 403 | `needsSetup:false`; `forbidden` |
| GET /api/recipes signed out | 401 | `unauthenticated` |
| POST /api/auth/login bad / good | 401 / 200 | same message for wrong password |
| GET /api/auth/me; POST /api/auth/logout; me again | 200; 204; 401 | |
| POST /api/recipes (tags `R5tag`,`Dinner`) | 201 | tags lower-cased |
| POST /api/recipes empty title | 400 | `validation`, names the field |
| GET /api/recipes/not-a-uuid | 400 | message leaks the Rust parse error ("Cannot parse `id` ... UUID parsing failed"), see S-1 |
| GET / PUT /api/recipes/:id | 200 / 200 | PUT is a full replace |
| PUT with unknown imageId | 400 | `unknown image` |
| DELETE; GET deleted; list/tag counts | 204; 404; excluded | tag counts drop the deleted recipe |
| POST restore (just deleted) | 200 | |
| POST restore of a live recipe | 200 | idempotent, fine |
| POST restore unknown id | 404 | |
| Restore after the 10 min window -> 409 | not run | cannot wait; covered only by backend tests, if at all |
| GET /api/tags | 200 | |
| GET /api/recipes `q=pie`, `q=r5 te` (word prefix), `tag=R5TAG`, `q`+`tag` | 200 | all found the test recipe |
| `sort=title`, `sort=time` | 200 | |
| `sort=bogus`, `limit=0`, `limit=201` | 400 | `validation` |
| nasty `q`: `%_%`, `"unterminated`, `'; DROP TABLE recipes;--`, `&\|!():*`, 5,000 chars, emoji | 200 | empty results, no 500 |
| `q=a%00b` (NUL) | 200 | NUL ignored, matches `ab`-style results (returned rows) |
| POST /api/media PNG | 201 | re-encoded JPEG |
| POST /api/media text file; signed out | 415; 401 | |
| GET /media/<file> signed in / out | 200 / 401 | |
| GET /media/../../etc/passwd (`--path-as-is`) | 404 | returned the Next.js HTML 404 page, not file contents |
| GET /media/..%2f..%2fetc%2fpasswd, /media/passwd, unknown uuid | 404 | `Image not found` |
| POST /api/import/url 127.0.0.1, localhost, 169.254.169.254, 10.0.0.1, [::1], 0x7f000001, 2130706433, [::ffff:127.0.0.1], 192.168.1.1 | 422 | all `blocked_address` |
| POST /api/import/url invalid, ftp://, file:// | 400 | `validation` |
| POST /api/import/url https://example.com/recipe | 502 | `fetch_failed` (no internet in the sandbox) |
| POST /api/import/url signed out | 401 | |
| GET /api/import/capabilities | 200 | `ai:false` |
| POST /api/import/text, /api/import/photo | 501 | `not_implemented`, API.md says 422 `ai_disabled` (photo: after storing photos), see S-2 |
| GET /api/users as admin | 200 | |
| POST /api/users member; duplicate; short password | 201; 409; 400 | |
| Member: GET/POST/DELETE users, GET /api/export | 403 | `forbidden` |
| Member: GET /api/recipes | 200 | |
| Member changes admin's password | 403 | |
| Member own password: no `currentPassword`, wrong one, correct | 401, 401, 204 | old password then 401, new one 200 |
| Admin resets member password | 204 | member's session ended (me -> 401) |
| Admin deletes self | 403 | |
| Admin deletes member; again | 204; 404 | deleted member's session dead (401) |
| GET /api/export as admin | 501 | stub (Phase 2) |
| Unknown /api/nope (in and out), unknown page /nope | 404 | JSON / HTML |
| Signed out: /, /recipes/new, /settings, /import | 307 -> /login | `?next=` kept except for `/` |
| /login; / signed in | 200 | |
| `SMOKE_RESTART=0 sh scripts/smoke.sh` | OK | |

No smoke failures; the only deviations are the stubs in S-2.

## WARN lines (shoot.py)
None. No page was scrolled on load or overflowed horizontally, in any of 102 shots.

## Screenshots
`shots/before/` (gitignored): `{light,dark}-<page>-{desktop,ipad,ipad-landscape,phone}.png` for home, home-q (`?q=`),
home-tag (`?tag=`), recipe (richest), recipe-long (longest title), new, edit, cook, import-link, import-photo,
settings, notfound; plus `{light,dark}-login-{ipad,desktop,phone}.png`. 102 files.
Looked at: every page light iPad; home and recipe dark at all four sizes; phone light home/recipe-long/import/settings
(phone light home and recipe were seen via their dark twins and the long recipe).

## Problems
No Must items.

### Should
- S-1 Raw framework error text in a 400: `GET /api/recipes/not-a-uuid` returns "Invalid URL: Cannot parse `id` with
  value ... UUID parsing failed: invalid character". Make it a generic `not_found`/`validation` message.
- S-2 Photo/text import and export are still stubs (501 `not_implemented`), but the Photo tab
  (`light-import-photo-ipad.png`) says "They are kept and shown beside an empty recipe", which API.md promises as
  422 `ai_disabled` + `photoImageIds`. Clicking "Keep photos and type it in" will therefore fail today. Either
  implement the AI-off photo path or hide/disable the tab until it exists. The Text tab has the same gap.
- S-3 Restore after the 10 minute window (409) could not be smoke tested; confirm a backend test covers it.

### Nice
- N-1 Search results header: with `?q=` or `?tag=` the page keeps the "Recipes" title but drops the count line and leaves
  a blank gap above the buttons (`light-home-q-ipad.png`, `light-home-tag-ipad.png`).
- N-2 Home grid at desktop/iPad landscape (2 columns): rows share height, so a short card leaves a large empty hole
  (Lemon drizzle cake, `dark-home-desktop.png`).
- N-3 Phone home: the sort select drops to its own row under search (`dark-home-phone.png`); category kicker wraps
  ("DINNER · VEGETARIAN · / WEEKNIGHT").
- N-4 Phone recipe: a dangling "·" ends the "Added by ... on Oct 21, 2026 ·" line before "Source:"
  (`dark-recipe-phone.png`).
- N-5 Edit form: after a section heading row the next row loses its "Section" button (`light-edit-ipad.png`), so the
  controls look misaligned. Long recipe with no ingredients/steps shows empty "No ingredients listed" boxes
  (`light-recipe-long-ipad.png`), acceptable.
