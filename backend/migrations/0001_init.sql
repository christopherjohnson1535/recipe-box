create extension if not exists citext;

create table users (
    id            uuid primary key default gen_random_uuid(),
    username      citext not null unique,
    display_name  text not null,
    password_hash text not null,
    role          text not null check (role in ('admin', 'member')),
    created_at    timestamptz not null default now()
);

create table sessions (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references users (id) on delete cascade,
    token_hash bytea not null unique,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null
);
create index sessions_user_id_idx on sessions (user_id);

create table images (
    id         uuid primary key default gen_random_uuid(),
    file_name  text not null unique,
    width      int not null,
    height     int not null,
    bytes      int not null,
    created_by uuid references users (id) on delete set null,
    created_at timestamptz not null default now()
);

-- Generated columns need IMMUTABLE expressions; jsonb_array_elements + string_agg are, but only via a function.
create function recipe_ingredients_text(ingredients jsonb) returns text
    language sql immutable parallel safe
    return (select coalesce(string_agg(e ->> 'text', ' '), '') from jsonb_array_elements(ingredients) as e);

create table recipes (
    id            uuid primary key default gen_random_uuid(),
    title         text not null,
    description   text not null default '',
    ingredients   jsonb not null default '[]',
    steps         jsonb not null default '[]',
    servings      text,
    prep_minutes  int check (prep_minutes >= 0),
    cook_minutes  int check (cook_minutes >= 0),
    total_minutes int check (total_minutes >= 0),
    notes         text not null default '',
    source_url    text,
    source_name   text,
    source_type   text not null default 'manual' check (source_type in ('manual', 'link', 'photo', 'text')),
    image_id      uuid references images (id) on delete set null,
    created_by    uuid references users (id) on delete set null,
    updated_by    uuid references users (id) on delete set null,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    deleted_at    timestamptz,
    search        tsvector generated always as (
        to_tsvector('simple', title || ' ' || description || ' ' || notes || ' ' || recipe_ingredients_text(ingredients))
    ) stored
);
create index recipes_search_idx on recipes using gin (search);
create index recipes_source_url_idx on recipes (source_url);
create index recipes_created_at_idx on recipes (created_at desc);

create table tags (
    id   serial primary key,
    name citext not null unique
);

create table recipe_tags (
    recipe_id uuid not null references recipes (id) on delete cascade,
    tag_id    int not null references tags (id) on delete cascade,
    primary key (recipe_id, tag_id)
);
create index recipe_tags_tag_id_idx on recipe_tags (tag_id);

create table recipe_photos (
    recipe_id uuid not null references recipes (id) on delete cascade,
    image_id  uuid not null references images (id) on delete cascade,
    position  int not null,
    primary key (recipe_id, position)
);
