-- Resumen cacheado de «Compartir» (texto generado, firma del plan).
-- jsonb nullable camelCase: { text, signature, generatedAt }.
-- Null = nunca generado / viajes anteriores. Derivado: regenerable.
-- Los grant de tabla cubren la columna nueva.

alter table public.trips
  add column if not exists share_card jsonb;
