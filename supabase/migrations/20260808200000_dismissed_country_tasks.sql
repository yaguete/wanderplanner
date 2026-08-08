-- Trámites de país descartados por el usuario (T4.4).
-- jsonb: string[] de ids estables `country:{iso}:{slug}` de GET /country-tasks.
-- Separado de `tasks`: ese mapa es solo estado de ítems/básicos por clave derivada.

alter table public.trips
  add column if not exists dismissed_country_tasks jsonb not null default '[]'::jsonb;
