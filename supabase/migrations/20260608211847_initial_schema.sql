create extension if not exists "pgcrypto";

create table table_config (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  secret_key      text not null default gen_random_uuid()::text,
  screen_w_in     numeric not null default 55,
  screen_h_in     numeric not null default 32,
  is_paused       boolean not null default false,
  pause_image_url text,
  active_scene_id uuid,
  created_at      timestamptz not null default now()
);

create table asset (
  id          uuid primary key default gen_random_uuid(),
  table_id    uuid not null references table_config(id) on delete cascade,
  storage_key text not null,
  filename    text not null,
  mime_type   text not null,
  width_px    int,
  height_px   int,
  file_size   int,
  created_at  timestamptz not null default now()
);

create table scene (
  id           uuid primary key default gen_random_uuid(),
  table_id     uuid not null references table_config(id) on delete cascade,
  name         text not null default 'Untitled Scene',
  sort_order   int not null default 0,
  map_asset_id uuid references asset(id) on delete set null,
  map_scale    numeric not null default 1,
  map_offset_x numeric not null default 0,
  map_offset_y numeric not null default 0,
  map_rotation int not null default 0,
  terrain      jsonb,
  objects      jsonb,
  fog_mask     text,
  fog_opacity  numeric not null default 0.85,
  grid_enabled boolean not null default false,
  grid_type    text not null default 'square',
  grid_color   text not null default '#ffffff',
  grid_opacity numeric not null default 0.3,
  weather      text not null default 'none',
  bg_color     text not null default '#000000',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- deferred so we can insert scene + set active_scene_id in same transaction
alter table table_config
  add constraint fk_active_scene
  foreign key (active_scene_id) references scene(id) on delete set null
  deferrable initially deferred;

create index on scene(table_id, sort_order);
create index on asset(table_id);

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger scene_updated_at
  before update on scene
  for each row execute function set_updated_at();
