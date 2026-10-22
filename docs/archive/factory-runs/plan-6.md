# Plan: issue #6 Link import (backend)

- `safe_fetch.rs`: `FetchPolicy` (default = public addresses only; a test-only constructor allows one loopback port) in
  `AppState.fetch_policy`. Per hop: http(s) only, resolve the host ourselves, refuse if ANY address is non-global
  (own v4/v6 classifier incl. mapped/compatible/NAT64/6to4), then connect with a per-hop client pinned to the vetted
  IPs (`resolve_to_addrs`, no proxy, redirects off). Manual redirects (max 5), 15 s total, 5 MB cap while streaming.
  401/403/429/503 or a small bot-check page -> `site_blocked`; other failures -> `fetch_failed`.
- `jsonld.rs` (+ `scraper`): JSON-LD (arrays, `@graph`, `@id` refs, `@type` arrays, HowToSection/HowToStep, ISO 8601
  durations, yield, image, author/site name, tags) with a microdata fallback; entities decoded, tags stripped.
- `routes/imports.rs`: `POST /api/import/url` -> fetch, extract (422 `no_recipe_found`), duplicate check on the
  normalised URL (requested and final), main image through safe_fetch + `media::store_image` (failure = warning).
  Nothing is written to `recipes`.
- Tests: classifier + default-policy refusals (unit), 6 fixtures (5 site styles + no recipe) asserted field by
  field, `tests/import_url.rs` through the router against a local axum server.
- Docs: wiki page note on blocked sites. No new env vars.
