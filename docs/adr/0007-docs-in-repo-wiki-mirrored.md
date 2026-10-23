# 0007. Documents live in the repo; the wiki is a mirror

Status: Accepted · Date: 2026-10-22 (recorded after the fact; the decision predates this record)

## Context
Specs should change in the same pull request as the code, and CLAUDE.md has agent sessions read the repository's docs (the second part is the recorder's inference of why). Users also expect a friendly place to read guides, and GitHub's wiki is that place but sits outside pull requests.

## Decision
Requirements, spec, API contract, UI guide and architecture decisions live in `docs/`, versioned with the code. The user-facing guides are written in `docs/wiki/`, and the "Publish wiki" workflow mirrors them to the GitHub wiki on every push to `main`. Edits made on the wiki website are overwritten.

## Consequences
- Docs are reviewed and versioned with the code, and a fresh agent session can read all of them offline.
- Wiki edits must go through a pull request, which is slower for small fixes.
- `docs/` must be kept to current documentation; history belongs in the archive.
