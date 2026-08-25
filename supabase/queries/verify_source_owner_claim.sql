-- Comprobación manual (SQL Editor, dos cuentas) tras 20260824170000:
-- 1. Invitado con viaje + fuente → login a cuenta existente con traspaso
--    → sources.user_id = caller.
-- 2. Editor PATCH sources.user_id → la columna no cambia.
-- 3. La reparación no toca sources de un sandbox anónimo vivo
--    (dueño del viaje también anónimo).

select s.id, s.user_id as source_owner, t.id as trip_id, t.user_id as trip_owner
  from public.sources s
  join public.trips t on t.source_ids @> array[s.id]
 where s.user_id is distinct from t.user_id;
