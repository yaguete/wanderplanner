-- `sources_update_access` WITH CHECK leía `public.sources` otra vez. Postgres
-- trata eso como política recursiva → 500 «infinite recursion detected in
-- policy for relation "sources"» en cada PATCH/UPSERT. El persist del viaje
-- (dueño o miembro) reventaba y salía el toast de reintento.
-- Congelar `user_id` en un trigger; el WITH CHECK no toca la misma tabla.

create or replace function public.protect_source_owner_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.user_id := old.user_id;
  return new;
end;
$$;

drop trigger if exists sources_protect_owner_fields on public.sources;
create trigger sources_protect_owner_fields
  before update on public.sources
  for each row
  execute function public.protect_source_owner_fields();

drop policy if exists "sources_update_access" on public.sources;
create policy "sources_update_access" on public.sources
  for update
  using (
    user_id = (select auth.uid())
    or public.user_can_access_source(id)
  )
  with check (
    user_id = (select auth.uid())
    or public.user_can_access_source(id)
  );
