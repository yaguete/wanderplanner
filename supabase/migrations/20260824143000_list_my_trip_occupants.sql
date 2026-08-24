-- Ocupantes de los viajes del caller (dueño + miembros) para avatares en Inicio.

create or replace function public.list_my_trip_occupants()
returns table (
  trip_id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  is_owner boolean
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
  with accessible as (
    select t.id, t.user_id as owner_id
      from public.trips t
     where t.user_id = caller
        or exists (
          select 1
            from public.trip_members m
           where m.trip_id = t.id
             and m.user_id = caller
        )
  ),
  occupants as (
    select a.id as trip_id, a.owner_id as user_id, true as is_owner
      from accessible a
    union
    select m.trip_id, m.user_id, false as is_owner
      from public.trip_members m
      join accessible a on a.id = m.trip_id
  )
  select
    o.trip_id,
    o.user_id,
    coalesce(
      nullif(btrim(p.display_name), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      'Viajero'
    ),
    nullif(u.raw_user_meta_data ->> 'avatar_url', ''),
    o.is_owner
  from occupants o
  join auth.users u on u.id = o.user_id
  left join public.profiles p on p.id = u.id;
end;
$$;

revoke all on function public.list_my_trip_occupants() from public, anon;
grant execute on function public.list_my_trip_occupants() to authenticated;
