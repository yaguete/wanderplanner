-- Limpieza de sesiones anónimas abandonadas (modo invitado del CTA de blogs).
--
-- Un invitado que nunca llegó a crear un viaje no aporta nada y sí superficie de abuso:
-- se borra pasados unos días. Al borrar el usuario, sus filas caen por `on delete cascade`.

create or replace function public.cleanup_anonymous_users(older_than interval default interval '30 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted integer;
begin
  with stale as (
    delete from auth.users u
    where u.is_anonymous
      and u.created_at < now() - older_than
      and not exists (select 1 from public.trips t where t.user_id = u.id)
    returning 1
  )
  select count(*) into deleted from stale;
  return deleted;
end;
$$;

revoke all on function public.cleanup_anonymous_users(interval) from anon, authenticated;

-- Programación diaria. `pg_cron` puede no estar habilitada en el proyecto: si falla,
-- la función queda disponible para invocarla a mano o desde un cron externo.
do $$
begin
  create extension if not exists pg_cron;
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
