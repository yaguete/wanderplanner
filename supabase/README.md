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

# Opción B (si tienes Supabase CLI vinculado):
supabase db push
```

`20260803180000_trip_tasks.sql` debe aplicarse **antes** de desplegar un frontend que lea `tasks` / `extra_tasks` / `num_travelers` / `currency` (si no, PostgREST 400 y `/trips` no carga). Es aditiva e idempotente: segura con el front viejo aún en producción.

`20260808000000_sources_total_days.sql` tiene la misma exigencia: `SOURCE_COLUMNS` pide `total_days` en todo `select` de `sources`, así que debe aplicarse **antes** de desplegar un frontend que ya la incluya (si no, PostgREST 400 al cargar `/trips` para cualquier usuario, no solo el flujo de partner). También aditiva e idempotente.

4. **Project Settings → API** → copia `URL` y `anon public` a `frontend/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://….supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ…
```

5. **Backend** (`backend/.env`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (cachés `article_extractions`, `place_thumbs`, `destination_covers`, contadores `usage_events`) y, en producción, `REQUIRE_AUTH=true` + `SUPABASE_JWT_SECRET` (JWT Secret en Settings → API) o confiar en el JWKS del proyecto. Claves de imágenes solo en backend: `GOOGLE_PLACES_API_KEY`, `UNSPLASH_ACCESS_KEY`.

## Opcional

- **Bot protection / Turnstile** en Auth Settings si rellenas `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
- **pg_cron**: las migraciones de cleanup intentan programar `cleanup_anonymous_users()` (04:00 UTC) y `cleanup_usage_events()` (04:15 UTC). Si la extensión no está disponible, invócalas a mano. **Producción (T7.3):** programar ambas junto al backup semanal.
