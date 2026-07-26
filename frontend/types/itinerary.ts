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
  total_days: number
  source_structured_by_days: boolean
  days: ItineraryDay[]
  general_tips: string | null
  /** Seguros, SIM, alquiler, vuelos, etc. a nivel de artículo (no por día). */
  basics?: BasicItem[]
  og_image?: string | null
  article_html?: string
}

// ── App-level types ───────────────────────────────────────────────────────────

export type ItemType = "transport" | "stay" | "food" | "activity"

/** Categoría de “Básicos” en app (camelCase). */
export type BasicCategory = "insurance" | "sim" | "carRental" | "flight" | "other"

export interface Trip {
  id: string
  name: string
  /** Códigos ISO 3166-1 alpha-2; opcionales. La creación de viaje ya no exige países (geocodificación: `UserDayItem.region` y nombre del viaje). */
  countries: string[]
  /** Rango (YYYY-MM-DD); no tiene que alinearse con `numDays` aprox. */
  startDate: string | null
  endDate: string | null
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
  /** Viajes pasados u ocultos del listado activo; siguen accesibles en Archivados. */
  archived?: boolean
}

export interface Source {
  id: string
  url: string
  author: string
  title: string
  /**
   * Zona geográfica del artículo (= `itinerary.destination` del backend, p. ej. "La Alpujarra granadina, Granada, Spain").
   * Se usa como fallback de `SourceItem.region` para geocodificar (`buildContextualQuery` en `lib/mapbox.ts`).
   */
  area: string | null
  items: SourceItem[]
  /** Ofertas / básicos extraídos del blog (pestaña Descuentos). */
  basics: SourceBasicItem[]
  articleHtml: string
  ogImage: string | null
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
}

export interface UserDay {
  id: string
  /** Texto de la descripción (lo que va tras «Día n ·» en pantalla; sin prefijo fijo) */
  label: string
  items: UserDayItem[]
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
  affiliateUrl?: string | null
  vendor?: string | null
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

// ── Legacy types (backward compat for old components, will be removed) ────────

export interface Reference {
  id: string
  url: string
  destination: string
  totalDays: number
  ogImage: string | null
  articleHtml: string
  itinerary: Itinerary
}

export type TripItemKind = "accommodation" | "activity" | "restaurant" | "transport"

export interface TripItem {
  id: string
  kind: TripItemKind
  name: string
  subtitle: string | null
  sourceRefId: string
}

export interface TripDay {
  id: string
  dayNumber: number
  title: string
  items: TripItem[]
}
