# Architecture decision records

Short records of decisions that shape the codebase, in [Michael Nygard's format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions):
context, decision, consequences. They explain why, so the next change does not undo a decision by accident.

To add one: copy the newest file, use the next number, write it in under a page, and set the status to
Proposed until the PR merges. Never rewrite an accepted record; add a new one that supersedes it and change the
old status to `Superseded by NNNN`.

| # | Decision |
|---|---|
| [0001](0001-rust-axum-backend-nextjs-frontend.md) | Rust/axum backend and Next.js frontend, three containers |
| [0002](0002-postgres-schema-per-test.md) | Postgres, with a schema per integration test |
| [0003](0003-safe-fetch-for-outbound-requests.md) | All outbound fetches go through `safe_fetch` |
| [0004](0004-ai-is-optional.md) | AI is optional (`AI_PROVIDER=none`) |
| [0005](0005-imports-are-drafts.md) | Imports return drafts; nothing is saved until reviewed |
| [0006](0006-editorial-design-system.md) | Editorial design system with three token layers |
| [0007](0007-docs-in-repo-wiki-mirrored.md) | Documents live in the repo; the wiki is a mirror |
