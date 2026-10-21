# Plan 8 backend (users routes)
1. users.rs: list (order by display_name), create (validate::{username,display_name,password}, password::hash, role admin|member, 23505 -> 409).
2. remove: one tx; `select ... where role='admin' or id=$1 for update` locks all admins + target, so count + delete are serialised.
   403 self, 403 last admin, 404 unknown. Sessions go via FK `on delete cascade`; recipes keep rows (`created_by`/`updated_by` are `on delete set null`).
3. set_password: self needs currentPassword (password::verify, same 401 text as login); admin may reset others; member on others 403.
   Update hash + end sessions in one tx; session::end_for_user(tx, user, keep_token_hash) keeps caller's own session on self-change.
4. Tests backend/tests/users.rs (own harness copy, same pattern as api.rs); remove 501-stub entries for users in api.rs.
5. Wiki docs/wiki/Household-Members.md + sidebar entry.
