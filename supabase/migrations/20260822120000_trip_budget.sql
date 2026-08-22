-- Techo opcional del viaje (vista de presupuesto).
-- jsonb nullable: { total, byCategory } en camelCase (contrato de itinerary.ts).
-- Null = no configurado / viajes anteriores. No es un coste: el dinero sigue
-- en `tasks`. Los grant de tabla cubren la columna nueva.

alter table public.trips
  add column if not exists budget jsonb;
