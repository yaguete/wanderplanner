-- El trigger de email corría como `authenticated` y `_normalize_email` está
-- revocada (no es RPC). Sin SECURITY DEFINER el INSERT devolvía 42501.
-- Además, pintar `shared_at` no debe bump de `version` (OCC del dueño).

create or replace function public.normalize_trip_invite_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.email := public._normalize_email(new.email);
  if new.email is null or position('@' in new.email) < 2 then
    raise exception 'invalid invite email' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.normalize_trip_invite_email() from public, anon, authenticated;

create or replace function public.bump_trip_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.shared_at is distinct from old.shared_at
     and new.version is not distinct from old.version
  then
    return new;
  end if;
  new.version := old.version + 1;
  return new;
end;
$$;
