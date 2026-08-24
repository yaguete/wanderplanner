-- Compartir viaje: miembros, invitaciones, versión optimista y RLS de colaboración.
--
-- Dueño = trips.user_id (inmutable desde el cliente). NO se duplica en trip_members
-- para que claim_guest_trips no tenga que reescribir membresías.
--
-- Invitación uniforme: siempre queda una fila viva en trip_invites hasta que
-- el invitado acepta (insert en trip_members + delete). Elegir a un compañero
-- ya compartido inserta membresía directa (RPC add_share_peer).
--
-- search_path = '' y todo cualificado. Sin FORCE RLS (claim_guest_trips /
-- delete_own_account son security definer y dejarían de funcionar).
--
-- Índice GIN: las políticas de sources usan `t.source_ids @> array[s.id]`,
-- nunca `s.id = any(t.source_ids)`.

-- ── Columnas ────────────────────────────────────────────────────────────────

alter table public.trips
  add column if not exists version bigint not null default 1;

alter table public.trips
  add column if not exists shared_at timestamptz;

create index if not exists trips_source_ids_gin_idx
  on public.trips using gin (source_ids);

-- ── Tablas ───────────────────────────────────────────────────────────────────

create table if not exists public.trip_members (
  trip_id    uuid not null references public.trips (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'editor' check (role = 'editor'),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create index if not exists trip_members_user_idx on public.trip_members (user_id);

create table if not exists public.trip_invites (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  email      text not null,
  token_hash text not null unique,
  invited_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create unique index if not exists trip_invites_pending_idx
  on public.trip_invites (trip_id, email);
create index if not exists trip_invites_email_idx on public.trip_invites (email);

alter table public.trip_members replica identity full;

comment on table public.trip_members is
  'Editores de un viaje. El dueño vive en trips.user_id, no aquí.';
comment on table public.trip_invites is
  'Invitaciones vivas. Aceptar = insert trip_members + delete. Caducadas: cleanup_trip_invites().';

-- ── usage_events.kind = trip_invite ──────────────────────────────────────────

alter table public.usage_events
  drop constraint if exists usage_events_kind_check;

alter table public.usage_events
  add constraint usage_events_kind_check
    check (kind in (
      'extraction',
      'assistant_message',
      'photo_lookup',
      'refresh',
      'system_revalidation',
      'day_summary',
      'partner_prewarm',
      'country_tasks',
      'place_suggest',
      'transport_hub',
      'landing_source_search',
      'trip_source_search',
      'photo_paid',
      'maps_resolve',
      'extraction_instagram',
      'trip_invite'
    ));

-- ── Helpers ──────────────────────────────────────────────────────────────────

create or replace function public._caller_is_anonymous()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select u.is_anonymous from auth.users u where u.id = auth.uid()),
    true
  );
$$;

create or replace function public._require_registered()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'auth required' using errcode = '28000';
  end if;
  if public._caller_is_anonymous() then
    raise exception 'anonymous sessions cannot share trips' using errcode = '42501';
  end if;
  return uid;
end;
$$;

create or replace function public._caller_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(lower(btrim(coalesce(auth.jwt() ->> 'email', ''))), '');
$$;

create or replace function public._normalize_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(lower(btrim(coalesce(p_email, ''))), '');
$$;

create or replace function public._mask_email(p_email text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  e text := public._normalize_email(p_email);
  local_part text;
  domain text;
  at_pos int;
begin
  if e is null then
    return null;
  end if;
  at_pos := position('@' in e);
  if at_pos < 2 then
    return '•••';
  end if;
  local_part := substr(e, 1, at_pos - 1);
  domain := substr(e, at_pos);
  if char_length(local_part) <= 1 then
    return overlay(local_part placing '•••' from 2) || domain;
  end if;
  return substr(local_part, 1, 1) || '•••' || domain;
end;
$$;

create or replace function public.user_is_trip_member(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.trip_members m
     where m.trip_id = p_trip_id
       and m.user_id = auth.uid()
  );
$$;

create or replace function public.user_is_trip_owner(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.trips t
     where t.id = p_trip_id
       and t.user_id = auth.uid()
  );
$$;

create or replace function public.user_can_access_trip(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.user_is_trip_owner(p_trip_id)
      or public.user_is_trip_member(p_trip_id);
$$;

create or replace function public.trip_owner_id(p_trip_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.user_id from public.trips t where t.id = p_trip_id;
$$;

create or replace function public.user_can_access_source(p_source_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.trips t
     where t.source_ids @> array[p_source_id]
       and public.user_can_access_trip(t.id)
  );
$$;

-- security definer: un `not exists` escrito en la política solo vería viajes
-- accesibles y borraría una fuente que otro viaje del dueño sigue usando.
create or replace function public.source_is_orphan(p_source_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
      from public.trips t
     where t.source_ids @> array[p_source_id]
  );
$$;

create or replace function public._trip_occupancy(p_trip_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select 1
       + (select count(*)::int from public.trip_members m where m.trip_id = p_trip_id)
       + (select count(*)::int from public.trip_invites i where i.trip_id = p_trip_id);
$$;

create or replace function public._is_share_peer(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_other is not null
     and p_other <> auth.uid()
     and exists (
       select 1
         from public.trips mine
         join public.trip_members m on m.trip_id = mine.id
        where mine.user_id = auth.uid()
          and m.user_id = p_other
       union all
       select 1
         from public.trips theirs
         join public.trip_members me on me.trip_id = theirs.id
        where theirs.user_id = p_other
          and me.user_id = auth.uid()
       union all
       select 1
         from public.trip_members a
         join public.trip_members b
           on a.trip_id = b.trip_id
          and a.user_id = auth.uid()
          and b.user_id = p_other
     );
$$;

-- ── Triggers ─────────────────────────────────────────────────────────────────

create or replace function public.bump_trip_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- touch_trip_shared_at solo pinta shared_at. Si bumpamos, el dueño entra en
  -- OCC y el syncer enseña «No hemos podido guardar los últimos cambios».
  if new.shared_at is distinct from old.shared_at
     and new.version is not distinct from old.version
  then
    return new;
  end if;
  new.version := old.version + 1;
  return new;
end;
$$;

drop trigger if exists trips_bump_version on public.trips;
create trigger trips_bump_version
  before update on public.trips
  for each row
  execute function public.bump_trip_version();

create or replace function public.protect_trip_owner_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is distinct from old.user_id
     and exists (
       select 1 from public.trip_members m
        where m.trip_id = old.id and m.user_id = auth.uid()
     )
  then
    new.user_id := old.user_id;
    new.archived := old.archived;
    new.referrer := old.referrer;
    new.seed_source_key := old.seed_source_key;
  end if;
  return new;
end;
$$;

drop trigger if exists trips_protect_owner_fields on public.trips;
create trigger trips_protect_owner_fields
  before update on public.trips
  for each row
  execute function public.protect_trip_owner_fields();

create or replace function public.enforce_trip_share_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  occupancy integer;
begin
  occupancy := public._trip_occupancy(
    case when tg_table_name = 'trip_members' then new.trip_id else new.trip_id end
  );
  -- BEFORE INSERT: occupancy aún no incluye NEW.
  if occupancy >= 8 then
    raise exception 'trip share cap reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trip_members_cap on public.trip_members;
create trigger trip_members_cap
  before insert on public.trip_members
  for each row
  execute function public.enforce_trip_share_cap();

drop trigger if exists trip_invites_cap on public.trip_invites;
create trigger trip_invites_cap
  before insert on public.trip_invites
  for each row
  execute function public.enforce_trip_share_cap();

create or replace function public.touch_trip_shared_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.trips
     set shared_at = coalesce(shared_at, now())
   where id = new.trip_id;
  return new;
end;
$$;

drop trigger if exists trip_members_shared_at on public.trip_members;
create trigger trip_members_shared_at
  after insert on public.trip_members
  for each row
  execute function public.touch_trip_shared_at();

drop trigger if exists trip_invites_shared_at on public.trip_invites;
create trigger trip_invites_shared_at
  after insert on public.trip_invites
  for each row
  execute function public.touch_trip_shared_at();

create or replace function public.normalize_trip_invite_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.email := public._normalize_email(new.email);
  if new.email is null or position('@' in new.email) < 2 then
    raise exception 'invalid invite email' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists trip_invites_normalize_email on public.trip_invites;
create trigger trip_invites_normalize_email
  before insert or update of email on public.trip_invites
  for each row
  execute function public.normalize_trip_invite_email();

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.trip_members enable row level security;
alter table public.trip_invites enable row level security;

drop policy if exists "trips_select_own" on public.trips;
drop policy if exists "trips_insert_own" on public.trips;
drop policy if exists "trips_update_own" on public.trips;
drop policy if exists "trips_delete_own" on public.trips;
drop policy if exists "trips_select_access" on public.trips;
drop policy if exists "trips_update_access" on public.trips;

create policy "trips_select_access" on public.trips
  for select using (
    user_id = (select auth.uid())
    or public.user_is_trip_member(id)
  );

create policy "trips_insert_own" on public.trips
  for insert with check (user_id = (select auth.uid()));

create policy "trips_update_access" on public.trips
  for update
  using (
    user_id = (select auth.uid())
    or public.user_is_trip_member(id)
  )
  with check (user_id = public.trip_owner_id(id));

create policy "trips_delete_own" on public.trips
  for delete using (user_id = (select auth.uid()));

drop policy if exists "sources_select_own" on public.sources;
drop policy if exists "sources_insert_own" on public.sources;
drop policy if exists "sources_update_own" on public.sources;
drop policy if exists "sources_delete_own" on public.sources;
drop policy if exists "sources_select_access" on public.sources;
drop policy if exists "sources_insert_access" on public.sources;
drop policy if exists "sources_update_access" on public.sources;
drop policy if exists "sources_delete_access" on public.sources;

create policy "sources_select_access" on public.sources
  for select using (
    user_id = (select auth.uid())
    or public.user_can_access_source(id)
  );

-- Insert: la fuente ya está (o acaba de quedar) en source_ids de un viaje
-- accesible, y user_id es el dueño de ese viaje; o es un alta huérfana propia.
create policy "sources_insert_access" on public.sources
  for insert with check (
    (
      public.user_can_access_source(id)
      and user_id = (
        select t.user_id
          from public.trips t
         where t.source_ids @> array[sources.id]
         limit 1
      )
    )
    or user_id = (select auth.uid())
  );

create policy "sources_update_access" on public.sources
  for update
  using (
    user_id = (select auth.uid())
    or public.user_can_access_source(id)
  )
  with check (user_id = (select s.user_id from public.sources s where s.id = sources.id));

create policy "sources_delete_access" on public.sources
  for delete using (
    (user_id = (select auth.uid()) or public.user_can_access_source(id))
    and public.source_is_orphan(id)
  );

drop policy if exists "assistant_conversations_insert_own" on public.assistant_conversations;
create policy "assistant_conversations_insert_own" on public.assistant_conversations
  for insert with check (
    user_id = (select auth.uid())
    and public.user_can_access_trip(trip_id)
  );

drop policy if exists "trip_members_select_access" on public.trip_members;
drop policy if exists "trip_members_delete_owner_or_self" on public.trip_members;
create policy "trip_members_select_access" on public.trip_members
  for select using (public.user_can_access_trip(trip_id));

create policy "trip_members_delete_owner_or_self" on public.trip_members
  for delete using (
    public.user_is_trip_owner(trip_id)
    or user_id = (select auth.uid())
  );

drop policy if exists "trip_invites_select_owner" on public.trip_invites;
drop policy if exists "trip_invites_insert_owner" on public.trip_invites;
drop policy if exists "trip_invites_delete_owner" on public.trip_invites;
drop policy if exists "trip_invites_update_owner" on public.trip_invites;

create policy "trip_invites_select_owner" on public.trip_invites
  for select using (public.user_is_trip_owner(trip_id));

create policy "trip_invites_insert_owner" on public.trip_invites
  for insert with check (
    public.user_is_trip_owner(trip_id)
    and invited_by = (select auth.uid())
  );

create policy "trip_invites_delete_owner" on public.trip_invites
  for delete using (public.user_is_trip_owner(trip_id));

create policy "trip_invites_update_owner" on public.trip_invites
  for update
  using (public.user_is_trip_owner(trip_id))
  with check (
    public.user_is_trip_owner(trip_id)
    and invited_by = (select auth.uid())
  );

revoke all on table public.trip_members from anon, authenticated;
revoke all on table public.trip_invites from anon, authenticated;
grant select, delete on table public.trip_members to authenticated;
grant select, insert, update, delete on table public.trip_invites to authenticated;

-- ── RPCs ─────────────────────────────────────────────────────────────────────

create or replace function public.list_trip_members(p_trip_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  email_masked text,
  is_owner boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := public._require_registered();
  owner uuid;
  invited_by_caller boolean;
begin
  if not public.user_can_access_trip(p_trip_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  owner := public.trip_owner_id(p_trip_id);

  return query
  select
    u.id,
    coalesce(
      nullif(p.display_name, ''),
      nullif(u.raw_user_meta_data ->> 'display_name', ''),
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      nullif(u.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(u.email, ''), '@', 1),
      'Viajero'
    ),
    nullif(u.raw_user_meta_data ->> 'avatar_url', ''),
    case
      when caller = owner or m.invited_by = caller then u.email
      else public._mask_email(u.email)
    end,
    (u.id = owner),
    coalesce(m.created_at, t.created_at)
  from public.trips t
  join auth.users u on u.id = t.user_id
  left join public.profiles p on p.id = u.id
  left join public.trip_members m
    on m.trip_id = t.id and m.user_id = u.id
  where t.id = p_trip_id

  union all

  select
    u.id,
    coalesce(
      nullif(p.display_name, ''),
      nullif(u.raw_user_meta_data ->> 'display_name', ''),
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      nullif(u.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(u.email, ''), '@', 1),
      'Viajero'
    ),
    nullif(u.raw_user_meta_data ->> 'avatar_url', ''),
    case
      when caller = owner or m.invited_by = caller then u.email
      else public._mask_email(u.email)
    end,
    false,
    m.created_at
  from public.trip_members m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = u.id
  where m.trip_id = p_trip_id
    and m.user_id <> owner;
end;
$$;

create or replace function public.list_trip_invites(p_trip_id uuid)
returns table (
  id uuid,
  email text,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._require_registered();
  if not public.user_is_trip_owner(p_trip_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select i.id, i.email, i.created_at, i.expires_at
    from public.trip_invites i
   where i.trip_id = p_trip_id
     and i.expires_at > now()
   order by i.created_at;
end;
$$;

create or replace function public.list_my_trip_invites()
returns table (
  invite_id uuid,
  trip_id uuid,
  trip_name text,
  trip_cover text,
  inviter_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := public._require_registered();
  mail text := public._caller_email();
begin
  if mail is null then
    return;
  end if;
  return query
  select
    i.id,
    t.id,
    t.name,
    t.cover,
    coalesce(
      nullif(p.display_name, ''),
      nullif(u.raw_user_meta_data ->> 'display_name', ''),
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      split_part(coalesce(u.email, ''), '@', 1),
      'Alguien'
    ),
    i.created_at
  from public.trip_invites i
  join public.trips t on t.id = i.trip_id
  join auth.users u on u.id = i.invited_by
  left join public.profiles p on p.id = u.id
  where i.email = mail
    and i.expires_at > now()
  order by i.created_at desc;
end;
$$;

create or replace function public._accept_trip_invite_row(p_invite public.trip_invites)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := public._require_registered();
  mail text := public._caller_email();
  owner uuid;
begin
  if p_invite.expires_at <= now() then
    delete from public.trip_invites where id = p_invite.id;
    return jsonb_build_object('status', 'expired');
  end if;
  if mail is null or mail <> p_invite.email then
    raise exception 'invite email mismatch' using errcode = '42501';
  end if;
  owner := public.trip_owner_id(p_invite.trip_id);
  if owner is null then
    delete from public.trip_invites where id = p_invite.id;
    return jsonb_build_object('status', 'gone');
  end if;
  if caller = owner then
    delete from public.trip_invites where id = p_invite.id;
    return jsonb_build_object('status', 'own', 'trip_id', p_invite.trip_id);
  end if;
  if exists (
    select 1 from public.trip_members m
     where m.trip_id = p_invite.trip_id and m.user_id = caller
  ) then
    delete from public.trip_invites where id = p_invite.id;
    return jsonb_build_object('status', 'already', 'trip_id', p_invite.trip_id);
  end if;

  delete from public.trip_invites where id = p_invite.id;
  insert into public.trip_members (trip_id, user_id, invited_by)
  values (p_invite.trip_id, caller, p_invite.invited_by);
  return jsonb_build_object('status', 'accepted', 'trip_id', p_invite.trip_id);
end;
$$;

create or replace function public.accept_trip_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  hashed text;
  inv public.trip_invites;
begin
  if p_token is null or length(btrim(p_token)) = 0 then
    return jsonb_build_object('status', 'unknown');
  end if;
  hashed := encode(sha256(convert_to(p_token, 'utf8')), 'hex');
  select * into inv from public.trip_invites i where i.token_hash = hashed;
  if not found then
    return jsonb_build_object('status', 'unknown');
  end if;
  return public._accept_trip_invite_row(inv);
end;
$$;

create or replace function public.accept_trip_invite_by_id(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.trip_invites;
begin
  select * into inv from public.trip_invites i where i.id = p_invite_id;
  if not found then
    return jsonb_build_object('status', 'unknown');
  end if;
  return public._accept_trip_invite_row(inv);
end;
$$;

create or replace function public.decline_trip_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  mail text := public._caller_email();
  deleted int;
begin
  perform public._require_registered();
  delete from public.trip_invites i
   where i.id = p_invite_id
     and i.email = mail;
  get diagnostics deleted = row_count;
  if deleted = 0 then
    return jsonb_build_object('status', 'unknown');
  end if;
  return jsonb_build_object('status', 'declined');
end;
$$;

create or replace function public.leave_trip(p_trip_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := public._require_registered();
  deleted int;
begin
  if public.user_is_trip_owner(p_trip_id) then
    raise exception 'owner cannot leave' using errcode = '42501';
  end if;
  delete from public.trip_members m
   where m.trip_id = p_trip_id and m.user_id = caller;
  get diagnostics deleted = row_count;
  if deleted = 0 then
    return jsonb_build_object('status', 'unknown');
  end if;
  return jsonb_build_object('status', 'left');
end;
$$;

create or replace function public.remove_trip_member(p_trip_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted int;
begin
  perform public._require_registered();
  if not public.user_is_trip_owner(p_trip_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_user_id = public.trip_owner_id(p_trip_id) then
    raise exception 'cannot remove owner' using errcode = '42501';
  end if;
  delete from public.trip_members m
   where m.trip_id = p_trip_id and m.user_id = p_user_id;
  get diagnostics deleted = row_count;
  if deleted = 0 then
    return jsonb_build_object('status', 'unknown');
  end if;
  return jsonb_build_object('status', 'removed');
end;
$$;

create or replace function public.add_share_peer(p_trip_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := public._require_registered();
  owner uuid;
begin
  if not public.user_is_trip_owner(p_trip_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  owner := public.trip_owner_id(p_trip_id);
  if p_user_id = caller or p_user_id = owner then
    raise exception 'cannot add self' using errcode = '22023';
  end if;
  if not public._is_share_peer(p_user_id) then
    raise exception 'not a share peer' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.trip_members m
     where m.trip_id = p_trip_id and m.user_id = p_user_id
  ) then
    return jsonb_build_object('status', 'already', 'trip_id', p_trip_id);
  end if;
  delete from public.trip_invites i
   where i.trip_id = p_trip_id
     and i.email = (
       select public._normalize_email(u.email) from auth.users u where u.id = p_user_id
     );
  insert into public.trip_members (trip_id, user_id, invited_by)
  values (p_trip_id, p_user_id, caller);
  return jsonb_build_object('status', 'added', 'trip_id', p_trip_id);
end;
$$;

create or replace function public.list_share_peers()
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  email_masked text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := public._require_registered();
begin
  return query
  with peers as (
    select distinct m.user_id as uid
      from public.trips mine
      join public.trip_members m on m.trip_id = mine.id
     where mine.user_id = caller
       and m.user_id <> caller
    union
    select distinct theirs.user_id
      from public.trip_members me
      join public.trips theirs on theirs.id = me.trip_id
     where me.user_id = caller
       and theirs.user_id <> caller
    union
    select distinct b.user_id
      from public.trip_members a
      join public.trip_members b
        on a.trip_id = b.trip_id
       and a.user_id = caller
       and b.user_id <> caller
  )
  select
    u.id,
    coalesce(
      nullif(p.display_name, ''),
      nullif(u.raw_user_meta_data ->> 'display_name', ''),
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      nullif(u.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(u.email, ''), '@', 1),
      'Viajero'
    ),
    nullif(u.raw_user_meta_data ->> 'avatar_url', ''),
    public._mask_email(u.email)
  from peers
  join auth.users u on u.id = peers.uid
  left join public.profiles p on p.id = u.id
  where coalesce(u.is_anonymous, false) = false
  order by 2;
end;
$$;

create or replace function public.lookup_invite_by_token_hash(p_token_hash text)
returns table (
  id uuid,
  trip_id uuid,
  trip_name text,
  email text,
  inviter_name text,
  inviter_email text,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Solo service_role (backend). El cliente no tiene grant.
  return query
  select
    i.id,
    t.id,
    t.name::text,
    i.email::text,
    coalesce(
      nullif(p.display_name, ''),
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      split_part(coalesce(u.email, ''), '@', 1),
      'Alguien'
    )::text,
    u.email::text,
    i.expires_at
  from public.trip_invites i
  join public.trips t on t.id = i.trip_id
  join auth.users u on u.id = i.invited_by
  left join public.profiles p on p.id = u.id
  where i.token_hash = p_token_hash;
end;
$$;

create or replace function public.cleanup_trip_invites()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted integer;
begin
  with stale as (
    delete from public.trip_invites i
     where i.expires_at < now() - interval '1 day'
    returning 1
  )
  select count(*) into deleted from stale;
  return deleted;
end;
$$;

create or replace function public.count_owned_shared_trips()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'shared_trips',
    (
      select count(*)::int
        from public.trips t
       where t.user_id = auth.uid()
         and (
           exists (select 1 from public.trip_members m where m.trip_id = t.id)
           or exists (select 1 from public.trip_invites i where i.trip_id = t.id)
         )
    ),
    'editors',
    (
      select count(*)::int
        from public.trip_members m
        join public.trips t on t.id = m.trip_id
       where t.user_id = auth.uid()
    )
  );
$$;

-- Grants: Postgres da EXECUTE a PUBLIC; hay que recortarlo.
revoke all on function public._caller_is_anonymous() from public, anon, authenticated;
revoke all on function public._require_registered() from public, anon, authenticated;
revoke all on function public._caller_email() from public, anon, authenticated;
revoke all on function public._normalize_email(text) from public, anon, authenticated;
revoke all on function public.normalize_trip_invite_email() from public, anon, authenticated;
revoke all on function public._mask_email(text) from public, anon, authenticated;
revoke all on function public._trip_occupancy(uuid) from public, anon, authenticated;
revoke all on function public._is_share_peer(uuid) from public, anon, authenticated;
revoke all on function public._accept_trip_invite_row(public.trip_invites) from public, anon, authenticated;
revoke all on function public.lookup_invite_by_token_hash(text) from public, anon, authenticated;
revoke all on function public.cleanup_trip_invites() from public, anon, authenticated;

revoke all on function public.user_is_trip_member(uuid) from public, anon;
revoke all on function public.user_is_trip_owner(uuid) from public, anon;
revoke all on function public.user_can_access_trip(uuid) from public, anon;
revoke all on function public.trip_owner_id(uuid) from public, anon;
revoke all on function public.user_can_access_source(uuid) from public, anon;
revoke all on function public.source_is_orphan(uuid) from public, anon;

grant execute on function public.user_is_trip_member(uuid) to authenticated;
grant execute on function public.user_is_trip_owner(uuid) to authenticated;
grant execute on function public.user_can_access_trip(uuid) to authenticated;
grant execute on function public.trip_owner_id(uuid) to authenticated;
grant execute on function public.user_can_access_source(uuid) to authenticated;
grant execute on function public.source_is_orphan(uuid) to authenticated;

revoke all on function public.list_trip_members(uuid) from public, anon;
revoke all on function public.list_trip_invites(uuid) from public, anon;
revoke all on function public.list_my_trip_invites() from public, anon;
revoke all on function public.accept_trip_invite(text) from public, anon;
revoke all on function public.accept_trip_invite_by_id(uuid) from public, anon;
revoke all on function public.decline_trip_invite(uuid) from public, anon;
revoke all on function public.leave_trip(uuid) from public, anon;
revoke all on function public.remove_trip_member(uuid, uuid) from public, anon;
revoke all on function public.add_share_peer(uuid, uuid) from public, anon;
revoke all on function public.list_share_peers() from public, anon;
revoke all on function public.count_owned_shared_trips() from public, anon;

grant execute on function public.list_trip_members(uuid) to authenticated;
grant execute on function public.list_trip_invites(uuid) to authenticated;
grant execute on function public.list_my_trip_invites() to authenticated;
grant execute on function public.accept_trip_invite(text) to authenticated;
grant execute on function public.accept_trip_invite_by_id(uuid) to authenticated;
grant execute on function public.decline_trip_invite(uuid) to authenticated;
grant execute on function public.leave_trip(uuid) to authenticated;
grant execute on function public.remove_trip_member(uuid, uuid) to authenticated;
grant execute on function public.add_share_peer(uuid, uuid) to authenticated;
grant execute on function public.list_share_peers() to authenticated;
grant execute on function public.count_owned_shared_trips() to authenticated;

-- lookup_invite_by_token_hash: el backend la llama con la service_role key.
grant execute on function public.lookup_invite_by_token_hash(text) to service_role;

do $$
begin
  alter publication supabase_realtime add table public.trips;
exception
  when duplicate_object then null;
  when undefined_object then
    raise notice 'publication supabase_realtime no existe';
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.trip_members;
exception
  when duplicate_object then null;
  when undefined_object then
    raise notice 'publication supabase_realtime no existe';
end;
$$;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'cleanup-trip-invites',
    '45 4 * * *',
    $cron$select public.cleanup_trip_invites();$cron$
  );
exception
  when others then
    raise notice 'pg_cron no disponible: programa cleanup_trip_invites() a mano';
end;
$$;
