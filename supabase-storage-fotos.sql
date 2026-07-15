-- Ejecuta este script una sola vez en Supabase > SQL Editor.
-- Crea un bucket público para las fotos de las tarjetas y permite
-- que cada administrador gestione únicamente los archivos de su carpeta.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'contact-photos',
  'contact-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Contact photo owners can upload" on storage.objects;
create policy "Contact photo owners can upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'contact-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Contact photo owners can select" on storage.objects;
create policy "Contact photo owners can select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'contact-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Contact photo owners can delete" on storage.objects;
create policy "Contact photo owners can delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'contact-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
