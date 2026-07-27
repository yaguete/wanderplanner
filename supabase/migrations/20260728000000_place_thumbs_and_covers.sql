-- Caché global de miniaturas Places (photo_name + URI efímera) y portadas Unsplash.
-- Solo service_role vía FastAPI; sin políticas RLS → inaccesible desde el navegador.

-- ── place_thumbs ─────────────────────────────────────────────────────────────
-- PK = consulta normalizada (minúsculas, espacios colapsados).
-- photo_name: recurso duradero places/…/photos/…; photo_uri: short-lived (~45 min).

create table if not exists public.place_thumbs (
  query text primary key,
  photo_name text null,
  photo_uri text null,
  photo_uri_expires_at timestamptz null,
  miss boolean not null default false,
  resolved_at timestamptz not null default now()
);

alter table public.place_thumbs enable row level security;
revoke all on public.place_thumbs from anon, authenticated;

-- ── destination_covers ───────────────────────────────────────────────────────
-- Portadas Unsplash por zona; photo_url estable. attribution + download_location para ToS.

create table if not exists public.destination_covers (
  query text primary key,
  photo_url text null,
  author_name text null,
  author_url text null,
  download_location text null,
  miss boolean not null default false,
  resolved_at timestamptz not null default now()
);

alter table public.destination_covers enable row level security;
revoke all on public.destination_covers from anon, authenticated;
