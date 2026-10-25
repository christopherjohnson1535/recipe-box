# Recipe Box API contract

The machine-readable contract is [`docs/openapi.json`](openapi.json): every route, request and response shape,
error responses and the `rb_session` cookie scheme. It is generated from the Rust handlers
(`cd backend && cargo run --bin openapi > ../docs/openapi.json`), and `frontend/src/lib/api-types.ts` is generated
from it (`cd frontend && npm run api:types`). CI fails when either is stale, and when a PR breaks the API relative to
`main` unless it carries the `breaking-api` label. This file keeps what the spec cannot say: conventions, the error
table, limits and behaviour. To build a client in another language, see [SDK.md](SDK.md).

Base path: `/api` (the browser reaches it through the frontend origin; Next.js rewrites to the API container).
JSON uses **camelCase**. Times are RFC 3339 strings. IDs are UUIDs.
Auth: cookie `rb_session` (httpOnly, SameSite=Lax, Secure when `COOKIE_SECURE=true`, Max-Age = `SESSION_DAYS`).

## Errors
Every non-2xx response:
```json
{ "error": { "code": "not_found", "message": "Recipe not found." } }
```
| HTTP | code | when |
|---|---|---|
| 400 | `validation` | bad body/query; `message` says which field. A malformed `:id` says `id: not a valid id.`; a wrong content type on a JSON route is also 400 |
| 401 | `unauthenticated` | no/expired session |
| 403 | `forbidden` | not admin; setup already done |
| 404 | `not_found` | |
| 409 | `conflict` | username taken; restore window passed |
| 405 | `method_not_allowed` | known path, wrong method |
| 413 | `too_large` | upload over `MAX_UPLOAD_MB` (multipart routes: `/api/media`, `/api/import/photo`, `/api/import/export`), or any other request body over 1 MB |
| 415 | `unsupported_media` | not an image we can decode, or over 10,000 px a side / 40 megapixels |
| 422 | `no_recipe_found` | page/photo had no recipe |
| 422 | `ai_disabled` | AI needed but `AI_PROVIDER=none` |
| 502 | `ai_error` | the AI provider failed: timeout, rejected key, busy after one retry, or a reply we could not read |
| 422 | `blocked_address` | URL resolves to a non-public IP |
| 502 | `site_blocked` | site returned 401/403/429/503 or a bot check — UI offers paste-text |
| 502 | `fetch_failed` | DNS, timeout, too large, other HTTP error |
| 501 | `not_implemented` | scaffold stub |
| 500 | `internal` | logged; message is generic |
| 502 | `api_unreachable` | **frontend proxy only**: the web container can't reach the API |
| 0 | `network` | **browser client only** (`ApiError`): the browser can't reach the web server |

The list of codes can grow. Clients treat an unknown code as a generic failure; the OpenAPI spec marks `ErrorCode` with `x-extensible-enum` for that reason.

Limits on JSON routes: body 1 MB; passwords at most 1024 characters (a longer one on login or password change is
refused with the usual 401 "Wrong username or password."; elsewhere 400); recipe `description` at most 10,000
characters, `notes` 20,000, each ingredient/step line 2,000, at most 500 ingredients, 500 steps and 50 tags
(400 `validation`, message starts with the field name). `POST /api/auth/logout` always returns 204 and clears the cookie,
even with no or an expired session.

## Clients outside the browser

Scripts and SDKs use the same session cookie as the web app; there are no bearer tokens or API keys yet.

1. `POST /api/auth/login` with `{"username", "password"}`.
2. Keep the `rb_session` cookie from the `Set-Cookie` response header and send it back on every later request (any
   cookie jar does this).
3. With `COOKIE_SECURE=true` the cookie is `Secure`, so it is only sent over HTTPS.

## Behaviour the spec does not spell out

Shapes (fields, nullability, enums) are in the spec; read these for rules.

- **Setup**: `POST /api/setup` is 403 `forbidden` once any user exists. Password at least 10 characters, username 3-40
  characters `[a-z0-9_.-]`.
- **Login**: same 401 message for an unknown user and a wrong password (constant-time verify).
- **Recipes**: `RecipeInput` blank ingredient/step texts are dropped, `tags` are trimmed, lower-cased and deduped,
  `sourceUrl` is http(s) only. `PUT` is a full replace. `DELETE` is a soft delete; `restore` answers 409 `conflict`
  when the recipe was deleted more than 10 minutes ago.
- **Recipe list**: excludes soft-deleted; `limit` 1..200 (default 50); `total` counts all matches, ignoring
  `limit`/`offset`.
  - `q` (blank = no filter): a recipe matches when the `websearch_to_tsquery('simple', q)` hits its title,
    description, notes or ingredients (`"exact phrase"`, `-exclude`, `or` work), **or** its title starts with `q`
    (`%`/`_` literal), **or** every word of `q` is a word prefix (`weeknight lasag` finds "Weeknight lasagne"; skipped
    when `q` uses quotes, `-` or `or`), **or** one of its tag names starts with `q` (case-insensitive, `dinner`/`din`
    find recipes tagged dinner). NUL bytes in `q` and `tag` are ignored.
  - `tag`: exact tag name (case-insensitive), ANDed with `q`.
  - `sort`: `newest` (default), `title` (A-Z), `time` (total minutes ascending, unknown last, then title). With `q` and
    no `sort`, results are ranked: title-prefix hits, then `ts_rank`, then newest. An explicit `sort` always wins.
    Anything else is `400 validation`.
- **Tags**: only tags used by live recipes, sorted by name.
- **Media**: accepts JPEG/PNG/WebP/GIF and HEIC/HEIF (iPhone/iPad photos; decoded by libheif's `heif-convert` in a
  child process with a 30 s limit, binary from `HEIF_CONVERT`). Re-encoded to JPEG q85, EXIF orientation applied, long edge at
  most 2400 px. Images over 10,000 px a side or 40 megapixels are refused (`415 unsupported_media`) before any pixels
  are decoded. `GET /media/{file_name}` requires a session; `file_name` must match `^[0-9a-f-]{36}(\.display)?\.jpg$`.
- **Display renditions** (illustrated plates): every stored image also gets `<uuid>.display.jpg`, a deterministic
  print-style version (centred crop 4:3 for landscape, 1:1 otherwise; long edge at most 1600 px, never upscaled; levels
  and midtones normalised toward one house look, colour cast partly neutralised, saturation muted, then a soft S tone
  curve, warm paper tint and light grain; JPEG q82). The original `<uuid>.jpg` is never changed and stays viewable
  full size. `POST /api/media` returns `displayUrl` (null if the rendition could not be made; the upload still
  succeeds). Photos stored before this existed get theirs from a background task at API start. Recipes and recipe
  list items carry `imageDisplayUrl`: the main photo's rendition when the household setting `plateTreatment` is on
  and the rendition exists, else null; `imageUrl` always points at the original. Import drafts carry no
  `imageDisplayUrl`. Backup export does not include renditions; images without one get it from the background pass at the next API start.
- **Settings**: `GET /api/settings` (any signed-in user) returns `{ "plateTreatment": true }`; `PUT /api/settings`
  (admin only, `403 forbidden` for a member) takes the same body and returns it. A missing, mistyped or unknown field
  is `400 validation`. `plateTreatment` defaults to on.
- **Imports return drafts and never save.** For `import/url`, `sourceUrl` is the final URL after redirects,
  `duplicateOf` the id of a live recipe with the same normalised source URL, and `imageId`/`imageUrl` the stored copy
  of the main photo (if it could not be fetched or decoded, or is over the size limits above, they are null and
  `warnings` says so). The whole request (fetch plus reading the page) has a 15 s budget; if reading the page runs
  out of it the answer is `502 fetch_failed` ("took too long to read"). Pages too deeply nested or tag-dense to read
  safely count as `422 no_recipe_found` unless they carry JSON-LD. Lists are cut at 500 items and text fields at
  10,000 characters, durations over 7 days are dropped; each adds a `warnings` entry.
- **Text import** (`POST /api/import/text`, `{text, sourceUrl?}`): `text` empty or blank is `400 validation`; so is a
  `sourceUrl` that is not http(s). The text goes to the AI provider (`422 ai_disabled` when `AI_PROVIDER=none`,
  `422 no_recipe_found` when the model finds none, `502 ai_error` when the provider fails). Only the first 50,000
  characters are read; a longer text adds a `warnings` entry. The draft has `sourceType` `text`; if `sourceUrl` is
  given it is kept (credentials and fragment removed) and `duplicateOf` is set as for links, but the address is
  never fetched.
- **AI fallback for links.** When `import/url` finds no JSON-LD or microdata recipe and AI is on, the page's visible
  text (main content, at most 20,000 characters, no navigation or scripts) goes to the AI provider as for text
  import. The draft has `sourceType` `link`, the page's `sourceUrl`/`sourceName`/main photo, and a `warnings` entry
  saying the AI read the page text. Pages with fewer than about 200 characters of text, pages too complex to read,
  and "no recipe" answers from the model are `422 no_recipe_found`; a provider failure is `502 ai_error`. Pages that
  have recipe data never reach the AI. The AI call has its own timeout and is not part of the 15 s page budget.
  With AI off nothing changes.
- **Photo import** (`POST /api/import/photo`, multipart): 1-6 `files` (repeat the field) and optional `mode`
  `recipe` (default) or `dish`; 0 or more than 6 files, or another `mode`, is 400 `validation`. The request may be up
  to 6 × `MAX_UPLOAD_MB`; each file over `MAX_UPLOAD_MB` is 413 `too_large`. Every photo is stored first (re-encoded
  like `/api/media`; an unreadable one is 415 and nothing from that request is kept), then the photos go to the AI
  provider in upload order, so several pages become one draft (PHO-3). The draft has `sourceType: photo` and
  `photoImageIds` in upload order; in `dish` mode `imageId`/`imageUrl` are the first photo and `warnings` includes
  "Guessed from a photo of the dish" (PHO-4). When no draft comes back (422 `ai_disabled`, 422 `no_recipe_found`,
  502 `ai_error`) the photos stay stored and the body's `error` also carries `"photoImageIds": [...]` so the UI can
  show them beside an empty form (PHO-5). No other error has that field.
- **Draft confidence and regions (optional, future).** Not yet returned by the API; the UI shows them when present and
  never invents them. A draft may carry `confidence`: `{ "title": 0.9, "ingredients": [0.98, 0.4, ...] }`, scores from
  0 to 1, `ingredients` indexed like the draft's `ingredients`; any key may be missing. The import screen flags a row
  below 0.6 as doubtful (the screen flags every such row). A draft may also carry `regions`: `[{ "photo": 0, "x": 0.1, "y": 0.2, "w": 0.4,
  "h": 0.1, "label": "title" }]`, boxes on the uploaded photos as fractions of width and height (`photo` is the index in
  upload order, default 0); boxes are drawn over the first photo only when present. `warnings` (already returned) is
  shown as a note.
- **AI provider** (`AI_PROVIDER=anthropic`): images are shrunk to at most 1568 px on the long edge before sending; the
  reply is validated and capped like link import (500 items, field lengths as in `/api/recipes`), each cut adding a
  `warnings` entry. One retry on 429/5xx/connect errors (not after
  a timeout, nor when `retry-after` asks for more than 10 s); otherwise 502 `ai_error`. A reply cut off at the token
  limit is kept when usable, with a warning. The API key is never logged or returned.
- **Users (admin)**: changing **your own** password requires `currentPassword` (401 `unauthenticated` if wrong, same
  message as a bad login); an admin resetting **someone else's** doesn't. Password at least 10 characters. Ends that
  user's other sessions (the caller's current session stays when it is their own password). `DELETE` ends the deleted
  user's sessions and refuses yourself and the last admin.
- **Export (admin)**: `GET /api/export` is a zip with `recipes.json` + `media/*`; `POST /api/import/export` skips
  recipes whose id exists. Both return 501 until the export issue lands; the spec records the intended success shapes.
