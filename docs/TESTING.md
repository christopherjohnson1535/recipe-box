# Testing guide

How Recipe Box is tested, how to add a test at each layer, and how to debug a failure from CI.
This describes the target state of the repository-quality work (tracked in #52). Much of the tooling below does not
exist on `main` yet: every statement about planned tooling is followed by a `verify after #NN merges` comment, which
the maintainer reconciles when that issue merges. Today the backend has per-file integration tests in
`backend/tests/` run with `cargo test`, and the frontend has Vitest tests.

## The pyramid
Cheap, fast tests at the bottom; a few slow, realistic ones at the top. A behaviour is tested at the lowest layer
that can show it.

| Layer | Tool | Lives in | Needs | Speed |
|---|---|---|---|---|
| 1. Unit (Rust) | `cargo nextest`, `#[test]` in the module | `backend/src/**` | nothing | ms |
| 1. Unit (frontend) | Vitest, Testing Library, MSW | `frontend/src/**/*.test.*` | nothing | ms |
| 2. Rust integration | `TestApp::spawn()` over a real Postgres | `backend/tests/` | Postgres (testcontainers or `TEST_DATABASE_URL`) | 10s of ms |
| 3. Contract | generated OpenAPI spec plus generated TS types, `oasdiff` | `docs/openapi.json`, `frontend/src/lib/api-types.ts` | nothing | seconds |
| 4. End to end | Playwright, TypeScript: `api` and `web` projects | `e2e/` | the Compose stack | minutes |

<!-- verify after #45 merges: Rust layers 1-2 (nextest, TestApp, testcontainers) -->
<!-- verify after #48 merges: Vitest, Testing Library, MSW -->
<!-- verify after #47 merges: contract layer (OpenAPI, oasdiff, generated types) -->
<!-- verify after #46 merges: Playwright e2e layer -->

Guard tests in `frontend/src/styles/` (no page-level styling, every theme has every token, contrast of at least 4.5:1)
are unit tests too; see [UI.md](UI.md) and [THEMING.md](THEMING.md).

## Determinism rules
These apply to every test at every layer. A flaky test is a bug, not something to retry.

1. **No retries.** `retries = 0` in nextest and in Playwright; Playwright also sets `forbidOnly` in CI.
   <!-- verify after #45 merges: nextest config -->
   <!-- verify after #46 merges: Playwright config -->
2. **Fixed clock, time zone and locale.** Rust tests inject a `FixedClock` that can be advanced; Vitest runs with a
   fixed `TZ`, locale and system time from `vitest.setup.ts`; Playwright sets `timezoneId: 'America/Denver'`,
   `locale: 'en-US'` and installs `page.clock` at a fixed instant. Never read the wall clock inside a test, and
   never rewrite database rows to fake time.
   <!-- verify after #45 merges: FixedClock -->
   <!-- verify after #48 merges: vitest.setup.ts -->
   <!-- verify after #46 merges: Playwright timezone, locale and page.clock -->
3. **No real network.** Tests talk only to local fixture servers (the one in `backend/tests/fixtures/`, the
   fixture-site container in the e2e stack, MSW in Vitest). Requests to anything else are blocked or fail the test.
   <!-- verify after #45 merges: Rust fixture server -->
   <!-- verify after #46 merges: fixture-site container -->
   <!-- verify after #48 merges: MSW -->
4. **Every test creates its own data** (its own schema, user and recipes) and passes in any order and in parallel.
   Shared fixtures are read-only.
5. **No sleeps.** Wait on a condition: a web-first Playwright assertion (`expect(locator).toBeVisible()`), a
   polled query with a deadline, `await` on the event. `waitForTimeout` and `sleep` are lint errors or review
   rejects.
   <!-- verify after #46 merges: lint rule against waitForTimeout; #45 for Rust sleeps -->
6. **No silent skips.** A missing prerequisite (no Postgres, no Docker) fails loudly with an explanation. A test
   that cannot run must not report as passed. (Today backend tests still skip silently without `TEST_DATABASE_URL`;
   fixed in #45.) <!-- verify after #45 merges -->
7. **Shuffled order in CI.** Suites run in random order (nextest and Vitest with a seed). A failure prints the seed;
   re-run with the same seed to reproduce.
   <!-- verify after #45 merges: nextest shuffle and seed -->
   <!-- verify after #48 merges: Vitest shuffle and seed -->

## Running tests
```sh
just check          # everything CI runs
just check-backend  # cargo fmt, clippy, tests
just check-frontend # lint, tsc, vitest, build
just test-backend   # all Rust unit + integration tests
just test-frontend  # vitest
just fmt            # format both trees
just e2e            # boots the e2e stack and runs both Playwright projects
just openapi        # regenerate docs/openapi.json and the frontend types
just up / down      # start and stop the Compose stack; `just logs` follows it
just db             # open a psql shell on the dev database
just setup          # install dependencies and git hooks
```
<!-- verify after #50 merges: recipe names and what each runs -->
`just` recipes are intended to be the single source of truth; CI is meant to call the same ones, so local and CI
cannot disagree. <!-- verify after #50 merges -->

Backend integration tests find Postgres in this order: `TEST_DATABASE_URL` if set
(e.g. `postgres://recipes:recipes@127.0.0.1:5432/recipes_test`), otherwise (planned) a Postgres 16 container started by
testcontainers, otherwise the test run fails with a message. Today only `TEST_DATABASE_URL` works and tests skip
without it. <!-- verify after #45 merges --> Running one test while iterating:
```sh
cd backend && cargo nextest run ingredient_and_title_matches   # by name filter (cargo test <name> today)
cd frontend && npx vitest run src/lib/recipe  # by path
cd e2e && npx playwright test --project=web -g "delete and undo"
```
<!-- verify after #45 merges: nextest -->
<!-- verify after #46 merges: Playwright filter -->

## Adding a test

### Rust unit test
Put a `#[cfg(test)] mod tests` at the bottom of the module for pure logic (parsing, scaling, validation). No
database, no clock, no network. Prefer table-style cases for parsers.

### Rust integration test
Use the shared harness in `backend/tests/common/`; never write another `ctx()` in a test file.
```rust
#[tokio::test]
async fn deleted_recipe_can_be_undone_within_ten_seconds() {
    let app = TestApp::spawn().await;                 // own schema, migrations, temp media dir, FixedClock
    let user = app.sign_in(a_user()).await;           // builders: a_user().admin(), a_recipe().titled("Soup")
    let recipe = user.create(a_recipe().titled("Soup")).await;

    user.delete(&recipe).await;
    app.clock.advance(Duration::from_millis(9_999));  // boundary tests: 9.999 s, 10 s, 10.001 s
    user.undo(&recipe).await.assert_ok();
}
```
<!-- verify after #45 merges: helper names -->
Rules: time-dependent behaviour is tested by advancing `app.clock`, not by editing rows; assert on JSON bodies
and status codes through the helpers; the schema and media directory are meant to be removed by a drop guard even if the
test panics. Auth, uploads, outbound fetches and deletion each need a test for the refusal path, not just the happy one.

### Contract
Change the Rust route or model annotations (`utoipa`), then `just openapi` to regenerate `docs/openapi.json` and
`frontend/src/lib/api-types.ts`. Commit both. CI regenerates and fails on any diff, and runs `oasdiff` against
`main`: a breaking change needs the `breaking-api` label and a note in the PR. Frontend code uses the generated
types; do not hand-write duplicates. <!-- verify after #47 merges -->

### Frontend unit and component test
Co-locate `thing.test.ts(x)` with the code. Render with Testing Library and query by role and label, as a user
would (this also checks accessibility). Mock the network only through the shared MSW handlers in
`frontend/src/test/`, built from the generated API types; do not stub `fetch` per test. The setup file already
fixes time, resets timers and cleans up the DOM, and console errors (including React `act()` warnings) fail the
test, so do not add that boilerplate. <!-- verify after #48 merges -->

### End-to-end test (Playwright)
Add a spec in `e2e/` under `api/` (request fixtures and the typed client) or `web/` (runs on Desktop Chrome, iPad
Pro 11 landscape and iPhone 15). Each test creates its own user and data through the API fixture, then drives
the flow. Use role and label locators and web-first assertions; do not use `waitForTimeout`. Cover a user flow,
not a component: sign in, add, search, open, delete, undo. If a bug can be shown at a lower layer, test it
there instead. <!-- verify after #46 merges -->

## Debugging a CI failure

### Rust or Vitest failure
1. Open the failed job and find the first failing test, not the last line of output.
2. If the suite ran shuffled, copy the printed seed and reproduce locally with the same seed.
3. Run only that test (see above). Because tests own their data, a failure that appears only in the full run
   means shared state or order dependence: that is the bug.

### Playwright failure
CI uploads the HTML report and a trace for failed tests as the artifact `playwright-report`.
<!-- verify artifact name after #46 merges -->
1. Download the artifact from the run's summary page and unzip it.
2. Open the trace, which replays the test with DOM snapshots, network calls and console output:
   ```sh
   cd e2e && npx playwright show-trace path/to/trace.zip
   ```
   Or open the whole report with `npx playwright show-report path/to/playwright-report`. Traces can also be
   dropped onto <https://trace.playwright.dev> (nothing is uploaded; it runs in the browser).
3. Walk the Actions list on the left. The failing step is highlighted; the Before and After snapshots show the page
   when the assertion ran. Check the Network tab for a failed or blocked request and the Console tab for errors.
4. Reproduce locally with the same project: `just e2e`, or `npx playwright test --project=web -g "<name>"` against a
   running stack. `npx playwright test --ui` gives time travel while you fix it.
5. If it passes locally but fails in CI, look for a missing wait (an assertion on something that appears later),
   a clock or locale difference, or a test relying on another test's data. Fix the cause. Do not add a retry
   or a sleep.
