# Supabase — WanderPlanner

Proyecto: `https://kzriijgdkrdruikmpufl.supabase.co`

## Una vez creado el proyecto

1. **Auth → Providers → Anonymous Sign-Ins → Enable**  
   Sin esto, `/start` (modo invitado del CTA de blogs) falla al llamar `signInAnonymously`.

2. **Auth → URL Configuration**  
   Añade `http://localhost:3000/**` (y el dominio de producción) en Redirect URLs. Site URL: `http://localhost:3000` en local.

3. **Aplicar migraciones** — desde el **30 ago 2026, con `supabase db push`**:

```bash
supabase db push            # aplica solo lo pendiente
supabase db push --dry-run  # ver qué haría, sin tocar nada
supabase migration list     # historial local vs remoto
```

El CLI ya está vinculado (`supabase link --project-ref kzriijgdkrdruikmpufl`), existe `supabase/config.toml` y el historial remoto (`supabase_migrations.schema_migrations`) está **alineado con las 37 migraciones del repo**: `db push --dry-run` responde *«Remote database is up to date»*.

> ### ⚠️ Aplica siempre con `db push`, no por MCP ni pegando SQL en el editor
>
> Las dos vías **funcionan**, pero solo `db push` deja el historial cuadrado. Aplicar por MCP registra un timestamp propio, al segundo (`20260824101635`), que no coincide con el del fichero, redondeado (`20260824120000_trip_sharing.sql`). El SQL es el mismo, pero para el CLI son **dos migraciones distintas**.
>
> Eso ya pasó: entre el 24 y el 30 de agosto se acumularon **diez** entradas remotas sin fichero local, sin que nadie lo notara, y `db push` quedó bloqueado con *«Remote migration versions not found in local migrations directory»*. Se arregló el 30 de agosto emparejando las nueve duplicadas (todas tenían su fichero en el repo, ninguna era SQL huérfano) y renombrando la décima.
>
> Si por lo que sea vuelve a aplicarse algo fuera de `db push`, el desfase se detecta con `supabase migration list` (columna `local` vacía) y se arregla así:
>
> ```bash
> # ver qué son antes de decidir (SQL Editor):
> #   select version, name from supabase_migrations.schema_migrations where version in (...)
>
> # si el SQL ya está en un fichero del repo → borrar solo el registro duplicado:
> supabase migration repair --status reverted <versiones>
>
> # si el SQL NO existe en el repo → guardarlo como fichero CON ESA MISMA versión,
> # nunca `supabase db pull` (vuelca el esquema entero y arrasa los 37 ficheros curados)
> ```
>
> `migration repair` **no ejecuta SQL en ningún caso**: solo escribe la tabla de historial. Lo peligroso no es el comando, es marcar `applied` algo que no lo esté — entonces `db push` lo saltará para siempre y el esquema divergirá en silencio.

Para reconstruir el proyecto desde cero (entorno nuevo), `supabase db push` aplica las 37 en orden. Pegarlas a mano en el SQL Editor sigue siendo posible, pero **deja el historial sin registrar** y reproduce el problema de arriba.

`20260803180000_trip_tasks.sql` debe aplicarse **antes** de desplegar un frontend que lea `tasks` / `extra_tasks` / `num_travelers` / `currency` (si no, PostgREST 400 y `/trips` no carga). Es aditiva e idempotente: segura con el front viejo aún en producción.

`20260808000000_sources_total_days.sql` tiene la misma exigencia: `SOURCE_COLUMNS` pide `total_days` en todo `select` de `sources`, así que debe aplicarse **antes** de desplegar un frontend que ya la incluya (si no, PostgREST 400 al cargar `/trips` para cualquier usuario, no solo el flujo de partner). También aditiva e idempotente.

`20260808200000_dismissed_country_tasks.sql` + `20260808210000_country_task_suggestions.sql` (T4.4): la primera añade `trips.dismissed_country_tasks` (el front la pide en `TRIP_COLUMNS`); la segunda crea la caché service_role de destilados y amplía `usage_events.kind` con `country_tasks`. Orden: **migraciones → backend (`GET /country-tasks`) → frontend**.

**⚠️ T4B.1 origen del viaje:** `20260808220000_trip_origin.sql` añade `trips.origin` (jsonb nullable). El frontend la pide en `TRIP_COLUMNS`; si llega a producción **antes** que la migración, PostgREST responde *column does not exist* y **`/trips` deja de cargar para todos**. Orden obligatorio: **aplicar la migración en Supabase → verificar la columna → solo entonces mergear a `main`**. Aditiva e idempotente (`add column if not exists`): segura con el front viejo aún en producción.

**Login de invitado → cuenta existente:** `20260816180000_guest_trip_claim.sql` crea `guest_trip_claims` + `prepare_guest_trip_claim()` / `claim_guest_trips()`. No añade columnas a `TRIP_COLUMNS`, así que un front nuevo contra una base vieja no tumba `/trips`: el botón «Ya tengo cuenta» aborta antes de `signIn` (`PGRST202`). Aun así, **aplicar la migración antes de mergear el front**. Verificar en SQL Editor (dos sesiones):

```sql
-- Como invitado (JWT anónimo):
select public.prepare_guest_trip_claim();
-- Como cuenta registrada, con el token devuelto:
select public.claim_guest_trips('<token>');
-- Comprobar que trips / sources / assistant_conversations cambiaron de user_id.
-- Segundo canje del mismo token → {"status":"invalid"}
-- Canje desde sesión anónima → {"status":"caller_anonymous"}
```

**Miniaturas Wikimedia + tope durable de fotos:** `20260817000000_place_thumbs_wikimedia.sql` (columnas `provider`/`attribution` en `place_thumbs`) y `20260817120000_photo_paid_usage.sql` (`usage_events.kind=photo_paid`, user_id null, índice `(kind, created_at)`). La segunda **antes** de desplegar el backend que escribe `photo_paid`: si no, el INSERT choca con el check y el tope lee 0 (fail-open). También relaja `usage_events_user_id_required` para kinds sin usuario (`partner_prewarm`, `landing_source_search`, `photo_paid`).

**Borrar cuenta:** `20260817190000_delete_own_account.sql` crea `delete_own_account()`. `20260830120000_delete_own_account_oauth.sql` la reemplaza para borrar `auth.oauth_consents` y `auth.oauth_authorizations` del llamante **antes** de `auth.users` (GoTrue ya tiene CASCADE; el SQL lo deja explícito). No toca `TRIP_COLUMNS`, así que un front nuevo contra una base vieja no tumba `/trips`: el botón de borrar responde `PGRST202`. Aun así, **aplicar la migración y verificar el `delete` en SQL Editor → luego mergear el front**. Verificar:

```sql
-- FKs de GoTrue hacia auth.users (consents / authorizations deben ser ON DELETE CASCADE)
select conrelid::regclass, pg_get_constraintdef(oid)
from pg_constraint
where confrelid = 'auth.users'::regclass
  and conrelid::regclass::text like 'auth.%oauth%';

-- Con sesión anónima → debe fallar (42501)
select public.delete_own_account();
-- Con cuenta de prueba registrada → borra auth.users y, en cascada,
-- profiles / trips / sources / assistant_conversations / favorite_references.
-- oauth_consents y oauth_authorizations de ese user_id deben quedar a 0.
-- oauth_clients del proyecto NO se tocan.
-- usage_events del uuid queda huérfano (sin FK, a propósito).
-- article_extractions y el resto de cachés globales no se tocan.
select count(*) from public.trips where user_id = '<uuid>';
select count(*) from auth.oauth_consents where user_id = '<uuid>';
select count(*) from auth.oauth_authorizations where user_id = '<uuid>';
```

**`/start` sin clonar + cleanup de invitados v2:** aplicar **antes** de mergear el front, en este orden:

1. `20260818120000_trip_seed_source_key.sql` — columna `trips.seed_source_key` (no está en `TRIP_COLUMNS`; un front viejo la ignora). Verificar columna e índice. Un front nuevo contra base vieja **rompe `/start`** (PostgREST 400 al pedir la columna), no `/trips`.
2. `20260818130000_cleanup_anonymous_users_v2.sql` — `drop function` de la firma `(interval)` y función nueva `(interval, interval, integer)`. Comprobar que no hay ambigüedad: `select public.cleanup_anonymous_users(interval '999 years', interval '999 years');` debe devolver `0`. Dry-run de candidatos antes de dejar el cron activo (anónimos vacíos a 30 días, con viajes a 7 días de inactividad; no toca upgrades a medias ni claims vivos).

**Pines de Google Maps en el artículo:** `20260819120000_maps_link_pins.sql` crea `maps_link_pins` (caché global service_role de `{lng,lat}` extraídos de short links) y añade `usage_events.kind=maps_resolve`. Aplicar **antes** de desplegar el backend con `POST /maps/resolve`. No toca `TRIP_COLUMNS`: un front nuevo contra base vieja no tumba `/trips`; el resolve degrada a geocoding Mapbox. Verificar: `select count(*) from public.maps_link_pins;` como `anon` debe fallar; con service_role, 0.

**Onboarding de primer impacto (cuentas registradas):** `20260828180000_profile_onboarding_seen.sql` añade `profiles.onboarding_seen_at`. El tour autoabierto sale **una vez por cuenta**, no por navegador; «Cómo funciona» lo reabre a mano. Consulta propia en el front (no va en `loadProfile`): si la columna no existe, el perfil de viajero no rompe y el auto-show no abre. Las cuentas registradas que ya existían se marcan al aplicar, para no reabrirles el tour en incógnito. Aplicar **antes** de desplegar el front que escribe la columna si quieres que una cuenta *nueva* vea el tour una vez; con el front nuevo y sin migración, los registrados no lo ven (fail-closed). Verificar:

```sql
select count(*) filter (where onboarding_seen_at is not null) as vistos,
       count(*) filter (where onboarding_seen_at is null) as pendientes
from public.profiles;
```

4. **Project Settings → API** → copia `URL` y `anon public` a `frontend/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://….supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ…
```

5. **Backend** (`backend/.env`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (cachés `article_extractions`, `place_thumbs`, `destination_covers`, `country_task_suggestions`, `maps_link_pins`, contadores `usage_events`). En **local** sí `SUPABASE_JWT_SECRET` (`supabase start` firma HS256). En **Fly no la pongas**: el gestionado firma ES256 y [`auth.py`](../backend/auth.py) iría por HS256 → **401 en toda la API**. Producción: `REQUIRE_AUTH=true` y JWKS vía `SUPABASE_URL`. Claves de imágenes solo en backend: `GOOGLE_PLACES_API_KEY`, `UNSPLASH_ACCESS_KEY`.

## Opcional

- **Bot protection / Turnstile** en Auth Settings si rellenas `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
- **pg_cron**: las migraciones de cleanup intentan programar `cleanup_anonymous_users()` (04:00 UTC), `cleanup_usage_events()` (04:15 UTC), `cleanup_guest_trip_claims()` (04:20 UTC) y `cleanup_funnel_events()` (04:30 UTC). Si la extensión no está disponible, invócalas a mano. En producción (comprobado 18 ago 2026) las tres primeras corren; la del embudo entra con su migración.
