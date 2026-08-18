-- Contadores del embudo del CTA de blogs (`POST /funnel`).
-- Solo service_role vía FastAPI; sin políticas RLS → inaccesible desde el navegador.
-- Sin user_id, IP ni URL completa: name + ref (partner) + post_slug (artículo) + meta acotado.

create table if not exists public.funnel_events (
  id        bigserial primary key,
  at        timestamptz not null default now(),
  name      text not null,
  ref       text,
  post_slug text,
  meta      jsonb not null default '{}'::jsonb
);

create index if not exists funnel_events_at_idx
  on public.funnel_events (at desc);
create index if not exists funnel_events_name_at_idx
  on public.funnel_events (name, at desc);
create index if not exists funnel_events_ref_slug_at_idx
  on public.funnel_events (ref, post_slug, at desc);

alter table public.funnel_events enable row level security;
revoke all on public.funnel_events from anon, authenticated;
grant select, insert, update, delete on table public.funnel_events to service_role;
grant usage, select on sequence public.funnel_events_id_seq to service_role;

create or replace function public.cleanup_funnel_events(older_than interval default interval '90 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted integer;
begin
  with stale as (
    delete from public.funnel_events e
    where e.at < now() - older_than
    returning 1
  )
  select count(*) into deleted from stale;
  return deleted;
end;
$$;

revoke all on function public.cleanup_funnel_events(interval) from anon, authenticated;
grant execute on function public.cleanup_funnel_events(interval) to service_role;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'cleanup-funnel-events',
    '30 4 * * *',
    $cron$select public.cleanup_funnel_events();$cron$
  );
exception
  when others then
    raise notice 'pg_cron no disponible: programa cleanup_funnel_events() manualmente';
end;
$$;
