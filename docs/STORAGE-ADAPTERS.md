# Adding a storage adapter

A storage adapter is a crate that implements the storage ports in `backend/crates/ports`. The services in
`backend/crates/app` only see those traits, so a new database does not touch routes or use cases. The rules behind
this are in [ADR 0008](adr/0008-hexagonal-backend.md). For client libraries see "Adding a language" in
[docs/SDK.md](SDK.md#adding-a-language).

Two existing adapters are your models:

- `backend/crates/adapters/postgres` (`recipe-box-adapter-postgres`): the production storage.
- `backend/crates/adapters/memory` (`recipe-box-adapter-memory`): the small reference one, also used by service tests.

## What a storage implements

Seven traits in `backend/crates/ports/src/repos.rs`, all `async-trait`, all returning `DomainResult`:

| Trait | Holds |
|---|---|
| `RecipeRepo` | recipes with tags and photo links; soft delete, restore, purge; `search`; `live_source_urls` |
| `ImageRepo` | image rows (`add`, `delete`, `set_display_file`, `without_display_file`) |
| `UserRepo` | users and password hashes; `create_first_admin`; `set_password_hash`; `remove` |
| `SessionRepo` | sessions by token digest |
| `SettingsRepo` | the household settings row |
| `TagRepo` | `list_in_use` |
| `StorageHealth` | `ping`, used by the health check |

Each trait's rustdoc is the contract. Read it before you write the method. The contract suite checks it.

Photo files are not part of this. They go through `MediaStore` (see "Media" below).

## Steps

1. **Create the crate** under `backend/crates/adapters/<name>/`. Copy the manifest shape from the memory adapter:
   package `recipe-box-adapter-<name>`, `[lib] name = "adapter_<name>"`, edition 2024, `publish = false`. Depend on
   `recipe-box-domain` and `recipe-box-ports` (path dependencies) and `async-trait`. Add your driver crate
   (for example `sqlx`). Do not depend on `recipe-box-app`, `recipe-box-api` or another adapter.
2. **Add it to the workspace**: put `"crates/adapters/<name>"` in both `members` and `default-members` in
   `backend/Cargo.toml`. Also add `COPY crates/adapters/<name>/Cargo.toml crates/adapters/<name>/Cargo.toml` (and the
   matching `src` entries in its `mkdir`, `touch` and `rm` lines) to the dependency layer of `backend/Dockerfile`, or
   the image build fails.
3. **Implement the traits.** One struct per port, as in `adapter_postgres` (`PgRecipeRepo`, `PgUserRepo`, ...), or one
   struct for all of them, as in `adapter_memory::MemoryStore`. Repositories take a `ports::Clock` when built
   (`PgRecipeRepo::new(pool, clock)`) and stamp rows with it. Never call the wall clock yourself.
4. **Map errors** into `DomainError` inside the crate, so no driver error crosses a port. Postgres keeps this in
   `backend/crates/adapters/postgres/src/error.rs`: `db(e)` turns an unexpected failure into
   `DomainError::Internal`, and `violation(&e)` lets a method turn a unique violation into `Conflict` and a foreign
   key violation into `Validation` (unknown image) or `NotFound` (unknown user). Use the variant the trait's rustdoc names (`NotFound`, `Conflict`,
   `Forbidden`, `Validation`). `Internal` is for failures the client cannot fix; its text goes to the logs only.
5. **Run the contract suite** (next section).
6. **Wire it in the server crate** (see "Wiring").
7. **Pass the layering guard** (see "CI guard").

## Atomic, coarse-grained methods

There is no unit-of-work or transaction port. Each method must be atomic inside your adapter: it does everything it
says, or leaves nothing behind.

- `RecipeRepo::create` and `update` take the whole `RecipeInput`. Save the recipe, its tags and its photo links as
  one unit. An unknown image id gives `Validation` and saves nothing.
- `UserRepo::set_password_hash` sets the hash and ends the user's other sessions in one step (it keeps the session
  whose token hash is `keep_session`).
- `UserRepo::set_password_hash` is a compare-and-set. With `expected` of `Some(h)`, change the hash only if the stored
  hash is still `h`; otherwise change nothing and return `Conflict`. `None` skips the check (an admin reset). Two
  concurrent changes must not both succeed.
- `UserRepo::create_first_admin` must let exactly one of two concurrent calls win. `UserRepo::remove` must not let
  two concurrent removals both delete the last admin.

If a use case needs two repository calls to be atomic, add a new coarse method to the trait, with contract cases. Do
not pass a transaction handle through a trait.

## Running the contract suite

The suite lives in `backend/crates/ports/src/contract/` and is behind the `contract` feature of `recipe-box-ports`.
Turn it on as a dev-dependency only:

```toml
[dev-dependencies]
recipe-box-ports = { path = "../../ports", features = ["contract"] }
tokio = { version = "1", features = ["macros", "rt"] }
```

(Postgres uses `rt-multi-thread` because its stack-builder blocks a worker thread.)

Then add `tests/contract.rs`. The suite takes a function that builds a `contract::Stack` (all seven repositories over
one backing store) from a clock. Every case calls it again, so each case starts with an empty store. The clock is a
`ManualClock`: time moves only when the case moves it, so there is no sleeping. This is a trimmed
`backend/crates/adapters/memory/tests/contract.rs` (the real file also has the capability-decline, media, hasher and
clock cases):

```rust
use std::sync::Arc;

use adapter_memory::MemoryStore;
use ports::{
    Clock,
    contract::{self, Capabilities, Stack},
};

fn stack(clock: Arc<dyn Clock>) -> Stack {
    let store = Arc::new(MemoryStore::new(clock));
    Stack {
        recipes: store.clone(),
        images: store.clone(),
        users: store.clone(),
        sessions: store.clone(),
        health: store.clone(),
        settings: store.clone(),
        tags: store,
    }
}

#[tokio::test]
async fn recipes_meet_the_contract() {
    contract::recipe_repo(stack, Capabilities::ALL).await;
}

#[tokio::test]
async fn accounts_meet_the_contract() {
    contract::user_repo(stack).await;
    contract::session_repo(stack).await;
    contract::settings_repo(stack).await;
    contract::tag_repo(stack).await;
    contract::image_repo(stack).await;
}

#[tokio::test]
async fn storage_answers_its_ping() {
    let s = stack(Arc::new(contract::ManualClock::default()));
    contract::storage_health(&*s.health).await;
}
```

Run it with `cargo test -p recipe-box-adapter-<name>` from `backend/`.

For a networked database, copy `backend/crates/adapters/postgres/tests/contract.rs`. It builds one throwaway, migrated
schema per case, drops them all at the end, and returns early with a "SKIPPED" message when `TEST_DATABASE_URL` is not
set. CI sets that variable, so the suite runs there. Do the same for your storage: one isolated database, schema or
prefix per case, cleaned up even when a case panics.

### Capabilities

`Capabilities` has two flags: `phrase_search` and `boolean_operators`. `Capabilities::ALL` is what Postgres must
offer. If your search engine cannot do `"two words"` phrases, or `-word` and `a or b`, pass a `Capabilities` with that
flag `false`. The suite then skips only those cases and prints `contract: SKIPPED <case>: adapter does not declare
`<flag>` on stderr. Declare a flag `false` only for a real limit of the engine, and say so in your crate docs. Do not
use it to get a failing case through.

## Search

Search is part of `RecipeRepo`, not a separate port. `RecipeRepo::search(SearchQuery)` returns a page of
`RecipeSummary`, and the rustdoc on that method plus the search cases in `contract/recipes.rs` define the behaviour.
Your engine may work any way it likes, but it must give the same results:

- web-search syntax: words are ANDed, `"two words"` is a phrase, `-word` excludes, `a or b` matches either;
- a half-typed last word matches as a prefix (`weeknight lasag` finds "Weeknight lasagne"), unless the text uses quotes,
  `-` or `or`;
- the whole text also matches a title that starts with it, and a tag name that starts with it;
- `%`, `_`, quotes and backslashes are plain characters, never wildcards or errors;
- order for `Sort::Default` with text: title starts with the text first, then relevance, then newest, then id.

The memory adapter's `search.rs` shows an engine with no database doing all of this. A separate `SearchIndex` port
(Tantivy, Meilisearch) is deferred until a second storage exists (ADR 0008). If you need one, raise it in an issue
first; do not bolt it on inside your adapter.

## Media

Photo files are not stored by a repository. `MediaStore` (`put`, `get`, `delete`, by flat file name) is its own port,
so the database and the photo storage can differ. `backend/crates/adapters/fs-media` is the model: `FsMediaStore`
writes into a directory. Object storage (S3 and the like) would be another crate implementing `MediaStore`.

- Check every name with `domain::validate::media_file_name` before you use it, and return `Validation` for a bad
  one, from `put`, `get` and `delete`. Names are `<uuid>.jpg` or `<uuid>.display.jpg`.
- `get` returns `None` for a missing blob. `delete` of a missing blob is not an error. `put` replaces.
- Run `ports::contract::media_store` with a function that makes a fresh store, as
  `backend/crates/adapters/fs-media/tests/contract.rs` does (`contract::media_store(MemoryMedia::default)` for the
  memory one).

## Wiring

The server is the only place that picks adapters. There is no config switch for the storage today: Postgres and the
file-system media store are fixed in code. To use your adapter you change these files in `backend/src/`:

1. Add `recipe-box-adapter-<name> = { path = "crates/adapters/<name>" }` to `[dependencies]` in `backend/Cargo.toml`.
2. `state.rs`, `AppState::with_clock`: the place that builds `Arc::new(PgRecipeRepo::new(...))` and the other six
   repositories, plus `media: Arc::new(FsMediaStore::new(...))`. Build your own there. `AppState` holds
   `Arc<dyn RecipeRepo>` and the rest, so nothing else changes.
3. `main.rs`: connection setup (the `PgPoolOptions` pool and `adapter_postgres::migrate`). Replace or branch it.
4. `config.rs`: `Config::from_env` reads `DATABASE_URL` and `MEDIA_DIR`. Add the settings your adapter needs.

If you want to choose at start-up, add a config value (for example `STORAGE=postgres|<name>`) and branch in
`with_clock`. Document the new variable in `docs/DEPLOY.md` and `.env.example`.

## CI guard

The backend job in `.github/workflows/ci.yml` runs `cargo tree` on the layers and fails the build when the
dependency direction breaks:

- `recipe-box-domain`, `recipe-box-ports` and `recipe-box-app` must not have `axum`, `sqlx`, `reqwest`, `tokio`,
  `utoipa` or `hyper` in their normal dependency tree. Your adapter pulls in its driver; no layer above may.
- `recipe-box-app` must not depend on `image`, `argon2`, `rand`, `sha2` or `base64`.
- `recipe-box-adapter-http` must not depend on `sqlx`, `reqwest`, `image`, `argon2` or `recipe-box-api`.
- `reqwest` may appear only under the HTTP-fetch and Anthropic adapters and the server crate.

Check locally from `backend/`:

```sh
cargo tree -p recipe-box-ports -e normal --prefix none
cargo tree -p recipe-box-app -e normal --prefix none
```

`contract` is a dev-dependency feature, so enabling it in your crate does not change these trees.

## Checklist

- [ ] Crate at `backend/crates/adapters/<name>/`, added to `members` and `default-members`
- [ ] Crate added to the dependency layer of `backend/Dockerfile` (`COPY` line plus the `mkdir`/`touch`/`rm` entries)
- [ ] Depends on `domain` and `ports` only (plus its driver); no `app`, `recipe-box-api` or other adapter
- [ ] All seven storage traits implemented; each method atomic; errors mapped to `DomainError`
- [ ] `set_password_hash` compares and sets; `create_first_admin` and `remove` safe under concurrency
- [ ] `tests/contract.rs` runs the recipe, user, session, settings, tag, image and health cases
- [ ] `Capabilities` honest; skipped cases explained
- [ ] Search matches the contract (or the gaps are declared in `Capabilities` and in the crate docs)
- [ ] Media: `MediaStore` adapter passes `contract::media_store`, or the existing `fs-media` is kept
- [ ] Wired in `backend/src/state.rs`, `main.rs`, `config.rs`; new variables documented
- [ ] `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` and the `cargo tree` guard pass
- [ ] `docs/openapi.json` unchanged
