# Review H: household members (auth/accounts + settings UI), issue #8

Result: no Must findings. Authorization, password handling, session handling, last-admin logic and data safety checked and sound. Backend suite (5 tests) passes. Mutation probes (copy under /tmp) show three weak spots in the tests.

## Checked, no finding
- Roles: `list/create/remove` use `AdminUser` (401 then 403). `set_password` checks `own || admin` before touching the DB, so a member gets 403 for any other id, existing or not (no existence oracle). No role-change route exists; `role` is whitelisted `admin|member` on create; unknown JSON fields are ignored so nothing can smuggle a role.
- Ids: `AppPath<Uuid>` gives 400 `validation` for malformed ids; unknown uuid gives 404 for admin.
- Passwords: own change needs `currentPassword` (missing is treated as "" and fails); same `Argon2::default()` and the same 401 text as login; min 10 / max 1024 enforced by `validate::password` for create and change. Hash is computed before storing; no password is logged (`TraceLayer` does not log bodies; internal errors log `e`, not input).
- Sessions: "current" is the cookie's `hash_token`, the same key the extractor uses. Own change deletes every other session in the same tx as the hash update. Admin reset passes `keep = None` (target is never the caller). Delete cascades sessions (FK `on delete cascade`, test asserts 0 rows and 401).
- Last admin: one tx locks all admin rows plus the target, ordered by id. Read-committed `for update` rechecks, so the loser of a mutual delete sees one admin. No deadlock with `set_password` (it locks a single row). Mutation test confirms the race test fails without lock and check together.
- Data: `recipes.created_by/updated_by` are `on delete set null`; test shows the recipe survives. Only `sessions` and `recipes` reference users.
- Frontend: forms use `method="post"` with `onSubmit` preventDefault, so a pre-hydration submit puts the password in the body, never the URL. `current-password` / `new-password` set correctly. `settings/page.tsx` calls `listUsers` only for admins; `SettingsView` also hides the section. Confirm names the person and focuses Keep; 409 maps to the username field, 401 to the current field.

## Findings

### H-01 Should: the `for update` lock in `remove` is not covered by any test
`backend/src/routes/users.rs:85`. Failing case: drop ` for update` from the query and `cargo test --test users` still passes 3 of 3 runs. The race test only fails when the last-admin check is removed too, so the lock (the actual serialisation) can be lost silently. Smallest fix: make the race deterministic, e.g. in the test open a second connection that holds `select ... for update` on the admin rows, fire the DELETE, release after a short delay, and assert 403 for the second remover (or a test that runs 20 rounds of the join).

### H-02 Should: self-delete refusal is not distinguishable in tests
`users.rs:79`, `tests/users.rs:~320`. Failing case: change the guard to `if false && ...`; all tests still pass, because a sole admin deleting self falls into the last-admin 403 with the same status and code. With two admins the self check is the only protection against an admin removing their own account. Smallest fix: in `delete_rules_and_effects`, add a second admin first, then assert `DELETE /api/users/<self>` is 403 and the message is "You can't remove yourself." (and that `/auth/me` still works).

### H-03 Should: admin reset path has no test for password length
`users.rs:127`, `tests/users.rs:424`. Failing case: change to `if own { validate::password(..)? }`; all tests pass, so an admin could set a 1-character password for a member. Smallest fix: add to `password_change_rules` an admin PUT with `{"password":"short"}` expecting 400 `validation`, and one with 1025 chars.

### H-04 Nice: untested edges
`tests/users.rs`: no test for (a) a member PUT to an unknown id returning 403 and not 404 (the no-oracle property), (b) malformed id `/api/users/abc` returning 400, (c) an admin changing their own password (needs `currentPassword`, keeps own session, ends their other sessions). Add three short cases.

### H-05 Nice: current-password guessing is not throttled
`users.rs:139`. A stolen session cookie can brute-force `currentPassword` with no limit (login has none either, so it is consistent). Failing case: loop PUT with wrong guesses, each costs one argon2 verify and holds the user row lock. Acceptable for a household app; if throttling is added to login later, apply it here too.

### H-06 Nice: serde errors can echo a wrongly typed value
`error.rs:97-103` (`body_text` of `JsonRejection`). Sending `{"password": 12345678901}` returns a message such as "invalid type: integer `12345678901`". Echoed only to the sender and not logged, so low risk. Smallest fix: map JSON rejections to a fixed "Invalid request body." for `users` routes, or leave.

### H-07 Nice: UI maps every 401 on the own-password form to "isn't your current password"
`frontend/src/components/settings/PasswordForm.tsx:64`. Failing case: session expired while the form is open; the user is told the current password is wrong instead of being sent to /login. Smallest fix: on 401 when `askCurrent`, call `api.me()`; if that is also 401, `router.push("/login")`. For the admin reset form (`askCurrent` false) a 401 shows the generic "Please sign in." with no redirect; same fix.

### H-08 Nice: stale row after a failed remove
`frontend/src/components/settings/HouseholdSection.tsx:39-43`. Failing case: another admin already removed Sam; the 404 shows an error but Sam stays in the list. Smallest fix: on `ApiError` status 404, also drop the user from state.

### H-09 Nice: UI details
(a) Disabled Remove buttons are not focusable and the reason text (`note`) is not tied to them with `aria-describedby`; keyboard and screen-reader users may miss why. (b) The own-password form has no hidden/readonly username input, so password managers may save the new password against the wrong account. (c) A `notice` Alert stays until the next action replaces it; clear it when a panel opens. (d) Add-member and password length checks on the client use UTF-16 `length`; server counts chars (an emoji-only password could pass the server and fail the client at 10 units, or the reverse). Use `[...s].length`.

Counts: Must 0, Should 3, Nice 6.
