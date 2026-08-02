# WanderPlanner — Contexto del proyecto

## Qué es

WanderPlanner es una app web cuyo frontend carga y combina un viaje (`Trip`) y fuentes de inspiración por URL (`Source`), persistidos en **Supabase** (Postgres + Auth + RLS) con modelo documento (`jsonb`). Un backend Python expone `POST /itinerary` (extrae un artículo con Claude → JSON estructurado, SSE con heartbeats, caché global por URL en `article_extractions`; **sin** resolver miniaturas), `GET /thumb` (Places + caché `place_thumbs`), `GET /cover` (Unsplash + caché `destination_covers`) y `POST /assistant/chat` (asistente con DeepSeek + tools, SSE); todos pueden verificar el JWT de Supabase. El front muestra esas fuentes, deja consolidar ítems en días, conserva afiliación (`affiliateUrl` / `affiliate_url`) y ofrece un asistente con varias conversaciones por viaje que conoce el perfil del viajero (tipo de viaje + blogs favoritos).

## Stack

**Frontend (confirmado en `frontend/package.json`):** Next.js `15.2.6`, React `^19`, TypeScript, Tailwind, Radix UI, `mapbox-gl`, `lucide-react`, `react-markdown`, `@supabase/supabase-js` + `@supabase/ssr`. Fuente UI: **Inter** (`next/font` en [`app/layout.tsx`](frontend/app/layout.tsx)).

**Backend:** FastAPI, CORS vía `ALLOWED_ORIGINS` (default localhost:3000/3001), `httpx`, `anthropic`, `openai` (DeepSeek), `python-jose` (JWT Supabase), `bs4`/`lxml`, `python-dotenv`. Tavily en [`backend/web_search.py`](backend/web_search.py). Fichas país MAE en [`backend/country_briefs.py`](backend/country_briefs.py).

**Hosting:** frontend en **Vercel** (Root Directory = `frontend`, dominio `wanderplanner.ai`); backend en **Fly.io** (app `wanderplanner-api`, región `ams`, [`backend/fly.toml`](backend/fly.toml) + [`backend/Dockerfile`](backend/Dockerfile), API `api.wanderplanner.ai`); Postgres + Auth en **Supabase** gestionado ([`supabase/README.md`](supabase/README.md)). Procedimiento, env y rollback: [`DEPLOY.md`](DEPLOY.md).

**Modelos de IA:**
- Itinerario: `claude-haiku-4-5-20251001`, clave `ANTHROPIC_API_KEY`.
- Asistente: DeepSeek (`DEEPSEEK_API_KEY`); prompt en [`backend/agents/travel_assistant.md`](backend/agents/travel_assistant.md).

## Estructura de carpetas

```
/                          # Raíz: monorepo frontend + backend + supabase
  DESIGN.md
  CLAUDE.md
  DEPLOY.md                # Vercel + Fly.io + Supabase: env, deploy, rollback
  scripts/
    smoke.sh               # Smoke de la API (auth 401 + CORS)
  supabase/
    migrations/            # SQL: esquema documento + RLS + grants + cleanup anónimos
    README.md              # Activar Anonymous Sign-Ins, aplicar migraciones, env
  backend/
    main.py                # FastAPI: /itinerary (SSE) + CORS
    place_thumbs.py        # GET /thumb (Places; caché place_thumbs)
    covers.py              # GET /cover (Unsplash; caché destination_covers)
    photo_lookup.py        # normalización, single-flight, tope diario
    assistant.py           # POST /assistant/chat (SSE)
    auth.py                # JWT Supabase (HS256 o JWKS)
    extraction_cache.py    # article_extractions vía service_role
    web_search.py          # Tavily (+ include_domains de blogs favoritos)
    Dockerfile
    agents/
  frontend/
    app/                   # App Router: /, /login, /signup, /account, /start, /trips…
    middleware.ts          # Sesión Supabase; protege /trips y /account
    components/            # UI + auth/ (RegistrationGate, Turnstile…)
    lib/
      auth-context.tsx     # AuthProvider / useAuth (incl. invitados anónimos)
      trip-context.tsx     # Mutaciones síncronas; sync vía trips-repo
      thumbs.ts            # GET /thumb (lazy; memoria + sessionStorage)
      unsplash.ts          # portadas vía GET /cover (sin clave en el navegador)
      db/                  # trips-repo, assistant-repo, profile-repo
      supabase/            # client, server, middleware helpers
    hooks/
```

## Rutas App Router y shell

- **`/`** — Landing placeholder ([`app/page.tsx`](frontend/app/page.tsx)): CTAs Entrar / Crear cuenta.
- **`/login`**, **`/signup`**, **`/auth/callback`**, **`/account`** — Auth y perfil de viajero (tipos + referencias favoritas).
- **`/start?source=&ref=`** — CTA de blogs amigos: sesión anónima + viaje borrador + fuente precargada.
- **Layout raíz** — Inter, `AuthProvider`, Analytics. **Sin** `TripProvider`.
- **Segmento `trips`** — [`app/trips/layout.tsx`](frontend/app/trips/layout.tsx): `TripProvider` → `RegistrationGateProvider` → shell (header, sidebar, main). Único sitio de `useTrips()`.
- **`/trips`** — Listado Activos/Archivados; empty/loading con spinner mientras `isLoading`.
- **`/trips/[tripId]`** — Fuentes + panel «Mi viaje» (desktop: lateral plegable; móvil: overlay) / Asistente. Móvil: FABs; desktop: breadcrumb.

## Auth e invitados

- Sesión vía Supabase Auth. Middleware exige sesión (registrada **o anónima**) en `/trips` y `/account`.
- **Invitado:** `signInAnonymously` (hay que activar Anonymous Sign-Ins en el dashboard). Mismo `user_id` que al registrarse.
- **`RegistrationGate`:** con `user.is_anonymous`, bloquea segunda fuente / nuevo viaje / ir a inicio. Registro con `updateUser` (email+password) o enlace por email (`linkGuestEmail` → `updateUser({ email })`). **No** usar `signInWithOtp` en invitados (crearía otro usuario).
- Perfil: `profiles` + `favorite_references`; se inyecta en el briefing del asistente y en `preferred_domains` de Tavily.

## Persistencia (modelo documento)

- Tablas `trips` / `sources`: columnas planas + `days`/`basics`/`items` en **jsonb camelCase** (contrato de [`types/itinerary.ts`](frontend/types/itinerary.ts)).
- [`trip-context.tsx`](frontend/lib/trip-context.tsx): mutaciones **síncronas** sobre `useState`; [`TripsSyncer`](frontend/lib/db/trips-repo.ts) hace upsert/delete por diffing (debounce ~1 s, cola, flush `pagehide`). Last-write-wins.
- `article_html` se excluye de la carga inicial; `ensureArticleHtml` / `fetchArticleHtml` al abrir Crónica.
- Asistente: [`assistant-repo.ts`](frontend/lib/db/assistant-repo.ts); `activeConversationId` en localStorage por `userId`+`tripId` (se limpia en login/logout explícitos; el histórico permanece en Supabase). Conversaciones caen por `ON DELETE CASCADE` al borrar el viaje.
- Preferencias UI menores (`wp-trips-view`, `wp-plan-open`) y cachés de thumbs/Mapbox en session/local storage.
- Miniaturas: no van en el payload de `/itinerary` (`thumb_url` null). `InspirationThumbnail` las pide a `GET /thumb` al entrar en viewport. Portadas: `GET /cover` vía [`unsplash.ts`](frontend/lib/unsplash.ts) (claves solo en backend).

## Archivos críticos

- [`frontend/types/itinerary.ts`](frontend/types/itinerary.ts) — Dominio; `Trip.referrer` para CTAs.
- [`frontend/lib/trip-context.tsx`](frontend/lib/trip-context.tsx) — Mutaciones + `isLoading` + sync Supabase.
- [`frontend/lib/db/trips-repo.ts`](frontend/lib/db/trips-repo.ts) / [`assistant-repo.ts`](frontend/lib/db/assistant-repo.ts) / [`profile-repo.ts`](frontend/lib/db/profile-repo.ts).
- [`frontend/lib/auth-context.tsx`](frontend/lib/auth-context.tsx) — login, signup, upgradeGuest, linkGuestEmail, signInAnonymously.
- [`frontend/components/auth/registration-gate.tsx`](frontend/components/auth/registration-gate.tsx).
- [`frontend/lib/api.ts`](frontend/lib/api.ts) / [`assistant-api.ts`](frontend/lib/assistant-api.ts) / [`api-auth.ts`](frontend/lib/api-auth.ts) / [`thumbs.ts`](frontend/lib/thumbs.ts) / [`unsplash.ts`](frontend/lib/unsplash.ts) — Bearer del access token; thumbs y covers.
- [`backend/auth.py`](backend/auth.py), [`extraction_cache.py`](backend/extraction_cache.py), [`place_thumbs.py`](backend/place_thumbs.py), [`covers.py`](backend/covers.py), [`assistant.py`](backend/assistant.py), [`web_search.py`](backend/web_search.py).
- Migraciones en [`supabase/migrations/`](supabase/migrations/) (`article_extractions`, `place_thumbs`, `destination_covers`: solo service_role).

## Modelo de datos

**Extracción (backend):** `Itinerary` snake_case + `og_image` / `article_html`; `thumb_url` siempre null en la respuesta (lazy en el front).

**`Trip` (app):** metadatos, `countries`, fechas opcionales (`startDate` / `endDate`), `numDays` (= `days.length`), `expectations`, `cover`/`coverUrl`, `archived`, `sourceIds`, `days`, `basics`, `referrer?`. Con `startDate`, `endDate` = inicio + `numDays` − 1 (calendario inclusive; p. ej. 14 sept + 7 días → 20 sept). Sin inicio, no hay fechas en cabeceras de día. Normalización en lectura en `rowToTrip` para legacy desacoplado.

**Portada:** primera fuente → `GET /cover`(área/país) → `ogImage` → emoji.

**Asistente (Postgres):** fila por conversación con `messages jsonb` (actions incluidas).

## Flujo principal

1. Auth (registrado o anónimo vía `/start`).
2. `addSourceToTrip` → `POST /itinerary` (caché `article_extractions`; se guarda en cuanto Claude responde) → `buildSource` → sync fila `sources` + `trips`.
3. Miniaturas visibles → `GET /thumb`; portada → `GET /cover`.
4. Consolidar en días / básicos; asistente con briefing + `user_profile`.

## Convenciones

- **Casing:** API snake_case ↔ front camelCase; jsonb interior en camelCase.
- **Ids:** `crypto.randomUUID()` en cliente (navegación optimista).
- **CORS:** `ALLOWED_ORIGINS` en backend.
- **Movimiento de ítems:** solo `moveItemBetweenDays`.
- **Móvil vs desktop:** sin breadcrumb en móvil; FABs solo en detalle móvil.

## Preguntas abiertas / deuda

- Multi-pestaña: last-write-wins sin Realtime.
- Normalizar jsonb a tablas hijas solo si hace falta colaboración/queries.
- `REQUIRE_AUTH=true` en producción.
- Metering de uso de Places/Unsplash (T1.2) antes de producción: `/thumb` y `/cover` solo tienen cinturón `MAX_PHOTO_LOOKUPS_DAY`.
- Límites por usuario (`usage_events`): programar `cleanup_usage_events()` en producción (T7.3) si pg_cron no está activo.
- Placeholders: compartir/descargar; landing definitiva.

## Reglas que no se rompen

- ❌ **No uses `useTrips()`** fuera de [`app/trips/layout.tsx`](frontend/app/trips/layout.tsx).
- ❌ **No amplíes `ItemType` / `BasicCategory`** sin alinear [`item-styles.ts`](frontend/lib/item-styles.ts).
- ❌ **No alteres el contrato JSON de extracción** en un solo sitio.
- ❌ **No mutes a mano** `trip.days[…].items` → solo `moveItemBetweenDays`.
- ❌ **No expongas `SUPABASE_SERVICE_ROLE_KEY`** al frontend.
- ❌ **No uses `signInWithOtp` para convertir invitados** → `upgradeGuest` / `linkGuestEmail`.
- ❌ **No pidas portada Unsplash en `createTrip`** → `applyCoverFromSource`.
- ❌ **No expongas claves de imágenes** (`GOOGLE_PLACES_API_KEY`, `UNSPLASH_ACCESS_KEY`) al frontend / `NEXT_PUBLIC_*`.
- ❌ **No mezcles conversaciones del asistente entre viajes**.
- ❌ **No muestres «Añadir fuente» en enlaces institucionales** → [`inspirational-source.ts`](frontend/lib/inspirational-source.ts).
- ❌ **No reintroduzcas el breadcrumb en móvil** ni FABs de detalle en desktop.

## Dependencias críticas

| Tocas | Revisa |
| --- | --- |
| Esquema SQL / RLS | [`supabase/migrations/`](supabase/migrations/), [`supabase/README.md`](supabase/README.md) |
| [`types/itinerary.ts`](frontend/types/itinerary.ts) | prompt itinerario, `itinerary-utils`, `main.py`, forma de jsonb |
| `trip-context` / sync | [`trips-repo.ts`](frontend/lib/db/trips-repo.ts), consumidores `useTrips()`, [`trip-dates.ts`](frontend/lib/trip-dates.ts) |
| Auth / invitados | [`auth-context.tsx`](frontend/lib/auth-context.tsx), `RegistrationGate`, `/start` |
| Asistente | [`use-assistant-chat.ts`](frontend/hooks/use-assistant-chat.ts), [`assistant-repo.ts`](frontend/lib/db/assistant-repo.ts), [`assistant.py`](backend/assistant.py), perfil |
| JWT / CORS API | [`auth.py`](backend/auth.py), [`api-auth.ts`](frontend/lib/api-auth.ts), `ALLOWED_ORIGINS` |
| Thumbs / covers | [`place_thumbs.py`](backend/place_thumbs.py), [`covers.py`](backend/covers.py), [`thumbs.ts`](frontend/lib/thumbs.ts), [`unsplash.ts`](frontend/lib/unsplash.ts) |
