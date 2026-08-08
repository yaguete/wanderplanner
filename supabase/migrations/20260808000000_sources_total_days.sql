-- Duración declarada por la guía original (`itinerary.total_days`): permite que un viaje
-- llegado del CTA de un partner adopte los días del artículo sin reparsear el título.
alter table public.sources add column if not exists total_days integer;
