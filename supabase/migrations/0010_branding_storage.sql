create function public.can_manage_branding()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('host', 'admin')
  );
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy branding_insert_own_folder on storage.objects
for insert to authenticated
with check (
  bucket_id = 'branding'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.can_manage_branding()
);

create policy branding_update_own_folder on storage.objects
for update to authenticated
using (
  bucket_id = 'branding'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.can_manage_branding()
)
with check (
  bucket_id = 'branding'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.can_manage_branding()
);

create policy branding_delete_own_folder on storage.objects
for delete to authenticated
using (
  bucket_id = 'branding'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.can_manage_branding()
);
