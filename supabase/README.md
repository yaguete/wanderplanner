# Supabase — WanderPlanner

Proyecto: `https://kzriijgdkrdruikmpufl.supabase.co`

## Una vez creado el proyecto

1. **Auth → Providers → Anonymous Sign-Ins → Enable**  
   Sin esto, `/start` (modo invitado del CTA de blogs) falla al llamar `signInAnonymously`.

2. **Auth → URL Configuration**  
   Añade `http://localhost:3000/**` (y el dominio de producción) en Redirect URLs. Site URL: `http://localhost:3000` en local.

3. **Aplicar migraciones** (SQL Editor → New query, o CLI):

```bash
# Opción A: pegar en orden el contenido de
#   migrations/20260726220000_init_wanderplanner.sql
#   migrations/20260726223000_cleanup_anonymous_users.sql
#   migrations/20260726230000_grant_data_api.sql
#   migrations/20260728000000_place_thumbs_and_covers.sql
#   migrations/20260728120000_usage_events.sql
#   migrations/20260803000000_grant_service_role_backend_tables.sql
#   migrations/20260803120000_article_extractions_validation.sql
#   migrations/20260803180000_trip_tasks.sql
#   migrations/20260804010000_day_summary_usage.sql
#   migrations/20260808000000_sources_total_days.sql
#   migrations/20260808190000_partner_prewarm_usage.sql
#   migrations/20260808200000_dismissed_country_tasks.sql
#   migrations/20260808210000_country_task_suggestions.sql
#   migrations/20260808220000_trip_origin.sql
#   migrations/20260816120000_ai_transfer_consent.sql
#   migrations/20260816180000_guest_trip_claim.sql
#   migrations/20260817000000_place_thumbs_wikimedia.sql
#   migrations/20260817120000_photo_paid_usage.sql
#   migrations/20260817190000_delete_own_account.sql

# Opción B: NO disponible hoy. `supabase db push` no funciona en este proyecto:
# no hay supabase/config.toml, el CLI no está vinculado y el remoto no tiene
# historial (`supabase_migrations.schema_migrations` vacío, porque todo se ha
# aplicado a mano). Si se ejecutara, intentaría replicar TODAS las migraciones
# desde el init, y ese fichero tiene 24 `create policy` / `create trigger` sin
# `if exists`: falla en el primero y no aplica nada.
#
# Para habilitarlo algún día, una sola vez (pide la contraseña de Postgres):
#   supabase init
#   supabase link --project-ref kzriijgdkrdruikmpufl
#   supabase migration repair --status applied <las 15 versiones ya aplicadas>
# A partir de ahí `supabase db push` sí aplica solo lo pendiente.
```

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

**Borrar cuenta:** `20260817190000_delete_own_account.sql` crea `delete_own_account()`. No toca `TRIP_COLUMNS`, así que un front nuevo contra una base vieja no tumba `/trips`: el botón de borrar responde `PGRST202`. Aun así, **aplicar la migración y verificar el `delete` en SQL Editor → luego mergear el front**. Verificar:

```sql
-- Con sesión anónima → debe fallar (42501)
select public.delete_own_account();
-- Con cuenta de prueba registrada → borra auth.users y, en cascada,
-- profiles / trips / sources / assistant_conversations / favorite_references.
-- usage_events del uuid queda huérfano (sin FK, a propósito).
-- article_extractions y el resto de cachés globales no se tocan.
select count(*) from public.trips where user_id = '<uuid>';
```

4. **Project Settings → API** → copia `URL` y `anon public` a `frontend/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://….supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ…
```

5. **Backend** (`backend/.env`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (cachés `article_extractions`, `place_thumbs`, `destination_covers`, `country_task_suggestions`, contadores `usage_events`) y, en producción, `REQUIRE_AUTH=true` + `SUPABASE_JWT_SECRET` (JWT Secret en Settings → API) o confiar en el JWKS del proyecto. Claves de imágenes solo en backend: `GOOGLE_PLACES_API_KEY`, `UNSPLASH_ACCESS_KEY`.

## Opcional

- **Bot protection / Turnstile** en Auth Settings si rellenas `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
- **pg_cron**: las migraciones de cleanup intentan programar `cleanup_anonymous_users()` (04:00 UTC), `cleanup_usage_events()` (04:15 UTC) y `cleanup_guest_trip_claims()` (04:20 UTC). Si la extensión no está disponible, invócalas a mano. **Producción (T7.3):** programar las tres junto al backup semanal.
