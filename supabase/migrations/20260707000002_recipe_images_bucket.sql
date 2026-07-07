-- Storage bucket for persisted recipe images. Scraped image URLs rot when
-- origin sites reorganize their CDNs; /api/persist-image copies them here
-- at save time. Public read (images render without signed URLs); writes are
-- scoped to the uploader's own folder ({user_id}/...).

insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', true)
on conflict (id) do nothing;

create policy "Users can upload own recipe images"
  on storage.objects for insert
  with check (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update own recipe images"
  on storage.objects for update
  using (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete own recipe images"
  on storage.objects for delete
  using (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Public read for recipe images"
  on storage.objects for select
  using (bucket_id = 'recipe-images');
