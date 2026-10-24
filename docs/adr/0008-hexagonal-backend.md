# 0008. Hexagonal (ports and adapters) backend

Status: Accepted · Date: 2026-10-24

## Context
The backend is one crate in which the layers are tangled. SQL lives in route handlers (`routes/recipes.rs` alone has about 33 sqlx calls). Domain types derive `sqlx::FromRow`, `sqlx::Type` and `utoipa::ToSchema`, and `error.rs` converts `sqlx::Error`. Media calls `tokio::fs` directly from the routes. `AppState` holds a concrete `PgPool` and `reqwest::Client`, so nothing can be swapped. This matters because we want a new storage (another database, object storage for photos), new inbound interfaces (CLI, gRPC, jobs) that reuse the same use cases, and language SDKs generated from a stable OpenAPI contract. Today each of those means touching every route.

## Decision
Make `backend/Cargo.toml` a Cargo workspace. The dependency rule is adapters → app → ports → domain, never the reverse. The compiler enforces it. A `cargo tree` check in the CI backend job already fails if `domain` depends on axum, sqlx, reqwest, tokio, utoipa or hyper; it will be extended to `ports` and `app` as those crates appear.

| Crate | Holds | May depend on |
|---|---|---|
| `domain` | Recipe, User, Image, validation, time rules, `DomainError` | chrono, uuid, thiserror, url; serde only if a domain type ever needs it (none does today) |
| `ports` | Outbound traits: `RecipeRepo`, `UserRepo`, `SessionRepo`, `MediaStore`, `RecipeExtractor`, `PageFetcher`, `Clock`, ... | `domain` |
| `app` | Use-case services (recipes, imports, media, auth, export, maintenance) | `domain`, `ports` |
| `adapters-*` | Inbound `http` (routes, DTOs, OpenAPI); outbound `postgres`, `fs-media`, `anthropic`, `http-fetch`, `memory` | layers above plus their own infra crates |
| `server` | `main.rs`: config, wiring, router, background tasks | everything |

Errors are split: `DomainError` lives in `domain`. It starts with `Validation` and gains variants (not found, conflict, forbidden) as later phases need them; `AppError`, status codes and the error body live in the HTTP adapter, with `From<DomainError>`.

Search is described in domain terms (`SearchQuery { text, tag, sort, limit, offset }` returning a page of summaries) and each `RecipeRepo` adapter decides how. The cases in `backend/tests/search.rs` become a storage contract suite every adapter must pass. A separate `SearchIndex` port (Tantivy, Meilisearch) is deferred until a second storage exists.

The work is done in eight phases (#87 to #94), each keeping `main` green and `docs/openapi.json` unchanged. Phase 1 keeps the existing `recipe-box-api` package at `backend/` as a workspace member, so the binary name and image entrypoint do not change. Some structs are temporarily duplicated between domain types and HTTP DTOs until the services phase (#91).

## Consequences
- A new storage or inbound interface is a new adapter, not a rewrite of the routes.
- Services can be tested against in-memory adapters, and the contract suite stops search behaving differently per backend.
- Costs: more crates and boilerplate, conversions between DTOs and domain types, a longer refactor across eight phases, and slower cold compiles.
