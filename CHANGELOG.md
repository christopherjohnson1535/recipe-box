# Changelog

All notable changes to Recipe Box are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Recipe Box has not tagged a release yet, so Phase 1 is
listed as a milestone; entries for tagged versions will follow the same layout.

From the first release on, GitHub release notes are generated from merged PR titles and labels
(`.github/release.yml`), and this file is updated from them when a version is tagged.

## [Unreleased]

### Added
- Repository quality work (tracked in #52): community docs (`CONTRIBUTING.md`, `SECURITY.md`, `CODEOWNERS`),
  `docs/TESTING.md`, architecture decision records in `docs/adr/`, a PR-title check and release-note categories.
- October 2026 redesign proposals with screenshots and mockup source (`docs/design/redesign-2026-10/`, #44).

### Changed
- Agent run notes moved from `docs/review/` to `docs/archive/factory-runs/`.
- Removed `docs/archive/factory-runs/` (agent run notes; still in git history).
- README status updated: Phase 1 complete, Phase 2 in progress.

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
