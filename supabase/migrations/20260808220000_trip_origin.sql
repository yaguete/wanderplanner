-- Punto de partida del viajero (T4B.1).
-- jsonb nullable: { label, countryCode, coords: { lng, lat } } en camelCase
-- (mismo contrato que UserDayItem.coords). Null = no configurado / viajes legacy.

alter table public.trips
  add column if not exists origin jsonb;
