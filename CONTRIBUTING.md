# Contributing to Recipe Box

Thanks for helping. This is a small household project, so the process is light, but the checks are strict.
Work happens issue by issue; [CLAUDE.md](CLAUDE.md) is the same guide written for a fresh Claude session.

## Set up
You need Docker, [`just`](https://github.com/casey/just), and the toolchains pinned in the repo (Rust, Node).
```sh
git clone https://github.com/christopherjohnson1535/recipe-box.git
cd recipe-box
just setup        # installs dependencies and git hooks
just check        # every lint, type check and test CI runs
```
<!-- verify after #50 merges: just recipe names -->
Run the whole stack with `just up` (http://localhost:3000) and stop it with `just down`. Without `just`, the raw
commands are in [docs/wiki/Development.md](docs/wiki/Development.md).

## Pick up an issue
1. Find an issue (lowest open [milestone](../../milestones) first; `good first session` issues are small).
2. Read the requirement IDs it cites in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md), the section of
   [docs/SPEC.md](docs/SPEC.md) it names, and [docs/API.md](docs/API.md) for any endpoint it touches.
3. Branch from `main` as `issue-<number>-<slug>`, for example `issue-13-cook-mode-timers`.
4. Stay inside the issue's **Owned paths**. If you must change something else, say why in the PR.

## Commits and pull request titles
PR titles follow [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <summary>`.
Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
Scope is optional and usually an area: `backend`, `frontend`, `e2e`, `deploy`, `docs`.

```
feat(frontend): add cook-mode timers (#13)
fix(backend): re-check redirects in safe_fetch (#30)
docs: add contributing and security guides (#51)
```
The `PR title` workflow (`.github/workflows/pr-title.yml`) fails the PR otherwise. Merges are squashed, so the
title becomes the commit on `main` and the line in the release notes. Add `!` after the type for a breaking change.
Keep individual commits small and clear; they are squashed away.

## Open a pull request
The [PR template](.github/pull_request_template.md) asks for `Closes #<n>`, a short list of what changed, the checks
you ran and the issue's acceptance checklist, ticked.

### Definition of done
- [ ] The issue's acceptance checklist is ticked, or each gap is explained.
- [ ] `just check` passes, or the per-tree commands from [CLAUDE.md](CLAUDE.md) for every tree you touched.
- [ ] New behaviour has a test at the right layer ([docs/TESTING.md](docs/TESTING.md)), and a bug fix has a test that failed first.
- [ ] No retries, sleeps, real network or wall-clock dependence added to tests.
- [ ] UI changes: screenshots at iPad and desktop size, checked for contrast, focus and 44 px touch targets.
- [ ] Docs updated: [docs/API.md](docs/API.md) if a contract changed, the matching page in `docs/wiki/`, the README if setup changed, `.env.example` for any new variable.
- [ ] If you made a lasting architectural decision, add an [ADR](docs/adr/README.md).
- [ ] The rules in CLAUDE.md that never bend still hold (safe_fetch, re-encoded uploads, session on every route, secrets in env vars, AI optional, imports are drafts).

## How the software factory works
Recipe Box is built with agents. An orchestrator briefs builder agents, then independent reviewers, then separate
fixers, then runs tests and looks at screenshots, before opening the PR. Each stage is a skill in
`.claude/skills/`. The stages, their gates and where run notes go are in [docs/FACTORY.md](docs/FACTORY.md). You
do not need to use the factory to contribute by hand, but your PR gets the same checks.

## Branch protection and required checks
`main` is protected: changes arrive by pull request, with the required checks green and the owner's review
(see [.github/CODEOWNERS](.github/CODEOWNERS)). Required status checks:

<!-- placeholder until #49 supplies the exact job names -->
- `PR title`
- backend checks
- frontend checks
- end-to-end tests
- container build

## Reporting security problems
Do not open a public issue. See [SECURITY.md](SECURITY.md).
