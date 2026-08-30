-- delete_own_account: las autorizaciones OAuth del usuario caen con la cuenta.
--
-- GoTrue declara `auth.oauth_consents.user_id` y
-- `auth.oauth_authorizations.user_id` con ON DELETE CASCADE hacia
-- `auth.users`. Aun así borramos esas filas *antes* del DELETE de users: el
-- invariante queda en esta función, no solo en el schema de GoTrue. No se
-- tocan `auth.oauth_clients` (son del proyecto / DCR, no del usuario).
--
-- Si el schema de Auth local aún no tiene esas tablas, `to_regclass` evita
-- que borrar la cuenta falle.

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

  if to_regclass('auth.oauth_consents') is not null then
    delete from auth.oauth_consents where user_id = caller;
  end if;
  if to_regclass('auth.oauth_authorizations') is not null then
    delete from auth.oauth_authorizations where user_id = caller;
  end if;

  delete from auth.users where id = caller;
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
