-- Contadores de consumo de APIs de pago por usuario (extracción, asistente, miniaturas).
-- Solo service_role vía FastAPI; sin políticas RLS → inaccesible desde el navegador.
-- Sin FK a auth.users: un invitado borrado no debe llevarse su historial de gasto
-- (trazabilidad del gasto). Los user_id huérfanos son inocuos.

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null check (kind in ('extraction', 'assistant_message', 'photo_lookup')),
  created_at timestamptz not null default now(),
  cost_hint numeric null
);

create index if not exists usage_events_user_kind_created_idx
  on public.usage_events (user_id, kind, created_at);

alter table public.usage_events enable row level security;
revoke all on public.usage_events from anon, authenticated;

-- Retención: la ventana más larga consultada es 30 días; 35 da margen.
-- Programar en producción (T7.3) junto al backup semanal si pg_cron no está disponible.
create or replace function public.cleanup_usage_events(older_than interval default interval '35 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted integer;
begin
  with stale as (
    delete from public.usage_events e
    where e.created_at < now() - older_than
    returning 1
  )
  select count(*) into deleted from stale;
  return deleted;
end;
$$;

revoke all on function public.cleanup_usage_events(interval) from anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'cleanup-usage-events',
    '15 4 * * *',
    $cron$select public.cleanup_usage_events();$cron$
  );
exception
  when others then
    raise notice 'pg_cron no disponible: programa cleanup_usage_events() manualmente (T7.3)';
end;
$$;
