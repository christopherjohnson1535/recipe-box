-- Favourites (REC-5): each member stars recipes for themselves; nobody else sees their stars.
-- A star stays while its recipe is soft-deleted (a restore brings it back) and goes when the recipe is purged; it goes
-- with its member when the member is removed.
create table favourites (
    user_id    uuid not null references users (id) on delete cascade,
    recipe_id  uuid not null references recipes (id) on delete cascade,
    created_at timestamptz not null,
    primary key (user_id, recipe_id)
);
-- Purging a recipe deletes its stars: without this, every purge scans the table.
create index favourites_recipe_idx on favourites (recipe_id);
