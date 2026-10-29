-- The "made it" log (REC-6): a member cooked a recipe on a day, with what they would change next time.
-- `cooked_on` is the cook's own calendar day (sent by their device). Entries stay while their recipe is soft-deleted
-- (a restore brings them back) and go when it is purged; a removed member's entries stay, unsigned.
create table cook_log (
    id         uuid primary key,
    recipe_id  uuid not null references recipes (id) on delete cascade,
    user_id    uuid references users (id) on delete set null,
    cooked_on  date not null,
    note       text not null default '',
    created_at timestamptz not null
);
create index cook_log_recipe_idx on cook_log (recipe_id, cooked_on desc, created_at desc);
