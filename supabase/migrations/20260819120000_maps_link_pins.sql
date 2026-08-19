-- Caché global de pines extraídos de short links de Google Maps (`POST /maps/resolve`).
-- Solo service_role vía FastAPI; sin políticas RLS → inaccesible desde el navegador.
-- PK = URL canónica (host+path, sin query en short links). Solo lng/lat: nunca
-- place ID, topónimo ni contenido de Google.

create table if not exists public.maps_link_pins (
  url text primary key,
  lng double precision not null,
  lat double precision not null,
  resolved_at timestamptz not null default now()
);

alter table public.maps_link_pins enable row level security;
revoke all on public.maps_link_pins from anon, authenticated;
grant select, insert, update, delete on table public.maps_link_pins to service_role;

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
    'maps_resolve'
  ));
