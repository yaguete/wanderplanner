-- Amplía usage_events.kind con partner_prewarm (pre-síntesis desde /partners).

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
    'partner_prewarm'
  ));
