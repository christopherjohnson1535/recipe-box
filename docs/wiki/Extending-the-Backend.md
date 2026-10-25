# Extending the backend

Recipe Box's backend is layered (see [Architecture](Architecture)), so the common extensions have a set path.
Each guide below lives in the repo.

| I want to... | Read |
|---|---|
| Store recipes in another database | [Adding a storage adapter](https://github.com/christopherjohnson1535/recipe-box/blob/main/docs/STORAGE-ADAPTERS.md) |
| Keep photos somewhere else (object storage) | The same guide, section "Media" |
| Use the API from another language | [Client SDKs, "Adding a language"](https://github.com/christopherjohnson1535/recipe-box/blob/main/docs/SDK.md#adding-a-language) |
| Understand why it is built this way | [ADR 0008](https://github.com/christopherjohnson1535/recipe-box/blob/main/docs/adr/0008-hexagonal-backend.md) |

## Storage adapters in short
1. Make a crate under `backend/crates/adapters/` that implements the storage traits from the `ports` crate.
2. Run the shared contract suite (`ports` with the `contract` feature) from its tests. It defines how storage and
   search must behave, so every database gives the same results.
3. Wire it in the server crate (`backend/src/state.rs` and `main.rs`).
4. Keep the CI layering check green: the domain, ports and app crates may not depend on web or database crates.

## Client SDKs in short
The API contract is `docs/openapi.json`. A generator turns it into a client; CI checks the generated code has not
drifted and runs a smoke test against a real stack. The Python client is the reference.
