---
name: factory-test
description: Stage 5 of the software factory — prove the build works - unit and guard tests, a smoke run on seeded fixture data, and screenshots of every page in every theme at desktop and phone size that the orchestrator actually looks at. Use before shipping, after any fix wave, and after any UI change.
---

# Test

## 1. Static and unit
`npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run build` — all must pass. Required test kinds:
- Data-safety tests for every copy/move/delete/sidecar/upload-record path (written to fail without the fix).
- Guard tests: theme contract + contrast, themes-are-distinct, no-page-styling.
- Integration tests with mocked `fetch` for external APIs (token refresh, batching, no retry of non-idempotent
  calls, matching results by token not position).

## 2. Smoke run on fixture data
Seed a fake library and card: `node scripts/factory/seed.js <dir>` (needs `SHARP_PATH` to a sharp install;
writes `<dir>/data/settings.json`). Start the built app with `PHOTOFLOW_DATA_DIR=<dir>/data`.
Exercise with curl and record a table (route · status · note) in `docs/review/FINAL*.md`:
every page and API route; import job to completion; re-import skips everything; cull pick → reject (files move to
`_rejects`, sidecar rating) → unflag (moved back, rating restored); border job twice (second never overwrites);
integration status; traversal attempts refused (`/api/thumb?path=/etc/passwd`, `..` shoot names); unknown pages
404; for each theme: `<html data-theme>`, `theme-color`, per-page `<title>`.

## 3. Screenshots — and look at them
`python3 scripts/factory/shoot.py <base-url> <out-dir> [themes…]` captures every page × theme × desktop/phone,
plus a focus state and the photo viewer. Then:
- Open at least: every page in the default theme (desktop + phone), the busiest page in every theme.
- Check: nothing scrolled on load (`window.scrollY` = 0), nothing overflowing at 390px, focus visible, headers
  not hidden behind sticky bars, empty/error states present.
- Note: in a full-page capture, fixed sidebars stop at the viewport height — that's the capture, not the app.
If the app can't run where the code lives (blocked browser download), build a standalone bundle there, move the
tarball to where Chromium exists, and run it there — see `scripts/factory/README.md`.

## Gate
All checks green, smoke table green, screenshots reviewed by the orchestrator with any issue sent to a fix agent.
