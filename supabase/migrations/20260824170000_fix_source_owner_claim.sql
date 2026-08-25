-- Claim de invitado: protect_source_owner_fields congelaba user_id siempre, así
-- que claim_guest_trips no reasignaba sources. Reparar con el trigger APAGADO
-- (auth.uid() es null en migraciones y el freeze las revertiría).
-- También: ocupación sin invitaciones caducadas, list_share_peers(p_trip_id),
-- tope de list_my_trip_invites.

create or replace function public.protect_source_owner_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    if auth.uid() is null
       or new.user_id <> auth.uid()
       or not coalesce(
            (select u.is_anonymous from auth.users u where u.id = old.user_id),
            false
          )
       or exists (
            select 1
              from public.trip_members m
              join public.trips t on t.id = m.trip_id
             where m.user_id = auth.uid()
               and t.source_ids @> array[old.id]
          )
    then
      new.user_id := old.user_id;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_source_owner_fields() from public, anon, authenticated;

alter table public.sources disable trigger sources_protect_owner_fields;

update public.sources s
   set user_id = t.user_id
  from public.trips t
 where t.source_ids @> array[s.id]
   and s.user_id is distinct from t.user_id
   and coalesce((select u.is_anonymous from auth.users u where u.id = s.user_id), false)
   and not coalesce((select u.is_anonymous from auth.users u where u.id = t.user_id), false);

alter table public.sources enable trigger sources_protect_owner_fields;

create or replace function public._trip_occupancy(p_trip_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select 1
       + (select count(*)::int from public.trip_members m where m.trip_id = p_trip_id)
       + (
           select count(*)::int
             from public.trip_invites i
            where i.trip_id = p_trip_id
              and i.expires_at > now()
         );
$$;

create or replace function public.enforce_trip_share_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  occupancy integer;
begin
  occupancy := public._trip_occupancy(new.trip_id);
  if occupancy >= 8 then
    raise exception 'trip share cap reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop function if exists public.list_share_peers();
drop function if exists public.list_share_peers(uuid);

create or replace function public.list_share_peers(p_trip_id uuid default null)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  email_masked text,
  already_in_trip boolean
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
    public._mask_email(u.email),
    (
      p_trip_id is not null
      and (
        exists (
          select 1
            from public.trip_members m
           where m.trip_id = p_trip_id
             and m.user_id = u.id
        )
        or exists (
          select 1
            from public.trip_invites i
           where i.trip_id = p_trip_id
             and i.expires_at > now()
             and i.email = public._normalize_email(u.email)
        )
      )
    )
  from peers
  join auth.users u on u.id = peers.uid
  left join public.profiles p on p.id = u.id
  where coalesce(u.is_anonymous, false) = false
  order by 2;
end;
$$;

revoke all on function public.list_share_peers(uuid) from public, anon;
grant execute on function public.list_share_peers(uuid) to authenticated;

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
      nullif(btrim(p.display_name), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      'Una persona'
    ),
    i.created_at
  from public.trip_invites i
  join public.trips t on t.id = i.trip_id
  join auth.users u on u.id = i.invited_by
  left join public.profiles p on p.id = u.id
  where i.email = mail
    and i.expires_at > now()
  order by i.created_at desc
  limit 20;
end;
$$;
