---
name: factory-plan
description: Stage 2 of the software factory — turn confirmed requirements into docs/SPEC.md and docs/API.md with stack, data model, pages, file ownership and agent preambles so a team of agents can build in parallel. Use after requirements are confirmed, before any multi-agent build, or to plan a single GitHub issue.
---

# Plan

Goal: a spec precise enough that several agents can build at once without touching each other's files.

## 0. Environment check (do this first)
- Where will agents run? Check there: `npm view next version`, `cargo search axum --limit 1`, a throwaway install,
  `git` access, a local Postgres for backend tests. If a registry is blocked, stop and ask the owner to allow it
  (claude.ai → Settings → Capabilities) or to run the build elsewhere. Google Fonts can be blocked at build time →
  self-host via `@fontsource-variable/*`. Docker Hub / a Docker daemon may be missing → container builds are
  verified in CI.
- Note where the owner will run the app (home PC, VPS, managed host) and what must keep working there.

## 1. Write or extend `docs/SPEC.md` (skeleton: `templates/SPEC.template.md`)
Must contain:
- **What it is** in three sentences, where it runs, and the deploy targets that must keep working.
- **How we write code:** ponytail rules (smallest complete change, one test per non-trivial logic,
  `// shortcut: <limit>, <when to upgrade>` comments), UI rules (tastemaker + `docs/UI.md`), and the invariants
  (sessions on every route, SSRF-safe fetching, uploads re-encoded, AI optional, imports return drafts).
- **Allowed dependencies** list per tree. Anything else needs a one-line reason in the agent's report.
- **Configuration** (env vars) and the **data model** (tables, JSON shapes).
- **API summary** with the exact contract in `docs/API.md` (method, body, response, error codes).
- **Pages table:** route · content · status.
- **File ownership:** every path that will exist, owned by exactly one agent or issue.
- **Cross-agent contracts:** exact shapes one side provides to another (e.g. `RecipeDraft`).
- **Feature notes:** the algorithm/edge-case decisions per area (JSON-LD mapping, duplicate key, retry rules).
- **Definition of done:** the checks for each tree pass; docs and wiki updated.

For a single issue, the plan can be a short section in the PR description: approach, owned paths, tests.

## 2. UI architecture (when there is UI)
- Follow `docs/UI.md` (editorial magazine direction). Three token layers: primitives → semantic → component.
  Only `src/components/ui/*` reads component tokens; pages compose ui components + layout utilities only.
- Guard tests: every theme defines every token, contrast ≥ 4.5:1, no page-level styling.

## 3. Agent preambles
`docs/agents/agent-preamble.md` is the filled-in builder preamble. For reviewers and fixers copy
`templates/review-preamble.md` / `templates/fix-preamble.md` into the brief or `docs/agents/`, filling in where the
code lives, how to reach it, and who may build this round.

## 4. Show the owner
One message: stack, the order of agent waves (or issues), anything that needs their action (allow a domain,
grant GitHub access). Then start `factory-build`.

## Templates
- `templates/SPEC.template.md` — skeleton with every section above.
- `templates/agent-preamble.md` — generic builder rules (ownership, scoped checks, commits).
- `templates/review-preamble.md` — reviewer rules (read-only, findings format, concrete failing case).
- `templates/fix-preamble.md` — fixer rules (confirm then fix, tests for data-safety fixes, FIXES.md ledger).
