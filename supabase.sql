-- Ejecuta este script en Supabase > SQL Editor.
-- Después crea tu usuario administrador en Authentication > Users.
-- Recomendación: desactiva los registros públicos si solo tú crearás contactos.

create extension if not exists pgcrypto;

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slug text not null unique check (char_length(slug) between 3 and 100),
  first_name text not null,
  last_name text,
  company text not null,
  job_title text not null,
  mobile text not null,
  phone text,
  email text,
  website text,
  address text,
  whatsapp text,
  photo_url text,
  notes text,
  accent_color text not null default '#b51f2e' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contacts_owner_id_idx on public.contacts(owner_id);
create index if not exists contacts_slug_active_idx on public.contacts(slug, is_active);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();

alter table public.contacts enable row level security;

-- Cualquier visitante puede leer únicamente tarjetas activas.
drop policy if exists "Public can read active contacts" on public.contacts;
create policy "Public can read active contacts"
on public.contacts
for select
to anon, authenticated
using (is_active = true or owner_id = auth.uid());

-- Cada administrador autenticado gestiona solamente sus contactos.
drop policy if exists "Owners can insert contacts" on public.contacts;
create policy "Owners can insert contacts"
on public.contacts
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "Owners can update contacts" on public.contacts;
create policy "Owners can update contacts"
on public.contacts
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Owners can delete contacts" on public.contacts;
create policy "Owners can delete contacts"
on public.contacts
for delete
to authenticated
using (owner_id = auth.uid());

grant usage on schema public to anon, authenticated;
grant select on public.contacts to anon;
grant select, insert, update, delete on public.contacts to authenticated;
