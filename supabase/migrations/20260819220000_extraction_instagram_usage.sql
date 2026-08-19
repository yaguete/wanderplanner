-- Tope diario de extracciones de Instagram para cuentas registradas.
-- kind=extraction_instagram, user_id obligatorio. Los invitados no escriben
-- este kind: una acción = un evento (`extraction`), como hasta ahora.

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
    'country_tasks',
    'place_suggest',
    'transport_hub',
    'landing_source_search',
    'trip_source_search',
    'photo_paid',
    'maps_resolve',
    'extraction_instagram'
  ));
