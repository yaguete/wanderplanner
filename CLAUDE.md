# WanderPlanner — Contexto del proyecto

## Qué es

WanderPlanner es una app web cuyo frontend carga y combina un viaje (`Trip`) y fuentes de inspiración por URL (`Source`), persistidos en **Supabase** (Postgres + Auth + RLS) con modelo documento (`jsonb`). Un backend Python expone `POST /itinerary` (extrae un artículo con Claude → JSON estructurado, SSE con heartbeats, caché global por URL en `article_extractions`; **sin** resolver miniaturas), `POST /partners/prewarm` (pre-síntesis pública para el kit de partners; Turnstile + límites; solo metadatos), `GET /thumb` (Places + caché `place_thumbs`), `GET /cover` (Unsplash + caché `destination_covers`), `GET /country-tasks` (trámites previos al viaje desde Recomendaciones MAE + Haiku; caché `country_task_suggestions`), `POST /day-summary` (descripción de 1-4 palabras de un día con Haiku), `GET /places/suggest` + `GET /transport-hubs` (proxy de Mapbox con el token **solo en servidor**) y `POST /assistant/chat` (asistente con DeepSeek + tools, SSE); todos salvo `/partners/prewarm` pueden verificar el JWT de Supabase. El front muestra esas fuentes, deja consolidar ítems en días, **permite añadir ítems propios y tramos de ida/vuelta**, conserva afiliación (`affiliateUrl` / `affiliate_url`) y ofrece un asistente con varias conversaciones por viaje que conoce el perfil del viajero (tipo de viaje + blogs favoritos).

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
    main.py                # FastAPI: /itinerary + /partners/prewarm (SSE) + CORS + routers
    partners.py            # Turnstile, guardia SSRF y límites del prewarm
    article_fetch.py       # Descarga + limpieza del artículo; og:image y og:title
    place_thumbs.py        # GET /thumb (Places; caché place_thumbs)
    covers.py              # GET /cover (Unsplash; caché destination_covers)
    photo_lookup.py        # normalización, single-flight, tope diario
    place_search.py        # GET /places/suggest + /transport-hubs (proxy Mapbox)
    day_summary.py         # POST /day-summary (Haiku; 1-4 palabras por día)
    country_briefs.py      # Fichas país MAE (PDF) para el asistente
    travel_briefs.py       # Recomendaciones de viaje MAE (HTML) para trámites
    country_tasks.py       # GET /country-tasks (Haiku → trámites paperwork/health)
    country_tasks_cache.py # country_task_suggestions vía service_role
    assistant.py           # POST /assistant/chat (SSE)
    auth.py                # JWT Supabase (HS256 o JWKS)
    usage.py               # usage_events: límites por usuario/día/invitado por `kind`
    obs.py                 # log_kv (logs estructurados)
    extraction_cache.py    # article_extractions vía service_role
    web_search.py          # Tavily (+ include_domains de blogs favoritos)
    Dockerfile
    agents/
  frontend/
    app/                   # App Router: /, /login, /signup, /partners, /account, /start, /trips…
      robots.ts            # Allow /; Disallow /trips y /account; NO /start
      sitemap.ts           # / y /partners (indexables)
      opengraph-image.tsx  # OG 1200×630 (next/og + brandSvgMarkup)
      apple-icon.tsx       # 180×180, ardilla #9F8173 sobre blanco opaco
      icon.svg             # favicon SVG con prefers-color-scheme
    middleware.ts          # Sesión Supabase; protege /trips y /account
    components/            # UI + auth/ + partners/ + tareas + tramos + mapa + nav móvil
      brand-mark.tsx       # isotipo ardilla, BrandLockup, brandSvgMarkup
      trips-shell.tsx      # providers + cromo de /trips (el layout es Server Component)
    lib/
      auth-context.tsx     # AuthProvider / useAuth (incl. invitados anónimos)
      trip-context.tsx     # Mutaciones síncronas; sync vía trips-repo
      trip-chrome-context.tsx # Header chrome + sidebar collapse (desktop /trips)
      partner-button.ts    # cleanSourceUrl / buildStartUrl / snippet HTML del kit
      partners-api.ts      # POST /partners/prewarm (SSE, sin Bearer)
      thumbs.ts            # GET /thumb (lazy; memoria + sessionStorage)
      unsplash.ts          # portadas vía GET /cover (sin clave en el navegador)
      country-tasks.ts     # GET /country-tasks (lazy; sessionStorage + dismissals)
      trip-tasks.ts        # Selector de tareas + claves (`taskKeyForItem`)
      task-labels.ts       # Verbo de cada tarea según tipo / `route.mode`
      item-provenance.ts   # MANUAL_SOURCE_ID / ASSISTANT_SOURCE_ID + atribución
      route-legs.ts        # Ciclo de vida de ida/vuelta (reanclado, rescate)
      transport-routes.ts  # Semilla y resumen de un tramo
      transport-hubs.ts    # Decisiones puras de hub por modo (sin I/O)
      airports.ts          # IATA OurAirports + áreas metro (T4B.3b); no editar airports-data.ts
      flight-search.ts     # Enlace Kiwi prerelleno (Nivel 1); afiliación solo aquí
      mapbox.ts            # suggestPlaces / hubs / Directions / HUB_MAX_DISTANCE_KM
      place-search-guardrails.ts # Efímero vs persistible; presupuesto de sesión
      map-route-geometry.ts      # Geodésicas, segmentos por modo, km por medio
      map-geocode-state.ts       # Estado del geocodificado del mapa
      trip-origin-resolve.ts     # Origen del viaje al crear/editar
      day-summary.ts       # POST /day-summary + firma de ítems del día
      assistant-suggestions.ts   # Snippets de arranque del asistente (sin LLM)
      site.ts              # SITE_URL canónica (metadataBase, sitemap, robots)
      db/                  # trips-repo, assistant-repo, profile-repo
      supabase/            # client, server, middleware helpers
    hooks/                 # use-assistant-chat, use-collapsing-header,
                           # use-virtual-keyboard, use-mobile, use-toast
```

**Tests:** ficheros `lib/*.test.ts` ejecutados con `tsx` (`npm run test:<nombre>`), no vitest. [`ci.yml`](.github/workflows/ci.yml) ejecuta **solo un subconjunto**: al añadir una suite nueva, añádela también al workflow o el CI seguirá verde sin ejecutarla.

## Rutas App Router y shell

- **`/`** — Landing placeholder ([`app/page.tsx`](frontend/app/page.tsx)): CTAs Entrar / Crear cuenta.
- **`/login`**, **`/signup`**, **`/auth/callback`**, **`/account`** — Auth y perfil de viajero (tipos + referencias favoritas).
- **`/partners`** — Kit público para bloggers ([`app/partners/page.tsx`](frontend/app/partners/page.tsx)): formulario URL + slug → enlace `/start` + snippet HTML; dispara `POST /partners/prewarm` para dejar la fuente en caché. Mismo cromo que `/login` (`AuthShell`, ancho `2xl`).
- **`/start?source=&ref=&days=`** — CTA de blogs amigos: sesión anónima + viaje borrador + fuente precargada. `&days=N` (opcional, 1..60) fuerza la duración del borrador; tiene prioridad sobre `total_days` de la extracción. El `ref` es obligatorio para el auto-dimensionado. **Rastreable + `noindex, follow`**: Google tiene que leer el meta; no va en `Disallow`.
- **Layout raíz** — Inter, `AuthProvider`, Analytics. **Sin** `TripProvider`. Metadata (`metadataBase`, OG, Twitter) en [`app/layout.tsx`](frontend/app/layout.tsx).
- **Segmento `trips`** — [`app/trips/layout.tsx`](frontend/app/trips/layout.tsx) es Server Component (`robots: noindex, nofollow`). Los providers viven en [`trips-shell.tsx`](frontend/components/trips-shell.tsx): `TripProvider` → `RegistrationGateProvider` → `TripChromeProvider` → shell (header, sidebar colapsable, main sobre canvas gris). Único sitio de `useTrips()`.
- **`/trips`** — Listado Activos/Archivados; empty/loading con spinner mientras `isLoading`.
- **`/trips/[tripId]`** — Desktop: tres paneles alícuota (Fuentes · Viaje · Asistente) con toggles en el header (`wp-trip-panels`); título del viaje en el header. **Móvil: nav inferior de tres secciones** ([`trip-mobile-nav.tsx`](frontend/components/trip-mobile-nav.tsx): Fuentes · Mi viaje · Asistente), con cabecera que se colapsa al hacer scroll ([`use-collapsing-header.ts`](frontend/hooks/use-collapsing-header.ts)) y ajuste al teclado virtual ([`use-virtual-keyboard.ts`](frontend/hooks/use-virtual-keyboard.ts)).

### Panel «Mi viaje»: cinco pestañas, no dos niveles

[`itinerary-view-mode-tabs.tsx`](frontend/components/itinerary-view-mode-tabs.tsx) — **Ruta · Actividades · Alojamientos · Transporte · Básicos** en una sola fila. **Ruta** es el timeline (Lista/Mapa) y las otras cuatro son la **vista de tareas filtrada por categoría** (`VIEW_MODE_TASK_CATEGORIES`). No existe el nivel «Itinerario | Tareas» que describen planes antiguos.

- El botón de alta de cada pestaña crea un **ítem real**: Transporte → [`transport-route-dialog.tsx`](frontend/components/transport-route-dialog.tsx); Alojamientos / Actividades → [`add-manual-item-dialog.tsx`](frontend/components/add-manual-item-dialog.tsx) con el tipo fijado.
- El **`ExtraTask`** (tarea suelta sin día ni lugar) solo se crea desde **Básicos**.
- Regla: si lo que se añade tiene sitio y día → `UserDayItem`; si no → `ExtraTask`. No hay una tercera cosa.

## Auth e invitados

- Sesión vía Supabase Auth. Middleware exige sesión (registrada **o anónima**) en `/trips` y `/account`.
- **Invitado:** `signInAnonymously` (hay que activar Anonymous Sign-Ins en el dashboard). Mismo `user_id` que al registrarse.
- **`RegistrationGate`:** con `user.is_anonymous`, bloquea segunda fuente / nuevo viaje / ir a inicio. Registro con `updateUser` (email+password) o enlace por email (`linkGuestEmail` → `updateUser({ email })`). **No** usar `signInWithOtp` en invitados (crearía otro usuario).
- Perfil: `profiles` + `favorite_references`; se inyecta en el briefing del asistente y en `preferred_domains` de Tavily.

## Persistencia (modelo documento)

- Tablas `trips` / `sources`: columnas planas + `days`/`basics`/`items` en **jsonb camelCase** (contrato de [`types/itinerary.ts`](frontend/types/itinerary.ts)).
- `sources.total_days` (= `Source.totalDays`): duración declarada por la guía (`itinerary.total_days`); permite que un viaje de partner adopte los días del artículo.
- [`trip-context.tsx`](frontend/lib/trip-context.tsx): mutaciones **síncronas** sobre `useState`; [`TripsSyncer`](frontend/lib/db/trips-repo.ts) hace upsert/delete por diffing (debounce ~1 s, cola, flush `pagehide`). Last-write-wins.
- Viajes de partner (`trip.referrer`): al añadir la primera fuente, si el viaje sigue virgen (sin fechas, ≤1 día vacío), se redimensiona a `totalDays` (tope 60), se fija `startDate` = mañana y se renombra con `source.area`. Con `&days=N` el calendario ya viene fijado en `/start` y solo se renombra. Nunca pisa viajes creados por el usuario.
- Extracción de fuente: `startSourceExtraction` (fire-and-forget) → chip pendiente en Fuentes (`pendingSources`); sin modal bloqueante. Tope **5 fuentes/viaje** ([`trip-sources.ts`](frontend/lib/trip-sources.ts)). Quitar una fuente **no** borra ítems/basics ya consolidados en Mi viaje.
- `article_html` se excluye de la carga inicial; `ensureArticleHtml` / `fetchArticleHtml` al abrir Crónica.
- Asistente: [`assistant-repo.ts`](frontend/lib/db/assistant-repo.ts); `activeConversationId` en localStorage por `userId`+`tripId` (se limpia en login/logout explícitos; el histórico permanece en Supabase). Conversaciones caen por `ON DELETE CASCADE` al borrar el viaje.
- Preferencias UI menores (`wp-trips-view`, `wp-trip-panels`, `wp-sidebar-collapsed`) y cachés de thumbs/Mapbox/country-tasks en session/local storage.
- Miniaturas: no van en el payload de `/itinerary` (`thumb_url` null). `InspirationThumbnail` las pide a `GET /thumb` al entrar en viewport. Portadas: `GET /cover` vía [`unsplash.ts`](frontend/lib/unsplash.ts) (claves solo en backend).
- Trámites de país (T4.4): pestaña **Básicos** → `GET /country-tasks` (Recomendaciones MAE + Haiku). Sugerencias aceptadas → `ExtraTask` con id `country:{iso}:{slug}`; descartes en `dismissedCountryTasks` (columna propia, **no** en `tasks`).
- Descripción de día por IA: `POST /day-summary`; la firma de ítems (`summarySignature` en `UserDay`) apaga el botón si nada ha cambiado.

## Tareas y dinero

- `trip.tasks` es un mapa **clave → estado**, no id → estado. Las claves las construye **solo** [`taskKeyForItem`](frontend/lib/trip-tasks.ts) y tienen tres espacios de nombres:
  - `leg:outbound` / `leg:return` — tramos de ida y vuelta (aunque se llamen igual, no colisionan);
  - `route:{itemId}` — traslado interno con `route`;
  - `${type}:${normalizeName(name)}` — todo lo demás (un hotel de 3 noches es UNA reserva aunque aparezca 3 veces en la Ruta).
- Ida y vuelta **en avión espejadas** (mismos IATA invertidos) se agregan como **una** tarea con clave `leg:outbound`; el coste de `leg:return` se pliega ahí. `taskKeyForItem` no cambia. La Ruta sigue mostrando dos tarjetas.
- **El dinero vive en un solo sitio**: `trip.tasks[clave].cost`. Ni los ítems ni `route` llevan precio.
- Divisa **del viaje** (`trip.currency`, default EUR), nunca por tarea. Coste por persona con `trip.numTravelers`.
- `nights` se deriva hoy de `dayIndexes.length`: un alojamiento añadido a mano se ancla a un día y cuenta **1 noche**. `spanDays` (T4B.2b) está pendiente — ver deuda.

## Tramos, transporte y mapa (Fase 4B)

- **Tramo** = `UserDayItem` de `type: "transport"` con `route?: { from, to, mode?, leg? }` (`RoutePlace` = label + coords `{lng,lat}` + `kind`). `mode` es **opcional a propósito**: el tramo existe antes de decidir el medio, y `task-labels.ts` cambia el verbo («Decidir cómo llegar a…» → «Comprar los vuelos»). Vive en `days` (jsonb): **sin migración**, con lectura defensiva.
- Un solo motor de formulario, [`transport-route-form.tsx`](frontend/components/transport-route-form.tsx), con dos envoltorios: [`route-leg-dialog.tsx`](frontend/components/route-leg-dialog.tsx) (ida/vuelta: propone extremos, puede fijar `trip.origin`) y [`transport-route-dialog.tsx`](frontend/components/transport-route-dialog.tsx) (traslado interno, día editable).
- **Ciclo de vida** en [`route-legs.ts`](frontend/lib/route-legs.ts): `reanchorRouteLegs`, `rescueLegsFromRemovedDays`, `upsertLegInDays`. Borrar el último día **no** pierde la vuelta: se reancla conservando el `id` (y por tanto su coste).
- **Hubs** (aeropuerto/estación) solo tras elegir medio y **por proximidad**, vía `GET /transport-hubs`; radios en `HUB_MAX_DISTANCE_KM` (aeropuerto 200 km, estación 80, bus 50). El ancla de búsqueda es la **ciudad**, no el hub ya elegido.
- **Licencia Mapbox** ([`place-search-guardrails.ts`](frontend/lib/place-search-guardrails.ts)): los candidatos de Search Box son **efímeros** y no se persisten salvo `NEXT_PUBLIC_ALLOW_TRANSPORT_HUB_PERSISTENCE=true`; lo persistible sale de Geocoding permanente (`NEXT_PUBLIC_MAPBOX_PERMANENT_GEOCODING`). Kill switch: `TRANSPORT_PLACE_SEARCH_ENABLED` (servidor) / `NEXT_PUBLIC_TRANSPORT_PLACE_SEARCH_ENABLED` (cliente). Límites por `usage_events` con kinds `place_suggest` y `transport_hub`.
- **Mapa** ([`itinerary-map-view.tsx`](frontend/components/itinerary-map-view.tsx) + [`map-route-geometry.ts`](frontend/lib/map-route-geometry.ts)): dos modos (`MapViewMode` = `transport` | `places`). Los tramos **no locales** (> `MAP_LOCAL_SEGMENT_MAX_KM`, 3.000 km) y las idas/vueltas que no son coche/bus **no se dibujan**: en su lugar se pintan anclas de llegada/salida (`collectMapGatewayAnchors`), así el encuadre se queda en el destino. Directions (`driving`) solo en subsecuencias por carretera < `PLACES_ROAD_MAX_KM` (300 km); el resto son geodésicas locales sin peticiones. Mapbox **no tiene perfil de tren**. Los km del pie se desglosan por medio (`summarizeTransportKm`).
- **Buscador de vuelos (T4B.3b, Nivel 1):** botón «Buscar vuelos» en tramos con `mode: "flight"` → enlace Kiwi prerelleno ([`flight-search.ts`](frontend/lib/flight-search.ts)). IATA desde tabla OurAirports + áreas metro ([`airports.ts`](frontend/lib/airports.ts)); regenerar con `node scripts/generate-airports.mjs`. **Prohibido** API de precios. Afiliación propia **solo** en `FLIGHT_SEARCH_AFFILIATE_ID`; nunca tocar `affiliateUrl` de fuentes. No editar [`airports-data.ts`](frontend/lib/airports-data.ts) a mano. El diálogo de ida no siembra Destino con el nombre del viaje.

## Archivos críticos

- [`frontend/types/itinerary.ts`](frontend/types/itinerary.ts) — Dominio; `Trip.referrer` para CTAs; `Source.totalDays`.
- [`frontend/lib/trip-context.tsx`](frontend/lib/trip-context.tsx) — Mutaciones + `isLoading` + sync Supabase; `startSourceExtraction` / `pendingSources`; adopción de calendario de partner.
- [`frontend/lib/trip-sources.ts`](frontend/lib/trip-sources.ts) — `MAX_SOURCES_PER_TRIP` / `canAddSource`.
- [`frontend/lib/partner-trip.ts`](frontend/lib/partner-trip.ts) — `draftTripNameFor` / `parseDaysParam` / `MAX_AUTO_DAYS` (CTA `/start`).
- [`frontend/lib/partner-button.ts`](frontend/lib/partner-button.ts) / [`partners-api.ts`](frontend/lib/partners-api.ts) — kit `/partners`: URL limpia, snippet HTML, prewarm SSE.
- [`frontend/components/partners/partner-button-builder.tsx`](frontend/components/partners/partner-button-builder.tsx).
- [`frontend/lib/db/trips-repo.ts`](frontend/lib/db/trips-repo.ts) / [`assistant-repo.ts`](frontend/lib/db/assistant-repo.ts) / [`profile-repo.ts`](frontend/lib/db/profile-repo.ts).
- [`frontend/lib/auth-context.tsx`](frontend/lib/auth-context.tsx) — login, signup, upgradeGuest, linkGuestEmail, signInAnonymously.
- [`frontend/components/auth/registration-gate.tsx`](frontend/components/auth/registration-gate.tsx).
- [`frontend/lib/api.ts`](frontend/lib/api.ts) / [`assistant-api.ts`](frontend/lib/assistant-api.ts) / [`api-auth.ts`](frontend/lib/api-auth.ts) / [`thumbs.ts`](frontend/lib/thumbs.ts) / [`unsplash.ts`](frontend/lib/unsplash.ts) / [`country-tasks.ts`](frontend/lib/country-tasks.ts) — Bearer del access token; thumbs, covers y trámites.
- [`frontend/lib/trip-tasks.ts`](frontend/lib/trip-tasks.ts) — Claves de tarea y agregación; única fuente de `taskKeyForItem`.
- [`frontend/lib/route-legs.ts`](frontend/lib/route-legs.ts) / [`transport-routes.ts`](frontend/lib/transport-routes.ts) / [`transport-hubs.ts`](frontend/lib/transport-hubs.ts) — Tramos de ida/vuelta y traslados.
- [`frontend/lib/mapbox.ts`](frontend/lib/mapbox.ts) / [`place-search-guardrails.ts`](frontend/lib/place-search-guardrails.ts) / [`map-route-geometry.ts`](frontend/lib/map-route-geometry.ts) — Búsqueda de lugares, licencia y geometría del mapa.
- [`frontend/lib/item-provenance.ts`](frontend/lib/item-provenance.ts) — `MANUAL_SOURCE_ID` / `ASSISTANT_SOURCE_ID`; **única** ruta de atribución.
- [`backend/auth.py`](backend/auth.py), [`partners.py`](backend/partners.py), [`extraction_cache.py`](backend/extraction_cache.py), [`place_thumbs.py`](backend/place_thumbs.py), [`covers.py`](backend/covers.py), [`place_search.py`](backend/place_search.py), [`day_summary.py`](backend/day_summary.py), [`usage.py`](backend/usage.py), [`travel_briefs.py`](backend/travel_briefs.py), [`country_tasks.py`](backend/country_tasks.py), [`assistant.py`](backend/assistant.py), [`web_search.py`](backend/web_search.py).
- Migraciones en [`supabase/migrations/`](supabase/migrations/) (`article_extractions`, `place_thumbs`, `destination_covers`, `country_task_suggestions`: solo service_role).

## Modelo de datos

**Extracción (backend):** `Itinerary` snake_case + `og_image` / `og_title` / `article_html`; `thumb_url` siempre null en la respuesta (lazy en el front). `og_title` lo inyecta [`article_fetch.py`](backend/article_fetch.py), no el LLM, y es el título de la `Source` (con fallback a la URL y a `destino — N días`).

**`UserDayItem`:** `coords?: {lng,lat}` resueltas al elegir candidato; `route?: TransportRoute` en transportes (ver Fase 4B); `sourceRouteHint?` = `from`/`to`/`mode` en texto que trae la extracción y solo precarga el formulario. `sourceId` puede ser un centinela (`"manual"` / `"assistant"`), nunca `null`.

**`Trip` (app):** metadatos, `countries`, fechas opcionales (`startDate` / `endDate`), `numDays` (= `days.length`), `expectations`, `cover`/`coverUrl`, `archived`, `sourceIds`, `days`, `basics`, `tasks`, `extraTasks`, `dismissedCountryTasks`, `numTravelers`, `currency`, `origin` (`TripOrigin | null`: label + coords `{lng,lat}` + countryCode), `referrer?`. Con `startDate`, `endDate` = inicio + `numDays` − 1 (calendario inclusive; p. ej. 14 sept + 7 días → 20 sept). Sin inicio, no hay fechas en cabeceras de día. Normalización en lectura en `rowToTrip` para legacy desacoplado.

**Portada:** primera fuente → `GET /cover`(área/país) → `ogImage` → emoji.

**Asistente (Postgres):** fila por conversación con `messages jsonb` (actions incluidas).

## Flujo principal

1. Auth (registrado o anónimo vía `/start`).
2. Kit partner (`/partners`): el blogger genera enlace + snippet; `POST /partners/prewarm` deja la URL en `article_extractions` (sin sesión; Turnstile + límites).
3. CTA partner (`/start`): borrador con `referrer`; opcionalmente N días + inicio mañana si `&days=N`.
4. `startSourceExtraction` → chip pendiente → `POST /itinerary` (caché `article_extractions`; hit si ya se precalentó) → `buildSource` (incluye `totalDays`) → sync fila `sources` + `trips`. Si el viaje tiene `referrer` y sigue virgen, adopta `totalDays` + `startDate` mañana y renombra con `area`.
5. Miniaturas visibles → `GET /thumb`; portada → `GET /cover`.
6. Consolidar en días / básicos; asistente con briefing + `user_profile`.

## Convenciones

- **Casing:** API snake_case ↔ front camelCase; jsonb interior en camelCase.
- **Ids:** `crypto.randomUUID()` en cliente (navegación optimista).
- **CORS:** `ALLOWED_ORIGINS` en backend.
- **Movimiento de ítems:** solo `moveItemBetweenDays`.
- **Móvil vs desktop:** sin breadcrumb en móvil; nav inferior de tres secciones solo en el detalle móvil; en desktop, toggles de panel en el header.
- **Coordenadas:** siempre objeto `{ lng, lat }`, nunca tupla (es la forma del jsonb y de `LngLat`).
- **Coste de una mutación:** en `/trips/[tripId]` los **tres paneles están montados a la vez** (los cerrados solo se ocultan con `content-visibility`). Cualquier consumidor de `useTrips()` se re-renderiza en **cada** mutación del viaje, aunque no se vea. Un trabajo caro en el asistente lo pagas al mover un ítem en la Ruta.
- **Arrays derivados del contexto:** `getTripSources(tripId)` construye un array nuevo en cada llamada. Si va a alimentar un `useMemo` o una prop de un `memo()`, pásalo por [`useStableList`](frontend/hooks/use-stable-list.ts) o el memo no servirá de nada.

## Preguntas abiertas / deuda

- Multi-pestaña: last-write-wins sin Realtime.
- Normalizar jsonb a tablas hijas solo si hace falta colaboración/queries.
- `REQUIRE_AUTH=true` en producción.
- Metering de uso de Places/Unsplash (T1.2) antes de producción: `/thumb` y `/cover` solo tienen cinturón `MAX_PHOTO_LOOKUPS_DAY`.
- Límites por usuario (`usage_events`): programar `cleanup_usage_events()` en producción (T7.3) si pg_cron no está activo.
- **`spanDays` pendiente (T4B.2b):** un alojamiento o transporte añadido a mano cuenta 1 noche / 1 día, y el coste por noche de la fila miente. Es lo siguiente de la Fase 4B.
- **CI parcial:** `route-legs`, `transport-routes` y `assistant-suggestions` tienen tests que [`ci.yml`](.github/workflows/ci.yml) no ejecuta.
- **Coste de Mapbox sin verificar:** falta comparar las peticiones a Directions de un viaje sin tramos antes/después del mapa nuevo; `place_suggest` / `transport_hub` no están en el presupuesto mensual.
- **Primera llamada a `resolveTripCountryCodes` (~460 ms):** ahí se compilan de golpe los ~400 patrones de [`countries.ts`](frontend/lib/countries.ts). Ocurre una vez por carga, en el primer render del asistente. Se quitaría indexando los países por su primera palabra para probar solo candidatos plausibles; ojo con los nombres con guion (`guinea-bissau`).
- Placeholders: compartir/descargar; landing definitiva.

## Reglas que no se rompen

- ❌ **No uses `useTrips()`** fuera del segmento `/trips`. El `TripProvider` está en [`trips-shell.tsx`](frontend/components/trips-shell.tsx), montado solo desde [`app/trips/layout.tsx`](frontend/app/trips/layout.tsx).
- ❌ **No pongas `/start` en `Disallow` de `robots.txt`.** Es el CTA de los blogs: tiene que ser rastreable para que Google lea el `noindex, follow`. `/trips` y `/account` sí van en `Disallow`. `/` y `/partners` se indexan. `Disallow` + `noindex` sobre la misma URL se anulan.
- ❌ **No amplíes `ItemType` / `BasicCategory`** sin alinear [`item-styles.ts`](frontend/lib/item-styles.ts).
- ❌ **No alteres el contrato JSON de extracción** en un solo sitio.
- ❌ **No mutes a mano** `trip.days[…].items` → solo `moveItemBetweenDays`.
- ❌ **No expongas `SUPABASE_SERVICE_ROLE_KEY`** al frontend.
- ❌ **No uses `signInWithOtp` para convertir invitados** → `upgradeGuest` / `linkGuestEmail`.
- ❌ **No pidas portada Unsplash en `createTrip`** → `applyCoverFromSource`.
- ❌ **No expongas claves de imágenes** (`GOOGLE_PLACES_API_KEY`, `UNSPLASH_ACCESS_KEY`) al frontend / `NEXT_PUBLIC_*`.
- ❌ **No mezcles conversaciones del asistente entre viajes**.
- ❌ **No muestres «Añadir fuente» en enlaces institucionales** → [`inspirational-source.ts`](frontend/lib/inspirational-source.ts).
- ❌ **No reintroduzcas el breadcrumb en móvil** ni el nav inferior en desktop.
- ❌ **No reintroduzcas el asistente overlay/FAB** en desktop ni paneles redimensionables en el detalle.
- ❌ **No compongas claves de tarea a mano** ni las renombres → `taskKeyForItem` / `taskKeyForBasic`. Cambiarlas huérfana los costes ya guardados en `trip.tasks`.
- ❌ **No guardes precios en el ítem ni en `route`** → `trip.tasks[clave].cost`.
- ❌ **No persistas candidatos efímeros de Search Box** (hubs) sin pasar por [`place-search-guardrails.ts`](frontend/lib/place-search-guardrails.ts): es una cuestión de licencia de Mapbox, no de estilo.
- ❌ **No pidas Directions para vuelos, trenes ni tramos largos** → geodésica/línea propia; Mapbox no tiene perfil `rail`.
- ❌ **No inventes otra ruta de atribución** → [`item-provenance.ts`](frontend/lib/item-provenance.ts): un ítem propio nunca lleva la firma de un bloguero.
- ❌ **No compiles regex dentro de un bucle sobre la tabla de países** → `hasWordBoundaryMatch` cachea el patrón por nombre. Inlinearlo otra vez devuelve `resolveTripCountryCodes` a ~460 ms **por llamada**, y se llama en cada render del asistente.
- ❌ **No optimices rendimiento sin medir antes.** Los tres paneles montados hacen que el coste percibido casi nunca esté donde parece: dos rondas de optimización sobre la Ruta (que renderiza en 18 ms) no movieron la aguja porque el segundo entero estaba en el asistente cerrado.
- ❌ **No implementes búsqueda de vuelos con API / precios** → el buscador es Nivel 1 (enlace Kiwi). Afiliación propia solo en `FLIGHT_SEARCH_AFFILIATE_ID`; no toques `affiliateUrl` de fuentes. La tabla IATA se genera con `scripts/generate-airports.mjs`, no se edita `airports-data.ts` a mano.

## Dependencias críticas

| Tocas | Revisa |
| --- | --- |
| Esquema SQL / RLS | [`supabase/migrations/`](supabase/migrations/), [`supabase/README.md`](supabase/README.md) |
| [`types/itinerary.ts`](frontend/types/itinerary.ts) | prompt itinerario, `itinerary-utils`, `main.py`, forma de jsonb |
| `trip-context` / sync | [`trips-repo.ts`](frontend/lib/db/trips-repo.ts), consumidores `useTrips()`, [`trip-dates.ts`](frontend/lib/trip-dates.ts) |
| Auth / invitados | [`auth-context.tsx`](frontend/lib/auth-context.tsx), `RegistrationGate`, `/start` |
| Asistente | [`use-assistant-chat.ts`](frontend/hooks/use-assistant-chat.ts), [`assistant-repo.ts`](frontend/lib/db/assistant-repo.ts), [`assistant.py`](backend/assistant.py), perfil |
| JWT / CORS API | [`auth.py`](backend/auth.py), [`api-auth.ts`](frontend/lib/api-auth.ts), `ALLOWED_ORIGINS` |
| Kit partners / prewarm | [`/partners`](frontend/app/partners/page.tsx), [`partners.py`](backend/partners.py), [`partners-api.ts`](frontend/lib/partners-api.ts), `TURNSTILE_SECRET_KEY` |
| Trámites de país | [`country_tasks.py`](backend/country_tasks.py), [`travel_briefs.py`](backend/travel_briefs.py), [`country-tasks.ts`](frontend/lib/country-tasks.ts), [`country-tasks-section.tsx`](frontend/components/country-tasks-section.tsx), `dismissed_country_tasks` |
| Thumbs / covers | [`place_thumbs.py`](backend/place_thumbs.py), [`covers.py`](backend/covers.py), [`thumbs.ts`](frontend/lib/thumbs.ts), [`unsplash.ts`](frontend/lib/unsplash.ts) |
| Tareas / costes | [`trip-tasks.ts`](frontend/lib/trip-tasks.ts) (+ test), [`task-labels.ts`](frontend/lib/task-labels.ts), [`trip-tasks-panel.tsx`](frontend/components/trip-tasks-panel.tsx), `tasks` / `extra_tasks` / `currency` / `num_travelers` |
| Tramos de transporte | [`route-legs.ts`](frontend/lib/route-legs.ts), [`transport-routes.ts`](frontend/lib/transport-routes.ts), [`transport-route-form.tsx`](frontend/components/transport-route-form.tsx), `taskKeyForItem`, mapa |
| Búsqueda de lugares / hubs | [`place_search.py`](backend/place_search.py), [`mapbox.ts`](frontend/lib/mapbox.ts), [`place-search-guardrails.ts`](frontend/lib/place-search-guardrails.ts), [`usage.py`](backend/usage.py), `MAPBOX_ACCESS_TOKEN` |
| Mapa | [`itinerary-map-view.tsx`](frontend/components/itinerary-map-view.tsx), [`map-route-geometry.ts`](frontend/lib/map-route-geometry.ts), [`map-geocode-state.ts`](frontend/lib/map-geocode-state.ts), coste de Directions |
| Marca / SEO | [`brand-mark.tsx`](frontend/components/brand-mark.tsx), [`site.ts`](frontend/lib/site.ts), [`robots.ts`](frontend/app/robots.ts), [`opengraph-image.tsx`](frontend/app/opengraph-image.tsx) |
