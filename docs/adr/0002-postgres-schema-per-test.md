# 0002. Postgres, with a schema per integration test

Status: Accepted (shared harness implementation tracked in #45) · Date: 2026-10-22 (recorded after the fact; the decision predates this record)

## Context
Search needs full-text queries over titles, ingredients and notes, and the household data is relational. Backend integration tests need a real database, run in parallel, and must not interfere with each other or with a developer's data.

## Decision
Postgres 16 is the only database (migrations in `backend/crates/adapters/postgres/migrations/`, run on API start). Each backend integration test creates its own schema and media directory, runs the migrations in it, and removes both afterwards. Tests connect through `TEST_DATABASE_URL`.

Today each test file sets this up with its own `ctx()` helper, cleans up with an explicit `cleanup().await`, and skips silently when `TEST_DATABASE_URL` is unset. Issue #45 tracks replacing that with one shared harness that removes the schema in a drop guard and falls back to testcontainers instead of skipping.

## Consequences
- Tests are isolated and can run in any order and in parallel, which the determinism rules require (docs/TESTING.md).
- No SQLite or mocked database: tests exercise the same SQL and full-text search as production.
- A test needs a Postgres server; CI provides one, and locally you point `TEST_DATABASE_URL` at one (testcontainers fallback planned in #45).
- Schemas should be cleaned up even when a test panics; today cleanup is an explicit call at the end of the test, and a drop guard is planned in #45.
