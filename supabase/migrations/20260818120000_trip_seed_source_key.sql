-- Marca el artículo del CTA que creó el viaje. Lo escribe SOLO /start, en el
-- mismo insert, antes de que exista la fila en sources. Sirve para que el mismo
-- artículo no clone viajes. El syncer no la incluye en su upsert (no está en
-- TRIP_COLUMNS / tripToRow) y no debe pisarla.

alter table public.trips add column if not exists seed_source_key text;

create index if not exists trips_user_seed_source_idx
  on public.trips (user_id, seed_source_key)
  where seed_source_key is not null;

comment on column public.trips.seed_source_key is
  'sourceMatchKey() del artículo del CTA que creó el viaje. Lo escribe SOLO /start, en el mismo insert, antes de que exista la fila en sources. Sirve para que el mismo artículo no clone viajes. El syncer no lo incluye en su upsert y no debe pisarlo.';
