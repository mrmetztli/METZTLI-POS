-- METZTLI Caja — base de sincronización en Supabase
-- Ejecutar en SQL Editor de un proyecto NUEVO de Supabase.
-- No modifica ni importa las bases IndexedDB existentes.

create extension if not exists pgcrypto;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'cashier' check (role in ('owner','admin','cashier','viewer')),
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create or replace function public.is_business_member(target_business uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = target_business and m.user_id = auth.uid()
  );
$$;

create table if not exists public.sync_records (
  business_id uuid not null references public.businesses(id) on delete cascade,
  store_name text not null check (store_name in (
    'products','categories','sales','clients','expenses',
    'expenseCategories','settings','audit','meta'
  )),
  record_id text not null,
  payload jsonb not null,
  revision bigint not null default 1,
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
  device_name text not null,
  platform text not null check (platform in ('android','windows','web')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (business_id, user_id, device_name)
);

alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.sync_records enable row level security;
alter table public.sync_devices enable row level security;

drop policy if exists "members can read their business" on public.businesses;
create policy "members can read their business" on public.businesses
  for select to authenticated using (public.is_business_member(id));

drop policy if exists "members can read membership list" on public.business_members;
create policy "members can read membership list" on public.business_members
  for select to authenticated using (public.is_business_member(business_id));

drop policy if exists "members can read shared records" on public.sync_records;
create policy "members can read shared records" on public.sync_records
  for select to authenticated using (public.is_business_member(business_id));

drop policy if exists "members can insert shared records" on public.sync_records;
create policy "members can insert shared records" on public.sync_records
  for insert to authenticated with check (
    public.is_business_member(business_id) and updated_by = auth.uid()
  );

drop policy if exists "members can update shared records" on public.sync_records;
create policy "members can update shared records" on public.sync_records
  for update to authenticated using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id) and updated_by = auth.uid());

drop policy if exists "members can read their devices" on public.sync_devices;
create policy "members can read their devices" on public.sync_devices
  for select to authenticated using (public.is_business_member(business_id));

drop policy if exists "members can register devices" on public.sync_devices;
create policy "members can register devices" on public.sync_devices
  for insert to authenticated with check (
    public.is_business_member(business_id) and user_id = auth.uid()
  );

drop policy if exists "members can update their devices" on public.sync_devices;
create policy "members can update their devices" on public.sync_devices
  for update to authenticated using (
    public.is_business_member(business_id) and user_id = auth.uid()
  ) with check (
    public.is_business_member(business_id) and user_id = auth.uid()
  );

-- Habilitar sync_records en Supabase Realtime desde Database > Publications
-- o añadirla a supabase_realtime si la publicación existe.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'sync_records'
     ) then
    alter publication supabase_realtime add table public.sync_records;
  end if;
end $$;

-- IMPORTANTE:
-- 1) Nunca uses la service_role key dentro de APK/EXE.
-- 2) No borres filas remotas para propagar eliminaciones: usa deleted=true (tombstone).
-- 3) El stock debe sincronizarse como movimientos atómicos, no con "última escritura gana".
-- 4) La importación inicial debe ser una operación explícita después de respaldar y revisar duplicados.
