-- Limpieza v2 de invitados abandonados.
--
-- Firma nueva ⇒ DROP explícito. `create or replace` con distinta aridad crea un
-- overload y el `select cleanup_anonymous_users();` de pg_cron pasa a ser ambiguo.
-- Reloj = última actividad real, no created_at. No borra un upgrade a medias
-- (is_anonymous sigue true hasta confirmar el correo) ni un claim vivo.

drop function if exists public.cleanup_anonymous_users(interval);

create or replace function public.cleanup_anonymous_users(
  empty_older_than interval default interval '30 days',
  with_trips_older_than interval default interval '7 days',
  max_rows integer default 5000
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted integer;
begin
  with candidates as (
    select u.id,
           (select count(*) from public.trips t where t.user_id = u.id) as trip_count,
           greatest(
             u.created_at,
             coalesce(u.last_sign_in_at, u.created_at),
             coalesce(u.updated_at,      u.created_at),
             coalesce((select max(t.updated_at) from public.trips t where t.user_id = u.id),
                      u.created_at)
           ) as last_activity
      from auth.users u
     where u.is_anonymous
       and u.email is null
       and coalesce(u.email_change, '') = ''
       and coalesce(u.encrypted_password, '') = ''
       and not exists (
         select 1 from public.guest_trip_claims c
          where c.guest_user_id = u.id
            and c.consumed_at is null
            and c.expires_at > now()
       )
  ),
  doomed as (
    select c.id
      from candidates c
     where (c.trip_count = 0 and c.last_activity < now() - empty_older_than)
        or (c.trip_count > 0 and c.last_activity < now() - with_trips_older_than)
     order by c.last_activity
     limit max_rows
  ),
  stale as (
    delete from auth.users u
     using doomed d
     where u.id = d.id
    returning 1
  )
  select count(*) into deleted from stale;
  return deleted;
end;
$$;

revoke all on function public.cleanup_anonymous_users(interval, interval, integer)
  from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('cleanup-anonymous-users');
exception
  when others then
    null;
end;
$$;

do $$
begin
  perform cron.schedule(
    'cleanup-anonymous-users',
    '0 4 * * *',
    $cron$select public.cleanup_anonymous_users();$cron$
  );
exception
  when others then
    raise notice 'pg_cron no disponible: programa cleanup_anonymous_users() manualmente';
end;
$$;
