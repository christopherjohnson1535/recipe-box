# Phase 1 review: backend security and data safety (R1)

Cross-cutting pass over the backend as merged on `issue-9-phase1-review`. Method: read every route and the auth,
media, config and error code; ran a throwaway API (own database, port 18080, binary copied to scratch) and
probed it with curl; the live app was only checked for health. Expected load: one household.

Result: no Must findings. The rules that never bend hold. 2 Should, 6 Nice.

## Checked and fine (no action)
- **Route table.** Every route except `GET /api/health`, `GET|POST /api/setup`, `POST /api/auth/login` returned 401 with no
  cookie (24 routes swept, bodyless too: auth runs before body parsing). `/api/users*`, `/api/export`,
  `/api/import/export` use `AdminUser`; a member got 403 on each, and 403 when resetting an admin's password.
- **IDOR.** Recipes and media are household-shared by design, so there is no per-user ownership to bypass. Password
  change: member on another id 403, own id needs `currentPassword`. Unknown, deleted and malformed ids give 404 or 400.
- **Cookie.** `rb_session=<43 chars>; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`; `Secure` comes from
  `COOKIE_SECURE` (config.rs:30, compose passes it). 32-byte random token, only its SHA-256 is stored.
- **Server-side expiry and logout.** `expires_at > now()` is in the lookup (extract.rs:23); an expired row gave 401.
  Logout deletes the row (old token then 401). Login always issues a new token, so no fixation.
- **Setup race.** 6 concurrent `POST /api/setup`: one 201, five 403, one admin row (table lock, setup.rs:44).
- **CSRF.** `text/plain`, `application/x-www-form-urlencoded` and `multipart/form-data` bodies on POST/PUT
  `/api/recipes`, `/api/users`, `/api/users/:id/password`, `/api/import/url` all return 400 (JSON extractor needs
  `application/json`), so a cross-site form cannot reach a body-taking route. Bodyless state changes (DELETE recipe,
  POST restore, POST logout) rely on `SameSite=Lax` alone, which holds for cross-site requests.
- **Media.** Names must match `^[0-9a-f-]{36}\.jpg$` (media.rs:152); dotted, encoded and `..` forms all 404. A PNG
  with trailing `<script>` came back as a clean 631-byte JPEG; SVG, garbage and a 14 MB random file are 415; 16 MB is
  413; a missing `file` field is 400.
- **Secrets in logs.** At `RUST_LOG=debug` across setup, login, a wrong-password login, and a request with an
  `Authorization` header: the password, bearer value and session token never appeared (sqlx logs statements without
  binds; TraceLayer logs no headers).
- **Data safety.** Delete is soft; get, put and list ignore deleted rows; restore inside 10 min works, at 11 min 409.
  Deleting a user keeps their recipes (`createdBy` becomes null). Recipe create/update run in one transaction
  (recipes.rs:162, 191); the image file is removed if its row insert fails (media.rs:62). Earlier fixes (H-01..H-04,
  Q-01, S-01) are still in place and covered by tests.
- **Dependencies.** All current majors (axum 0.8, sqlx 0.9, tokio 1.54, image 0.25.10, argon2 0.6, rustls 0.23.46,
  reqwest 0.13). `cargo tree -d` shows only transitive duplicates (digest/sha2 0.10 and 0.11, base64, rand/getrandom,
  hashbrown, miniz_oxide); nothing flagged.

## Findings

### B-01 Should: login and password checks hash an unbounded password (pre-auth CPU)
- `backend/src/routes/auth.rs:35` (`password::verify(body.password, hash)`); same for `current_password` at
  `routes/users.rs:150`. `MAX_PASSWORD` (1024) is only applied when setting a password (`validate.rs:39`).
- Failing case: `POST /api/auth/login` with a 14 MB `password` and no cookie returned 401 after 1.6 s of argon2 work on a
  blocking thread. A handful of those pin the blocking pool for every other request, signed out or in.
- Smallest fix: at the top of `login` (and before the own-password verify) reject
  `body.password.chars().count() > validate::MAX_PASSWORD` with the same 401 "Wrong username or password." (a longer
  password can never have been set).

### B-02 Should: every JSON route accepts a 15 MB body, and recipe text fields have no length cap
- `routes/mod.rs:46` applies one `DefaultBodyLimit` (= `MAX_UPLOAD_MB`) to all routes; `validate.rs:103-125` caps only the title.
- Failing case: unauthenticated `POST /api/auth/login` buffered a 14 MB body (B-01); an authed `POST /api/recipes` with a
  3 MB `description` returned 201 and now sits in the row and the `search` tsvector (a 15 MB one would too). A runaway
  import or paste could store megabytes the search index must carry.
- Smallest fix: `DefaultBodyLimit::max(1 << 20)` on the router, and a larger layer only on the multipart routes
  (`/api/media`, `/api/import/photo`, `/api/import/export`); in `validate::recipe` cap description/notes (e.g. 20k chars),
  ingredients and steps (e.g. 500 each) and tags (e.g. 30), returning 400 `validation`. The import path already caps at
  500 items and 10,000 chars (FIXES #6 S-03), so use the same numbers.

### B-03 Nice: port in use (and other startup failures) print a backtrace
- `backend/src/main.rs:28` (`TcpListener::bind(&bind_addr).await?`), also `:19` (`connect`).
- Confirmed (SCAFFOLD item). With `RUST_BACKTRACE=1` set, binding an in-use port prints `Error: Address already in use
  (os error 98)` followed by a 20-line stack trace; an unreachable database prints "pool timed out while waiting for an
  open connection" after 10 s, also with a trace and no mention of the database. Bad `DATABASE_URL` and bad
  `COOKIE_SECURE` already give clean one-liners. Default Docker runs have no `RUST_BACKTRACE`, so this mostly hits
  native runs.
- Smallest fix: add context and print the chain without a trace:
  ```rust
  let listener = tokio::net::TcpListener::bind(&bind_addr).await
      .with_context(|| format!("cannot listen on {bind_addr} (is another copy already running?)"))?;
  ```
  and make `main` call a `run()` and on `Err(e)` do `eprintln!("error: {e:#}"); std::process::exit(1)`, so `anyhow`
  never renders `Debug` (which is where the backtrace comes from). Same `with_context` on `connect(&config.database_url)`
  ("cannot reach the database"; do not print the URL, it holds the password).

### B-04 Nice: 405 has an empty body, not the JSON error shape
- `routes/mod.rs` has a JSON fallback for unknown paths but no method fallback. `PATCH /api/recipes/:id` returns 405 with
  `content-length: 0`; docs/API.md says every non-2xx is `{ error: { code, message } }`.
- Smallest fix: `.method_not_allowed_fallback(|| async { AppError::Validation(..) })` with a 405 variant, or map in a
  tiny response layer. The web client treats an empty body as unknown, so low impact.

### B-05 Nice: a wrong content type is a 400 "invalid JSON", not 415
- `error.rs:96` maps every JSON rejection except 413 to Validation. `text/plain` gets "body: invalid JSON or wrong field
  type", which hides the real cause for someone scripting the API. Safe as is (it is why CSRF is closed). Fix if wanted:
  `StatusCode::UNSUPPORTED_MEDIA_TYPE` -> message "Send application/json."

### B-06 Nice: a stale or expired cookie is not cleared by logout
- `routes/auth.rs:56` takes `CurrentUser`, so logging out with an expired session returns 401 and leaves the dead cookie.
  Harmless (the web app sends the user to sign-in anyway). Fix if wanted: take `jar` only and always clear.

### B-07 Nice: no Origin/Fetch-Metadata check on the bodyless POST/DELETE routes
- Delete recipe, restore, logout depend only on `SameSite=Lax`. A page on a sibling origin of the same site (another port
  on the same host or LAN name) can send them with the cookie. Low in a household install; if wanted, reject
  state-changing requests whose `Origin` host differs from `Host` in a tiny middleware.

### B-08 Nice: login is unthrottled and each login adds a session row
- Known (FIXES #8 H-05, filed as its own issue). Noted here because B-01 makes the cost of a bad login larger; both are
  fixed cheaply together once throttling lands.

## Known and left alone
- Orphan image files accumulate (FIXES #6 S-10, `lib.rs` comment); the purge task does not sweep them.
- Compose falls back to `POSTGRES_PASSWORD=recipes` if `.env` is missing; the db port is not published and `api` has no
  `ports:`, so only the web container reaches either. `BIND_ADDR` defaults to `0.0.0.0:8080` for native runs, which
  exposes the API directly; fine behind compose, worth a line in DEPLOY.md for native installs.
