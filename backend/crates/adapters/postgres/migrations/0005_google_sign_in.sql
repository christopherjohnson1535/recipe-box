-- Sign in with Google for existing members (ACC-6). `users.email` is set by an admin: a Google account with that
-- verified address may sign in as the member. It is optional, and unique when set (citext: case-insensitive).
alter table users add column email citext unique;

-- A member's link to an account at an identity provider. `subject` is the provider's stable id for the account (the
-- email can change, the subject cannot); `email` is the address the account had when it was linked, shown in Settings
-- and never used to sign in. One account links to one member; a member may link several.
create table user_identities (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references users (id) on delete cascade,
    provider   text not null,
    subject    text not null,
    email      citext not null,
    created_at timestamptz not null,
    unique (provider, subject)
);
create index user_identities_user_id_idx on user_identities (user_id, created_at);
