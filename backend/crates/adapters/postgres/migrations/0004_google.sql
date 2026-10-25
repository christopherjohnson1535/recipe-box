-- A member's link to their own Google account (GRO-5). `refresh_token` is sealed by the server (nonce || ciphertext);
-- the database never sees the token. It is null once Google refused it: the member is then not connected, but the row
-- keeps `tasklist_id`, the Google Tasks list the grocery list was last sent to, so reconnecting reuses that list.
-- `export_started_at` is the lease of a running export (one per member at a time, whichever server process).
create table google_connection (
    user_id           uuid primary key references users (id) on delete cascade,
    refresh_token     bytea,
    tasklist_id       text,
    connected_at      timestamptz not null,
    export_started_at timestamptz
);
