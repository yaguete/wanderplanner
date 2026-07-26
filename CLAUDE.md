# WanderPlanner — Contexto del proyecto

## Qué es

WanderPlanner es una app web cuyo frontend carga y combina en memoria un viaje (`Trip`) y fuentes de inspiración por URL (`Source`). Un backend Python expone un endpoint `POST /itinerary` que descarga un artículo, lo envía a un modelo Claude y devuelve un JSON estructurado. El front muestra esas fuentes, deja añadir ítems a días y conserva afiliación como enlaces en `affiliateUrl` u `affiliate_url`.

## Stack

**Frontend (confirmado en `frontend/package.json`):** Next.js `15.2.6`, React `^19`, TypeScript, Tailwind (`tailwindcss` en devDependencies), Radix UI (`@radix-ui/*`), `mapbox-gl` (mapa de itinerario), `lucide-react`, además de utilidades comunes (`clsx`, `tailwind-merge`, `zod`, etc.).

**Backend (confirmado en `backend/main.py` y `backend/requirements.txt`):** FastAPI (`fastapi` en `requirements.txt`), CORS hacia orígenes `http://localhost:3000` y `http://localhost:3001`, cliente HTTP con `httpx` (import en `main.py`, no consta en `requirements.txt` actual), `anthropic` para Claude (import en `main.py`, no consta en `requirements.txt` actual), parsing HTML con `bs4` / `BeautifulSoup` y `lxml` (import de `lxml` implícito vía `BeautifulSoup(..., "lxml")`), carga de variables con `python-dotenv` (`load_dotenv()` en `main.py`).

**Hosting / despliegue:** no hay en el repositorio configuración de host (p. ej. Dockerfile, `vercel.json`, workflow CI). `frontend` incluye `@vercel/analytics` renderizado en [`app/layout.tsx`](frontend/app/layout.tsx) (`<Analytics />` en el cuerpo).

**Modelo de IA (confirmado en `main.py`):** `model="claude-haiku-4-5-20251001"`, clave vía `ANTHROPIC_API_KEY` en el entorno.

## Estructura de carpetas

Árbol por directorios (omitidos `node_modules`, `.next`, `venv`, `__pycache__` y artefactos de build similares):

```
/                          # Raíz: monorepo frontend + backend
  DESIGN.md
  CLAUDE.md
  .gitignore
  tsconfig.json            # (raíz; uso exacto: pendiente de documentar)
  .venv/                   # (Python en raíz, si aplica)
  .vscode/                 # Configuración de editor
  backend/                 # API Python FastAPI
    main.py
    requirements.txt
    .env
    agents/
      itinerary_builder.md # Plantilla de prompt: JSON devuelto por Claude
  frontend/                # App Next.js
    app/                   # Rutas App Router (`layout.tsx`, `page.tsx`, `trips/…`)
    components/            # UI de viajes, paneles, asistente, shadcn en `ui/`
    lib/                   # `trip-context`, `api`, `itinerary-utils`, mapas, mocks
    types/                 # `itinerary.ts`: tipos de dominio
    hooks/                 # Hooks reutilizables
    public/                # Estáticos
    styles/                # Estilos adicionales (si aplica)
    package.json
    tailwind.config.ts
    tsconfig.json
```

## Rutas App Router y shell

En `frontend/app/` no hay otras entradas que las cinco de abajo: no existe `app/trips/[tripId]/layout.tsx` ni rutas anidadas adicionales.

- **Raíz `/`** — [`app/page.tsx`](frontend/app/page.tsx) hace `redirect("/trips")`; no hay otra UI en `/`.

- **Layout raíz** — [`app/layout.tsx`](frontend/app/layout.tsx): `html`/`body`, variable de fuente (`next/font` DM Sans), `globals.css` e [`@vercel/analytics`](frontend/app/layout.tsx) en el `<body>`. **No** define `TripProvider` ni cromo de app; el estado de viajes solo existe bajo el segmento `/trips` (ver siguiente).

- **Segmento `trips` (accesible como `/` vía redirect)** — [`app/trips/layout.tsx`](frontend/app/trips/layout.tsx) (`"use client"`): monta [`TripProvider`](frontend/lib/trip-context.tsx) → `TooltipProvider` (Radix) → cápsula a pantalla completa con [`AppHeader`](frontend/components/app-header.tsx), fila con [`AppSidebar`](frontend/components/app-sidebar.tsx) y un `<main>` con `{children}`. Toda ruta cuyo path empiece por `/trips` pasa por aquí; es el único sitio del árbol donde aplica `useTrips()`.

- **`/trips`** — [`app/trips/page.tsx`](frontend/app/trips/page.tsx): listado “Tus viajes”, `createTrip` / `deleteTrip` desde el contexto, `NewTripDialog` y `router.push` hacia el detalle (`/trips/{id}`); confirmación al borrar con `Dialog` de shadcn. La barra lateral también ofrece “Nuevo viaje” con el mismo `NewTripDialog`.

- **`/trips/[tripId]`** — [`app/trips/[tripId]/page.tsx`](frontend/app/trips/[tripId]/page.tsx): `ResizablePanelGroup` con inspiración e itinerario; `router.replace("/trips")` si el id no está en el contexto.

**Componentes de cromo no anteriores (solo `/trips`):** [`app-header`](frontend/components/app-header.tsx) — marca, subtítulo, avatar con [`mock-user`](frontend/lib/mock-user); [`app-sidebar`](frontend/components/app-sidebar.tsx) — `Link` a `/trips`, lista colapsable de viajes, “Nuevo viaje”, `usePathname` para resalte; [`new-trip-dialog`](frontend/components/new-trip-dialog.tsx) — nombre del viaje, rango con `Calendar`+`react-day-picker`, días aprox. (`Trip.countries` queda `[]` en creación; geocodificación vía `region` en ítems / nombre del viaje). El resto de `components/` (asistente, shadcn en `ui/`, etc.) no está mapeado aquí pieza a pieza; añade referencias a medida que toques esos archivos.

## Archivos críticos

- [`frontend/types/itinerary.ts`](frontend/types/itinerary.ts) — Única definición de tipos: respuesta `Itinerary` del backend, modelo en app `Trip`/`Source`/`UserDayItem` y `UserBasicItem`; nombres `affiliate_url` vs `affiliateUrl` y categorías `BasicCategory`.

- [`frontend/lib/trip-context.tsx`](frontend/lib/trip-context.tsx) — `TripProvider`: estado (`useState` con `MOCK_TRIPS` / `MOCK_SOURCES` + rehidratación desde `localStorage`), y todas las mutaciones del viaje y de fuentes; `createTrip` abre N días según `numDays`; decide qué ítems básicos se quitan al refetchear o borrar fuente.

- [`frontend/lib/trip-persistence.ts`](frontend/lib/trip-persistence.ts) — Carga/guarda `trips`+`sources` en `localStorage` y esquema versionado (migración v1→v2 de `destination`/`dates` antiguos).

- [`frontend/lib/api.ts`](frontend/lib/api.ts) — `fetchItinerary`: `POST` a `NEXT_PUBLIC_API_URL` o `http://localhost:8000` + ruta `/itinerary` con cuerpo `{ url }`, parseo de error del backend.

- [`frontend/lib/itinerary-utils.ts`](frontend/lib/itinerary-utils.ts) — `flattenItinerary` / `flattenBasics` / `buildSource`: pasa de JSON backend a `Source` listo para la UI, incl. `affiliateUrl` y `vendor` en estancias.

- [`backend/main.py`](backend/main.py) — Descarga y saneo del artículo, texto con enlaces para el LLM, `call_claude` (streaming de Anthropic con `max_tokens` configurable), inyección de `article_html` y `og_image`, enriquecimiento de `thumb_url` (Google Places Photo y fallback Unsplash), y endpoint FastAPI `POST /itinerary`.

- [`backend/agents/itinerary_builder.md`](backend/agents/itinerary_builder.md) — Instrucciones a Claude: días, `affiliate_url`, arreglo `basics` a nivel de artículo, y el marcador de plantilla `{article_content}` reemplazado en código.

- [`frontend/lib/mock-data.ts`](frontend/lib/mock-data.ts) — Origen del estado inicial de `trips` y `sources` mientras el front no persiste otra capa; útil para ver forma de los datos y pruebas locales.

- [`frontend/lib/countries.ts`](frontend/lib/countries.ts) — Catálogo ISO 3166 (español) y helpers (`getCountryByCode`, `countriesPlainList`).

- [`frontend/lib/trip-dates.ts`](frontend/lib/trip-dates.ts) — `formatTripDates` / `formatTripMonthYear` / `toISODate` para `Trip.startDate`/`endDate`.

- [`frontend/app/page.tsx`](frontend/app/page.tsx) y [`frontend/app/layout.tsx`](frontend/app/layout.tsx) — Redirect raíz a `/trips` y documento global (fuente, `Analytics`); **sin** `TripProvider`.

- [`frontend/app/trips/layout.tsx`](frontend/app/trips/layout.tsx) — `TripProvider` + `TooltipProvider` + `AppHeader` + `AppSidebar` + `main` para `children` (ver sección *Rutas App Router y shell*).

- [`frontend/app/trips/page.tsx`](frontend/app/trips/page.tsx) — Home de viajes, tarjetas, creación y borrado, `NewTripDialog`.

- [`frontend/components/inspiration-panel.tsx`](frontend/components/inspiration-panel.tsx) — Panel izquierdo: chips de fuentes, pestañas `Crónica` / `Itinerario` / `Transporte` / `Descuentos`; en `Itinerario` se excluyen cards de transporte, `Transporte` usa icono fijo por card (sin fetch de miniaturas), y `Descuentos` muestra logo de vendor + badge de añadido; mantiene `inert` cuando el asistente ocupa el foco.

- [`frontend/components/inspiration-thumbnail.tsx`](frontend/components/inspiration-thumbnail.tsx) — Miniaturas en Fuentes por modo: default (`thumbUrl`/Unsplash/fallback), `vendorLogo` (logo de marca en descuentos) y `transportIcon` (sin descarga de imagen para transporte).

- [`frontend/lib/vendor-logo.ts`](frontend/lib/vendor-logo.ts) — Resolución de logos en descuentos: mapeo local por `vendor`/dominio y fallback por dominio (proveedor configurable con `NEXT_PUBLIC_VENDOR_LOGO_PROVIDER`).

- [`frontend/components/itinerary-panel-v2.tsx`](frontend/components/itinerary-panel-v2.tsx) — Panel derecho: `viewMode` (itinerario, alojamiento, transporte, básicos) y en itinerario el toggle lista/mapa, edición de etiquetas de día, `ItineraryItemRow` y `moveItemOneStep` vía `moveItemBetweenDays`.

- [`frontend/lib/mapbox.ts`](frontend/lib/mapbox.ts) — Geocodificación y rutas con token `NEXT_PUBLIC_MAPBOX_TOKEN` (y lógica de caché); usa query contextual y filtro `country` (ISO) para reducir homónimos en otros continentes.

- [`frontend/components/itinerary-map-view.tsx`](frontend/components/itinerary-map-view.tsx) — Mapa Mapbox: `stay`+`activity` en orden, `getDirections` y resumen de km; depende de `geocodeName` con `tripDestination` y `geocodeFreeText` para el destino del viaje.

- [`frontend/app/trips/[tripId]/page.tsx`](frontend/app/trips/[tripId]/page.tsx) — Página de detalle: `ResizablePanelGroup` horizontal con `InspirationPanel` e `ItineraryPanel` (`itinerary-panel-v2`); redirige a `/trips` con `router.replace` si el `tripId` no existe en el contexto.

- [`frontend/lib/day-heading.ts`](frontend/lib/day-heading.ts) — Títulos de día (`formatDayHeadingLine`, `getDayUserDescription`): usado en paneles; cambios afectan cómo se muestran días y menús "Añadir al día".

- [`frontend/lib/item-styles.ts`](frontend/lib/item-styles.ts) — `ITEM_LABELS` y `BASIC_LABELS` y metadatos visuales; mantener alineado con `ItemType` y `BasicCategory` en `types/itinerary.ts`.

## Modelo de datos

El archivo [`frontend/types/itinerary.ts`](frontend/types/itinerary.ts) es la fuente de verdad de tipos.

**Respuesta de extracción (backend, JSON):** el tipo `Itinerary` agrupa `destination`, `total_days`, `source_structured_by_days`, un array de `ItineraryDay` (cada uno con alojamientos, actividades, restaurantes, transporte y sugerencias) y, aparte, `general_tips` y opcionalmente `basics`, más `og_image` y `article_html` añadidos en `build_itinerary` en el servidor, no en el cuerpo que devuelve el LLM aislado.

Dentro de un día, `Accommodation` puede llevar `affiliate_url` (snake_case en JSON) tal como pide el prompt, para ofertas de reserva.

**`BasicItem` (también contrato de extracción, snake_case en JSON):** `category` (`insurance` | `sim` | `car_rental` | `flight` | `other`), `name`, `vendor`, `notes` y `affiliate_url` — representa ofertas “a nivel de artículo” (no anidadas en un `ItineraryDay`).

**Estado de la app:** `Trip` reúne metadatos del viaje, `countries: string[]` (códigos ISO 3166-1 alpha-2; puede ir vacío al crear el viaje), rango de fechas `startDate` / `endDate` (ISO `YYYY-MM-DD` o `null`, independiente de `numDays` aproximado), `sourceIds: string[]`, un array de `UserDay` (cada `UserDay` tiene `id`, `label` y `UserDayItem[]`) y a nivel de viaje `basics: UserBasicItem[]` (no por día). Al crear un viaje, `createTrip` abre N días según `numDays` o 1 por defecto.

**`UserDayItem` (ítem ya en el calendario del usuario):** conserva trazas `sourceItemId` y `sourceId`, el `type` (`"transport" | "stay" | "food" | "activity"`), `name`/`detail`, el autor de la fuente, `region?` (pista geográfica para geocodificar y mostrar en la card; copiada de `SourceItem.region` o, si no la trae, del `Source.area` al añadir desde inspiración), y en frontend `affiliateUrl?` y `vendor?` para reservar o abrir enlaces con afiliado.

**`Source` (una artículo ya procesado y guardado en memoria de la app):** `url`, `author`, `title`, `area: string | null` (= `itinerary.destination`, p. ej. "La Alpujarra granadina, Granada, Spain"; usado como **fallback** de `SourceItem.region` para geocodificar), `items: SourceItem[]` (cada `SourceItem` añade `id`, `dayHint` y `region?` opcional), `basics: SourceBasicItem[]` (categoría en *camelCase* vía mapeo), `articleHtml` y `ogImage`.

**`UserBasicItem` (oferta añadida al viaje):** enlaza a la fuente con `sourceBasicItemId` y `sourceId` y vuelve a exponer `affiliateUrl` en camelCase. Sirve para la sección "Básicos" del viaje, separada de las tarjetas por día.

`affiliate_url` vs `affiliateUrl`: en JSON del backend y en el tipo de extracción se usa `affiliate_url`; al construir `SourceItem` y filas de usuario, `itinerary-utils` asigna `affiliateUrl` (y opcionalmente `vendor` con `vendorFromUrl` a partir de la URL).

`region` (por ítem) vs `area` (por fuente): el prompt pide al LLM una pista geográfica corta (`region`, p. ej. "Soportújar, Granada") en cada Accommodation/Activity/Restaurant/Transport (camelCase ya en el front: `SourceItem.region`); a nivel de fuente, `Source.area` guarda `itinerary.destination` como fallback. La card del itinerario muestra "Tipo · Region vía @autor" cuando hay `region`, y el mapa pasa `point.region ?? destination` como `tripDestination` a `geocodeName` para desambiguar POIs homónimos (p. ej. *Mirador del Embrujo* en Granada y no en Madrid).

`basics` en el backend: arreglo documentado en el prompt, artículo-nivel; en la app `Trip.basics` añade o quita entradas cuando el usuario acepta ofertas desde el panel de inspiración.

También existen tipos bajo comentario `// Legacy` (`Reference`, `TripItem`, etc.) *pendiente de documentar* si aún se usan en el árbol actual; no forman el flujo principal de `TripProvider`.

## Flujo principal

1. **Añadir fuente por URL (frontend):** `InspirationPanel` llama `addSourceToTrip(tripId, url)` en [`frontend/lib/trip-context.tsx`](frontend/lib/trip-context.tsx).

2. **Petición al backend:** `addSourceToTrip` hace `fetchItinerary(url)` en [`frontend/lib/api.ts`](frontend/lib/api.ts), que hace `POST` a `POST ${API_BASE}/itinerary` con `JSON.stringify({ url })`.

3. **Servidor FastAPI:** en [`backend/main.py`](backend/main.py), el handler `generate_itinerary` llama `build_itinerary(request.url)`.

4. **Descarga y limpieza:** `build_itinerary` hace `fetch_article` → `fetch_article` obtiene HTML, extrae cuerpo con `_find_content` / `_strip_junk`, y construye:
   - `plain_text` con `_text_with_links_for_llm` (enlaces `a` como `[texto](url absoluta)`);
   - `cleaned_html` filtrada para `articleHtml`;
   - `og_image` desde metadatos o Twitter image.

5. **Claude:** `call_claude(plain_text)` lee la plantilla [`backend/agents/itinerary_builder.md`](backend/agents/itinerary_builder.md), sustituye `{article_content}` y llama a Anthropic vía `client.messages.stream(...)` (requerido para salidas largas), con `max_tokens` configurable por `ITINERARY_MAX_OUTPUT_TOKENS`; el texto final se parsea como JSON.

6. **Retorno y enriquecimiento:** se asigna `itinerary["og_image"]` e `itinerary["article_html"]` = `cleaned_html` (no vienen en el cuerpo LLM), luego `enrich_thumbnails` intenta `thumb_url` por Google Places Photo (`GOOGLE_MAPS_API_KEY`/`GOOGLE_PLACES_API_KEY`) con fallback a Unsplash si aplica; `transport` queda fuera del enriquecimiento de thumbnails.

7. **Adaptación al front:** en `addSourceToTrip` se hace `buildSource(url, itinerary)` en [`frontend/lib/itinerary-utils.ts`](frontend/lib/itinerary-utils.ts) → `Source` con `flattenItinerary` (ítems) y `flattenBasics` (básicos). Se hace `setSources` y se añade `source.id` a `trip.sourceIds`.

8. **Uso en UI:** `InspirationPanel` lee `getTripSources` y en pestañas itera `currentSource.items` o `currentSource.basics` o `currentSource.articleHtml` según el tab. Al añadir, `addItemToDay` crea un `UserDayItem` o `addBasicToTrip` un `UserBasicItem` con el mismo enlace de afiliado en camelCase.

9. **Vista de itinerario:** `ItineraryPanel` (export default en `itinerary-panel-v2.tsx`) renderiza días, filas, movimiento con `moveItemBetweenDays` y, en submodo mapa, `ItineraryMapView` y `mapPoints` derivado del orden de `trip.days` y de ítems `stay`+`activity`.

## Estado global (trip-context)

- **`trips` y `sources`:** arrays en React `useState`, inicializados con `MOCK_TRIPS` y `MOCK_SOURCES` importados de [`frontend/lib/mock-data.ts`](frontend/lib/mock-data.ts) y, en cliente, reemplazados por un snapshot de [`trip-persistence.ts`](frontend/lib/trip-persistence.ts) si existe.

- **`isLoadingSource`:** booleano, `true` mientras `addSourceToTrip` o `refetchSource` resuelve la red.

- **Acciones expuestas (interface `TripContextValue`):** `createTrip`, `deleteTrip`, `getTrip`, `getTripSources`, `addSourceToTrip`, `refetchSource`, `removeSourceFromTrip`, `addDay`, `updateDayLabel`, `removeDay`, `removeSelectedDays`, `addItemToDay`, `removeItemFromDay`, `moveItemBetweenDays`, `addBasicToTrip`, `removeBasicFromTrip` — el valor se memoriza con `useMemo` en el `TripProvider` y se consume vía `useTrips()`.

- **Limpieza vinculada a fuentes:** `removeSourceFromTrip` quita el `sourceId` del viaje, elimina ítems cuyo `sourceId` coincide, filtra `basics` con ese `sourceId` y, si otra lógica lo permite, deja de referenciar fuentes huérfanas en el array `sources` en el `setSources` de la cola. `refetchSource` mantiene el `id` de `Source` pero reemplaza `items`/`basics` con nuevas ids generadas en el rebuild; ajusta días y `basics` del viaje para quitar referencias a `sourceItemId` o `sourceBasicItemId` que ya no existan en el `newSource`. `addBasicToTrip` evita duplicados con la misma par `(sourceBasicItemId, sourceId)`.

## Convenciones establecidas

- **Casing:** JSON del API en snake_case (p. ej. `affiliate_url`, `car_rental` en categorías) y mapeo explícito a camelCase en el front (`affiliateUrl`, `carRental`) vía `mapBasicCategory` y nombres de propiedades de `UserBasicItem` / `SourceItem`.

- **Nuevas ids:** frecuente `crypto.randomUUID()` para días, ítems añadidos, fuentes, y `uid` / `uidBasic` basados en contador+timestamp en `itinerary-utils` para `SourceItem` y `SourceBasicItem`.

- **Styling en paneles con separación visual:** p. ej. clases con `flex flex-col gap-…` o `border-t` entre secciones, en `itinerary-panel-v2.tsx` (evita depender de `space-y` donde daba problemas; la razón concreta está comentada en deuda/UX según el historial del repo — aquí solo se documenta el patrón visto: `cn`, `flex`, `gap`).

- **Enlaces de afiliado y externos:** p. ej. en `InspirationPanel` / `ItineraryItemRow` se usa `target="_blank"` y `rel="noreferrer"` o `rel="noreferrer noopener"`.

- **CORS del backend** (`main.py`) solo `localhost:3000` y `3001` — otra origen requiere cambio explícito de lista.

- **Movimiento de ítems** entre días: no rebalancear a mano arrays en la UI, sino una sola vía `moveItemBetweenDays` con `fromDayId`/`toDayId`/`toIndex` calculada en el panel; la implementación hace un solo `splice` en origen y en destino según el mismo o distinto día.

- **Día 1, etc. en UI** se toma de índice en array: `dayIndex + 1` o textos vía `formatDayHeadingLine` (no renumber automático forzado en almacenamiento, salvo lo que hace `day.label` y la lista `trip.days`).

## Preguntas abiertas / deuda técnica conocida

- **Persistencia:** `trips` y `sources` se rehidratan y guardan en `localStorage` vía [`trip-persistence.ts`](frontend/lib/trip-persistence.ts) (versión de esquema, migración v1→v2 si hacía falta `destination`/`dates`); no hay backend de persistencia. (La caché de mapa sigue aparte en el cliente.)

- **`removeDay` vs `removeSelectedDays`:** `removeSelectedDays` nunca deja cero días. `removeDay` simplemente filtra el `dayId` sin asegurar mínimo de días; bajo `frontend` no hay llamadas a `removeDay` (solo su definición y export en `trip-context`), mientras `removeSelectedDays` sí se usa en el panel de itinerario.

- **`backend/requirements.txt`:** no lista `httpx`, `anthropic`, `beautifulsoup4` o `lxml` aunque `main.py` los importa — desalineación respecto a un `pip install -r` limpio. El repo puede depender de un venv con paquetes instalados a mano.

- **Herramienta de build front:** el script `build` pudo advertir de ESLint faltante en entorno concreto; *pendiente de documentar* criterio de calidad/CI en repo.

- **CORS y API base:** orígenes fijos; `NEXT_PUBLIC_API_URL` o default `localhost:8000` en `api.ts` — el despliegue real (dominios, https) no consta en código revisado.

- **Tipos legacy** en `types/itinerary.ts` siguen bajo comentario de “backward compat”; *pendiente de documentar* si algún import activo aún depende de ellos.

- **Pestañas/acciones aún inactivas o placeholder:** p. ej. en `itinerary-panel-v2` botones compartir y descargar con `disabled` y tooltip "Próximamente", y vista `viewMode === "transport"` con texto placeholder.

- **Proceso del LLM y HTML:** un fallo de `json.loads` en el servidor se traduce en 500; se mitigó el truncado por salida larga usando streaming de Anthropic + `ITINERARY_MAX_OUTPUT_TOKENS`, pero no hay reintentos semánticos si el modelo sigue devolviendo JSON inválido.

- **Mapa (cliente):** `UserDayItem` no guarda coordenadas; el mapa resuelve posiciones vía servicios y token público — otra deuda: dependencia de cuotas/keys y calidad de geocodificación, no de datos guardados en el `Trip`.

## Reglas que no se rompen

Formato: prohibición y consecuencia o vía correcta, deducida de decisiones ya fijadas en el código.

- ❌ **No uses `useTrips()` bajo un layout que no cuelgue de** [`app/trips/layout.tsx`](frontend/app/trips/layout.tsx) (donde va `TripProvider`) **→** el hook lanza error; el estado de viaje solo vive bajo `/trips`.

- ❌ **No amplíes o renames** `ItemType` / `BasicCategory` en [`types/itinerary.ts`](frontend/types/itinerary.ts) **sin tocar** [`item-styles.ts`](frontend/lib/item-styles.ts) (`Record<ItemType, …>`, `Record<BasicCategory, …>`) **→** faltan etiquetas/iconos o rompe el tipado; los `Record` deben cubrir todos los casos.

- ❌ **No alteres el contrato JSON de extracción** (`Itinerary`, `BasicItem`, nombres `affiliate_url`, categorías snake_case en el cuerpo del artículo) en un solo sitio **→** alinea a la vez [`backend/agents/itinerary_builder.md`](backend/agents/itinerary_builder.md) (qué pide a Claude), [`itinerary-utils.ts`](frontend/lib/itinerary-utils.ts) (mapeo, `affiliateUrl`, `mapBasicCategory`) y el tipado en [`itinerary.ts`](frontend/types/itinerary.ts); en servidor, el cuerpo se pasa a `json.loads` en [`main.py`](backend/main.py).

- ❌ **No reordenes o muevas ítems de día a día mutando a mano** `trip.days[…].items` en componentes **→** la única vía coordinada con el resto de actualizaciones es `moveItemBetweenDays` en [`trip-context`](frontend/lib/trip-context.tsx).

- ❌ **No expongas el front en un origen distinto a localhost:3000/3001** sin ajustar CORS en [`main.py`](backend/main.py) **→** el `POST` a la API queda bloqueado por el navegador aunque el endpoint exista.

- ❌ **No fijes la base de la API solo en un componente**; el cliente HTTP central está en [`api.ts`](frontend/lib/api.ts) con `NEXT_PUBLIC_API_URL` y el default `http://localhost:8000` **→** mezclar otra base rompe alineación con CORS y con lo que crees que llama el front.

- ❌ **No cambies la lógica de** `dayHint` / `source_structured_by_days` en `flattenItinerary` a ciegas **→** afecta la pista de día (`dayHint`) al presentar o agrupar en el panel de inspiración (comentado en el propio `itinerary-utils`); revisa [`inspiration-panel.tsx`](frontend/components/inspiration-panel.tsx) si ajustas pistas de día.

## Dependencias críticas

Pares *si tocas A, revisa B*; solo conexiones que el código hace visibles ahora. No es un inventario de toda la carpeta `components/`.

| Tocas | Revisa (porque qué depende) |
| --- | --- |
| [`types/itinerary.ts`](frontend/types/itinerary.ts) — `Itinerary`, `ItineraryDay`, `BasicItem` | [`backend/agents/itinerary_builder.md`](backend/agents/itinerary_builder.md) y el parseo / enriquecimiento en [`main.py`](backend/main.py) (`json.loads` del cuerpo del LLM) |
| [`types/itinerary.ts`](frontend/types/itinerary.ts) — `ItemType` / `BasicCategory` (app) | [`item-styles.ts`](frontend/lib/item-styles.ts) (`ITEM_*`, `BASIC_*` deben alinear) |
| [`itinerary-utils.ts`](frontend/lib/itinerary-utils.ts) — `buildSource` / `flattenItinerary` / `mapBasicCategory` | Cualquier cambio al JSON de `/itinerary` en tipos o prompt; consumidores de `Source` (`SourceItem`/`dayHint`) p. ej. panel de inspiración |
| [`trip-context.tsx`](frontend/lib/trip-context.tsx) — forma de `Trip`/`Source`, `TripContextValue` o acciones | Componentes con `useTrips()`: [`app/trips/page.tsx`](frontend/app/trips/page.tsx), [`app-sidebar`](frontend/components/app-sidebar.tsx), [`inspiration-panel`](frontend/components/inspiration-panel.tsx), [`itinerary-panel-v2`](frontend/components/itinerary-panel-v2.tsx), [`app/trips/[tripId]/page.tsx`](frontend/app/trips/[tripId]/page.tsx) |
| [`day-heading.ts`](frontend/lib/day-heading.ts) | [`inspiration-panel`](frontend/components/inspiration-panel.tsx) y [`itinerary-panel-v2`](frontend/components/itinerary-panel-v2.tsx) (títulos y descripciones de día) |
| [`api.ts`](frontend/lib/api.ts) | Llamada desde el contexto (`addSourceToTrip` / `refetchSource` en `trip-context`); CORS y URL deben ser coherentes con el backend desplegado o local |
| [`mapbox.ts`](frontend/lib/mapbox.ts) o token `NEXT_PUBLIC_MAPBOX_TOKEN` | [`itinerary-map-view.tsx`](frontend/components/itinerary-map-view.tsx) (geocodificación, rutas) |
| `region` por ítem en [`itinerary_builder.md`](backend/agents/itinerary_builder.md) | [`types/itinerary.ts`](frontend/types/itinerary.ts) (`Accommodation`/`Activity`/`Restaurant`/`Transport.region`, `SourceItem.region`, `UserDayItem.region`), [`itinerary-utils.ts`](frontend/lib/itinerary-utils.ts) (copia por ítem y `Source.area`), [`itinerary-panel-v2.tsx`](frontend/components/itinerary-panel-v2.tsx) (badge en card y `mapPoints[].region`), [`itinerary-map-view.tsx`](frontend/components/itinerary-map-view.tsx) (`tripDestination` por punto) |


