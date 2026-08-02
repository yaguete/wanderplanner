-- Metadatos de validación para stale-while-revalidate de article_extractions.
-- La PK sigue siendo `url` (filas existentes); `canonical_url` es alias de lookup.
-- También amplía usage_events: refresh rate-limit + revalidación de sistema (user_id nullable).

-- ── article_extractions: columnas de frescura ───────────────────────────────────

alter table public.article_extractions
  add column if not exists canonical_url text,
  add column if not exists etag text,
  add column if not exists last_modified text,
  add column if not exists article_modified_at timestamptz,
  add column if not exists content_hash text,
  add column if not exists content_version integer,
  add column if not exists validated_at timestamptz;

-- Normalización mínima en SQL (el backend Python es la fuente de verdad).
-- Quita fragmento, tracking params conocidos, barra final y lowercasing del host.
create or replace function public.normalize_article_url(raw text)
returns text
language plpgsql
immutable
as $$
declare
  u text;
  scheme text;
  rest text;
  hostpath text;
  query text := '';
  path text;
  host text;
  parts text[];
  kept text[] := '{}';
  p text;
  key text;
begin
  if raw is null or btrim(raw) = '' then
    return null;
  end if;
  u := split_part(raw, '#', 1);
  if position('://' in u) = 0 then
    return lower(rtrim(u, '/'));
  end if;
  scheme := lower(split_part(u, '://', 1));
  rest := substring(u from length(scheme) + 4);
  if position('?' in rest) > 0 then
    hostpath := split_part(rest, '?', 1);
    query := split_part(rest, '?', 2);
  else
    hostpath := rest;
  end if;
  host := lower(split_part(hostpath, '/', 1));
  path := substring(hostpath from length(split_part(hostpath, '/', 1)) + 1);
  if path = '/' then
    path := '';
  else
    path := rtrim(path, '/');
  end if;
  if query <> '' then
    parts := string_to_array(query, '&');
    foreach p in array parts loop
      key := lower(split_part(p, '=', 1));
      if key not in (
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'utm_id', 'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref'
      ) and p <> '' then
        kept := array_append(kept, p);
      end if;
    end loop;
    if array_length(kept, 1) is not null then
      return scheme || '://' || host || path || '?' || array_to_string(kept, '&');
    end if;
  end if;
  return scheme || '://' || host || path;
end;
$$;

update public.article_extractions
set
  validated_at = coalesce(validated_at, fetched_at, now()),
  canonical_url = coalesce(canonical_url, public.normalize_article_url(url))
where validated_at is null or canonical_url is null;

create index if not exists article_extractions_canonical_url_idx
  on public.article_extractions (canonical_url);

-- ── usage_events: refresh + system_revalidation ───────────────────────────────

alter table public.usage_events
  alter column user_id drop not null;

alter table public.usage_events
  drop constraint if exists usage_events_kind_check;

alter table public.usage_events
  add constraint usage_events_kind_check
  check (kind in (
    'extraction',
    'assistant_message',
    'photo_lookup',
    'refresh',
    'system_revalidation'
  ));

-- system_revalidation no tiene user_id; el resto sí.
alter table public.usage_events
  drop constraint if exists usage_events_user_id_required;

alter table public.usage_events
  add constraint usage_events_user_id_required
  check (
    (kind = 'system_revalidation' and user_id is null)
    or (kind <> 'system_revalidation' and user_id is not null)
  );
