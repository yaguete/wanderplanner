-- Claim de viajes de invitado → cuenta existente.
--
-- Un invitado que hace `signIn` a una cuenta ya registrada cambia de `user_id`.
-- RLS (`USING` + `WITH CHECK` = `auth.uid() = user_id`) impide reasignar filas
-- desde el cliente. Estas funciones `security definer` son el único camino.
--
-- `public.trips` / `sources` / `assistant_conversations` las posee `postgres` y
-- NO están en `force row level security`. Si algún día se añade
-- `alter table … force row level security`, estas funciones dejan de funcionar
-- en silencio: hay que revisarlas antes.
--
-- Decisiones (no «arreglar» a la ligera):
--   - `profiles` y `favorite_references` NO se mueven. La cuenta destino ya
--     tiene las suyas. Única excepción: `signup_referrer`, atribución del kit
--     `/partners`, y solo si el destino aún no tenía.
--   - `ai_transfer_consent_at` / `_version` tampoco: el consentimiento del
--     art. 49.1.a se prestó en otra identidad.
--   - `usage_events` se queda con el anónimo. Los límites de invitado no viajan.
--   - `trips.created_at` no se toca, así el viaje reclamado se ordena por su
--     fecha real. El RPC devuelve `trip_ids` por si la UI quiere un toast.

create table if not exists public.guest_trip_claims (
  token_hash    text primary key,
  guest_user_id uuid not null references auth.users (id) on delete cascade,
  claimed_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  consumed_at   timestamptz
);

create index if not exists guest_trip_claims_guest_idx
  on public.guest_trip_claims (guest_user_id);
create index if not exists guest_trip_claims_expires_idx
  on public.guest_trip_claims (expires_at);

alter table public.guest_trip_claims enable row level security;
revoke all on table public.guest_trip_claims from anon, authenticated;

-- `search_path = ''` y todo cualificado: linter `function_search_path_mutable`.
-- Token: dos `gen_random_uuid()` concatenados (core PG13+, `pg_catalog`).
-- Hash: `sha256()` core (PG11+), no `digest()` de pgcrypto (esquema `extensions`).
-- Anonimidad: `auth.users.is_anonymous`, no el JWT (puede estar cacheado).

create or replace function public.prepare_guest_trip_claim()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  is_anon boolean;
  token text;
begin
  if caller is null then
    raise exception 'auth required' using errcode = '28000';
  end if;

  select u.is_anonymous into is_anon from auth.users u where u.id = caller;
  if not coalesce(is_anon, false) then
    raise exception 'only anonymous sessions can prepare a claim' using errcode = '42501';
  end if;

  delete from public.guest_trip_claims
   where guest_user_id = caller and consumed_at is null;

  token := replace(gen_random_uuid()::text, '-', '')
        || replace(gen_random_uuid()::text, '-', '');

  insert into public.guest_trip_claims (token_hash, guest_user_id, expires_at)
  values (
    encode(sha256(convert_to(token, 'utf8')), 'hex'),
    caller,
    now() + interval '30 minutes'
  );

  return token;
end;
$$;

create or replace function public.claim_guest_trips(token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_anon boolean;
  guest uuid;
  guest_anon boolean;
  moved uuid[];
begin
  if caller is null then
    raise exception 'auth required' using errcode = '28000';
  end if;

  if token is null or length(btrim(token)) = 0 then
    return jsonb_build_object('status', 'invalid');
  end if;

  select u.is_anonymous into caller_anon from auth.users u where u.id = caller;
  if coalesce(caller_anon, true) then
    return jsonb_build_object('status', 'caller_anonymous');
  end if;

  -- Compare-and-swap: consumir y leer el dueño en una sola sentencia.
  update public.guest_trip_claims c
     set consumed_at = now(), claimed_by = caller
   where c.token_hash = encode(sha256(convert_to(token, 'utf8')), 'hex')
     and c.consumed_at is null
     and c.expires_at > now()
  returning c.guest_user_id into guest;

  if guest is null then return jsonb_build_object('status', 'invalid'); end if;
  if guest = caller then return jsonb_build_object('status', 'noop');  end if;

  select u.is_anonymous into guest_anon from auth.users u where u.id = guest;
  if not coalesce(guest_anon, false) then
    -- El invitado se registró por su cuenta entre medias: no le quitamos nada.
    return jsonb_build_object('status', 'guest_upgraded');
  end if;

  with moved_trips as (
    update public.trips set user_id = caller where user_id = guest returning id
  )
  select coalesce(array_agg(id), '{}') into moved from moved_trips;

  update public.sources                 set user_id = caller where user_id = guest;
  update public.assistant_conversations set user_id = caller where user_id = guest;

  update public.profiles dest
     set signup_referrer = src.signup_referrer
    from public.profiles src
   where dest.id = caller and src.id = guest
     and dest.signup_referrer is null and src.signup_referrer is not null;

  return jsonb_build_object('status', 'claimed', 'trip_ids', to_jsonb(moved));
end;
$$;

-- Postgres concede EXECUTE a PUBLIC en toda función nueva; hay que revocarlo.
-- Un invitado anónimo también tiene el rol `authenticated`; lo que separa los
-- dos casos es `is_anonymous`, no el grant.
revoke all on function public.prepare_guest_trip_claim() from public, anon;
revoke all on function public.claim_guest_trips(text)      from public, anon;
grant execute on function public.prepare_guest_trip_claim() to authenticated;
grant execute on function public.claim_guest_trips(text)    to authenticated;

create or replace function public.cleanup_guest_trip_claims()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted integer;
begin
  with stale as (
    delete from public.guest_trip_claims c
     where c.expires_at < now() - interval '1 day'
    returning 1
  )
  select count(*) into deleted from stale;
  return deleted;
end;
$$;

revoke all on function public.cleanup_guest_trip_claims() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'cleanup-guest-trip-claims',
    '20 4 * * *',
    $cron$select public.cleanup_guest_trip_claims();$cron$
  );
exception
  when others then
    raise notice 'pg_cron no disponible: programa cleanup_guest_trip_claims() manualmente';
end;
$$;
