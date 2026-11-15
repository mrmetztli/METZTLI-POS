-- METZTLI Caja — extensión comercial multiempresa
-- Aplicar DESPUÉS de supabase/schema.sql. No contiene service_role ni secretos.
-- Las invitaciones por correo se envían desde una Supabase Edge Function
-- que valida al solicitante y usa service_role únicamente en el servidor.

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.business_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and position('@' in email) > 1),
  role text not null check (role in ('admin','cashier','viewer')),
  invited_by uuid not null references auth.users(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists business_invitations_pending_email_idx
  on public.business_invitations (business_id, email)
  where accepted_at is null;

create table if not exists public.business_subscriptions (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  plan_code text not null default 'trial',
  status text not null default 'pending'
    check (status in ('pending','trialing','active','past_due','suspended','cancelled')),
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
alter table public.business_invitations enable row level security;
alter table public.business_subscriptions enable row level security;

revoke all on public.platform_admins from anon, authenticated;
revoke all on public.business_invitations from anon, authenticated;
revoke all on public.business_subscriptions from anon, authenticated;

-- Los dueños/admins solo pueden consultar invitaciones de su propio negocio.
grant select on public.business_invitations to authenticated;
create policy "business admins can view invitations"
  on public.business_invitations for select to authenticated
  using (
    private.user_business_role(business_id) in ('owner','admin')
  );

-- El estado de licencias y el rol de plataforma se consultan/modifican
-- exclusivamente desde Edge Functions/servidor con service_role.
-- Nunca exponer service_role en Android, Windows ni navegador.

-- No permitir que clientes agreguen miembros pasando un UUID arbitrario.
-- El alta se realiza por invitación de correo y aceptación autenticada.
revoke all on function public.add_business_member(uuid, uuid, text)
  from public, anon, authenticated;

create or replace function public.accept_business_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.business_invitations%rowtype;
  current_user_id uuid := auth.uid();
  current_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if current_user_id is null or current_email = '' then
    raise exception 'Debes iniciar sesión con un correo verificado'
      using errcode = '28000';
  end if;

  select * into invitation
  from public.business_invitations
  where id = p_invitation_id
  for update;

  if not found
     or invitation.accepted_at is not null
     or invitation.expires_at <= now()
     or invitation.email <> current_email then
    raise exception 'La invitación no existe, venció o no corresponde a tu correo'
      using errcode = '42501';
  end if;

  insert into public.business_members (business_id, user_id, role)
  values (invitation.business_id, current_user_id, invitation.role)
  on conflict (business_id, user_id) do nothing;

  update public.business_invitations
  set accepted_at = now()
  where id = invitation.id;

  return invitation.business_id;
end;
$$;

revoke all on function public.accept_business_invitation(uuid) from public, anon;
grant execute on function public.accept_business_invitation(uuid) to authenticated;

-- El propietario puede quitar miembros; no puede quitarse a sí mismo
-- ni eliminar/cambiar al propietario mediante este procedimiento.
create or replace function public.remove_business_member(
  p_business_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
  target_role text;
begin
  caller_role := private.user_business_role(p_business_id);
  if caller_role is distinct from 'owner' then
    raise exception 'Solo el propietario puede retirar miembros'
      using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'El propietario no puede retirarse a sí mismo'
      using errcode = '42501';
  end if;

  select role into target_role
  from public.business_members
  where business_id = p_business_id and user_id = p_user_id;

  if target_role is null then return; end if;
  if target_role = 'owner' then
    raise exception 'No se puede retirar al propietario'
      using errcode = '42501';
  end if;

  delete from public.business_members
  where business_id = p_business_id and user_id = p_user_id;
end;
$$;

revoke all on function public.remove_business_member(uuid, uuid) from public, anon;
grant execute on function public.remove_business_member(uuid, uuid) to authenticated;

-- La función create_business existente permite a cualquier usuario autenticado
-- crear su propio negocio. El negocio comienza con licencia pending/trial,
-- administrada por la plataforma desde servidor.
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

  insert into public.business_subscriptions (business_id, plan_code, status)
  values (new_business_id, 'trial', 'pending');

  return new_business_id;
end;
$$;

revoke all on function public.create_business(text) from public, anon;
grant execute on function public.create_business(text) to authenticated;
