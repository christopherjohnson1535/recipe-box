-- A member's link to their own Google account (GRO-5). `refresh_token` is sealed by the server (nonce || ciphertext);
-- the database never sees the token. `tasklist_id` is the Google Tasks list the grocery list was last sent to.
create table google_connection (
    user_id       uuid primary key references users (id) on delete cascade,
    refresh_token bytea not null,
    tasklist_id   text,
    connected_at  timestamptz not null
);
