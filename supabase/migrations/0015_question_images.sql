alter table public.questions
  add column image_url text check (image_url is null or char_length(image_url) <= 500),
  add column image_alt text check (image_alt is null or char_length(image_alt) <= 200),
  add constraint questions_image_needs_alt
    check (image_url is null or char_length(btrim(coalesce(image_alt, ''))) > 0);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'question-images',
  'question-images',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy question_images_insert_own_folder on storage.objects
for insert to authenticated
with check (
  bucket_id = 'question-images'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.can_manage_branding()
);

create policy question_images_update_own_folder on storage.objects
for update to authenticated
using (
  bucket_id = 'question-images'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.can_manage_branding()
)
with check (
  bucket_id = 'question-images'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.can_manage_branding()
);

create policy question_images_delete_own_folder on storage.objects
for delete to authenticated
using (
  bucket_id = 'question-images'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.can_manage_branding()
);
