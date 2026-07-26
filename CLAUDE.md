# WanderPlanner — Contexto del proyecto

## Qué es

WanderPlanner es una app web cuyo frontend carga y combina en memoria un viaje (`Trip`) y fuentes de inspiración por URL (`Source`). Un backend Python expone `POST /itinerary` (extrae un artículo con Claude → JSON estructurado) y `POST /assistant/chat` (asistente de viaje con DeepSeek + tools, SSE). El front muestra esas fuentes, deja consolidar ítems en días, conserva afiliación (`affiliateUrl` / `affiliate_url`) y ofrece un asistente con varias conversaciones por viaje.

## Stack

**Frontend (confirmado en `frontend/package.json`):** Next.js `15.2.6`, React `^19`, TypeScript, Tailwind (`tailwindcss` en devDependencies), Radix UI (`@radix-ui/*`), `mapbox-gl` (mapa de itinerario), `lucide-react`, `react-markdown` (chat del asistente), además de utilidades comunes (`clsx`, `tailwind-merge`, `zod`, etc.). Fuente UI: **Inter** (`next/font` en [`app/layout.tsx`](frontend/app/layout.tsx)).

**Backend (confirmado en `backend/main.py`, `backend/assistant.py` y `backend/requirements.txt`):** FastAPI, CORS hacia `http://localhost:3000` y `http://localhost:3001`, `httpx`, `anthropic` (itinerario), `openai` (cliente DeepSeek para el asistente), `bs4`/`lxml`, `python-dotenv`. Búsqueda web vía Tavily (`backend/web_search.py`, `TAVILY_API_KEY`). Fichas país MAE en `backend/country_briefs.py`.

**Hosting / despliegue:** no hay en el repositorio configuración de host (p. ej. Dockerfile, `vercel.json`, workflow CI). `frontend` incluye `@vercel/analytics` en [`app/layout.tsx`](frontend/app/layout.tsx).

**Modelos de IA:**
- Itinerario: `claude-haiku-4-5-20251001`, clave `ANTHROPIC_API_KEY`.
- Asistente: DeepSeek vía API compatible OpenAI (`DEEPSEEK_API_KEY`); prompt en [`backend/agents/travel_assistant.md`](backend/agents/travel_assistant.md).

## Estructura de carpetas

Árbol por directorios (omitidos `node_modules`, `.next`, `venv`, `__pycache__` y artefactos de build similares):

```
/                          # Raíz: monorepo frontend + backend
  DESIGN.md
  CLAUDE.md
  .gitignore
  tsconfig.json
  .venv/                   # (Python en raíz, si aplica)
  .vscode/
  backend/
    main.py                # FastAPI: /itinerary + monta router asistente
    assistant.py           # POST /assistant/chat (SSE)
    article_fetch.py
    country_briefs.py
    web_search.py          # Tavily
    requirements.txt
    .env
    agents/
      itinerary_builder.md
      travel_assistant.md
  frontend/
    app/                   # App Router
    components/            # UI viajes, paneles, asistente, shadcn en `ui/`
    lib/                   # trip-context, api, assistant-*, unsplash, mapas…
    types/
    hooks/                 # use-assistant-chat, use-mobile…
    public/
    package.json
    tailwind.config.ts
    tsconfig.json
```

## Rutas App Router y shell

En `frontend/app/` no hay otras entradas que las cinco de abajo: no existe `app/trips/[tripId]/layout.tsx` ni rutas anidadas adicionales.

- **Raíz `/`** — [`app/page.tsx`](frontend/app/page.tsx) hace `redirect("/trips")`.

- **Layout raíz** — [`app/layout.tsx`](frontend/app/layout.tsx): Inter, `globals.css`, `@vercel/analytics`. **Sin** `TripProvider`.

- **Segmento `trips`** — [`app/trips/layout.tsx`](frontend/app/trips/layout.tsx): `TripProvider` → `TooltipProvider` → `AppHeader` + `AppSidebar` + `<main>{children}</main>`. Único sitio donde aplica `useTrips()`.

- **`/trips`** — [`app/trips/page.tsx`](frontend/app/trips/page.tsx): listado con pestañas Activos/Archivados, vista grid/lista, tarjetas con portada (`coverUrl` o emoji), acciones Archivar / Editar / Eliminar; `NewTripDialog` (crear y editar); `createTrip` / `updateTrip` / `archiveTrip` / `unarchiveTrip` / `deleteTrip`.

- **`/trips/[tripId]`** — [`app/trips/[tripId]/page.tsx`](frontend/app/trips/[tripId]/page.tsx): canvas de **Fuentes** a ancho completo + overlay **Mi viaje** (`ItineraryPanel`) + overlay **Asistente** (`AssistantPanelLayer`). `TripBreadcrumb` solo en **desktop** (`hidden sm:flex`). En **móvil**: sin breadcrumb; FABs inferiores (+ fuente, asistente, Mi viaje); sheet inferior para URL al añadir fuente. `router.replace("/trips")` si el id no existe.

**Cromo `/trips`:** [`app-header`](frontend/components/app-header.tsx); [`app-sidebar`](frontend/components/app-sidebar.tsx) (solo viajes no archivados); [`new-trip-dialog`](frontend/components/new-trip-dialog.tsx) (crear/editar: nombre, fechas, `numDays`; en edición no permite bajar `numDays` por debajo de `trip.days.length`); [`trip-breadcrumb`](frontend/components/trip-breadcrumb.tsx) (desktop).

## Archivos críticos

- [`frontend/types/itinerary.ts`](frontend/types/itinerary.ts) — Tipos de dominio: `Itinerary`, `Trip` (incl. `archived`, `cover`/`coverUrl`), `Source`, `UserDayItem`, `UserBasicItem`.

- [`frontend/lib/trip-context.tsx`](frontend/lib/trip-context.tsx) — `TripProvider`: mutaciones de viaje/fuentes; `createTrip` (sin fetch de portada); portada vía `applyCoverFromSource` al añadir/refetch/quitar primera fuente + backfill; `updateTrip`; `archiveTrip`/`unarchiveTrip`; `deleteTrip` también llama `clearAssistantState(tripId)`.

- [`frontend/lib/trip-persistence.ts`](frontend/lib/trip-persistence.ts) — `trips`+`sources` en `localStorage`, esquema **v3** (`archived`; migraciones desde v1/v2).

- [`frontend/lib/unsplash.ts`](frontend/lib/unsplash.ts) — Miniaturas y portadas; `coverQueriesFromSource` / `fetchCoverFromQueries` (área → país). Clave `NEXT_PUBLIC_UNSPLASH_ACCESS_KEY` (si falta, portada degrada a `ogImage` o emoji).

- [`frontend/lib/api.ts`](frontend/lib/api.ts) — `fetchItinerary` → `POST …/itinerary`.

- [`frontend/lib/assistant-api.ts`](frontend/lib/assistant-api.ts) / [`assistant-context.ts`](frontend/lib/assistant-context.ts) / [`assistant-persistence.ts`](frontend/lib/assistant-persistence.ts) — Cliente SSE del asistente, briefing del viaje, persistencia multi-conversación por `tripId` (clave `wanderplanner:assistant:{tripId}`, migración desde hilo único legacy).

- [`frontend/hooks/use-assistant-chat.ts`](frontend/hooks/use-assistant-chat.ts) — Estado del chat: conversaciones, activa, `send`/`newConversation`/`openConversation`/`deleteConversation`.

- [`frontend/components/assistant-dock.tsx`](frontend/components/assistant-dock.tsx) — Panel del asistente: historial, nueva conversación, mensajes (usuario en bocadillo muted; asistente a ancho completo sin caja), acciones propuestas.

- [`frontend/components/assistant-markdown.tsx`](frontend/components/assistant-markdown.tsx) — Markdown del asistente; «Añadir fuente» solo si [`isInspirationalSourceUrl`](frontend/lib/inspirational-source.ts) (oculta institucionales: `.gob`, `.gov`, visados, etc.).

- [`frontend/lib/itinerary-utils.ts`](frontend/lib/itinerary-utils.ts) — `buildSource` / `flattenItinerary` / `flattenBasics`.

- [`backend/main.py`](backend/main.py) — Extracción de artículo + Claude + thumbnails; monta el router del asistente.

- [`backend/assistant.py`](backend/assistant.py) — `POST /assistant/chat` SSE; tools (`web_search`, `fetch_url`, `get_country_brief`, `propose_add_source`, `propose_add_item`).

- [`backend/agents/itinerary_builder.md`](backend/agents/itinerary_builder.md) / [`travel_assistant.md`](backend/agents/travel_assistant.md) — Prompts.

- [`frontend/lib/mock-data.ts`](frontend/lib/mock-data.ts), [`countries.ts`](frontend/lib/countries.ts), [`trip-dates.ts`](frontend/lib/trip-dates.ts).

- [`frontend/components/inspiration-panel.tsx`](frontend/components/inspiration-panel.tsx) — Fuentes: chips; pestañas **Crónica** (default al añadir fuente) / **Ruta** / **Transporte** / **Descuentos**; en móvil, formulario de URL como sheet inferior con backdrop.

- [`frontend/components/inspiration-thumbnail.tsx`](frontend/components/inspiration-thumbnail.tsx), [`vendor-logo.ts`](frontend/lib/vendor-logo.ts).

- [`frontend/components/itinerary-panel-v2.tsx`](frontend/components/itinerary-panel-v2.tsx) — Overlay «Mi viaje».

- [`frontend/lib/mapbox.ts`](frontend/lib/mapbox.ts), [`itinerary-map-view.tsx`](frontend/components/itinerary-map-view.tsx).

- [`frontend/lib/day-heading.ts`](frontend/lib/day-heading.ts), [`item-styles.ts`](frontend/lib/item-styles.ts).

## Modelo de datos

El archivo [`frontend/types/itinerary.ts`](frontend/types/itinerary.ts) es la fuente de verdad de tipos.

**Respuesta de extracción (backend, JSON):** `Itinerary` con `destination`, `total_days`, `source_structured_by_days`, días (`Accommodation` puede llevar `affiliate_url`), `general_tips`, opcional `basics`; `og_image` y `article_html` los añade el servidor.

**`BasicItem`:** `category` (`insurance` | `sim` | `car_rental` | `flight` | `other`), `name`, `vendor`, `notes`, `affiliate_url`.

**Estado de la app — `Trip`:** metadatos, `countries`, `startDate`/`endDate`, `numDays`, `expectations` (texto libre opcional para el asistente), `cover` (emoji) / `coverUrl` (foto o `null`), `archived`, `sourceIds`, `days: UserDay[]`, `basics: UserBasicItem[]`. `createTrip` abre N días según `numDays` (mín. 1) con `coverUrl: null` hasta la primera fuente.

**Portada:** sin fuentes → emoji; con fuentes → Unsplash del `area` de `sourceIds[0]` (fallback país / `ogImage`). Sigue a la primera fuente (add/refetch/remove).

**`UserDayItem` / `Source` / `UserBasicItem`:** sin cambio de contrato respecto a versiones anteriores (trazas de fuente, `region`/`area`, afiliado camelCase).

**Asistente (localStorage, aparte de trips):** por viaje, `conversations[]` + `activeConversationId`; título derivado del primer mensaje del usuario.

Tipos `// Legacy` en `itinerary.ts`: no forman el flujo principal de `TripProvider`.

## Flujo principal (fuentes → itinerario)

1. `InspirationPanel` → `addSourceToTrip(tripId, url)`.
2. `fetchItinerary` → `POST /itinerary`.
3. Backend: descarga/limpia artículo → Claude (`itinerary_builder.md`) → JSON + `og_image`/`article_html` + thumbnails.
4. `buildSource` → `Source`; se enlaza al viaje; si es la primera fuente, se deriva `coverUrl`.
5. UI: pestaña **Crónica** por defecto; Ruta/Transporte/Descuentos; `addItemToDay` / `addBasicToTrip`.
6. «Mi viaje»: `ItineraryPanel` + mapa opcional.

## Flujo del asistente

1. FAB / breadcrumb abre `AssistantPanelLayer` (`assistant-dock.tsx`).
2. `useAssistantChat` hidrata conversaciones de `assistant-persistence` para ese `tripId`.
3. Cada `send` construye `buildTripBriefing` + historial de la conversación activa → `POST /assistant/chat` (SSE).
4. Tools pueden emitir `propose_add_*`; la UI confirma antes de mutar el viaje. Enlaces en markdown: «Añadir fuente» solo si la URL es de inspiración (no institucional).
5. Varias conversaciones por viaje; historial interno; borrar una conversación no deshace ítems/fuentes ya añadidos.

## Estado global (trip-context)

- **`trips` / `sources`:** `useState` + rehidratación `trip-persistence` (v3).
- **`isLoadingSource`:** mientras `addSourceToTrip` / `refetchSource`.
- **Acciones:** `createTrip`, `updateTrip`, `deleteTrip`, `archiveTrip`, `unarchiveTrip`, `getTrip`, `getTripSources`, `addSourceToTrip`, `refetchSource`, `removeSourceFromTrip`, `addDay`, `updateDayLabel`, `removeDay`, `removeSelectedDays`, `addItemToDay`, `removeItemFromDay`, `moveItemBetweenDays`, `addBasicToTrip`, `removeBasicFromTrip`.
- Limpieza de fuentes: igual que antes (huérfanas, refetch invalida ids viejos). Al `deleteTrip`, también `clearAssistantState`.

## Convenciones establecidas

- **Casing:** API snake_case ↔ front camelCase (`affiliateUrl`, `carRental`, …).
- **Ids:** `crypto.randomUUID()` en app; `uid`/`uidBasic` en `itinerary-utils`.
- **Paneles:** preferir `flex` + `gap` / `border-t` donde el historial del repo evita `space-y` problemático.
- **Enlaces externos:** `target="_blank"` + `rel="noreferrer"` / `noopener`.
- **CORS:** solo localhost:3000/3001.
- **Movimiento de ítems:** solo `moveItemBetweenDays`.
- **Días en UI:** índice `dayIndex + 1` / `formatDayHeadingLine`.
- **Móvil vs desktop:** no aplicar patrones de FABs/sheet del detalle a desktop; el breadcrumb es desktop-only.

## Preguntas abiertas / deuda técnica conocida

- **Persistencia:** trips/sources y asistente en `localStorage`; sin backend de usuarios/viajes.
- **`removeDay` vs `removeSelectedDays`:** `removeSelectedDays` nunca deja 0 días; `removeDay` no se usa en UI.
- **`backend/requirements.txt`:** puede no listar todos los imports reales (`httpx`, `anthropic`, `openai`, etc.).
- **CORS / API base:** fijos a local; `NEXT_PUBLIC_API_URL` default `localhost:8000`.
- **Tipos legacy** en `itinerary.ts`.
- **Placeholders:** compartir/descargar y vista transporte en itinerario.
- **LLM itinerario:** JSON inválido → 500; streaming mitiga truncado, no hay reintentos semánticos.
- **Mapa:** sin coordenadas en `UserDayItem`; depende de Mapbox + cuotas.

## Reglas que no se rompen

- ❌ **No uses `useTrips()`** fuera de [`app/trips/layout.tsx`](frontend/app/trips/layout.tsx) → error del hook.
- ❌ **No amplíes `ItemType` / `BasicCategory`** sin alinear [`item-styles.ts`](frontend/lib/item-styles.ts).
- ❌ **No alteres el contrato JSON de extracción** en un solo sitio → alinea prompt + `itinerary-utils` + tipos + `main.py`.
- ❌ **No mutes a mano** `trip.days[…].items` → solo `moveItemBetweenDays`.
- ❌ **No expongas otro origen** sin CORS en `main.py`.
- ❌ **No fijes otra base de API** fuera de [`api.ts`](frontend/lib/api.ts).
- ❌ **No cambies `dayHint` / `source_structured_by_days`** a ciegas → revisa inspiration-panel.
- ❌ **No pidas portada Unsplash en `createTrip`** → la portada nace de la primera fuente (`applyCoverFromSource`).
- ❌ **No mezcles conversaciones del asistente entre viajes** → clave y estado por `tripId`; al borrar viaje, limpiar asistente.
- ❌ **No muestres «Añadir fuente» en enlaces institucionales** del markdown del asistente → [`inspirational-source.ts`](frontend/lib/inspirational-source.ts).
- ❌ **No reintroduzcas el breadcrumb en móvil** ni FABs de detalle en desktop.

## Dependencias críticas

| Tocas | Revisa |
| --- | --- |
| [`types/itinerary.ts`](frontend/types/itinerary.ts) — extracción | [`itinerary_builder.md`](backend/agents/itinerary_builder.md), [`main.py`](backend/main.py) |
| `ItemType` / `BasicCategory` | [`item-styles.ts`](frontend/lib/item-styles.ts) |
| [`itinerary-utils.ts`](frontend/lib/itinerary-utils.ts) | Contrato `/itinerary` + inspiration-panel |
| [`trip-context.tsx`](frontend/lib/trip-context.tsx) | Consumidores `useTrips()`, [`assistant-persistence`](frontend/lib/assistant-persistence.ts) en `deleteTrip` |
| Portada / Unsplash | [`unsplash.ts`](frontend/lib/unsplash.ts), `addSourceToTrip` / `refetchSource` / `removeSourceFromTrip` |
| Asistente UI/hook | [`assistant-dock.tsx`](frontend/components/assistant-dock.tsx), [`use-assistant-chat.ts`](frontend/hooks/use-assistant-chat.ts), [`assistant-persistence.ts`](frontend/lib/assistant-persistence.ts), [`assistant.py`](backend/assistant.py), [`travel_assistant.md`](backend/agents/travel_assistant.md) |
| [`inspirational-source.ts`](frontend/lib/inspirational-source.ts) | [`assistant-markdown.tsx`](frontend/components/assistant-markdown.tsx), ActionCards de `add_source` |
| Detalle móvil/desktop | [`app/trips/[tripId]/page.tsx`](frontend/app/trips/[tripId]/page.tsx), [`trip-breadcrumb.tsx`](frontend/components/trip-breadcrumb.tsx), [`inspiration-panel.tsx`](frontend/components/inspiration-panel.tsx) |
| [`day-heading.ts`](frontend/lib/day-heading.ts) | inspiration-panel + itinerary-panel-v2 |
| [`api.ts`](frontend/lib/api.ts) / [`assistant-api.ts`](frontend/lib/assistant-api.ts) | CORS y URL del backend |
| [`mapbox.ts`](frontend/lib/mapbox.ts) | [`itinerary-map-view.tsx`](frontend/components/itinerary-map-view.tsx) |
| `region` en prompt | tipos + itinerary-utils + panel/mapa |
