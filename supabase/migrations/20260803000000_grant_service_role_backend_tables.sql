-- Con "Automatically expose new tables" desactivado, service_role tampoco recibe
-- privilegios automáticos: las tablas "solo backend" quedaron inaccesibles (42501)
-- y sus cachés/metering degradaban en silencio a "sin caché" / "sin límites".
-- Verificado el 2026-08-03: SELECT con la clave service_role devolvía 403 en las cuatro.

grant usage on schema public to service_role;

grant select, insert, update, delete on table public.article_extractions to service_role;
grant select, insert, update, delete on table public.place_thumbs to service_role;
grant select, insert, update, delete on table public.destination_covers to service_role;
grant select, insert, update, delete on table public.usage_events to service_role;
grant execute on function public.cleanup_usage_events(interval) to service_role;
