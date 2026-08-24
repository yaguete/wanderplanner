-- El nombre del que invita no cae al local-part del email: perfil, metadata, o «Una persona».

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
  return query
  select
    i.id,
    t.id,
    t.name::text,
    i.email::text,
    coalesce(
      nullif(btrim(p.display_name), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      'Una persona'
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

revoke all on function public.lookup_invite_by_token_hash(text) from public, anon, authenticated;
grant execute on function public.lookup_invite_by_token_hash(text) to service_role;

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
  order by i.created_at desc;
end;
$$;
