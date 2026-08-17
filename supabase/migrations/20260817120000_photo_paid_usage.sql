-- Tope global durable de fotos de pago (/thumb Places + /cover Unsplash).
-- kind=photo_paid, user_id null. Amplía el check de kinds con los que el
-- backend ya escribe (place_suggest, transport_hub, landing/trip_source_search)
-- y relaja user_id_required para los kinds sin usuario.

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
    'photo_paid'
  ));

alter table public.usage_events
  drop constraint if exists usage_events_user_id_required;

alter table public.usage_events
  add constraint usage_events_user_id_required
  check (
    (
      kind in (
        'system_revalidation',
        'partner_prewarm',
        'landing_source_search',
        'photo_paid'
      )
      and user_id is null
    )
    or (kind = 'trip_source_search')
    or (
      kind not in (
        'system_revalidation',
        'partner_prewarm',
        'landing_source_search',
        'trip_source_search',
        'photo_paid'
      )
      and user_id is not null
    )
  );

create index if not exists usage_events_kind_created_idx
  on public.usage_events (kind, created_at);
