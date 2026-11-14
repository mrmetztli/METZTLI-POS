-- METZTLI Caja — esquema inicial seguro para sincronización Supabase
-- Ejecutar una sola vez en SQL Editor de un proyecto NUEVO.
-- No importa, modifica ni elimina datos de IndexedDB.
-- Requiere Supabase Auth. No usar service_role en APK, EXE ni navegador.

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create table if not exists public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'cashier'
    check (role in ('owner','admin','cashier','viewer')),
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create table if not exists public.sync_records (
  business_id uuid not null references public.businesses(id) on delete cascade,
  store_name text not null check (store_name in (
    'products','categories','sales','clients','expenses',
    'expenseCategories','settings','audit','meta'
  )),
  record_id text not null check (char_length(record_id) between 1 and 200),
  payload jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  deleted boolean not null default false,
  primary key (business_id, store_name, record_id)
);

create index if not exists sync_records_updated_idx
  on public.sync_records (business_id, updated_at);

create table if not exists public.sync_devices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_name text not null check (char_length(btrim(device_name)) between 1 and 100),
  platform text not null check (platform in ('android','windows','web')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (business_id, user_id, device_name)
);

-- Funciones privadas de autorización: SECURITY DEFINER con search_path vacío.
create or replace function private.user_business_role(target_business uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.business_members as m
  where m.business_id = target_business
    and m.user_id = (select auth.uid())
  limit 1;
$$;

create or replace function private.is_business_member(target_business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.business_members as m
    where m.business_id = target_business
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.can_write_sync_store(
  target_business uuid,
  target_store text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case private.user_business_role(target_business)
    when 'owner' then true
    when 'admin' then true
    when 'cashier' then target_store <> 'settings'
    else false
  end;
$$;

revoke all on function private.user_business_role(uuid) from public, anon;
revoke all on function private.is_business_member(uuid) from public, anon;
revoke all on function private.can_write_sync_store(uuid, text) from public, anon;
grant execute on function private.user_business_role(uuid) to authenticated;
grant execute on function private.is_business_member(uuid) to authenticated;
grant execute on function private.can_write_sync_store(uuid, text) to authenticated;

-- Alta inicial atómica: el usuario autenticado crea el negocio y queda como owner.
create or replace function public.create_business(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_business_id uuid;
  clean_name text := btrim(coalesce(p_name, ''));
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Debes iniciar sesión para crear un negocio'
      using errcode = '28000';
  end if;
  if char_length(clean_name) < 1 or char_length(clean_name) > 120 then
    raise exception 'El nombre debe tener entre 1 y 120 caracteres'
      using errcode = '22023';
  end if;

  insert into public.businesses (name)
  values (clean_name)
  returning id into new_business_id;

  insert into public.business_members (business_id, user_id, role)
  values (new_business_id, current_user_id, 'owner');

  return new_business_id;
end;
$$;

-- Alta de miembros por UUID de Auth. La invitación/creación de cuentas se hace
-- primero desde Supabase Auth; esta función solo concede acceso al negocio.
-- Admin puede agregar cashier/viewer. Solo owner puede agregar admin.
create or replace function public.add_business_member(
  p_business_id uuid,
  p_user_id uuid,
  p_role text default 'cashier'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
begin
  caller_role := private.user_business_role(p_business_id);

  if caller_role not in ('owner', 'admin') then
    raise exception 'No tienes permiso para administrar miembros'
      using errcode = '42501';
  end if;

  if p_user_id is null or p_role not in ('admin', 'cashier', 'viewer') then
    raise exception 'Usuario o rol no válido'
      using errcode = '22023';
  end if;

  if p_role = 'admin' and caller_role <> 'owner' then
    raise exception 'Solo el propietario puede asignar el rol admin'
      using errcode = '42501';
  end if;

  insert into public.business_members (business_id, user_id, role)
  values (p_business_id, p_user_id, p_role)
  on conflict (business_id, user_id)
  do update set role = excluded.role
  where public.business_members.role <> 'owner';

  if not found then
    raise exception 'No se puede modificar el propietario del negocio'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.create_business(text) from public, anon;
revoke all on function public.add_business_member(uuid, uuid, text) from public, anon;
grant execute on function public.create_business(text) to authenticated;
grant execute on function public.add_business_member(uuid, uuid, text) to authenticated;

-- RLS y privilegios SQL: las políticas no sustituyen a los GRANT.
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.sync_records enable row level security;
alter table public.sync_devices enable row level security;

revoke all on table public.businesses from anon, authenticated;
revoke all on table public.business_members from anon, authenticated;
revoke all on table public.sync_records from anon, authenticated;
revoke all on table public.sync_devices from anon, authenticated;

grant select on table public.businesses to authenticated;
grant select on table public.business_members to authenticated;
grant select, insert, update on table public.sync_records to authenticated;
grant select, insert, update on table public.sync_devices to authenticated;

drop policy if exists "members can read their business" on public.businesses;
create policy "members can read their business" on public.businesses
  for select to authenticated
  using ((select private.is_business_member(id)));

drop policy if exists "members can read membership list" on public.business_members;
create policy "members can read membership list" on public.business_members
  for select to authenticated
  using ((select private.is_business_member(business_id)));

drop policy if exists "members can read shared records" on public.sync_records;
create policy "members can read shared records" on public.sync_records
  for select to authenticated
  using ((select private.is_business_member(business_id)));

drop policy if exists "permitted roles can insert shared records" on public.sync_records;
create policy "permitted roles can insert shared records" on public.sync_records
  for insert to authenticated
  with check (
    updated_by = (select auth.uid())
    and (select private.can_write_sync_store(business_id, store_name))
  );

drop policy if exists "permitted roles can update shared records" on public.sync_records;
create policy "permitted roles can update shared records" on public.sync_records
  for update to authenticated
  using ((select private.can_write_sync_store(business_id, store_name)))
  with check (
    updated_by = (select auth.uid())
    and (select private.can_write_sync_store(business_id, store_name))
  );

drop policy if exists "members can read their devices" on public.sync_devices;
create policy "members can read their devices" on public.sync_devices
  for select to authenticated
  using ((select private.is_business_member(business_id)));

drop policy if exists "members can register their devices" on public.sync_devices;
create policy "members can register their devices" on public.sync_devices
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.is_business_member(business_id))
  );

drop policy if exists "members can update their devices" on public.sync_devices;
create policy "members can update their devices" on public.sync_devices
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and (select private.is_business_member(business_id))
  )
  with check (
    user_id = (select auth.uid())
    and (select private.is_business_member(business_id))
  );

-- Publicación Realtime: notificar cambios; los datos se vuelven a leer bajo RLS.
do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_catalog.pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'sync_records'
     ) then
    alter publication supabase_realtime add table public.sync_records;
  end if;
end $$;

-- Notas de seguridad y consistencia:
-- * service_role/secret key nunca debe incluirse en clientes.
-- * No se concede DELETE directo: propagar bajas con deleted=true (tombstone).
-- * El stock requiere movimientos y operaciones atómicas; no sincronizar stock por LWW.
-- * Los folios definitivos requieren asignación remota atómica.
-- * La primera importación de datos locales debe ser explícita, respaldada y revisada.
