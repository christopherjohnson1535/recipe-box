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
- Proxy header settings in the HTTPS guides (#17, #33): `TRUST_PROXY_HEADERS` / `TRUSTED_PROXIES` / `WEB_BIND` per access path in `docs/DEPLOY.md` and the Tailscale, VPS and Fly pages; `docker compose --profile https` now stops at once when `PUBLIC_HOSTNAME` is empty.
- Backup and restore you can trust (#19): `scripts/backup.sh` checksums and verifies each backup, leaves out sign-in sessions and
  secrets, and prunes old ones (`BACKUP_KEEP`); `scripts/restore.sh` asks first, refuses to overwrite existing data without
  `--force` (saving a safety backup), refuses newer-version backups and restores the database in one transaction. A CI job
  backs up a seeded stack, wipes its volumes, restores and compares every recipe and photo. Cron, off-site copy and Fly steps
  in the wiki.
- HTTPS deploy guides (#17): Tailscale at home, a VPS with the Caddy profile, and Fly.io (with `deploy/fly/` config), plus a
  `COOKIE_SECURE` table; the Tailscale steps no longer ask for `WEB_BIND=0.0.0.0`.
- Release process (#18): a `v*` tag publishes amd64 + arm64 images to GHCR only after the full CI suite passes,
  checks both platforms are in the manifest and pull without a login, then creates the GitHub release. Tag table,
  `IMAGE_TAG` pinning, upgrade/rollback and Raspberry Pi notes in `docs/DEPLOY.md`.
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
