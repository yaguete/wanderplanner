-- Autoborrado de cuenta desde Configuración.
--
-- El cliente no puede borrar `auth.users` con la anon key. Esta función
-- `security definer` es el único camino: exige sesión no anónima y borra la
-- fila de GoTrue. El resto (profiles, favorite_references, trips, sources,
-- assistant_conversations, guest_trip_claims) cae por ON DELETE CASCADE.
--
-- No se toca `usage_events` (sin FK a propósito: trazabilidad de gasto;
-- el UUID huérfano no identifica a nadie cuando la cuenta ya no existe).
-- Tampoco las cachés globales (`article_extractions`, `place_thumbs`,
-- `destination_covers`, `country_task_suggestions`): no tienen user_id.
--
-- Anonimidad: `auth.users.is_anonymous`, no el JWT (puede estar cacheado).
-- `search_path = ''` y todo cualificado: linter `function_search_path_mutable`.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  is_anon boolean;
begin
  if caller is null then
    raise exception 'auth required' using errcode = '28000';
  end if;

  select u.is_anonymous into is_anon from auth.users u where u.id = caller;
  if coalesce(is_anon, false) then
    raise exception 'anonymous sessions cannot delete their account' using errcode = '42501';
  end if;

  delete from auth.users where id = caller;
end;
$$;

-- Postgres concede EXECUTE a PUBLIC en toda función nueva; hay que revocarlo.
-- Un invitado anónimo también tiene el rol `authenticated`; lo que separa los
-- dos casos es `is_anonymous`, no el grant.
revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
