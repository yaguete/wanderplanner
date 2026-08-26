/**
 * Modelo de dominio: contrato JSON del backend (`Itinerary`, días, `BasicItem` en snake_case) y
 * estructura de la app (`Trip`, `Source`, `UserDayItem`, `UserBasicItem` en camelCase).
 * No renombrar `affiliate_url` en tipos de extracción sin alinear `itinerary-utils` y el prompt
 * en `backend/agents/itinerary_builder.md`. Los tipos bajo "Legacy" conservan compatibilidad.
 */
// ── Backend extraction types (returned by /itinerary endpoint) ─────────────────

/** Pista geográfica corta para geocodificar el ítem (p. ej. "Soportújar, Granada"). */
type RegionHint = string | null

export interface Accommodation {
  name: string
  type: "hotel" | "hostel" | "guesthouse" | "airbnb" | "other"
  notes: string | null
  region?: RegionHint
  /** Foto miniatura; la inyecta el servidor (Unsplash), no el LLM. */
  thumb_url?: string | null
  /** URL de afiliado u oferta, tal como aparece en el blog. */
  affiliate_url?: string | null
}

export interface Activity {
  name: string
  type: "attraction" | "excursion" | "other"
  notes: string | null
  region?: RegionHint
  thumb_url?: string | null
  /** URL de afiliado u oferta (tours, cruceros, flightseeing). */
  affiliate_url?: string | null
  sub_activities?: Activity[]
}

export interface Restaurant {
  name: string
  type: "local" | "cheap" | "exotic" | "exclusive" | "other"
  notes: string | null
  region?: RegionHint
  thumb_url?: string | null
}

export interface Transport {
  type: "bus" | "ferry" | "flight" | "train" | "car" | "other"
  from: string | null
  to: string | null
  notes: string | null
  region?: RegionHint
  thumb_url?: string | null
}

export interface ItineraryDay {
  day: number
  title: string
  accommodations: Accommodation[]
  activities: Activity[]
  restaurants: Restaurant[]
  transport: Transport[]
  tips: string | null
}

/** Categoría de oferta/“básico” devuelta por el backend (snake_case en JSON). */
export interface BasicItem {
  category: "insurance" | "sim" | "car_rental" | "flight" | "other"
  name: string
  vendor: string | null
  notes: string | null
  affiliate_url: string | null
  thumb_url?: string | null
}

export interface Itinerary {
  destination: string
  total_days: number | null
  source_structured_by_days: boolean
  days: ItineraryDay[]
  general_tips: string | null
  /** Seguros, SIM, alquiler, vuelos, etc. a nivel de artículo (no por día). */
  basics?: BasicItem[]
  og_image?: string | null
  /** Título del artículo (og:title / <title>); lo inyecta el fetch, no el LLM. */
  og_title?: string | null
  /** Username del autor (Instagram); lo inyecta el fetch, no el LLM. */
  author?: string | null
  article_html?: string
}

// ── App-level types ───────────────────────────────────────────────────────────

export type ItemType = "transport" | "stay" | "food" | "activity"

/** Categoría de “Básicos” en app (camelCase). */
export type BasicCategory = "insurance" | "sim" | "carRental" | "flight" | "other"

/**
 * Grupos de la vista Tareas (T4.2). No amplía `ItemType` ni `BasicCategory`:
 * se deriva del tipo del ítem (`stay` → accommodation, todos los básicos → `basic`).
 * `paperwork` / `health` quedan reservadas para las tareas de país (T4.4).
 */
export type TripTaskCategory =
  | "accommodation"
  | "transport"
  | "activity"
  | "food"
  | "basic"
  | "paperwork"
  | "health"
  | "other"

/**
 * Grupos que el usuario ve (cuenta, techo por tipo, selector de extras).
 * Imagen de `taskGroupKey`: paperwork/health caen en `other`.
 */
export type TaskGroupCategory = Exclude<TripTaskCategory, "paperwork" | "health">

/**
 * Techo opcional del viaje, en `trip.currency`. No es un coste: no entra en
 * ningún total. `total: null` + `byCategory` vacío = sin techo.
 * Un 0 persistido (legacy/corrupto) sí es un techo de cero; el setter no lo escribe.
 * Al desglosar, lo no asignado se escribe en `other` para que sume `total`;
 * si el desglose (o Otras a mano) supera el global, `total` sube.
 */
export interface TripBudget {
  /** Techo total del viaje. null = no declarado (nunca se persiste 0 desde la UI). */
  total: number | null
  /** Solo las claves que el usuario ha rellenado. */
  byCategory: Partial<Record<TaskGroupCategory, number>>
}

/**
 * Texto de «Compartir» cacheado en el viaje. Lo escribe la IA y el usuario
 * puede editarlo; `signature` es `sharePlanSignature` del plan que originó
 * (o regeneró) el texto. Si el plan cambia, la firma queda vieja hasta
 * «Regenerar»: no se pisa sola.
 */
export interface ShareCard {
  text: string
  signature: string
  /** ISO UTC; sirve para depurar. */
  generatedAt: string
}

/**
 * Estado de una tarea. `notNeeded` = "esto no hay que reservarlo" (triaje);
 * `booked` = reservado (o «hecho» en trámites); `paid` = pagado.
 * Los valores son excluyentes. Ausencia en el mapa = nunca tocada.
 */
export type TripTaskStatus = "pending" | "booked" | "paid" | "notNeeded"

/**
 * Estado de una tarea tocada por el usuario. Solo se persiste en `Trip.tasks`
 * (o en `ExtraTask.state`) tras una mutación explícita; ausencia = nunca tocada
 * (siempre-accionables se tratan como pendientes; activity/food van a triaje).
 */
export interface TripTaskState {
  status: TripTaskStatus
  cost: number | null
  /**
   * Si la reserva es cancelable. `null` = no aplica o no indicado.
   * La UI solo lo enseñará en alojamiento y transporte.
   */
  cancellable: boolean | null
  notes: string | null
  /** ISO UTC; se sella en cada mutación de estado. */
  updatedAt: string
}

/** Tarea manual (no proviene de un ítem del itinerario ni de un básico). */
export interface ExtraTask {
  id: string
  title: string
  category: TripTaskCategory
  state: TripTaskState
}

/**
 * Punto de partida del viajero (T4B.1). Coordenadas en objeto `{ lng, lat }`
 * — no tupla — igual que `UserDayItem.coords` y el jsonb.
 */
export interface TripOrigin {
  label: string
  /** ISO 3166-1 alpha-2; null si Mapbox no lo aporta. */
  countryCode: string | null
  coords: { lng: number; lat: number }
}

export interface Trip {
  id: string
  name: string
  /** Códigos ISO 3166-1 alpha-2; opcionales. La creación de viaje ya no exige países (geocodificación: `source.area` + `UserDayItem.region`). */
  countries: string[]
  /**
   * Rango YYYY-MM-DD opcional. `endDate` se deriva de `startDate + numDays − 1`
   * (días de calendario inclusive). Sin `startDate`, ambas quedan null.
   */
  startDate: string | null
  endDate: string | null
  /** Siempre alineado con `days.length` tras mutaciones / carga normalizada. */
  numDays: number | null
  /**
   * Qué espera el usuario del viaje (opcional). Se incluye en el briefing del asistente.
   * Texto libre; vacío se guarda como `null`.
   */
  expectations: string | null
  cover: string
  coverUrl: string | null
  sourceIds: string[]
  days: UserDay[]
  /** Seguros, SIM, descuentos, etc. a nivel de viaje (no por día). */
  basics: UserBasicItem[]
  /**
   * Estado de tareas indexado por clave derivada (`taskKeyForItem` /
   * `taskKeyForBasic` en `lib/trip-tasks.ts`), no por id de ítem: un alojamiento
   * de N noches es UNA reserva aunque aparezca N veces en la Ruta.
   * Solo entradas tocadas por el usuario; no duplica datos descriptivos del ítem.
   */
  tasks: Record<string, TripTaskState>
  /** Tareas manuales con su estado anidado. */
  extraTasks: ExtraTask[]
  /**
   * Ids estables de sugerencias de trámites de país descartadas
   * (`country:{iso}:{slug}` de GET /country-tasks). No viven en `tasks`.
   */
  dismissedCountryTasks: string[]
  /** Viajeros del viaje; nullable hasta T4.3 (coste por persona). */
  numTravelers: number | null
  /** Divisa del viaje (ISO 4217). Una sola para que el total sea suma válida. */
  currency: string
  /**
   * Origen del viajero (ciudad/dirección de salida). Null = no configurado
   * o viaje anterior a T4B.1.
   */
  origin: TripOrigin | null
  /**
   * Techo opcional (global y por grupo). null = no configurado / viaje anterior
   * a la vista de presupuesto. No es un coste: el dinero sigue en `tasks`.
   */
  budget: TripBudget | null
  /**
   * Resumen para Compartir. Lo escribe la IA; el usuario puede editarlo.
   * Null = nunca generado / viaje anterior a la columna.
   */
  shareCard: ShareCard | null
  /** Viajes pasados u ocultos del listado activo; siguen accesibles en Archivados. */
  archived?: boolean
  /** Slug del partner cuyo CTA originó el viaje (`/start?ref=…`). */
  referrer?: string | null
  /** Dueño (`trips.user_id`). Lo rellena la carga / el alta; vacío solo en fixtures de test. */
  ownerId?: string
  /** Versión OCC (`trips.version`). Default 1. */
  version?: number
}

export interface Source {
  id: string
  url: string
  author: string
  /** Título del artículo (og:title) o, si falta, etiqueta de guía `destino — N días`. */
  title: string
  /**
   * Zona geográfica del artículo (= `itinerary.destination` del backend, p. ej. "La Alpujarra granadina, Granada, Spain").
   * Se usa como fallback de `SourceItem.region` para geocodificar (`buildContextualQuery` en `lib/mapbox.ts`).
   */
  area: string | null
  /** Días que declara la guía original (`itinerary.total_days`); null si no es un número válido. */
  totalDays: number | null
  items: SourceItem[]
  /** Ofertas / básicos extraídos del blog (pestaña Descuentos). */
  basics: SourceBasicItem[]
  articleHtml: string
  ogImage: string | null
  /** Dueño de la fila (`sources.user_id`). Las fuentes de un viaje compartido son del dueño. */
  ownerId?: string
}

/**
 * Pista estructurada de un transporte extraído de una fuente (T4B.3 §9.7).
 * Texto + medio; sin coordenadas (no se geocodifica al cargar).
 */
export interface SourceRouteHint {
  from: string | null
  to: string | null
  mode: RouteMode | null
}

export interface SourceItem {
  id: string
  type: ItemType
  name: string
  detail: string | null
  dayHint: number | null
  /**
   * Pista geográfica concreta de este ítem (p. ej. "Soportújar, Granada"). Se usa para desambiguar
   * el geocoder (`tripDestination` en `lib/mapbox.ts`); si está vacía, se cae al `area` de la `Source`.
   */
  region?: string | null
  /** URL de afiliado o reserva (p. ej. alojamientos con link de booking/afiliado). */
  affiliateUrl?: string | null
  /** Nombre de marca/portal (derivado o explícito). */
  vendor?: string | null
  /**
   * Miniatura (p. ej. Unsplash inyectada en el servidor o resuelta en el cliente con `buildThumbQuery`).
   */
  thumbUrl?: string | null
  /** Transporte: from/to/mode de la extracción, antes de que el usuario confirme `route`. */
  sourceRouteHint?: SourceRouteHint
  /**
   * Pin extraído de un enlace de Google Maps del artículo (`attachMapsPinsFromHtml`).
   * Objeto `{ lng, lat }`. Solo se rellena si el ítem no tenía coords.
   */
  coords?: { lng: number; lat: number } | null
}

export interface UserDay {
  id: string
  /** Texto de la descripción (lo que va tras «Día n ·» en pantalla; sin prefijo fijo) */
  label: string
  items: UserDayItem[]
  /**
   * Huella de los ítems con los que se generó la última descripción por IA
   * (`dayItemsSignature`). Si coincide con la firma actual, el botón queda apagado.
   */
  summarySignature?: string | null
}

/**
 * Tipo de lugar de un extremo de tramo (T4B.3).
 * `airport` / `station` / `busStation` solo aparecen tras refinamiento por modo.
 */
export type RoutePlaceKind =
  | "airport"
  | "station"
  | "busStation"
  | "city"
  | "address"
  | "other"

/** Extremo resuelto de un tramo de ida/vuelta. Coordenadas siempre objeto `{lng,lat}`. */
export interface RoutePlace {
  label: string
  coords: { lng: number; lat: number }
  kind: RoutePlaceKind
}

/** Medio elegido para el tramo; null/ausente = «aún no lo sé». */
export type RouteMode = "car" | "train" | "bus" | "flight" | "ferry" | "other"

/** Dirección del tramo respecto al viaje. */
export type RouteLeg = "outbound" | "return"

/**
 * Cadena de un tramo de ida/vuelta (T4B.3). Vive en el ítem, no en el Trip.
 * `mode` nullable a propósito: el tramo existe antes de decidir el medio.
 */
export interface TransportRoute {
  from: RoutePlace
  to: RoutePlace
  mode?: RouteMode | null
  leg?: RouteLeg
}

export interface UserDayItem {
  id: string
  sourceItemId: string
  sourceId: string
  type: ItemType
  name: string
  detail: string | null
  sourceAuthor: string
  /** Misma pista que `SourceItem.region`; copiada al añadir al día para no depender de la `Source`. */
  region?: string | null
  /**
   * Coordenadas resueltas (p. ej. al elegir un candidato Mapbox en ítems manuales).
   * Objeto `{ lng, lat }` — no tupla — para el jsonb y el contrato de `LngLat`.
   * En tramos con `route` (T4B.3): apunta a `route.to.coords` (destino del tramo;
   * en la vuelta es la casa). El mapa (T4B.6) usará `route.from`/`route.to` directamente.
   */
  coords?: { lng: number; lat: number } | null
  affiliateUrl?: string | null
  vendor?: string | null
  /**
   * Tramo de ida/vuelta o traslado interno estructurado (T4B.3).
   * Con `leg` = ida/vuelta del viaje; sin `leg` = desplazamiento interno.
   * `from`/`to` son la fuente de verdad; `name` se deriva como «A → B».
   */
  route?: TransportRoute
  /**
   * Pista de la fuente al consolidar un transporte (T4B.3 §9.7).
   * La UI/tareas usan `route` cuando existe; el hint solo precarga el formulario.
   */
  sourceRouteHint?: SourceRouteHint
}

export interface SourceBasicItem {
  id: string
  category: BasicCategory
  name: string
  detail: string | null
  vendor: string | null
  affiliateUrl: string | null
  thumbUrl?: string | null
}

export interface UserBasicItem {
  id: string
  sourceBasicItemId: string
  sourceId: string
  category: BasicCategory
  name: string
  detail: string | null
  vendor: string | null
  affiliateUrl: string | null
  sourceAuthor: string
}