-- Un UPDATE que no cambia nada observable (el persist reescribe el mismo
-- documento porque Realtime clonó el objeto) no debe incrementar `version`.
-- Si bumpa, el cliente ve un cambio remoto, clona otra vez, vuelve a persistir
-- y acaba en OCC / toast de «no hemos podido guardar».

create or replace function public.bump_trip_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'version' - 'updated_at')
     is not distinct from (to_jsonb(old) - 'version' - 'updated_at')
  then
    return new;
  end if;
  -- touch_trip_shared_at solo pinta shared_at. Si bumpamos, el dueño entra en OCC.
  if new.shared_at is distinct from old.shared_at
     and new.version is not distinct from old.version
  then
    return new;
  end if;
  new.version := old.version + 1;
  return new;
end;
$$;
