-- Miniaturas Wikimedia Commons: provider + atribución; URI sin caducidad.
-- Las filas miss se purgan para que Commons las reintente (TTL 30 días las
-- habría dejado ciegas). Las fotos de Places ya pagadas se dejan.

alter table public.place_thumbs
  add column if not exists provider text null,
  add column if not exists attribution jsonb null;

alter table public.place_thumbs
  drop constraint if exists place_thumbs_provider_check;

alter table public.place_thumbs
  add constraint place_thumbs_provider_check
  check (provider is null or provider in ('wikimedia', 'places'));

delete from public.place_thumbs where miss = true;
