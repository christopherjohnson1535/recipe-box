# 0002. Postgres, with a schema per integration test

Status: Accepted · Date: 2026-10-22 (recorded after the fact; the decision predates this record)

## Context
Search needs full-text queries over titles, ingredients and notes, and the household data is relational. Backend integration tests need a real database, run in parallel, and must not interfere with each other or with a developer's data.

## Decision
Postgres 16 is the only database (migrations in `backend/migrations/`, run on API start). Each backend integration test creates its own schema and media directory, runs the migrations in it, and removes both afterwards. Tests connect through `TEST_DATABASE_URL`. The shared test harness (#45) owns this, and falls back to testcontainers rather than silently skipping when the variable is unset.

## Consequences
- Tests are isolated and can run in any order and in parallel, which the determinism rules require (docs/TESTING.md).
- No SQLite or mocked database: tests exercise the same SQL and full-text search as production.
- A test needs a Postgres server; CI provides one, and locally `just` or testcontainers do.
- Schemas must be cleaned up even when a test panics, so cleanup is a drop guard, not a final statement.
