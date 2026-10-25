# Testing guide

How Recipe Box is tested, how to add a test at each level, and how to debug a failure from CI.
The backend is a hexagonal Cargo workspace ([ADR 0008](adr/0008-hexagonal-backend.md)), so its tests sit at three
levels that match the layers. Frontend tests and the contract checks are described below too.

## The pyramid
Cheap, fast tests at the bottom; a few slow, realistic ones at the top. A behaviour is tested at the lowest level
that can show it. Where a rule lives decides where its test lives.

| Level | What it tests | Tool | Lives in | Needs | Speed |
|---|---|---|---|---|---|
| Unit (domain, adapters) | Pure logic: validation, parsers, scaling | `#[test]` in the module | `backend/crates/*/src/**` (`#[cfg(test)]`) | nothing | ms |
| **B1. Service unit tests** | Use-case rules in the `app` crate | `#[tokio::test]` over in-memory adapters and a manual clock | `backend/crates/app/tests/` (`services.rs`, `imports.rs`, helpers in `common/`), `#[cfg(test)]` in `crates/app/src/imports.rs` | nothing | ms |
| **B2. Storage contract suite** | How any storage adapter must behave | `ports::contract` (`contract` feature), run by each adapter | suite: `backend/crates/ports/src/contract/`; runners: `crates/adapters/{memory,postgres,fs-media}/tests/contract.rs` | memory and fs-media: nothing; Postgres: `TEST_DATABASE_URL` | ms to 10s of ms |
| **B3. HTTP integration** | Routes, status codes, cookies, wiring over a real Postgres | `TestApp::spawn()` | `backend/tests/*.rs`, harness in `backend/tests/common/` | Postgres (`TEST_DATABASE_URL` or testcontainers) | 10s of ms |
| Frontend unit | Components and hooks | Vitest, Testing Library, MSW | `frontend/src/**/*.test.*` | nothing | ms |
| API contract | Generated spec, TS types and Python client stay in sync | `cargo run --bin openapi`, `oasdiff`, Redocly | `docs/openapi.json`, `frontend/src/lib/api-types.ts`, `sdks/python/` | nothing | seconds |
| End to end | Real flows through the browser and the API | Playwright (TypeScript) | `e2e/tests/{api,web,compose}/` | the Compose stack, or local Postgres | minutes |

Guard tests in `frontend/src/styles/` (no page-level styling, every theme has every token, contrast of at least 4.5:1)
are unit tests too; see [UI.md](UI.md) and [THEMING.md](THEMING.md).

### What belongs at each backend level
- **B1, a rule the service owns.** Limit, offset and sort validation, the plate rule, the restore window, login's
  same-answer rule, own versus admin password change, the last admin, import limits. If the rule is in `app`, test it
  here, not through HTTP.
- **B2, how storage behaves.** Search ranking and syntax, soft delete and purge edges, atomic saves with tags and
  images, concurrency (two first admins, two password changes: exactly one wins), session expiry, media names.
  Every `RecipeRepo`, `UserRepo`, `SessionRepo`, `ImageRepo`, `SettingsRepo`, `TagRepo`, `StorageHealth`,
  `MediaStore` and `PasswordHasher` implementation runs these cases. A new storage adapter must pass them.
- **B3, the wiring and the HTTP shape.** Routes, status codes and error bodies, cookies, multipart uploads, the
  auth refusal on each route, the real Postgres adapter with real migrations, `docs/openapi.json` drift
  (`backend/tests/openapi.rs`). Do not re-test a service rule here beyond one path through the route.
- **E2E, a user flow.** Sign in, add, search, open, delete, undo, import. Not a rule that a lower level can show.

## Determinism rules
These apply to every test at every level. A flaky test is a bug, not something to retry.

1. **No retries.** `retries = 0` in `backend/.config/nextest.toml` and in `e2e/playwright.config.ts`; Playwright also
   sets `forbidOnly` in CI.
2. **Fixed clock, time zone and locale.** Rust tests never read the wall clock. B1 and B2 use
   `ports::contract::ManualClock` (starts at `contract::epoch()`, moves with `advance`). B3 uses the app's fixed
   `Clock` (`TestApp.clock`, starts at `common::epoch()`). Vitest sets `TZ`, locale and system time in
   `vitest.config.mts` and `vitest.setup.ts`; Playwright sets `timezoneId: 'America/Denver'` and `locale: 'en-US'`.
   Never rewrite database rows to fake time.
3. **No real network.** Tests talk only to local fixtures: the HTML files in `backend/tests/fixtures/` served from a
   local listener (B3) or fakes (`FakeFetcher`, `FakeReader`, `FakeExtractor` in `crates/app/tests/common/`), the
   `fixture` container in `docker-compose.e2e.yml` (e2e), and MSW in Vitest.
4. **Every test creates its own data** (its own schema, user and recipes) and passes in any order and in parallel.
   B1 builds a fresh `World`, B2 builds a fresh `Stack` per case, B3 gets its own Postgres schema. Shared fixtures
   are read-only.
5. **No sleeps.** Wait on a condition: a web-first Playwright assertion (`expect(locator).toBeVisible()`), a
   polled query with a deadline, `await` on the event. The e2e ESLint config makes `waitForTimeout` an error.
   In Rust, move the manual clock instead of sleeping.
6. **No silent skips.** A missing prerequisite fails loudly. B3 panics with an explanation if there is neither
   `TEST_DATABASE_URL` nor Docker. One exception: the Postgres contract tests
   (`crates/adapters/postgres/tests/contract.rs`) return early with a `SKIPPED:` message on stderr when
   `TEST_DATABASE_URL` is unset, so set it when you change that adapter. Capability skips in the contract suite
   print a `contract: SKIPPED` line each.
7. **Shuffled order in CI.** CI runs `cargo nextest run --profile ci` (one process per test), then
   `cargo test` in random order with a printed seed; Vitest always shuffles and prints its seed. Re-run with the same
   seed to reproduce.

## Running tests
```sh
just check          # lint, format, types, tests, audits (coverage and scans are CI-only)
just check-backend  # cargo fmt, clippy, tests
just check-frontend # lint, tsc, vitest, build
just test-backend   # all Rust tests, all workspace crates (nextest if installed, else cargo test)
just test-frontend  # vitest
just fmt            # format the Rust code
just e2e            # Playwright e2e (native stack; needs local Postgres)
just openapi        # regenerate docs/openapi.json
just openapi-lint   # Redocly lint of docs/openapi.json
just sdk-python     # regenerate the Python client; `just sdk-python-smoke` runs its smoke test
just bench          # search benchmark, 2,000 recipes (needs Postgres)
just up / down      # start and stop the Compose stack; `just logs` follows it
just db             # how to get a Postgres for the backend tests
just setup          # install dependencies, fetch skills, git hooks if lefthook is installed
```
`just` recipes are the shared entry points; CI's frontend job calls them, and the backend job runs the raw cargo
commands (fmt, clippy, the dependency guards, nextest, the shuffled `cargo test`).

### The three backend levels
Run from `backend/`. Package names carry a `recipe-box-` prefix.
```sh
# B1: service unit tests (no Postgres)
cargo nextest run -p recipe-box-app

# B2: the storage contract suite, per adapter
cargo nextest run -p recipe-box-adapter-memory      # no Postgres
cargo nextest run -p recipe-box-adapter-fs-media    # no Postgres, uses a temp dir
TEST_DATABASE_URL=postgres://recipes:recipes@127.0.0.1:5432/recipes_test \
  cargo nextest run -p recipe-box-adapter-postgres

# B3: HTTP integration tests (root package recipe-box-api)
cargo nextest run -p recipe-box-api                 # all files in backend/tests/
cargo nextest run -p recipe-box-api --test time_rules

# E2E (from the repo root)
just e2e                                            # or: E2E_STACK=compose npm --prefix e2e test
```
`cargo test` accepts the same `-p` and `--test` flags if nextest is not installed.

B3 finds Postgres in this order: `TEST_DATABASE_URL` if set
(e.g. `postgres://recipes:recipes@127.0.0.1:5432/recipes_test`), otherwise a Postgres 16 container started by
testcontainers, otherwise the test run fails with a message. Running one test while iterating:
```sh
cd backend && cargo nextest run -p recipe-box-app search_reports    # by name filter
cd frontend && npx vitest run src/lib/recipe                          # by path
cd e2e && npx playwright test --project=web-desktop -g "delete"       # by project and title
```
The Playwright projects are `api`, `web-desktop`, `web-ipad`, `web-phone` and, with `E2E_STACK=compose`, `compose`.

## Adding a test

### Rust unit test
Put a `#[cfg(test)] mod tests` at the bottom of the module for pure logic (parsing, scaling, validation) in
`domain` or an adapter. No database, no clock, no network. Prefer table-style cases for parsers.

### B1. Service unit test (`app` crate)
Add the test to `backend/crates/app/tests/services.rs` (or `imports.rs` for imports). Build a `World` (it wires
`Deps` from `adapter_memory::MemoryStore`, `MemoryMedia`, the fakes and a `ManualClock`), get `Services`, call a
service method and assert on the `DomainResult`. Use `world.clock.advance(..)` for time. Fakes for fetching,
page reading, extraction and task spawning are in `crates/app/tests/common/`.
```rust
#[tokio::test]
async fn search_reports_limit_then_offset_then_sort() {
    let w = World::new();
    let s = w.services();
    // ...call s.recipes with bad limit, offset and sort and assert the order of the errors
}
```
A new rule goes in the service, not the handler, and gets a test here. Cover the refusal path as well as the happy
one. If you need a new fake, put it in `adapter_memory` (shared) or `app/tests/common/` (test-only).

### B2. Storage contract case
Add a case when a port gains a behaviour that every storage must share.
1. Write the case as an `async fn` in `backend/crates/ports/src/contract/` (`recipes.rs`, `accounts.rs` or
   `infra.rs`) taking `&make`, build a `Ctx` (fresh `Stack`, `ManualClock`, one admin) and assert through the trait
   only.
2. Call it from the suite's entry function (`recipe_repo`, `user_repo`, `media_store`, ...).
3. If some storage cannot support it, add a flag to `Capabilities` and gate the case with `skip(...)` so the skip
   is printed. Do not use a flag to hide a bug.
4. Run `cargo nextest run -p recipe-box-adapter-memory` and the Postgres run above. Both must pass.

For the full steps to add a storage adapter, see [STORAGE-ADAPTERS.md](STORAGE-ADAPTERS.md).

To run the suite for a **new adapter**, add `ports` with `features = ["contract"]` as a dev-dependency and call it
from `tests/contract.rs`, as `crates/adapters/memory/tests/contract.rs` does:
```rust
contract::recipe_repo(stack, Capabilities::ALL).await;   // stack: fn(Arc<dyn Clock>) -> Stack
contract::media_store(MyMedia::new).await;
```
The Postgres runner shows how to give each case its own schema and drop it afterwards.

### B3. HTTP integration test
Use the shared harness in `backend/tests/common/`; never write another one in a test file. Start a file with
`mod common;`.
```rust
#[tokio::test]
async fn restore_window_edges() {
    let ctx = TestApp::spawn_as_admin().await;       // own schema, migrations, temp media dir, fixed clock
    let c = ctx.cookie.as_str();                     // the admin's session cookie
    let id = ctx.create_recipe_id(c, a_recipe().titled("Edge")).await;
    ctx.delete(&format!("/api/recipes/{id}"), c).await.assert_status(StatusCode::NO_CONTENT);
    ctx.clock.advance(Duration::minutes(10) - Duration::milliseconds(1));   // boundary tests: 1 ms either side
    ctx.post(&format!("/api/recipes/{id}/restore"), c, serde_json::Value::Null)
        .await
        .assert_status(StatusCode::OK);
}
```
Builders: `a_user().admin()`, `a_recipe().titled("Soup")`. Rules: test time by advancing `ctx.clock`, not by editing
rows; assert on JSON bodies and status codes through the helpers (`assert_status`, `assert_error`); the schema and
media directory are removed by a drop guard even if the test panics. The harness moves the clock by 1 microsecond
before each recipe save after the first so that "newest first" is stable. Auth, uploads, outbound fetches and deletion
each need a test for the refusal path, not just the happy one. Do not add a service rule's whole test matrix here; put
it in B1.

### Contract (OpenAPI)
Change the route or DTO annotations (`utoipa`) in `backend/crates/adapters/http`, then `just openapi` to regenerate
`docs/openapi.json` and regenerate `frontend/src/lib/api-types.ts`. If the API changed, run `just sdk-python` too.
Commit all of them. CI regenerates and fails on any diff, runs Redocly lint, and runs `oasdiff` against `main`: a
breaking change needs the `breaking-api` label and a note in the PR. Frontend code uses the generated types; do not
hand-write duplicates. See [SDK.md](SDK.md).

### Frontend unit and component test
Co-locate `thing.test.ts(x)` with the code. Render with Testing Library and query by role and label, as a user
would (this also checks accessibility). Mock the network only through the shared MSW handlers in
`frontend/src/test/`, typed against the generated API types; do not stub `fetch` per test. The setup file already
fixes time, resets timers and cleans up the DOM, and console errors (including React `act()` warnings) fail the
test, so do not add that boilerplate.

### End-to-end test (Playwright)
Add a spec in `e2e/tests/api/` (request fixtures and the typed client in `e2e/support/api-client.ts`) or
`e2e/tests/web/` (runs on Desktop Chrome, iPad Pro 11 landscape and iPhone 15). Each test creates its own user and
data through the helpers in `e2e/support/fixtures.ts` (`member`, `makeUser`, `unique()`), then drives the flow. Use
role and label locators and web-first assertions; do not use `waitForTimeout`. Cover a user flow, not a component.
If a bug can be shown at a lower level, test it there instead.

## Debugging a CI failure

### Rust or Vitest failure
1. Open the failed job and find the first failing test, not the last line of output.
2. If the suite ran shuffled, copy the printed seed and reproduce locally with the same seed (Rust:
   `cargo test -- -Zunstable-options --shuffle-seed <seed>` with `RUSTC_BOOTSTRAP=1`; Vitest: `--sequence.seed=<n>`).
3. Run only that test (see above). Because tests own their data, a failure that appears only in the full run
   means shared state or order dependence: that is the bug.

### Playwright failure
CI uploads the HTML report and the traces of failed tests as the artifact `e2e-report` (`e2e/playwright-report/` and
`e2e/test-results/`).
1. Download the artifact from the run's summary page and unzip it.
2. Open the trace, which replays the test with DOM snapshots, network calls and console output:
   ```sh
   cd e2e && npx playwright show-trace path/to/trace.zip
   ```
   Or open the whole report with `npx playwright show-report path/to/playwright-report` (`npm --prefix e2e run report` does the same). Traces can also be
   dropped onto <https://trace.playwright.dev> (nothing is uploaded; it runs in the browser).
3. Walk the Actions list on the left. The failing step is highlighted; the Before and After snapshots show the page
   when the assertion ran. Check the Network tab for a failed or blocked request and the Console tab for errors.
4. Reproduce locally with the same project: `just e2e`, or `npx playwright test --project=web-desktop -g "<name>"` in
   `e2e/`. `npx playwright test --ui` gives time travel while you fix it.
5. If it passes locally but fails in CI, look for a missing wait (an assertion on something that appears later),
   a clock or locale difference, or a test relying on another test's data. Fix the cause. Do not add a retry
   or a sleep.
