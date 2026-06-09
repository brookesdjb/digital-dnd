-- Map-assets storage bucket: upload once, use across all scenes.
-- Public access — display client (TV browser) loads images without auth.
insert into storage.buckets (id, name, public)
values ('map-assets', 'map-assets', true)
on conflict (id) do nothing;

-- LAN mode: no auth — allow public read/write/delete.
create policy "map-assets public read"
  on storage.objects for select
  using (bucket_id = 'map-assets');

create policy "map-assets public insert"
  on storage.objects for insert
  with check (bucket_id = 'map-assets');

create policy "map-assets public delete"
  on storage.objects for delete
  using (bucket_id = 'map-assets');
