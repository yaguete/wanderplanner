-- Fechas que puso la app y no el usuario: la adopción del calendario de la guía
-- (primera fuente de un viaje de partner) y `/start?days=N` fijan inicio = mañana.
-- El asistente las trata como «sin fechas» hasta que el usuario las cambia.
-- Los grant de tabla cubren la columna nueva.

alter table public.trips
  add column if not exists dates_provisional boolean not null default false;

-- Borradores de partner que siguen con el «mañana» del día en que se crearon.
update public.trips
set dates_provisional = true
where referrer is not null
  and start_date is not null
  and start_date = (created_at at time zone 'Europe/Madrid')::date + 1
  and not dates_provisional;
