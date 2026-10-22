# 0001. Rust/axum backend and Next.js frontend, three containers

Status: Accepted · Date: 2026-10-22 (recorded after the fact; the decision predates this record)

## Context
Recipe Box is a household app used from a browser and an iPad PWA, self-hosted with Docker on a home server (including arm64). It needs a small memory footprint, one place that touches the database, the media volume, outside websites and the AI provider, and a modern installable frontend. See docs/SPEC.md.

## Decision
The API is Rust (axum 0.8, tokio, sqlx 0.9 with runtime queries, edition 2024). The web app is Next.js 16 (App Router, React 19, strict TypeScript, Tailwind 4, standalone output). They run as separate containers beside Postgres. The browser talks only to the web container, which proxies `/api/*` and `/media/*` to the API at runtime (`API_INTERNAL_URL`), so there is one origin and the session cookie just works.

## Consequences
- The API is the only component with credentials and network access to the outside, which keeps the security surface small.
- Rust gives a small, fast image and strong types for the data model; the cost is slower builds and a cross-compile step for arm64.
- Runtime `query_as` rather than `query!` macros means builds do not need a live database, at the price of no compile-time SQL checking; integration tests cover that gap (0002).
- Frontend types are written against the API contract by hand today; a generated OpenAPI spec is planned (#47).
