# WanderPlanner — Contexto del proyecto

## Qué es

WanderPlanner es una app web cuyo frontend carga y combina un viaje (`Trip`) y fuentes de inspiración por URL (`Source`), persistidos en **Supabase** (Postgres + Auth + RLS) con modelo documento (`jsonb`). Un backend Python expone `POST /itinerary` (extrae un artículo con Claude → JSON estructurado, SSE con heartbeats, caché global por URL en `article_extractions`; **sin** resolver miniaturas), `POST /partners/prewarm` (pre-síntesis pública para el kit de partners; Turnstile + límites; solo metadatos), `GET /sources/suggest` (público: artículos para la landing; caché curada → Tavily de dominios conocidos → Tavily abierto si 1+2 no dan hits), `GET /thumb` (Commons en `kind=activity` — todo lo que no es stay/food/transport — y Places en stay/food/transport, Básicos (`basic`→`stay`) y fallback; caché `place_thumbs`; tope global durable `usage_events.kind=photo_paid`), `GET /cover` (Unsplash + caché `destination_covers`), `GET /country-tasks` (trámites previos al viaje desde Recomendaciones MAE + Haiku; caché `country_task_suggestions`), `POST /day-summary` (descripción de 1-4 palabras de un día con Haiku), `GET /places/suggest` + `GET /transport-hubs` (proxy de Mapbox; **escritos pero sin enchufar**: hoy el front va directo a `api.mapbox.com`) y `POST /assistant/chat` (asistente con DeepSeek + tools, SSE); todos salvo `/partners/prewarm` y `/sources/suggest` pueden verificar el JWT de Supabase. El front muestra esas fuentes, deja consolidar ítems en días, **permite añadir ítems propios y tramos de ida/vuelta**, conserva afiliación (`affiliateUrl` / `affiliate_url`) y ofrece un asistente con varias conversaciones por viaje que conoce el perfil del viajero (tipo de viaje + blogs favoritos).

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
    source_suggest.py      # GET /sources/suggest (landing: caché curada → Tavily)
    landing_source_domains.py  # Dominios + URLs semilla de la pestaña destino
    inspirational_source.py    # Espejo Python de inspirational-source.ts
    article_fetch.py       # Descarga + limpieza del artículo; og:image y og:title
    instagram.py           # Posts/reels: resolver + instagram_llm_text + coerce
    instagram_ocr.py       # Descarga de slides + Haiku vision (fail-open)
    instagram_url.py       # Canónica /p/{shortcode}; espejo de instagram-url.ts
    itinerary_schema.py    # JSON Schema de structured outputs (blog + IG + OCR)
    place_thumbs.py        # GET /thumb (Commons + Places; caché place_thumbs)
    wikimedia_thumbs.py    # es.wikipedia + Commons para actividades
    covers.py              # GET /cover (Unsplash; caché destination_covers)
    photo_lookup.py        # normalización, single-flight, tope durable photo_paid
    place_search.py        # GET /places/suggest + /transport-hubs (proxy Mapbox)
    day_summary.py         # POST /day-summary (Haiku; 1-4 palabras por día)
    share_summary.py       # POST /share-summary (DeepSeek; resumen para Compartir)
    country_briefs.py      # Fichas país MAE (PDF) para el asistente
    travel_briefs.py       # Recomendaciones de viaje MAE (HTML) para trámites
    country_tasks.py       # GET /country-tasks (Haiku → trámites paperwork/health)
    country_tasks_cache.py # country_task_suggestions vía service_role
    assistant.py           # POST /assistant/chat (SSE)
    auth.py                # JWT Supabase (HS256 o JWKS)
    trip_share.py          # POST /trips/{id}/invites + lookup/complete-signup
    emails.py              # Resend: invitaciones (sin loguear el email del invitado)
    usage.py               # usage_events: límites por usuario/día/invitado por `kind`
    funnel.py              # POST /funnel: contadores del CTA (start_opened, outbound_click, account_created)
    obs.py                 # log_kv (logs estructurados)
    extraction_cache.py    # article_extractions vía service_role
    web_search.py          # Tavily (+ include_domains de blogs favoritos)
    Dockerfile
    agents/
  frontend/
    app/                   # App Router: /, /login, /signup, /forgot-password, /reset-password, /partners, /start, /legal…; (app)/ → /trips y /account
      robots.ts            # Allow /; Disallow /trips y /account; NO /start
      sitemap.ts           # /, /partners y /legal/* (indexables)
      opengraph-image.tsx  # OG 1200×630 (next/og + brandSvgMarkup)
      apple-icon.tsx       # 180×180, ardilla #9F8173 sobre blanco opaco
      icon.svg             # favicon SVG con prefers-color-scheme
    middleware.ts          # Sesión Supabase; protege /trips y /account
    components/            # UI + auth/ + partners/ + landing/ + legal/ + tareas + tramos + mapa + nav móvil
      brand-mark.tsx       # isotipo ardilla, BrandLockup, brandSvgMarkup
      landing/             # home pública + /partners en negativo; LandingNav (sesión)
      trips-shell.tsx      # providers + cromo de /trips y /account (el layout es Server Component)
    lib/
      auth-context.tsx     # AuthProvider / useAuth (incl. invitados anónimos)
      trip-context.tsx     # Mutaciones síncronas; sync vía trips-repo
      trip-chrome-context.tsx # Header chrome + sidebar collapse (desktop /trips)
      trip-paths.ts        # `/trips/:id` vs listado (sidebar solo en detalle)
      partner-button.ts    # cleanSourceUrl / buildStartUrl / snippet HTML del kit
      partners-api.ts      # POST /partners/prewarm (SSE, sin Bearer)
      source-suggest.ts    # GET /sources/suggest (landing + Añadir fuente)
      trip-source-suggestions.ts # sugerencias in-app; sessionStorage wp-trip-source-suggest
      thumbs.ts            # GET /thumb (lazy; memoria + sessionStorage)
      unsplash.ts          # portadas vía GET /cover (sin clave en el navegador)
      country-tasks.ts     # GET /country-tasks (lazy; sessionStorage + dismissals)
      trip-tasks.ts        # Selector de tareas + claves (`taskKeyForItem`)
      trip-budget.ts       # Techo, veredicto, cobertura y cuenta; puro
      task-labels.ts       # Verbo de cada tarea según tipo / `route.mode`
      item-provenance.ts   # MANUAL_SOURCE_ID / ASSISTANT_SOURCE_ID + atribución
      route-legs.ts        # Ciclo de vida de ida/vuelta (reanclado, rescate)
      transport-routes.ts  # Semilla y resumen de un tramo
      transport-hubs.ts    # Decisiones puras de hub por modo (sin I/O)
      airports.ts          # IATA OurAirports + áreas metro (T4B.3b); no editar airports-data.ts
      flight-search.ts     # Enlace Skyscanner prerelleno (Nivel 1); hop Impact; AFFILIATE_ID vacío
      booking-dates.ts     # checkin/checkout en Booking del bloguero; no persiste
      booking-search.ts    # Booking del asistente (aid propio); no pisa el del bloguero
      mapbox.ts            # suggestPlaces / hubs / Directions / HUB_MAX_DISTANCE_KM
      place-search-guardrails.ts # Efímero vs persistible; presupuesto de sesión
      map-route-geometry.ts      # Geodésicas, segmentos por modo, km por medio
      map-geocode-state.ts       # Estado del geocodificado del mapa
      trip-origin-resolve.ts     # Origen del viaje al crear/editar
      day-summary.ts       # POST /day-summary + firma de ítems del día
      itinerary-calendar.ts # Rejilla mes/semana de Ruta (lunes; sin leer el reloj)
      assistant-suggestions.ts   # Snippets de arranque del asistente (sin LLM)
      assistant-actions.ts  # Resolver propuestas de mover ítems (`propose_move_item`)
      site.ts              # SITE_URL canónica (metadataBase, sitemap, robots)
      legal.ts             # Titular e inventario de storage para /legal/* (sin nombres de proveedor)
      cookie-consent.ts    # wp-consent (analítica); test:cookie-consent
      funnel-analytics.ts  # CTA blogs: POST /funnel (start_opened, outbound_click, account_created); test:funnel-analytics
                           # call sites → funnel(); no URLs ni emails. start_opened ANTES del captcha.
      guest-trip-claim.ts  # login de invitado → cuenta existente (`wp-guest-trip-claim`)
      auth-session-persist.ts # remember-me: `wp-session-persist` + applyPersistMode (test:auth-session-persist)
      auth-next.ts         # saneador de `?next=` post-login (test:auth-next)
      auth-google.ts       # SSO Google + flag NEXT_PUBLIC_GOOGLE_AUTH_ENABLED (test:auth-google)
      start-session.ts     # decisión pura de `/start` (open/reuse/create/replace)
      account-security.ts  # confirmación de borrado + validación de contraseña + aviso sharing
      trip-merge.ts        # fusión a 3 bandas OCC (numDays/endDate derivados)
      trip-share.ts        # tope 8, peers, emails (test:trip-share)
      trip-invite-url.ts   # /invite/{token} (test:trip-invite-url)
      share-briefing.ts    # plan recortado para Compartir (sin dinero; test:share-briefing)
      share-targets.ts     # wa.me / t.me / mailto / copiar (test:share-targets)
      share-summary.ts     # POST /share-summary
      ai-transfer-consent.ts # Consentimiento art. 49.1.a: `wp-ai-transfer-consent:{userId}`
                           # para la UI + `profiles.ai_transfer_consent_at/_version` como constancia
      db/                  # trips-repo, assistant-repo, profile-repo
      supabase/            # client, server, middleware helpers
    hooks/                 # use-assistant-chat, use-trip-realtime, use-trip-members,
                           # use-collapsing-header, use-virtual-keyboard, use-mobile, use-toast
```

**Tests:** ficheros `lib/*.test.ts` ejecutados con `tsx` (`npm run test:<nombre>`), no vitest. [`ci.yml`](.github/workflows/ci.yml) ejecuta **todas** las suites del front, una por línea; al añadir una, añádela también al workflow o dejará de ser cierto. El job `backend` corre `pytest` (instala `requirements-dev.txt`).

## Rutas App Router y shell

- **`/`** — Landing ([`app/page.tsx`](frontend/app/page.tsx) + [`components/landing/`](frontend/components/landing/)): hero (h1 + cápsula `LandingStart`: pegar URL / buscar destino / crear cuenta), tres zooms de valor (`ValueProps`: fuentes / plan / oficiales), footer. Server Components salvo `LandingLockup`, `LandingStart` y `LandingNav` (sesión). Indexable. El CTA de blogueros vive en el footer (`/partners`), no en el hero.
- **`/legal/aviso-legal`**, **`/legal/privacidad`**, **`/legal/cookies`** — Copy real, indexables, en `sitemap.ts`. Cromo de la landing de viajeros ([`legal/layout.tsx`](frontend/app/legal/layout.tsx)); `/legal` redirige al aviso. Identidad y proveedores de IA en [`lib/legal.ts`](frontend/lib/legal.ts).
- **`/login`**, **`/signup`**, **`/forgot-password`**, **`/reset-password`**, **`/auth/callback`** — Auth. El formulario de `/signup` está extraído en [`signup-form.tsx`](frontend/components/auth/signup-form.tsx) (variante compacta en el hero). Login y alta: email+contraseña o **Continuar con Google** (`NEXT_PUBLIC_GOOGLE_AUTH_ENABLED`; invitado + Google va por claim, no por `upgradeGuest`). «Recuérdame en este dispositivo» (marcado por defecto) escribe `wp-session-persist` y las `sb-…` persistentes o de sesión. Recuperación: `resetPasswordForEmail` → callback → `/reset-password`. El alta con contraseña es nombre + email + contraseña dos veces.
- **`/account`** — Perfil de viajero (tipos + referencias favoritas). Vive en el mismo shell que `/trips` (header + canvas; el sidebar solo aparece en el detalle del viaje); el grupo `(app)` no cambia la URL.
- **`/account/settings`** — Configuración de cuenta (email de solo lectura, cambio de contraseña, borrar cuenta). Mismo shell. Invitado que entre a mano → `/trips`.
- **`/partners`** — Landing de marketing en negativo ([`app/partners/page.tsx`](frontend/app/partners/page.tsx) + [`components/landing/partners/`](frontend/components/landing/partners/)): misma arquitectura que `/` (hero + 3 zooms + CTA + footer) sobre tinta `hsl(20 8% 11%)`. El generador del botón vive en el hero (`id="empezar"`) y dispara `POST /partners/prewarm`. Indexable. Slugs reservados: `landing`, `wp-landing`, `start`, `admin`. **No** usa `AuthShell`.
- **`/start?source=&ref=&days=`** — CTA de blogs amigos y de los chips del hero. **Cuenta registrada:** el viaje entra en la cuenta; el mismo artículo (`trips.seed_source_key`) abre el existente, no clona. **Invitado:** un solo hueco (el último CTA sustituye al anterior; si había trabajo real, pregunta). `&days=N` (opcional, 1..60) fuerza la duración del borrador; tiene prioridad sobre `total_days` de la extracción. El `ref` es obligatorio para el auto-dimensionado; los chips usan `ref=wp-landing` (reservado, no es un partner). **Rastreable + `noindex, follow`**: Google tiene que leer el meta; no va en `Disallow`.
- **Layout raíz** — Inter, `AuthProvider`, `CookieBanner`, `AnalyticsGate` (Vercel Analytics y Speed Insights solo con consentimiento). **Sin** `TripProvider`. Metadata (`metadataBase`, OG, Twitter) en [`app/layout.tsx`](frontend/app/layout.tsx).
- **Shell de app (`/trips` + `/account`)** — [`app/(app)/layout.tsx`](frontend/app/(app)/layout.tsx) es Server Component (`robots: noindex, nofollow`). El grupo `(app)` no cambia las URLs. Los providers viven en [`trips-shell.tsx`](frontend/components/trips-shell.tsx): `TripProvider` → `RegistrationGateProvider` → `TripChromeProvider` → shell (header, sidebar colapsable **solo en `/trips/[id]`**, main sobre canvas gris). Único sitio de `useTrips()`. Menú de cuenta: **Perfil** (`/account`) y **Configuración** (`/account/settings`); el invitado ve «Guardar mi viaje». En listado y cuenta el menú va en la cabecera; en el detalle desktop, en el pie del sidebar.
- **`/trips`** — Listado Activos/Archivados; empty/loading con spinner mientras `isLoading`.
- **`/trips/[tripId]`** — Desktop: tres paneles alícuota (Fuentes · Viaje · Asistente) con toggles en el header (`wp-trip-panels`); título del viaje en el header. **Móvil: nav inferior de tres secciones** ([`trip-mobile-nav.tsx`](frontend/components/trip-mobile-nav.tsx): Fuentes · Mi viaje · Asistente), con cabecera que se colapsa al hacer scroll ([`use-collapsing-header.ts`](frontend/hooks/use-collapsing-header.ts)) y ajuste al teclado virtual ([`use-virtual-keyboard.ts`](frontend/hooks/use-virtual-keyboard.ts)). Las secciones no se apilan en `absolute inset-0`: la activa va en flujo (la inactiva, `display:none`) porque el scroller es el documento, y su posición la guarda `sectionScrollRef`.

### Panel «Mi viaje»: cinco pestañas, no dos niveles

[`itinerary-view-mode-tabs.tsx`](frontend/components/itinerary-view-mode-tabs.tsx) — **Ruta · Actividades · Alojamientos · Transporte · Básicos** en una sola fila. **Ruta** es el timeline (**Lista · Calendario · Mapa**) y las otras cuatro son la **vista de tareas filtrada por categoría** (`VIEW_MODE_TASK_CATEGORIES`). El presupuesto **no es una sexta pestaña**: el botón vive en la fila de meta (ítems · días · gestionadas) y, al entrar, sustituye la fila de pestañas por «Volver al plan» ([`itinerary-budget-view.tsx`](frontend/components/itinerary-budget-view.tsx)). No existe el nivel «Itinerario | Tareas» que describen planes antiguos. El calendario es vista de lectura (sin fechas: mes fantasma + CTA); el alta y la edición siguen en Lista.

- El botón de alta de cada pestaña crea un **ítem real**: Transporte → [`transport-route-dialog.tsx`](frontend/components/transport-route-dialog.tsx); Alojamientos / Actividades → [`add-manual-item-dialog.tsx`](frontend/components/add-manual-item-dialog.tsx) con el tipo fijado.
- El **`ExtraTask`** (tarea suelta sin día ni lugar) se crea desde **Básicos** o desde **Añadir gasto** en la vista de presupuesto.
- Regla: si lo que se añade tiene sitio y día → `UserDayItem`; si no → `ExtraTask`. No hay una tercera cosa.

## Auth e invitados

- Sesión vía Supabase Auth. Middleware exige sesión (registrada **o anónima**) en `/trips` y `/account`.
- **Invitado:** `signInAnonymously` (hay que activar Anonymous Sign-Ins en el dashboard). Un solo viaje (el último CTA). Al registrarse (`upgradeGuest`) conserva el `user_id`. Cerrar sesión siendo invitado pide confirmación: es irreversible.
- **`RegistrationGate`:** con `user.is_anonymous`, bloquea segunda fuente / nuevo viaje / ir a inicio. Registro con `upgradeGuest` (nombre + email + contraseña dos veces). `linkGuestEmail` solo reenvía la confirmación si el proyecto exige confirmar el correo. **«Ya tengo cuenta»** prepara un claim (`prepare_guest_trip_claim`) y, tras `signIn` a la cuenta existente, `claim_guest_trips` reasigna `trips` / `sources` / `assistant_conversations`. En `/login` el traspaso es una casilla (marcada por defecto). `/signup` no cierra al invitado: ya hace `upgradeGuest`. `/forgot-password` sigue preparando el claim (TTL 30 min). Google desde invitado: `flushPendingSync` + claim **sin** `signOut` previo (si cancela en Google, el sandbox sigue vivo).
- Contrato de `/start`: nadie → sandbox nuevo; invitado → un hueco; cuenta → añade a la cuenta. El viaje de un invitado llega a una cuenta **solo** si se identifica desde el sandbox y lo ve en pantalla.
- Perfil: `profiles` + `favorite_references`; se inyecta en el briefing del asistente y en `preferred_domains` de Tavily.
- **Borrar cuenta:** `delete_own_account()` (RPC `security definer`) borra `auth.users`; el resto del usuario cae por `ON DELETE CASCADE`. Se conservan las cachés globales (`article_extractions`, thumbs, covers, trámites). `usage_events` queda huérfano a propósito. El cliente no puede borrar `auth.users` con la anon key. Invitados: no; siguen el cleanup anónimo.

## Persistencia (modelo documento)

- Tablas `trips` / `sources`: columnas planas + `days`/`basics`/`items`/`budget` en **jsonb camelCase** (contrato de [`types/itinerary.ts`](frontend/types/itinerary.ts)).
- `trips.budget`: techo opcional `{ total, byCategory }`. Va en `TRIP_COLUMNS` / `tripToRow` (no es como `seed_source_key`).
- `trips.seed_source_key`: `sourceMatchKey` del artículo del CTA. Lo escribe solo `/start`, **fuera** de `TRIP_COLUMNS` / `tripToRow` para que el syncer no lo pise.
- `sources.total_days` (= `Source.totalDays`): duración declarada por la guía (`itinerary.total_days`); permite que un viaje de partner adopte los días del artículo.
- [`trip-context.tsx`](frontend/lib/trip-context.tsx): mutaciones **síncronas** sobre `useState`; [`TripsSyncer`](frontend/lib/db/trips-repo.ts) hace upsert/delete por diffing (debounce ~1 s, cola, flush `pagehide`). Viajes compartidos: OCC con `trips.version` + fusión a 3 bandas; Realtime del viaje abierto entra por la misma cola (`ingestRemote`). Fuentes nuevas de Realtime/conflicto: `acknowledgeLoadedSources` **antes** de meterlas en el estado (si no, el persist las upserta con `article_html: ""`).
- Compartir: tablas `trip_members` / `trip_invites`; invitaciones por email (`POST /trips/{id}/invites`) o compañero de `list_share_peers`. El dueño invita; el editor sale con `leave_trip`. El asistente sigue privado por conversación.
- Viajes de partner (`trip.referrer`): al añadir la primera fuente, si el viaje sigue virgen (sin fechas, ≤1 día vacío), se redimensiona a `totalDays` (tope 60), se fija `startDate` = mañana y se renombra con `source.area`. Con `&days=N` el calendario ya viene fijado en `/start` y solo se renombra. Nunca pisa viajes creados por el usuario.
- Extracción de fuente: `startSourceExtraction` (fire-and-forget) → chip pendiente en Fuentes (`pendingSources`); sin modal bloqueante. Tope **5 fuentes/viaje** ([`trip-sources.ts`](frontend/lib/trip-sources.ts)). Quitar una fuente **no** borra ítems/basics ya consolidados en Mi viaje.
- `article_html` se excluye de la carga inicial; `ensureArticleHtml` / `fetchArticleHtml` al abrir Crónica.
- Asistente: [`assistant-repo.ts`](frontend/lib/db/assistant-repo.ts); `activeConversationId` en localStorage por `userId`+`tripId` (se limpia en login/logout explícitos; el histórico permanece en Supabase). Conversaciones caen por `ON DELETE CASCADE` al borrar el viaje.
- Preferencias UI menores (`wp-trips-view`, `wp-trip-panels`, `wp-sidebar-collapsed`, `wp-route-view`, `wp-route-wide`, `wp-calendar-scale`, `wp-map-mode`, `wp-map-places-line`), consentimiento (`wp-consent`, `wp-ai-transfer-consent`), claim de invitado (`wp-guest-trip-claim`), remember-me (`wp-session-persist`) y cachés de thumbs/Mapbox/country-tasks/sugerencias de fuentes (`wp-trip-source-suggest`) en session/local storage / cookies.
- Miniaturas: no van en el payload de `/itinerary` (`thumb_url` null). `InspirationThumbnail` las pide a `GET /thumb` al entrar en viewport. Commons cubre `kind=activity` (el resto de `ItemType`, no un filtro de museos). Places cubre stay/food/transport, Básicos (`basic` → `stay` en [`thumbs.ts`](frontend/lib/thumbs.ts)) y cualquier activity que Commons rechace. Filas Places ya cacheadas se intentan pasar a Commons **al caducar** la URI de 45 min, no en un backfill. PK de `place_thumbs` = `query` (last-write-wins si el mismo sitio llega con otro `kind`). Portadas: `GET /cover` vía [`unsplash.ts`](frontend/lib/unsplash.ts) (claves solo en backend; **sin cuota por usuario**, solo el tope global `photo_paid`).
- Trámites de país (T4.4): pestaña **Básicos** → `GET /country-tasks` (Recomendaciones MAE + Haiku). Sugerencias aceptadas → `ExtraTask` con id `country:{iso}:{slug}`; descartes en `dismissedCountryTasks` (columna propia, **no** en `tasks`).
- Descripción de día por IA: `POST /day-summary`; la firma de ítems (`summarySignature` en `UserDay`) apaga el botón si nada ha cambiado.

## Tareas y dinero

- `trip.tasks` es un mapa **clave → estado**, no id → estado. Las claves las construye **solo** [`taskKeyForItem`](frontend/lib/trip-tasks.ts) y tienen tres espacios de nombres:
  - `leg:outbound` / `leg:return` — tramos de ida y vuelta (aunque se llamen igual, no colisionan);
  - `route:{itemId}` — traslado interno con `route`;
  - `${type}:${normalizeName(name)}` — todo lo demás (un hotel de 3 noches es UNA reserva aunque aparezca 3 veces en la Ruta).
- Ida y vuelta **en avión espejadas** (mismos IATA invertidos) se agregan como **una** tarea con clave `leg:outbound`; el coste de `leg:return` se pliega ahí. `taskKeyForItem` no cambia. La Ruta sigue mostrando dos tarjetas.
- **El dinero vive en un solo sitio**: `trip.tasks[clave].cost`. Ni los ítems ni `route` llevan precio.
- El **techo** opcional vive en `trips.budget` (jsonb: `{ total, byCategory }`). No es un coste y no entra en ningún total. Vacío = `null`.
- Divisa **del viaje** (`trip.currency`, default EUR), nunca por tarea. Coste por persona con `trip.numTravelers`. Cambiar la divisa no convierte importes ni el techo.
- `nights` se deriva hoy de `dayIndexes.length`: un alojamiento añadido a mano se ancla a un día y cuenta **1 noche**. `spanDays` (T4B.2b) está pendiente — ver deuda.

## Tramos, transporte y mapa (Fase 4B)

- **Tramo** = `UserDayItem` de `type: "transport"` con `route?: { from, to, mode?, leg? }` (`RoutePlace` = label + coords `{lng,lat}` + `kind`). `mode` es **opcional a propósito**: el tramo existe antes de decidir el medio, y `task-labels.ts` cambia el verbo («Decidir cómo llegar a…» → «Comprar los vuelos»). Vive en `days` (jsonb): **sin migración**, con lectura defensiva.
- Un solo motor de formulario, [`transport-route-form.tsx`](frontend/components/transport-route-form.tsx), con dos envoltorios: [`route-leg-dialog.tsx`](frontend/components/route-leg-dialog.tsx) (ida/vuelta: propone extremos, puede fijar `trip.origin`) y [`transport-route-dialog.tsx`](frontend/components/transport-route-dialog.tsx) (traslado interno, día editable).
- **Ciclo de vida** en [`route-legs.ts`](frontend/lib/route-legs.ts): `reanchorRouteLegs`, `rescueLegsFromRemovedDays`, `upsertLegInDays`. Borrar el último día **no** pierde la vuelta: se reancla conservando el `id` (y por tanto su coste).
- **Hubs** (aeropuerto/estación) solo tras elegir medio y **por proximidad**, vía `GET /transport-hubs`; radios en `HUB_MAX_DISTANCE_KM` (aeropuerto 200 km, estación 80, bus 50). El ancla de búsqueda es la **ciudad**, no el hub ya elegido.
- **Licencia Mapbox** ([`place-search-guardrails.ts`](frontend/lib/place-search-guardrails.ts)): los candidatos de Search Box son **efímeros** y no se persisten salvo `NEXT_PUBLIC_ALLOW_TRANSPORT_HUB_PERSISTENCE=true`. Lo persistible sale de Geocoding permanente en **dos escalones**: `suggestPlaces` autocompleta contra el dataset temporal (barato, no persistible) y [`resolvePermanentCoords`](frontend/lib/mapbox.ts) resuelve la coordenada definitiva contra `mapbox.places-permanent` al confirmar la selección — una llamada por lugar guardado, no una por tecla. Esa función **nunca falla**: si el permanente está apagado, da error, tarda o devuelve un punto a más de 25 km del elegido, devuelve el mismo objeto `fallback` que recibió, y los llamantes lo detectan por identidad (`coords === s.center`). Kill switch: `TRANSPORT_PLACE_SEARCH_ENABLED` (servidor) / `NEXT_PUBLIC_TRANSPORT_PLACE_SEARCH_ENABLED` (cliente); `NEXT_PUBLIC_MAPBOX_PERMANENT_GEOCODING=false` apaga solo el permanente (**licencia, no ahorro**: el `permanent=true` sobre `mapbox.places` nunca facturó el SKU caro; apagarlo reabre persistir el dataset temporal). Límites por `usage_events` con kinds `place_suggest` y `transport_hub` — que hoy **no se escriben**, porque el proxy no está enchufado.
- **Mapa** ([`itinerary-map-view.tsx`](frontend/components/itinerary-map-view.tsx) + [`map-route-geometry.ts`](frontend/lib/map-route-geometry.ts)): dos modos (`MapViewMode` = `transport` | `places`). Los tramos **no locales** (> `MAP_LOCAL_SEGMENT_MAX_KM`, 3.000 km) y las idas/vueltas que no son coche/bus **no se dibujan**: en su lugar se pintan anclas de llegada/salida (`collectMapGatewayAnchors`), así el encuadre se queda en el destino. Directions (`driving`) solo en subsecuencias por carretera < `PLACES_ROAD_MAX_KM` (300 km); el resto son geodésicas locales sin peticiones. Mapbox **no tiene perfil de tren**. Los km del pie se desglosan por medio (`summarizeTransportKm`).
- **Buscador de vuelos (T4B.3b, Nivel 1):** botón «Buscar vuelos» en tramos con `mode: "flight"` → enlace Skyscanner prerelleno vía Impact [`flight-search.ts`](frontend/lib/flight-search.ts) (`pxf.io/gOnd70?u=`). IATA desde tabla OurAirports + áreas metro ([`airports.ts`](frontend/lib/airports.ts)); regenerar con `node scripts/generate-airports.mjs`. **Prohibido** API de precios. `FLIGHT_SEARCH_AFFILIATE_ID` vacío (no cobramos comisión; el badge no se enciende); nunca tocar `affiliateUrl` de fuentes. No editar [`airports-data.ts`](frontend/lib/airports-data.ts) a mano. El diálogo de ida no siembra Destino con el nombre del viaje.
- **Fechas en Booking:** en Ruta y Tareas, si el `affiliateUrl` es de Booking y el viaje tiene fechas, [`booking-dates.ts`](frontend/lib/booking-dates.ts) añade `checkin`/`checkout` al href. El jsonb no se muta; el `aid` del bloguero se conserva. Fuentes y hosts que no son Booking se dejan igual.
- **Booking del asistente:** un `stay` vía asistente (no consolidado de fuente) lleva búsqueda prerellenada en Booking (`aid=1607597`) vía [`booking-search.ts`](frontend/lib/booking-search.ts). El `ss` es nombre ± región; fechas, viajeros y divisa se añaden al pintar. **Nunca** sustituye el `affiliateUrl` de una fuente. Sin badge «afiliado» en la UI.

## Archivos críticos

- [`frontend/types/itinerary.ts`](frontend/types/itinerary.ts) — Dominio; `Trip.referrer` para CTAs; `Source.totalDays`.
- [`frontend/lib/trip-context.tsx`](frontend/lib/trip-context.tsx) — Mutaciones + `isLoading` + sync Supabase; `startSourceExtraction` / `pendingSources`; adopción de calendario de partner.
- [`frontend/lib/trip-sources.ts`](frontend/lib/trip-sources.ts) — `MAX_SOURCES_PER_TRIP` / `canAddSource`.
- [`frontend/lib/partner-trip.ts`](frontend/lib/partner-trip.ts) — `draftTripNameFor` / `parseDaysParam` / `LANDING_REF` / `isReusableDraftTrip` (CTA `/start`).
- [`frontend/lib/partner-button.ts`](frontend/lib/partner-button.ts) / [`partners-api.ts`](frontend/lib/partners-api.ts) — kit `/partners`: URL limpia, snippet HTML, prewarm SSE.
- [`frontend/components/partners/partner-button-builder.tsx`](frontend/components/partners/partner-button-builder.tsx).
- [`frontend/lib/db/trips-repo.ts`](frontend/lib/db/trips-repo.ts) / [`assistant-repo.ts`](frontend/lib/db/assistant-repo.ts) / [`profile-repo.ts`](frontend/lib/db/profile-repo.ts).
- [`frontend/lib/auth-context.tsx`](frontend/lib/auth-context.tsx) — login, signup, upgradeGuest, linkGuestEmail, signInAnonymously, requestPasswordReset, updatePassword, deleteAccount.
- [`frontend/lib/auth-session-persist.ts`](frontend/lib/auth-session-persist.ts) / [`auth-next.ts`](frontend/lib/auth-next.ts) / [`auth-google.ts`](frontend/lib/auth-google.ts) — remember-me, destino `?next=` y SSO Google.
- [`frontend/lib/guest-trip-claim.ts`](frontend/lib/guest-trip-claim.ts) — stash + RPC para llevar el viaje del invitado a una cuenta existente.
- [`frontend/lib/start-session.ts`](frontend/lib/start-session.ts) — decisión pura de `/start` (open / reuse / create / replace).
- [`frontend/lib/account-security.ts`](frontend/lib/account-security.ts) — confirmación de borrado (`displayNameFor`) y validación de contraseña.
- [`frontend/components/auth/registration-gate.tsx`](frontend/components/auth/registration-gate.tsx).
- [`frontend/lib/api.ts`](frontend/lib/api.ts) / [`assistant-api.ts`](frontend/lib/assistant-api.ts) / [`api-auth.ts`](frontend/lib/api-auth.ts) / [`thumbs.ts`](frontend/lib/thumbs.ts) / [`unsplash.ts`](frontend/lib/unsplash.ts) / [`country-tasks.ts`](frontend/lib/country-tasks.ts) — Bearer del access token; thumbs, covers y trámites.
- [`frontend/lib/trip-tasks.ts`](frontend/lib/trip-tasks.ts) — Claves de tarea y agregación; única fuente de `taskKeyForItem`.
- [`frontend/lib/trip-budget.ts`](frontend/lib/trip-budget.ts) — Techo, veredicto, cobertura y cuenta (puro).
- [`frontend/components/itinerary-budget-view.tsx`](frontend/components/itinerary-budget-view.tsx) / [`cost-input.tsx`](frontend/components/cost-input.tsx) — Superficie de presupuesto y input de importe.
- [`frontend/lib/route-legs.ts`](frontend/lib/route-legs.ts) / [`transport-routes.ts`](frontend/lib/transport-routes.ts) / [`transport-hubs.ts`](frontend/lib/transport-hubs.ts) — Tramos de ida/vuelta y traslados.
- [`frontend/lib/mapbox.ts`](frontend/lib/mapbox.ts) / [`place-search-guardrails.ts`](frontend/lib/place-search-guardrails.ts) / [`map-route-geometry.ts`](frontend/lib/map-route-geometry.ts) — Búsqueda de lugares, licencia y geometría del mapa.
- [`frontend/lib/item-provenance.ts`](frontend/lib/item-provenance.ts) — `MANUAL_SOURCE_ID` / `ASSISTANT_SOURCE_ID`; **única** ruta de atribución.
- [`backend/auth.py`](backend/auth.py), [`partners.py`](backend/partners.py), [`instagram.py`](backend/instagram.py), [`instagram_ocr.py`](backend/instagram_ocr.py), [`source_suggest.py`](backend/source_suggest.py), [`extraction_cache.py`](backend/extraction_cache.py), [`place_thumbs.py`](backend/place_thumbs.py), [`wikimedia_thumbs.py`](backend/wikimedia_thumbs.py), [`covers.py`](backend/covers.py), [`place_search.py`](backend/place_search.py), [`day_summary.py`](backend/day_summary.py), [`share_summary.py`](backend/share_summary.py), [`usage.py`](backend/usage.py), [`funnel.py`](backend/funnel.py), [`travel_briefs.py`](backend/travel_briefs.py), [`country_tasks.py`](backend/country_tasks.py), [`assistant.py`](backend/assistant.py), [`web_search.py`](backend/web_search.py).
- Migraciones en [`supabase/migrations/`](supabase/migrations/) (`article_extractions`, `place_thumbs`, `destination_covers`, `country_task_suggestions`: solo service_role).

## Modelo de datos

**Extracción (backend):** `Itinerary` snake_case + `og_image` / `og_title` / `article_html`; `thumb_url` siempre null en la respuesta (lazy en el front). `og_title` lo inyecta [`article_fetch.py`](backend/article_fetch.py), no el LLM, y es el título de la `Source` (con fallback a la URL y a `destino — N días`).

**`UserDayItem`:** `coords?: {lng,lat}` resueltas al elegir candidato; `route?: TransportRoute` en transportes (ver Fase 4B); `sourceRouteHint?` = `from`/`to`/`mode` en texto que trae la extracción y solo precarga el formulario. `sourceId` puede ser un centinela (`"manual"` / `"assistant"`), nunca `null`.

**`Trip` (app):** metadatos, `countries`, fechas opcionales (`startDate` / `endDate`), `numDays` (= `days.length`), `expectations`, `cover`/`coverUrl`, `archived`, `sourceIds`, `days`, `basics`, `tasks`, `extraTasks`, `dismissedCountryTasks`, `numTravelers`, `currency`, `origin` (`TripOrigin | null`: label + coords `{lng,lat}` + countryCode), `budget` (`TripBudget | null`: techo global + por grupo), `referrer?`. Con `startDate`, `endDate` = inicio + `numDays` − 1 (calendario inclusive; p. ej. 14 sept + 7 días → 20 sept). Sin inicio, no hay fechas en cabeceras de día. Normalización en lectura en `rowToTrip` para legacy desacoplado.

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
- **Quién scrollea en `/trips`:** en **móvil el scroller es el documento**; en desktop, el shell es una caja fija (`md:h-screen md:overflow-hidden`) y scrollean contenedores anidados. Safari y Chrome atan el colapso de su barra de direcciones **solo al root scroller**, así que un `overflow` anidado que se coma el gesto deja la barra clavada. Todo el overflow del camino va tras `md:`, `AppHeader` y las cabeceras de panel van `sticky` (0 y `--wp-header-height`), y el dock va `fixed`. Cada panel agrupa su cromo en **un solo bloque sticky** (Fuentes: título + chips replegables + pestañas + buscador; Mi viaje: cabecera + barra Lista/Calendario/Mapa): al replegarse la parte de arriba el bloque encoge y el resto sube solo. Encadenar `top` entre varios sticky de altura variable no se sostiene. Única excepción en caja fija: el **Asistente** (chat con composer anclado; congela el documento con `data-wp-scroll-lock`). Mapa y Calendario **no** acotan el panel: llevan su propio `max-md:h-[70svh]`.
- **Coordenadas:** siempre objeto `{ lng, lat }`, nunca tupla (es la forma del jsonb y de `LngLat`).
- **Coste de una mutación:** en `/trips/[tripId]` los **tres paneles están montados a la vez** (los cerrados solo se ocultan con `content-visibility`). Cualquier consumidor de `useTrips()` se re-renderiza en **cada** mutación del viaje, aunque no se vea. Un trabajo caro en el asistente lo pagas al mover un ítem en la Ruta.
- **Arrays derivados del contexto:** `getTripSources(tripId)` construye un array nuevo en cada llamada. Si va a alimentar un `useMemo` o una prop de un `memo()`, pásalo por [`useStableList`](frontend/hooks/use-stable-list.ts) o el memo no servirá de nada.

## Preguntas abiertas / deuda

- Multi-pestaña (incluido el mismo usuario en dos pestañas): el **viaje abierto** está cubierto — `trips.version` + OCC + fusión a 3 bandas + Realtime filtrado por `id` —, sea compartido o no. El listado `/trips` no tiene Realtime: renombrar o archivar desde dos pestañas a la vez sigue siendo last-write-wins.
- Normalizar jsonb a tablas hijas solo si hace falta colaboración/queries.
- ~~`REQUIRE_AUTH=true` en producción~~ **resuelto y verificado el 26 ago 2026**: el secret está puesto en Fly desde el 2 de agosto y `GET /thumb` sin `Authorization` responde **401** en `api.wanderplanner.ai`. Lo comprueba `./scripts/smoke.sh` en cada deploy. En local sigue en `false` a propósito ([`AGENTS.md`](AGENTS.md)).
- Metering de uso de Places/Unsplash (T1.2) antes de producción: el cinturón `MAX_PHOTO_LOOKUPS_DAY` es durable (`usage_events.kind=photo_paid`, fail-closed, memo ~60 s). **`/cover` no tiene cuota por usuario** (`enforce_usage` / `record_event` de `photo_lookup`): Unsplash solo cuenta contra el tope global. No meter `USER_MAX_*` en portadas sin decidir el producto — un 429 en `/cover` deja el listado de viajes sin foto.
- **`place_thumbs.kind` no está en la PK.** `single_flight` sí lleva `kind` (`thumb:{kind}:{query}`). La fila sigue siendo last-write-wins por `query`; partir la clave duplicaría getMedia.
- Límites por usuario (`usage_events`): `cleanup_usage_events()` está programada a las 04:15 UTC y **corre** (comprobado 18 ago 2026). `cleanup_funnel_events()` va a las 04:30 UTC (migración `funnel_events`).
- **`spanDays` pendiente (T4B.2b):** un alojamiento o transporte añadido a mano cuenta 1 noche / 1 día, y el coste por noche de la fila miente. Es lo siguiente de la Fase 4B.
- **Coste de Mapbox sin verificar:** falta comparar las peticiones a Directions de un viaje sin tramos antes/después del mapa nuevo; `place_suggest` / `transport_hub` no están en el presupuesto mensual.
- **Proxy de Mapbox sin enchufar:** [`place_search.py`](backend/place_search.py) (`/places/suggest`, `/transport-hubs`) está escrito y nadie lo llama — el front va directo a `api.mapbox.com` con `NEXT_PUBLIC_MAPBOX_TOKEN`. Consecuencias: el token viaja en el bundle (defensa: restricción por URL del token, que es lo único que hay), y los kinds `place_suggest` / `transport_hub` de `usage_events` nunca se escriben, así que el gasto va sin medir. Enrutar `suggestPlaces` / `searchTransportHubs` por el proxy cierra las dos cosas; los tiles de `mapbox-gl` y Directions seguirán yendo directos igualmente, así que el token público no desaparece del navegador.
- **Primera llamada a `resolveTripCountryCodes` (~460 ms):** ahí se compilan de golpe los ~400 patrones de [`countries.ts`](frontend/lib/countries.ts). Ocurre una vez por carga, en el primer render del asistente. Se quitaría indexando los países por su primera palabra para probar solo candidatos plausibles; ojo con los nombres con guion (`guinea-bissau`).
- Placeholders: descargar; landing definitiva.

## Reglas que no se rompen

- ❌ **No uses `useTrips()`** fuera del shell de [`trips-shell.tsx`](frontend/components/trips-shell.tsx). El `TripProvider` se monta desde [`app/(app)/layout.tsx`](frontend/app/(app)/layout.tsx) (`/trips` y `/account`).
- ❌ **No pongas `/start` en `Disallow` de `robots.txt`.** Es el CTA de los blogs: tiene que ser rastreable para que Google lea el `noindex, follow`. `/trips` y `/account` sí van en `Disallow`. `/` y `/partners` se indexan. `Disallow` + `noindex` sobre la misma URL se anulan.
- ❌ **No amplíes `ItemType` / `BasicCategory` / `TaskGroupCategory`** sin alinear [`item-styles.ts`](frontend/lib/item-styles.ts) (`ITEM_TYPE_ICONS`, `BASIC_ICONS`, `TASK_CATEGORY_ICONS`).
- ❌ **No alteres el contrato JSON de extracción** en un solo sitio.
- ❌ **No coercees un itinerario de Instagram con `media.caption`.** El detector es `InstagramText` (`instagram_llm_text`); si vuelves a `media.caption`, la revalidación aplana un Caso A que el OCR había estructurado. El hash es `sha256(IG_PIPELINE_VERSION + caption)` — calculable **sin** OCR. `/partners/prewarm` rechaza URLs de Instagram.
- ❌ **No mutes a mano** `trip.days[…].items` → solo `moveItemBetweenDays`.
- ❌ **No expongas `SUPABASE_SERVICE_ROLE_KEY`** al frontend.
- ❌ **No hay OTP ni magic link en el producto; no lo reintroduzcas** — ni para convertir invitados ni para entrar. La recuperación es `resetPasswordForEmail` → `/reset-password`. Entrar en una cuenta ya existente desde invitado va por `prepare_guest_trip_claim` / `claim_guest_trips`. Google desde invitado también: claim, **no** `upgradeGuest` (OAuth crea otro `user_id`).
- ❌ **No llames a `turnstile.ready()`.** Su primera línea es `g.scriptWasLoadedAsync && (warn(...), throw(...))`: si `api.js` se cargó con async/defer **lanza siempre**, y un `<script>` inyectado desde JS es async por definición. Al llamarla dentro de un `setTimeout` la excepción escapaba de la promesa, `waitForTurnstileApi` no resolvía nunca y a los 8 s salía «El captcha no terminó a tiempo» sobre un hueco vacío — con login, alta, recuperación, `/start`, invitado, ajustes de cuenta, landing y partners caídos a la vez. La vía soportada con async es el parámetro `onload=` de `api.js` (más sondeo de `window.turnstile.render` como red). Por eso `ready` **no** está en el tipo `TurnstileApi` de [`turnstile.tsx`](frontend/components/auth/turnstile.tsx): que no compile es la defensa. Lo fija [`turnstile.test.ts`](frontend/components/auth/turnstile.test.ts), cuyo doble de `api.js` lanza igual que el real.
- ❌ **No escribas las cookies `sb-…` sin pasar por `applyPersistMode`**, y no le quites el `maxAge: 0` a un borrado — ahí `signOut` deja de cerrar sesión en silencio. `@supabase/ssr` pisa `cookieOptions.maxAge`; el único punto es nuestro `setAll`.
- ❌ **No conviertas una sesión registrada en invitada en `/start`.** Si `getSession()` tiene cuenta, se usa tal cual; un error de red no abre sandbox. Validar con `getUser()` solo sesiones anónimas (la limpieza puede haber borrado la fila).
- ❌ **No metas `seed_source_key` en `TRIP_COLUMNS` ni en `tripToRow`.** El upsert del syncer la pisaría con `null`. Solo la escriben `insertDraftTrip` / `reuseOrInsertDraftTrip` desde `/start`.
- ❌ **No cierres la sesión de invitado en `/signup`.** El formulario ya ramifica a `upgradeGuest` y conserva el `user_id`.
- ❌ **No reasignes `user_id` desde el cliente** → RLS lo bloquea. El único camino es [`guest-trip-claim.ts`](frontend/lib/guest-trip-claim.ts) + [`20260816180000_guest_trip_claim.sql`](supabase/migrations/20260816180000_guest_trip_claim.sql).
- ❌ **No filtres al dueño si el email ya tiene cuenta.** La respuesta de `POST /trips/{id}/invites` y el estado «Pendiente» son idénticos exista o no. Añadir a un compañero de `list_share_peers` sí entra directo.
- ❌ **No adelantes `version` en el baseline del syncer sin el documento del que salió.** `savedTrips` guarda dos cosas acopladas: qué contenía la fila y en qué versión estaba. Si el número avanza y el documento no, el siguiente `UPDATE … WHERE version = N` acierta con un documento viejo y **pisa lo que escribió la otra persona, en silencio**. Así se perdían ítems: Realtime inyectaba `version` sin `days`/`tasks` y un `Math.max` lo subía al baseline. La rama de «nada cambió» de `persist` pasa por [`keepSavedVersion`](frontend/lib/db/trips-repo.ts) — que fuerza `saved.version` y **no** hereda `trip.version` — y el baseline solo avanza por una escritura con éxito o por `acknowledgeTrip(remote)` tras leer la fila entera. El `trip.version` del estado de React va retrasado a propósito (`persistTrip` devuelve la versión nueva al syncer, no a `setTrips`): por eso el skip del eco de Realtime compara contra `savedTrip(id)`, nunca contra el estado.
- ❌ **No metas fuentes en el estado sin `acknowledgeLoadedSources`.** Una `Source` que llega al estado sin registrarse en `savedSources` + `deferredHtml` entra en el siguiente persist como alta, y como `SOURCE_COLUMNS` no trae `article_html` la fila viaja con `article_html: ""`: **borra el artículo para todos los miembros** y devuelve `items`/`basics` a la versión sin hidratar. Vale para `ingestRemote` y para cualquier carga perezosa futura; el modelo es `reset()` / `acknowledgeSource`.
- ❌ **No quites `user_id` de `SOURCE_COLUMNS`.** Sin él, `Source.ownerId` es `undefined` en todo lo cargado y el guardia `ownedRemovedSources` del persist deja de proteger: el cliente de un editor intenta `DELETE` sobre filas del dueño y lo único que lo para es la política `source_is_orphan`.
- ❌ **No vuelvas a leer `public.sources` dentro del `WITH CHECK` de `sources`.** Postgres lo trata como política recursiva (`42P17 infinite recursion detected in policy`) y **todo** `PATCH`/upsert de fuentes revienta con un 500. Congelar `user_id` es trabajo de un trigger, no del `WITH CHECK` ([`20260824160000_fix_sources_rls_recursion.sql`](supabase/migrations/20260824160000_fix_sources_rls_recursion.sql)).
- ❌ **No hagas incondicional el freeze de `protect_source_owner_fields`,** ni repares dueños con el trigger puesto. Los triggers también corren dentro de un `security definer`: congelar siempre deja `claim_guest_trips` sin mover `sources`, y a los ~30 días el cleanup de anónimos se lleva los artículos del viaje ya reclamado. El freeze cede solo si el dueño saliente es anónimo, el nuevo es `auth.uid()` y el llamante no es editor de un viaje que referencia esa fuente; las reparaciones van entre `disable trigger` / `enable trigger` porque en una migración `auth.uid()` es `null` ([`20260824170000_fix_source_owner_claim.sql`](supabase/migrations/20260824170000_fix_source_owner_claim.sql)).
- ❌ **No suscribas `sources` a Realtime, ni ningún `postgres_changes` sin `filter`.** Los eventos DELETE **no** pasan por RLS: una suscripción abierta a `trips` reparte ids de filas borradas de cualquiera, y `sources` no se puede filtrar por viaje. Las fuentes nuevas se detectan por el diff de `source_ids` y se piden por id.
- ❌ **No cambies la aridad de una función SQL sin `drop function` explícito.** `create or replace` con otra firma crea un **overload**, no reemplaza: la llamada queda ambigua y PostgREST puede resolver a la vieja. Ya pasó con [`cleanup_anonymous_users`](supabase/migrations/20260818130000_cleanup_anonymous_users_v2.sql) y con `list_share_peers` al añadirle `p_trip_id`.
- ❌ **No pongas `force row level security` en `trips` / `sources` / `assistant_conversations`** sin revisar esas funciones: el `security definer` deja de funcionar en silencio.
- ❌ **No pidas portada Unsplash en `createTrip`** → `applyCoverFromSource`.
- ❌ **No expongas claves de imágenes** (`GOOGLE_PLACES_API_KEY`, `UNSPLASH_ACCESS_KEY`) al frontend / `NEXT_PUBLIC_*`.
- ❌ **No mezcles conversaciones del asistente entre viajes**.
- ❌ **No muestres «Añadir fuente» en citas del chat** (taquillas, museos, ministerios, OTAs). El botón no va en el markdown: indexar un artículo es `propose_add_source` o el panel Fuentes. Heurística en [`inspirational-source.ts`](frontend/lib/inspirational-source.ts).
- ❌ **No reintroduzcas el breadcrumb en móvil** ni el nav inferior en desktop.
- ❌ **No quites el margen sordo (`SETTLE_MS`) de [`use-collapsing-header.ts`](frontend/hooks/use-collapsing-header.ts).** En móvil la cabecera va dentro del scroller que escucha: replegarla acorta el documento, eso genera más eventos de scroll y el hook los lee como gesto. Sin margen la realimentación no converge (simulada: 400+ cambios de estado en un solo gesto; con margen, 2). Lo mismo vale para cualquier `ResizeObserver` sobre `documentElement`: coalesce a un frame.
- ❌ **No acotes un panel de `/trips` con `overflow-hidden` en móvil teniendo cabecera sticky dentro.** El panel pasa a ser el scrollport del sticky y su `top` empuja la cabecera hacia abajo, tapando la barra que hay debajo (así se perdía Lista/Calendario/Mapa y no había forma de salir de Calendario ni de Mapa). Lo que necesite caja propia se la pone él (`max-md:h-[70svh]`), no el panel.
- ❌ **No pongas `overflow` ni alto de viewport sin `md:` en el camino de `/trips`** (shell, `main`, escenario móvil, paneles, listas). Cualquier scroller anidado en móvil devuelve la barra de direcciones del navegador a fija: solo colapsa con el root scroller. Ojo con `overflow-x-hidden` suelto — con un eje en `hidden` el otro computa a `auto` y crea contenedor de scroll igual.
- ❌ **No virtualices contra un contenedor en móvil** → `WindowVirtualSourceRows` (scroller de ventana + `scrollMargin`) en [`inspiration-panel.tsx`](frontend/components/inspiration-panel.tsx). Con `useVirtualizer` sobre un div que ya no scrollea, la lista de Ruta se queda congelada en la primera ventana. Y **no le quites `useFlushSync: false`**: `useWindowVirtualizer` fija el scroller ya en el primer render, monta filas dentro del commit inicial y corrige el alto medido con `flushSync` desde la fase de commit — React lo rechaza al entrar en Ruta.
- ❌ **No reintroduzcas el asistente overlay/FAB** en desktop ni paneles redimensionables en el detalle.
- ❌ **No compongas claves de tarea a mano** ni las renombres → `taskKeyForItem` / `taskKeyForBasic`. Cambiarlas huérfana los costes ya guardados en `trip.tasks`.
- ❌ **No guardes precios en el ítem ni en `route`** → `trip.tasks[clave].cost`.
- ❌ **No dupliques la agrupación por categoría** ni la lista de «las seis» → `taskGroupKey` / `TASK_CATEGORY_ORDER` / `groupTasksByCategory`.
- ❌ **No inventes precios para completar la cobertura** del presupuesto ni uses APIs de precios. El hueco es la honestidad del cálculo.
- ❌ **No persistas candidatos efímeros de Search Box** (hubs) sin pasar por [`place-search-guardrails.ts`](frontend/lib/place-search-guardrails.ts): es una cuestión de licencia de Mapbox, no de estilo.
- ❌ **No pidas geocoding permanente con `permanent=true` sobre `mapbox.places`.** En v5 el permanente es un **endpoint distinto** (`mapbox.places-permanent`), no un parámetro, y `mapbox.places` **ignora en silencio** lo que no conoce: responde 200 igual con un parámetro inventado. Así estuvo el flag `NEXT_PUBLIC_MAPBOX_PERMANENT_GEOCODING` sin hacer nada mientras `toPersistableRoutePlace` etiquetaba como `permanent-geocode` coordenadas del dataset temporal. Si tocas la URL, el test [`mapbox-permanent.test.ts`](frontend/lib/mapbox-permanent.test.ts) comprueba el dataset.
- ❌ **No pidas Directions para vuelos, trenes ni tramos largos** → geodésica/línea propia; Mapbox no tiene perfil `rail`.
- ❌ **No inventes otra ruta de atribución** → [`item-provenance.ts`](frontend/lib/item-provenance.ts): un ítem propio nunca lleva la firma de un bloguero.
- ❌ **No compiles regex dentro de un bucle sobre la tabla de países** → `hasWordBoundaryMatch` cachea el patrón por nombre. Inlinearlo otra vez devuelve `resolveTripCountryCodes` a ~460 ms **por llamada**, y se llama en cada render del asistente.
- ❌ **No optimices rendimiento sin medir antes.** Los tres paneles montados hacen que el coste percibido casi nunca esté donde parece: dos rondas de optimización sobre la Ruta (que renderiza en 18 ms) no movieron la aguja porque el segundo entero estaba en el asistente cerrado.
- ❌ **No implementes búsqueda de vuelos con API / precios** → el buscador es Nivel 1 (enlace Skyscanner vía Impact). `FLIGHT_SEARCH_AFFILIATE_ID` vacío (no cobramos comisión); no toques `affiliateUrl` de fuentes. La tabla IATA se genera con `scripts/generate-airports.mjs`, no se edita `airports-data.ts` a mano.
- ❌ **No maquetes el snippet de partners con estilos «normales» ni en varias líneas.** El embed se renderiza en casa ajena ([`partner-button.ts`](frontend/lib/partner-button.ts)): va **en una sola línea** (`wpautop` convierte los saltos del contenido en `<br />`), con **`!important` en cada declaración** (los temas traen reglas `!important` sobre los enlaces del contenido) y **sin depender del `style` de ningún `span` anidado** — el salto de línea es un `<br>` y el énfasis un `<strong>`, porque un editor visual borra esos `style` y el texto sale pegado («ayudapara»). Cada contenedor de texto fija su `font-size`, o el strut de la línea lo hereda del blog. Y lo que el `<style>` tenga que pisar (hover, apilado móvil) va **sin `!important` en el inline y con `!important` en la regla**: un inline normal ya gana a la hoja de estilo, y un inline `!important` gana incluso a la nuestra. El marrón del embed es `BRAND_INK` (tinta del lockup), **nunca `BRAND_COLOR`**, que está documentado como no apto para texto. El texto del banner lo edita el bloguero: `splitBannerCopy` es la **única** descomposición en líneas y negrita, y la consumen tanto el HTML como la vista previa JSX — si divergen, el bloguero copia algo que no ha visto. El `href` escapa `&` a `&amp;` (si queda crudo, un editor se come `target=`/`rel=` dentro de `?ref=`). En `/start` el `ref` no se guarda crudo: [`parseRefParam`](frontend/lib/partner-trip.ts). Todo esto lo fija [`partner-button.test.ts`](frontend/lib/partner-button.test.ts).
- ❌ **No persistas `checkin`/`checkout` en `affiliateUrl`.** Las fechas de Booking se calculan al pintar el href ([`booking-dates.ts`](frontend/lib/booking-dates.ts)); el `aid` del bloguero no se sustituye. El Booking del asistente ([`booking-search.ts`](frontend/lib/booking-search.ts)) tampoco persiste fechas ni viajeros; no uses su `aid` en ítems de fuente.
- ❌ **El uso in-app de sugerencias de fuentes no consume la cuota Tavily de la landing** → `GET /sources/suggest?scope=trip` con JWT (`trip_source_search`); sin JWT válido cae a `landing`. Tope IP en ambos scopes. Caché de respuesta TTL (`SOURCE_SUGGEST_RESPONSE_TTL_SEC`, default 6 h); `fresh=true` solo en «Buscar más».
- ❌ **No escribas en `/legal/*` nada que el código no haga.** La política describe el producto real: `usage_events` no guarda IPs, `funnel_events` guarda `name`/`ref`/`post_slug`/`meta` (sin URL completa, sin email, sin user_id; purga 90 días), Vercel Analytics y Speed Insights no ponen cookies, el fetcher no consulta `robots.txt`, `FLIGHT_SEARCH_AFFILIATE_ID` está vacío y el Booking del asistente sí usa `BOOKING_AFFILIATE_AID`.
- ❌ **Los eventos del CTA de blogs van por `funnel()`, no por `track()`.** Ni URLs completas ni emails. `start_opened` se dispara **antes** del captcha de `/start`; si lo cuelgas de `start()` dejas de medir el abandono. Los `track()` del hero (`landing_start_*`) son otra cosa y se quedan.
- ❌ **No nombres un modelo ni un proveedor de IA en la prosa legal.** El art. 13.1.e permite hablar por «categorías de destinatarios», y así el copy no caduca al rotar de modelo; los nombres se facilitan por correo. Lo que **sí** es obligatorio decir es el **país** y la **garantía**, escritos a mano en `#terceros` de [`/legal/privacidad`](frontend/app/legal/privacidad/page.tsx). Cambiar de proveedor a uno de un país nuevo obliga a repasar ese párrafo, el texto de [`ai-transfer-gate.tsx`](frontend/components/ai-transfer-gate.tsx) y a **subir `AI_TRANSFER_CONSENT_VERSION`**: un consentimiento informado solo cubre lo que el usuario llegó a leer.
- ❌ **No metas dinero en el resumen de Compartir.** Ni costes, ni techo, ni divisa, ni viajeros. La defensa no es un filtro de salida: `buildSharePlan` no lo envía, y el test lo fija.
- ❌ **No reutilices `buildTripBriefing` para compartir.** Lleva costes, estados de reserva, afiliados, coordenadas e HTML de artículos.
- ❌ **No excluyas `share_card` de `bump_trip_version()`.** Ahorra un refetch y reabre la pérdida silenciosa entre coeditores.
- ❌ **No calcules `sharePlanSignature` en `AppHeader`.** Consume `useTrips()` y se re-renderiza en cada mutación del viaje.
- ❌ **No regeneres el resumen de Compartir en silencio.** Si el plan cambia, enseña «Regenerar»; no pises `share_card.text` (puede llevar letra del usuario). Editar solo persiste con «Guardar». «Regenerar» es la única vía que descarta esos cambios.
- ❌ **No quites el aviso de una línea de la hoja de Compartir.** Es lo que informa del uso nuevo sin subir `AI_TRANSFER_CONSENT_VERSION`.
- ❌ **No fijes la longitud del resumen en el prompt.** Sale de `share_length_target(num_days)` en el backend, con test en las fronteras.
- ❌ **No dejes markdown en la salida del resumen.** El texto acaba en WhatsApp, Telegram y correo; solo uno entiende énfasis, y con otra sintaxis.
- ❌ **No llames a `navigator.share()` después de un `await`.** Fuera del gesto del usuario, iOS lo rechaza.
- ❌ **No des por hecho que `require_user` te protege sin mirar `REQUIRE_AUTH`.** Con la bandera en `false` devuelve `None` sin token y `enforce_usage` **no aplica ningún límite**: un endpoint de IA nuevo queda abierto y gratis para cualquiera. En **producción está en `true`** (verificado el 26 ago 2026: 401 sin Bearer), así que ahí sí protege; en local y en cualquier entorno con `REQUIRE_AUTH=false` **no**, y por eso el límite nunca se prueba donde se escribe el código. Si añades un endpoint de IA, comprueba su 401 en `scripts/smoke.sh`, que es el único sitio donde esto se verifica de verdad.

## Dependencias críticas

| Tocas | Revisa |
| --- | --- |
| Esquema SQL / RLS | [`supabase/migrations/`](supabase/migrations/), [`supabase/README.md`](supabase/README.md) |
| [`types/itinerary.ts`](frontend/types/itinerary.ts) | prompt itinerario, `itinerary-utils`, `main.py`, forma de jsonb |
| `trip-context` / sync | [`trips-repo.ts`](frontend/lib/db/trips-repo.ts), consumidores `useTrips()`, [`trip-dates.ts`](frontend/lib/trip-dates.ts) |
| Auth / invitados | [`auth-context.tsx`](frontend/lib/auth-context.tsx), `RegistrationGate`, `/start`, [`start-session.ts`](frontend/lib/start-session.ts), [`guest-trip-claim.ts`](frontend/lib/guest-trip-claim.ts), [`auth-session-persist.ts`](frontend/lib/auth-session-persist.ts), [`auth-next.ts`](frontend/lib/auth-next.ts), [`auth-google.ts`](frontend/lib/auth-google.ts), [`20260816180000_guest_trip_claim.sql`](supabase/migrations/20260816180000_guest_trip_claim.sql), [`20260818120000_trip_seed_source_key.sql`](supabase/migrations/20260818120000_trip_seed_source_key.sql), [`20260818130000_cleanup_anonymous_users_v2.sql`](supabase/migrations/20260818130000_cleanup_anonymous_users_v2.sql), [`20260821120000_google_display_name.sql`](supabase/migrations/20260821120000_google_display_name.sql), [`account-security.ts`](frontend/lib/account-security.ts), [`20260817190000_delete_own_account.sql`](supabase/migrations/20260817190000_delete_own_account.sql) |
| Asistente | [`use-assistant-chat.ts`](frontend/hooks/use-assistant-chat.ts), [`assistant-dock.tsx`](frontend/components/assistant-dock.tsx), [`assistant-actions.ts`](frontend/lib/assistant-actions.ts), [`assistant-repo.ts`](frontend/lib/db/assistant-repo.ts), [`assistant.py`](backend/assistant.py), [`travel_assistant.md`](backend/agents/travel_assistant.md), perfil. Propuestas: `propose_add_item` / `propose_add_source` / `propose_move_item` (esta última confirma vía `moveItemBetweenDays`). |
| Compartir / invitaciones | [`trip_share.py`](backend/trip_share.py), [`emails.py`](backend/emails.py), [`invite-trip-button.tsx`](frontend/components/invite-trip-button.tsx), [`app-header.tsx`](frontend/components/app-header.tsx), [`invite-trip-dialog.tsx`](frontend/components/invite-trip-dialog.tsx), [`invite-accept.tsx`](frontend/components/invite-accept.tsx), [`use-trip-members.ts`](frontend/hooks/use-trip-members.ts), [`20260824120000_trip_sharing.sql`](supabase/migrations/20260824120000_trip_sharing.sql) + `…170000`, `RESEND_API_KEY` |
| Compartir la ruta | [`share_summary.py`](backend/share_summary.py), [`share_summary.md`](backend/agents/share_summary.md), [`share-route-button.tsx`](frontend/components/share-route-button.tsx), [`share-route-dialog.tsx`](frontend/components/share-route-dialog.tsx), [`share-briefing.ts`](frontend/lib/share-briefing.ts), [`share-targets.ts`](frontend/lib/share-targets.ts), [`share-summary.ts`](frontend/lib/share-summary.ts), `trips.share_card`, kind `share_summary` |
| Fusión OCC | [`trip-merge.ts`](frontend/lib/trip-merge.ts), [`trips-repo.ts`](frontend/lib/db/trips-repo.ts), `trips.version` |
| Captcha (Turnstile) | [`turnstile.tsx`](frontend/components/auth/turnstile.tsx) (+ [test](frontend/components/auth/turnstile.test.ts)), sus 8 consumidores (`/login`, `/signup`, `/forgot-password`, `/start`, `account/settings`, `RegistrationGate`, `LandingStart`, `PartnerButtonBuilder`), `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, Hostname management de Cloudflare |
| Kit partners / prewarm | [`/partners`](frontend/app/partners/page.tsx), [`partners.py`](backend/partners.py), [`partners-api.ts`](frontend/lib/partners-api.ts), `TURNSTILE_SECRET_KEY` |
| Embudo CTA blogs | [`funnel-analytics.ts`](frontend/lib/funnel-analytics.ts), [`funnel.py`](backend/funnel.py), [`/start`](frontend/app/start/page.tsx), [`funnel_events`](supabase/migrations/20260818200000_funnel_events.sql), consultas en [`supabase/queries/funnel.sql`](supabase/queries/funnel.sql) |
| Snippet del embed | [`partner-button.ts`](frontend/lib/partner-button.ts) (+ [test](frontend/lib/partner-button.test.ts)), [`partner-button-preview.tsx`](frontend/components/partners/partner-button-preview.tsx) — el JSX es espejo del HTML |
| Sugerencias de fuentes (landing + Añadir fuente) | [`landing-start.tsx`](frontend/components/landing/landing-start.tsx), [`source-suggest-list.tsx`](frontend/components/source-suggest-list.tsx), [`source_suggest.py`](backend/source_suggest.py), [`source-suggest.ts`](frontend/lib/source-suggest.ts), [`trip-source-suggestions.ts`](frontend/lib/trip-source-suggestions.ts), [`landing_source_domains.py`](backend/landing_source_domains.py), `ref=wp-landing`, kind `trip_source_search` |
| Trámites de país | [`country_tasks.py`](backend/country_tasks.py), [`travel_briefs.py`](backend/travel_briefs.py), [`country-tasks.ts`](frontend/lib/country-tasks.ts), [`country-tasks-section.tsx`](frontend/components/country-tasks-section.tsx), `dismissed_country_tasks` |
| Thumbs / covers | [`place_thumbs.py`](backend/place_thumbs.py), [`wikimedia_thumbs.py`](backend/wikimedia_thumbs.py), [`covers.py`](backend/covers.py), [`thumbs.ts`](frontend/lib/thumbs.ts), [`unsplash.ts`](frontend/lib/unsplash.ts) |
| Tareas / costes | [`trip-tasks.ts`](frontend/lib/trip-tasks.ts) (+ test), [`task-labels.ts`](frontend/lib/task-labels.ts), [`trip-tasks-panel.tsx`](frontend/components/trip-tasks-panel.tsx), `tasks` / `extra_tasks` / `currency` / `num_travelers`, [`booking-search.ts`](frontend/lib/booking-search.ts) (stay del asistente) |
| Presupuesto | [`trip-budget.ts`](frontend/lib/trip-budget.ts), [`itinerary-budget-view.tsx`](frontend/components/itinerary-budget-view.tsx), [`cost-input.tsx`](frontend/components/cost-input.tsx), `trips.budget`, [`assistant-context.ts`](frontend/lib/assistant-context.ts), [`travel_assistant.md`](backend/agents/travel_assistant.md) |
| Tramos de transporte | [`route-legs.ts`](frontend/lib/route-legs.ts), [`transport-routes.ts`](frontend/lib/transport-routes.ts), [`transport-route-form.tsx`](frontend/components/transport-route-form.tsx), `taskKeyForItem`, mapa |
| Búsqueda de lugares / hubs | [`place_search.py`](backend/place_search.py), [`mapbox.ts`](frontend/lib/mapbox.ts), [`place-search-guardrails.ts`](frontend/lib/place-search-guardrails.ts), [`usage.py`](backend/usage.py), `MAPBOX_ACCESS_TOKEN` |
| Mapa | [`itinerary-map-view.tsx`](frontend/components/itinerary-map-view.tsx), [`map-route-geometry.ts`](frontend/lib/map-route-geometry.ts), [`map-geocode-state.ts`](frontend/lib/map-geocode-state.ts), coste de Directions |
| Calendario de Ruta | [`itinerary-calendar-view.tsx`](frontend/components/itinerary-calendar-view.tsx), [`itinerary-calendar.ts`](frontend/lib/itinerary-calendar.ts), `wp-route-view` / `wp-calendar-scale` |
| Scroll / alturas en `/trips` móvil | [`trips-shell.tsx`](frontend/components/trips-shell.tsx), [`app-header.tsx`](frontend/components/app-header.tsx), [`use-collapsing-header.ts`](frontend/hooks/use-collapsing-header.ts), [`trip-mobile-nav.tsx`](frontend/components/trip-mobile-nav.tsx), `--wp-header-height` / `data-wp-scroll-lock` en [`globals.css`](frontend/app/globals.css) |
| Marca / SEO | [`brand-mark.tsx`](frontend/components/brand-mark.tsx), [`site.ts`](frontend/lib/site.ts), [`robots.ts`](frontend/app/robots.ts), [`opengraph-image.tsx`](frontend/app/opengraph-image.tsx) |
| Proveedor o modelo de IA (`ASSISTANT_MODEL`, cliente de [`assistant.py`](backend/assistant.py), extracción de [`main.py`](backend/main.py)) | Párrafo `#terceros` de [`/legal/privacidad`](frontend/app/legal/privacidad/page.tsx) (país + garantía), texto de [`ai-transfer-gate.tsx`](frontend/components/ai-transfer-gate.tsx) y `AI_TRANSFER_CONSENT_VERSION` en [`ai-transfer-consent.ts`](frontend/lib/ai-transfer-consent.ts) si cambia el país |
