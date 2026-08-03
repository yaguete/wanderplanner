-- Tareas de reserva/gestión por viaje: estado + coste indexado por id de ítem,
-- sin duplicar UserDayItem / UserBasicItem. Divisa y viajeros son del viaje.
-- `tasks` jsonb: Record<itemId, TripTaskState> (camelCase, contrato de itinerary.ts).
-- `extra_tasks` jsonb: ExtraTask[] con state anidado (tareas manuales).
-- `num_travelers` lo usará T4.3 (coste por persona); `currency` default EUR.

alter table public.trips
  add column if not exists tasks jsonb not null default '{}'::jsonb,
  add column if not exists extra_tasks jsonb not null default '[]'::jsonb,
  add column if not exists num_travelers integer,
  add column if not exists currency text not null default 'EUR';
