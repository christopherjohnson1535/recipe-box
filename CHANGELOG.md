# Changelog

All notable changes to Recipe Box are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow
[Semantic Versioning](https://semver.org/) and are git tags `vMAJOR.MINOR.PATCH`; each one publishes
`ghcr.io/christopherjohnson1535/recipe-box-api` and `-web` images for amd64 and arm64. Recipe Box has not tagged a
release yet, so Phase 1 is listed as a milestone.

To release: move the `[Unreleased]` entries under `## [x.y.z] - YYYY-MM-DD`, merge, then tag (steps in
`docs/DEPLOY.md`, "Cutting a release"). GitHub release notes are generated from merged PR titles and labels
(`.github/release.yml`).

## [Unreleased]

### Added
- Plan the evening (#83, KIT-7): with AI set up, cook together suggests an order that starts the slow dishes first so
  everything is ready together, shown as a preview the cook uses or dismisses, with start times for an optional serve
  time. `POST /api/cook/plan`; the AI's plan is checked (every step once, each recipe in order, start times that never go
  back) and falls back to taking turns, with the reason, when it does not add up. Hidden with `AI_PROVIDER=none`;
  greyed out offline.
- Favourites (#22, REC-5): each member stars recipes for themselves, on the home cards and the recipe page, and
  **Favourites** in the tag row filters to them (with search and tags). `PUT`/`DELETE /api/recipes/{id}/favourite`,
  `GET /api/recipes?favourite=true`, and `isFavourite` on recipes. Favourites are kept on the device for offline reading
  without being opened first (KIT-5); starring needs the server. Stars follow their recipe through delete and undo and go
  with a removed member.
- Step timers (#24, KIT-6): a time written in a step starts a timer from cook mode, alone or cooking together. Times in words ("twenty minutes", "half an hour", "an hour and a half") and "10-minute" now count; the running chip shows the time left; a finished timer comes first, chimes and vibrates (where the device can) for ten seconds, and stops on Dismiss; **Timer sound** mutes the chime per device. Detection lives in `frontend/src/lib/timers.ts`.
- "Made it" log (#23, REC-6): log a cook from cooking mode or the recipe page, with the day and what you'd change; the recipe
  page lists who made it and when. `GET`/`POST /api/recipes/{id}/cook-log` and `DELETE /api/recipes/{id}/cook-log/{entryId}`
  (your own entry, or any as an admin). Entries follow their recipe through delete and undo, and stay unsigned when a member is removed.
- Proxy header settings in the HTTPS guides (#17, #33): `TRUST_PROXY_HEADERS` / `TRUSTED_PROXIES` / `WEB_BIND` per access path in `docs/DEPLOY.md` and the Tailscale, VPS and Fly pages; `docker compose --profile https` now stops at once when `PUBLIC_HOSTNAME` is empty.
- Backup and restore you can trust (#19): `scripts/backup.sh` checksums and verifies each backup, leaves out sign-in sessions and
  secrets, and prunes old ones (`BACKUP_KEEP`); `scripts/restore.sh` asks first, refuses to overwrite existing data without
  `--force` (saving a safety backup), refuses newer-version backups and restores the database in one transaction. A CI job
  backs up a seeded stack, wipes its volumes, restores and compares every table and photo. A restore rebuilds the schema
  exactly, validates the photo archive first and swaps photos in by rename; `--stop-api` makes a fully consistent backup. Cron, off-site copy and Fly steps
  in the wiki.
- Export and import all recipes (#20, ACC-5): admins download one zip of every recipe and photo and import it back from
  Settings. Import is all-or-nothing, re-validates every recipe and photo, gives everything new ids, and refuses
  zip bombs and path tricks. Format documented in `docs/API.md`; `MAX_BACKUP_MB` caps the upload.
- HTTPS deploy guides (#17): Tailscale at home, a VPS with the Caddy profile, and Fly.io (with `deploy/fly/` config), plus a
  `COOKIE_SECURE` table; the Tailscale steps no longer ask for `WEB_BIND=0.0.0.0`.
- Release process (#18): a `v*` tag publishes amd64 + arm64 images to GHCR only after the full CI suite passes,
  checks both platforms are in the manifest and pull without a login, then creates the GitHub release. Tag table,
  `IMAGE_TAG` pinning, upgrade/rollback and Raspberry Pi notes in `docs/DEPLOY.md`.
- Offline reading (KIT-5): a service worker keeps recipes you opened, their photos and cooking mode, with an offline
  banner and Save/Import turned off while offline; signing out clears what was kept (#16).
- Text import (`POST /api/import/text`) and an AI fallback for link import when a page has no recipe data (#12).
- Repository quality work (tracked in #52): community docs (`CONTRIBUTING.md`, `SECURITY.md`, `CODEOWNERS`),
  `docs/TESTING.md`, architecture decision records in `docs/adr/`, a PR-title check and release-note categories.
- October 2026 redesign proposals with screenshots and mockup source (`docs/design/redesign-2026-10/`, #44).

### Changed
- Agent run notes are no longer kept in the repo (still in git history): `docs/review/` is gitignored and the
  factory skills write reviews, the fix ledger and smoke tables to the session's scratch folder and the PR (#52).
- README status updated: Phase 1 complete, Phase 2 in progress.
- Coverage ratchet now covers the backend too (baseline 92.7% lines) and raises the frontend baseline to
  86.28% lines / 78.19% branches; CI shows the numbers as a notice on each PR (#52).
- End-to-end tests use the API types generated from the spec instead of hand-written copies (#52).
- Export reads recipes 200 at a time (one query per page instead of one per recipe), and import checks which archived
  recipes already exist the same way; new `RecipeRepo::get_many` port method with contract cases (#112).

## Phase 1 — Recipe box (2026-10-21 to 2026-10-22)

The household can sign in, keep recipes, add them from links, and find them again. Milestone
"Phase 1 — Recipe box": 10 of 10 issues closed.

### Added
- Containers: Docker Compose stack (`db`, `api`, `web`, optional `caddy`), cross-compiled arm64 API image and an
  end-to-end smoke test (#1, #25).
- Design system: editorial look with three token layers, `ui` components for every page and guard tests for
  page-level styling, missing theme tokens and low contrast (#2, #27).
- Recipe editor: create and edit recipes with ingredients, steps, sections, tags and a photo (#3, #28).
- Recipe page: delete with a 10-second undo, by-lines and print layout (#4, #35).
- Search with tag filters and sorting (#5, #36).
- Link import backend: `safe_fetch` (public addresses only), schema.org parsing, photo download and duplicate
  check (#6, #30).
- Import screen: link, photo or text, then review the draft, then save (#7, #32).
- Household members: admin user management and a Settings page (#8, #34).

### Security
- Sign-in and setup forms post natively, so a password never lands in a URL (#29, #31).
- Phase 1 security review and design QA pass (#9, #37).

[Unreleased]: https://github.com/christopherjohnson1535/recipe-box/commits/main
