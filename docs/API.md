# Recipe Box API contract

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
| 422 | `blocked_address` | URL resolves to a non-public IP |
| 502 | `site_blocked` | site returned 401/403/429/503 or a bot check — UI offers paste-text |
| 502 | `fetch_failed` | DNS, timeout, too large, other HTTP error |
| 501 | `not_implemented` | scaffold stub |
| 500 | `internal` | logged; message is generic |
| 502 | `api_unreachable` | **frontend proxy only**: the web container can't reach the API |
| 0 | `network` | **browser client only** (`ApiError`): the browser can't reach the web server |

Limits on JSON routes: body 1 MB; passwords at most 1024 characters (a longer one on login or password change is
refused with the usual 401 "Wrong username or password."; elsewhere 400); recipe `description` at most 10,000
characters, `notes` 20,000, each ingredient/step line 2,000, at most 500 ingredients, 500 steps and 50 tags
(400 `validation`, message starts with the field name). `POST /api/auth/logout` always returns 204 and clears the cookie,
even with no or an expired session.

## Types
```ts
type Ingredient = { text: string; section: string | null };
type Step = { text: string; section: string | null };
type SourceType = "manual" | "link" | "photo" | "text";

type RecipeInput = {            // POST/PUT body
  title: string;                // 1..300 chars, required
  description?: string;         // default ""
  ingredients?: Ingredient[];   // blank texts dropped
  steps?: Step[];
  servings?: string | null;
  prepMinutes?: number | null;  // >= 0
  cookMinutes?: number | null;
  totalMinutes?: number | null;
  notes?: string;
  sourceUrl?: string | null;    // http(s) only
  sourceName?: string | null;
  sourceType?: SourceType;      // default "manual"
  imageId?: string | null;      // from POST /api/media or a draft
  photoImageIds?: string[];     // original import photos, in order
  tags?: string[];              // trimmed, lower-cased, deduped
};

type Recipe = Required<RecipeInput> & {
  id: string;
  imageUrl: string | null;      // "/media/<file>"
  photoUrls: string[];
  createdBy: UserRef | null;
  updatedBy: UserRef | null;
  createdAt: string;
  updatedAt: string;
};
type RecipeSummary = { id; title; description; totalMinutes; tags: string[]; imageUrl: string | null; sourceType; updatedAt };
type RecipeDraft = Omit<RecipeInput, "title"> & { title: string; imageUrl: string | null; warnings: string[]; duplicateOf: string | null };
type User = { id: string; username: string; displayName: string; role: "admin" | "member"; createdAt: string };
type UserRef = { id: string; displayName: string };
type Image = { id: string; url: string; width: number; height: number };
```

## Endpoints

### Health & setup
- `GET /api/health` → `200 { "status": "ok", "db": "ok", "version": "0.1.0" }` (503 with `db: "error"` if the DB is down).
- `GET /api/setup` → `200 { "needsSetup": boolean }`.
- `POST /api/setup` `{ username, displayName, password }` → `201 User` + session cookie. 403 `forbidden` if any user
  exists. Password ≥ 10 chars. Username 3–40 chars `[a-z0-9_.-]`.

### Auth
- `POST /api/auth/login` `{ username, password }` → `200 User` + cookie; 401 `unauthenticated` on bad credentials
  (same message for unknown user and wrong password; constant-time verify).
- `POST /api/auth/logout` → `204`, deletes the session row, clears the cookie.
- `GET /api/auth/me` → `200 User` or 401.

### Recipes
- `GET /api/recipes?q=&tag=&sort=newest|title|time&limit=50&offset=0` → `200 { items: RecipeSummary[], total: number }`.
  Excludes soft-deleted. `limit` 1..200. `total` counts all matches, ignoring `limit`/`offset`.
  - `q` (blank = no filter): a recipe matches when the `websearch_to_tsquery('simple', q)` hits its title,
    description, notes or ingredients (`"exact phrase"`, `-exclude`, `or` work), **or** its title starts with `q`
    (`%`/`_` literal), **or** every word of `q` is a word prefix (`weeknight lasag` finds "Weeknight lasagne"; skipped
    when `q` uses quotes, `-` or `or`), **or** one of its tag names starts with `q` (case-insensitive, `dinner`/`din`
    find recipes tagged dinner). NUL bytes in `q` and `tag` are ignored.
  - `tag`: exact tag name (case-insensitive), ANDed with `q`.
  - `sort`: `newest` (default), `title` (A–Z), `time` (total minutes ascending, unknown last, then title). With `q` and
    no `sort`, results are ranked: title-prefix hits, then `ts_rank`, then newest. An explicit `sort` always wins.
    Anything else is `400 validation`.
- `POST /api/recipes` `RecipeInput` → `201 Recipe`.
- `GET /api/recipes/:id` → `200 Recipe` (404 if deleted).
- `PUT /api/recipes/:id` `RecipeInput` (full replace) → `200 Recipe`.
- `DELETE /api/recipes/:id` → `204` (soft delete).
- `POST /api/recipes/:id/restore` → `200 Recipe`; 409 `conflict` if deleted more than 10 minutes ago.

### Tags
- `GET /api/tags` → `200 [{ "name": "dinner", "count": 12 }]`, sorted by name, only tags used by live recipes.

### Media
- `POST /api/media` multipart field `file` → `201 Image`. Accepts JPEG/PNG/WebP/GIF (HEIC: issue). Re-encoded to
  JPEG q85, EXIF orientation applied, long edge ≤ 2400 px. Images over 10,000 px a side or 40 megapixels are refused
  (`415 unsupported_media`) before any pixels are decoded.
- `GET /media/:fileName` → the image (`Cache-Control: private, max-age=31536000, immutable`). Requires session.
  `fileName` must match `^[0-9a-f-]{36}\.jpg$`.

### Import (drafts only — never saves)
- `GET /api/import/capabilities` → `{ "ai": boolean, "provider": "none" | "anthropic" }`.
- `POST /api/import/url` `{ url }` → `200 RecipeDraft`. Errors: `blocked_address`, `site_blocked`, `fetch_failed`,
  `no_recipe_found`. A bad URL is `400 validation`. `sourceUrl` is the final URL after redirects, `duplicateOf` the id
  of a live recipe with the same normalised source URL, and `imageId`/`imageUrl` the stored copy of the main photo
  (if it could not be fetched or decoded, or is over the size limits above, they are null and `warnings` says so).
  The whole request (fetch plus reading the page) has a 15 s budget; if reading the page runs out of it the answer is
  `502 fetch_failed` ("took too long to read"). Pages too deeply nested or tag-dense to read safely count as
  `422 no_recipe_found` unless they carry JSON-LD. Lists are cut at 500 items and text fields at 10,000 characters,
  durations over 7 days are dropped; each adds a `warnings` entry.
- `POST /api/import/text` `{ text, sourceUrl? }` → `200 RecipeDraft` (AI; `ai_disabled` without it).
- `POST /api/import/photo` multipart `files` (1–6) + `mode` (`recipe`|`dish`) → `200 RecipeDraft` with
  `photoImageIds` set. Without AI: 422 `ai_disabled` **after** storing the photos — the body's `error` also carries
  `"photoImageIds": [...]` so the UI can show photo + empty form (PHO-5).

### Users (admin)
- `GET /api/users` → `User[]`; `POST /api/users` `{ username, displayName, password, role }` → `201 User`;
  `DELETE /api/users/:id` → `204` (not yourself; not the last admin);
  `PUT /api/users/:id/password` `{ password, currentPassword? }` → `204` (admin, or the user themself).
  Changing **your own** password requires `currentPassword` (401 `unauthenticated` if wrong, same message as a bad
  login); an admin resetting **someone else's** doesn't. Password ≥ 10 chars. Ends that user's other sessions (the
  caller's current session stays when it is their own password). `DELETE` ends the deleted user's sessions.
  Errors: 403 `forbidden` (member on admin routes, or a member changing another user's password; deleting yourself;
  deleting the last admin), 404 `not_found`, 409 `conflict` (username taken), 400 `validation`.

### Export (admin)
- `GET /api/export` → `application/zip` with `recipes.json` + `media/*`.
- `POST /api/import/export` multipart `file` (that zip) → `200 { imported, skipped }` (skips same id).
