-- lookup_invite_by_token_hash: auth.users.email es varchar(255); RETURNS TABLE
-- declara text. Sin el CAST, RETURN QUERY aborta (42804) y el front ve «unknown».

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

revoke all on function public.lookup_invite_by_token_hash(text) from public, anon, authenticated;
grant execute on function public.lookup_invite_by_token_hash(text) to service_role;
