-- WanderPlanner — esquema inicial (modelo documento)
--
-- `trips` y `sources` son filas-documento: su interior (`days`, `basics`, `items`) va en
-- columnas jsonb con el mismo camelCase que `frontend/types/itinerary.ts`, sin capa de mapeo.
-- Solo las columnas planas se traducen snake_case ↔ camelCase en `frontend/lib/db/trips-repo.ts`.
--
-- Los ids de `trips`, `sources` y `assistant_conversations` los genera el cliente con
-- `crypto.randomUUID()` para conservar la navegación optimista; no hay default en la columna.

create extension if not exists pgcrypto;

-- ── Utilidades ────────────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── profiles ──────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  -- urbano, familia, playa, montaña, deporte, relax… (valores libres definidos en el front)
  traveler_types text[] not null default '{}',
  traveler_notes text,
  -- slug del partner cuyo CTA trajo al usuario (fase 5)
  signup_referrer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Crea el perfil al registrarse (incluidas las sesiones anónimas del modo invitado).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, signup_referrer)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'signup_referrer', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── favorite_references ───────────────────────────────────────────────────────
-- Blogueros, revistas o webs de referencia del usuario. `domain` se usa como
-- `include_domains` de Tavily para priorizar sus fuentes en la búsqueda del asistente.

create table if not exists public.favorite_references (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null,
  url text,
  domain text,
  created_at timestamptz not null default now()
);

create index if not exists favorite_references_user_id_idx
  on public.favorite_references (user_id);

-- ── trips ─────────────────────────────────────────────────────────────────────

create table if not exists public.trips (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '',
  -- ISO 3166-1 alpha-2
  countries text[] not null default '{}',
  start_date date,
  end_date date,
  num_days integer,
  expectations text,
  cover text not null default '✈️',
  cover_url text,
  archived boolean not null default false,
  referrer text,
  -- Orden importa: la posición 0 define la portada del viaje.
  source_ids uuid[] not null default '{}',
  -- UserDay[] y UserBasicItem[] tal cual los define types/itinerary.ts
  days jsonb not null default '[]'::jsonb,
  basics jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trips_user_id_idx on public.trips (user_id);

create trigger trips_set_updated_at
  before update on public.trips
  for each row execute function public.set_updated_at();

-- ── sources ───────────────────────────────────────────────────────────────────
-- `article_html` se excluye de la carga inicial y se pide bajo demanda al abrir la Crónica.

create table if not exists public.sources (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  url text not null,
  author text not null default '',
  title text not null default '',
  area text,
  og_image text,
  -- SourceItem[] y SourceBasicItem[]
  items jsonb not null default '[]'::jsonb,
  basics jsonb not null default '[]'::jsonb,
  article_html text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sources_user_id_idx on public.sources (user_id);

create trigger sources_set_updated_at
  before update on public.sources
  for each row execute function public.set_updated_at();

-- ── assistant_conversations ───────────────────────────────────────────────────
-- Fila por conversación; `messages` es el espejo del array de assistant-persistence.ts
-- (incluidas las `actions` propuestas). Se borra en cascada al eliminar el viaje.

create table if not exists public.assistant_conversations (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  title text not null default 'Nueva conversación',
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assistant_conversations_trip_idx
  on public.assistant_conversations (trip_id, updated_at desc);

create trigger assistant_conversations_set_updated_at
  before update on public.assistant_conversations
  for each row execute function public.set_updated_at();

-- ── article_extractions ───────────────────────────────────────────────────────
-- Caché global por URL de la respuesta de Claude: evita repagar la extracción del mismo
-- artículo entre usuarios y hace instantáneo el CTA del blog. Solo `service_role` (FastAPI).

create table if not exists public.article_extractions (
  url text primary key,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.favorite_references enable row level security;
alter table public.trips enable row level security;
alter table public.sources enable row level security;
alter table public.assistant_conversations enable row level security;
alter table public.article_extractions enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "favorite_references_select_own" on public.favorite_references
  for select using (auth.uid() = user_id);
create policy "favorite_references_insert_own" on public.favorite_references
  for insert with check (auth.uid() = user_id);
create policy "favorite_references_update_own" on public.favorite_references
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "favorite_references_delete_own" on public.favorite_references
  for delete using (auth.uid() = user_id);

create policy "trips_select_own" on public.trips
  for select using (auth.uid() = user_id);
create policy "trips_insert_own" on public.trips
  for insert with check (auth.uid() = user_id);
create policy "trips_update_own" on public.trips
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "trips_delete_own" on public.trips
  for delete using (auth.uid() = user_id);

create policy "sources_select_own" on public.sources
  for select using (auth.uid() = user_id);
create policy "sources_insert_own" on public.sources
  for insert with check (auth.uid() = user_id);
create policy "sources_update_own" on public.sources
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sources_delete_own" on public.sources
  for delete using (auth.uid() = user_id);

create policy "assistant_conversations_select_own" on public.assistant_conversations
  for select using (auth.uid() = user_id);
create policy "assistant_conversations_insert_own" on public.assistant_conversations
  for insert with check (auth.uid() = user_id);
create policy "assistant_conversations_update_own" on public.assistant_conversations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "assistant_conversations_delete_own" on public.assistant_conversations
  for delete using (auth.uid() = user_id);

-- article_extractions: sin políticas → inaccesible con anon/authenticated.
revoke all on public.article_extractions from anon, authenticated;

-- Data API: con "Automatically expose new tables" OFF hay que conceder a mano.
-- (También en 20260726230000_grant_data_api.sql por si esta migración ya se aplicó.)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.favorite_references to authenticated;
grant select, insert, update, delete on table public.trips to authenticated;
grant select, insert, update, delete on table public.sources to authenticated;
grant select, insert, update, delete on table public.assistant_conversations to authenticated;

-- Data API: con "Automatically expose new tables" OFF hay que conceder a mano.
-- (También en 20260726230000_grant_data_api.sql por si esta migración ya se aplicó.)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.favorite_references to authenticated;
grant select, insert, update, delete on table public.trips to authenticated;
grant select, insert, update, delete on table public.sources to authenticated;
grant select, insert, update, delete on table public.assistant_conversations to authenticated;
