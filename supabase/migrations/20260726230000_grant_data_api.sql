-- Con "Automatically expose new tables" desactivado en el proyecto, hay que conceder
-- privilegios a mano a los roles de la Data API. RLS sigue filtrando por auth.uid().

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.favorite_references to authenticated;
grant select, insert, update, delete on table public.trips to authenticated;
grant select, insert, update, delete on table public.sources to authenticated;
grant select, insert, update, delete on table public.assistant_conversations to authenticated;

-- Las sesiones anónimas usan el rol `authenticated` con JWT is_anonymous=true;
-- no hace falta conceder nada extra a `anon` sobre las tablas de usuario.
-- article_extractions: solo service_role (ya revocado en la migración inicial).
