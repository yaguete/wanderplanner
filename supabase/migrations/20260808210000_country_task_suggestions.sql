-- Caché global del JSON destilado de trámites por país (GET /country-tasks).
-- Solo FastAPI + service_role; mismo modelo que article_extractions / place_thumbs.
-- Amplía usage_events.kind con country_tasks.

create table if not exists public.country_task_suggestions (
  country_code text not null,
  brief_sha256 text not null,
  content_version integer not null,
  payload jsonb not null,
  brief_fetched_at timestamptz not null default now(),
  distilled_at timestamptz not null default now(),
  primary key (country_code, brief_sha256, content_version)
);

create index if not exists country_task_suggestions_country_code_idx
  on public.country_task_suggestions (country_code);

alter table public.country_task_suggestions enable row level security;
revoke all on public.country_task_suggestions from anon, authenticated;
grant select, insert, update, delete on table public.country_task_suggestions to service_role;

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
    'country_tasks'
  ));
