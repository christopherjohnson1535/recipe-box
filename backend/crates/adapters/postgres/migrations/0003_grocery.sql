-- The household grocery list (GRO-1 to GRO-4). One active list, made on first use.
create table grocery_list (
    id         uuid primary key,
    created_at timestamptz not null,
    updated_at timestamptz not null
);
-- At most one row, even when two requests create the list at once.
create unique index grocery_list_single on grocery_list ((true));

-- Recipes on the list. `scale` is a double so that 0.3 reads back as 0.3.
create table grocery_list_recipe (
    list_id   uuid not null references grocery_list (id) on delete cascade,
    recipe_id uuid not null references recipes (id) on delete cascade,
    scale     double precision not null check (scale between 0.25 and 10),
    added_at  timestamptz not null,
    primary key (list_id, recipe_id)
);

-- `key` is the merge key of the item's name. A generated item (made from the recipes) is unique per key; a manual
-- one never merges. `cleared` hides a generated item until its amounts change.
create table grocery_item (
    id         uuid primary key,
    list_id    uuid not null references grocery_list (id) on delete cascade,
    key        text not null,
    name       text not null,
    amounts    jsonb not null default '[]',
    section    text not null check (section in ('produce', 'meat', 'fridge', 'freezer', 'pantry', 'other')),
    checked    boolean not null default false,
    cleared    boolean not null default false,
    manual     boolean not null default false,
    recipe_ids uuid[] not null default '{}'
);
create unique index grocery_item_generated_key on grocery_item (list_id, key) where not manual;

-- What the household taught the app: a name's store section, and the names it always has at home.
create table grocery_section_override (
    key     text primary key,
    section text not null check (section in ('produce', 'meat', 'fridge', 'freezer', 'pantry', 'other'))
);

create table grocery_staple (
    key text primary key
);
insert into grocery_staple (key) values ('salt'), ('black pepper'), ('pepper'), ('water');
