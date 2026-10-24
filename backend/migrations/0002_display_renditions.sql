-- Print-style "display" rendition next to every stored photo (null = not made yet; the backfill fills it).
alter table images add column display_file_name text unique;

-- One row of household-wide settings.
create table household_settings (
    id              boolean primary key default true check (id),
    plate_treatment boolean not null default true,
    updated_at      timestamptz not null default now()
);
insert into household_settings default values;
