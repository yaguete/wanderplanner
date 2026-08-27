/**
 * Duración de un ítem (T4B.2b): un ancla persistida, N ecos derivados.
 *
 * `spanDays` = días de calendario que cubre, contando el de inicio.
 * Ausente o 1 = solo su día. Al escribir solo se persiste si ≥ 2.
 * Lo usan stay (noches) y activity (días de la actividad); no food ni
 * transport. El mapa de apertura/cierre de jornada sigue siendo solo stay.
 *
 * No replica el ítem en `days[].items`. Las fuentes siguen con N copias
 * persistidas; los ecos son solo para anclas con `spanDays`.
 */
import type { ItemType, UserDay, UserDayItem } from "@/types/itinerary"

/** Stay (noches) y activity (excursión de varios días). */
export function itemTakesCalendarSpan(type: ItemType): boolean {
  return type === "stay" || type === "activity"
}

export function spanAnchorLabel(type: ItemType, spanTotal: number): string | null {
  if (spanTotal < 2) return null
  if (type === "stay") return `${spanTotal} noches`
  if (type === "activity") return `${spanTotal} días`
  return null
}

export function spanEchoLabel(
  type: ItemType,
  spanIndex: number,
  spanTotal: number,
): string {
  if (type === "stay") return `Noche ${spanIndex} de ${spanTotal}`
  return `Día ${spanIndex} de ${spanTotal}`
}

export function spanEchoRemoveLabel(type: ItemType): string {
  return type === "stay" ? "Acortar la estancia" : "Acortar la actividad"
}

export function spanClipNotice(type: ItemType, nextSpan: number, numDays: number): string {
  const unit =
    type === "stay"
      ? nextSpan === 1
        ? "1 noche"
        : `${nextSpan} noches`
      : nextSpan === 1
        ? "1 día"
        : `${nextSpan} días`
  return `Quedan ${unit}: el viaje acaba el día ${numDays}`
}

/** Tope del viaje (mismo que `&days=N` / adopción partner). */
const SPAN_DAYS_MAX = 60

/**
 * Lectura defensiva. Devuelve `undefined` si ausente, 1, no-entero o inválido
 * — las dos representaciones de «solo su día» colapsan a la misma.
 */
export function parseSpanDays(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 2) return undefined
  if (raw > SPAN_DAYS_MAX) return SPAN_DAYS_MAX
  return raw
}

/**
 * Recorta al resto del viaje desde el ancla. Nunca crea días.
 * Devuelve ≥ 1; 1 significa «solo su día» (no persistir).
 */
export function clipSpanToTrip(
  anchorIndex: number,
  spanDays: number,
  numDays: number,
): number {
  if (!Number.isInteger(anchorIndex) || anchorIndex < 0 || anchorIndex >= numDays) {
    return 1
  }
  const max = numDays - anchorIndex
  const n = Number.isFinite(spanDays) ? Math.floor(spanDays) : 1
  if (n < 1) return 1
  return Math.min(n, max)
}

/** Valor a persistir: ≥ 2 recortado, o `undefined` si queda en 1. */
export function spanDaysForWrite(
  nights: number,
  anchorIndex: number,
  numDays: number,
): number | undefined {
  const clipped = clipSpanToTrip(anchorIndex, nights, numDays)
  return clipped >= 2 ? clipped : undefined
}

export function applySpanDays(
  item: UserDayItem,
  nights: number,
  anchorIndex: number,
  numDays: number,
): UserDayItem {
  const span = spanDaysForWrite(nights, anchorIndex, numDays)
  if (span == null) {
    if (item.spanDays === undefined) return item
    const next = { ...item }
    delete next.spanDays
    return next
  }
  if (item.spanDays === span) return item
  return { ...item, spanDays: span }
}

/**
 * `spanIndex` es 1-based (ancla = 1). Quitar el eco k deja `spanDays = k − 1`.
 * Si resulta 1, se omite el campo.
 */
export function spanDaysAfterDroppingEcho(spanIndex: number): number | undefined {
  if (!Number.isInteger(spanIndex) || spanIndex < 2) return undefined
  return spanIndex - 1 >= 2 ? spanIndex - 1 : undefined
}

export type SpannedSlot = {
  item: UserDayItem
  /** 1-based, igual que el resto del mapa / Ruta. */
  dayNumber: number
  /** 1-based: el ancla es 1. */
  spanIndex: number
  spanTotal: number
  isEcho: boolean
}

type StaySpan = {
  item: UserDayItem
  anchorIndex: number
  spanTotal: number
}

function listSpannedAnchors(days: UserDay[]): StaySpan[] {
  const numDays = days.length
  const out: StaySpan[] = []
  days.forEach((day, dayIndex) => {
    for (const item of day.items) {
      if (!itemTakesCalendarSpan(item.type)) continue
      const parsed = parseSpanDays(item.spanDays)
      if (parsed == null) continue
      const spanTotal = clipSpanToTrip(dayIndex, parsed, numDays)
      if (spanTotal < 2) continue
      out.push({ item, anchorIndex: dayIndex, spanTotal })
    }
  })
  return out
}

/**
 * Por día: ítems persistidos (en orden) más los ecos que le tocan, al inicio.
 * Si el día ya tiene el ítem (fuente replicada), no se duplica el eco.
 *
 * Única fuente de ecos para Ruta y calendario. Calcúlalo una vez por
 * `trip.days` y reparte el tramo; no lo llames dentro del `map` de días.
 */
export function expandSpannedItems(days: UserDay[]): SpannedSlot[][] {
  const numDays = days.length
  const spans = listSpannedAnchors(days)
  return days.map((day, dayIndex) => {
    const slots: SpannedSlot[] = []
    const presentIds = new Set(day.items.map((i) => i.id))

    for (const span of spans) {
      const last = span.anchorIndex + span.spanTotal - 1
      if (dayIndex <= span.anchorIndex || dayIndex > last) continue
      if (presentIds.has(span.item.id)) continue
      slots.push({
        item: span.item,
        dayNumber: dayIndex + 1,
        spanIndex: dayIndex - span.anchorIndex + 1,
        spanTotal: span.spanTotal,
        isEcho: true,
      })
    }

    for (const item of day.items) {
      const span = spans.find((s) => s.item.id === item.id && s.anchorIndex === dayIndex)
      slots.push({
        item,
        dayNumber: dayIndex + 1,
        spanIndex: 1,
        spanTotal: span?.spanTotal ?? 1,
        isEcho: false,
      })
    }

    return slots
  })
}

export function hasFiniteLngLat(
  c: { lng: number; lat: number } | null | undefined,
): c is { lng: number; lat: number } {
  return (
    !!c &&
    typeof c.lng === "number" &&
    typeof c.lat === "number" &&
    Number.isFinite(c.lng) &&
    Number.isFinite(c.lat)
  )
}

export type StaySpanMapAnchor = {
  item: UserDayItem
  coords: { lng: number; lat: number }
  anchorIndex: number
  spanTotal: number
}

/**
 * Anclas de mapa: solo stays con coords finitas y span ≥ 2.
 * Una activity con spanDays sale en la Ruta (ecos), no como apertura/cierre.
 */
export function listStaySpanMapAnchors(days: UserDay[]): StaySpanMapAnchor[] {
  const out: StaySpanMapAnchor[] = []
  for (const span of listSpannedAnchors(days)) {
    if (span.item.type !== "stay") continue
    if (!hasFiniteLngLat(span.item.coords)) continue
    out.push({
      item: span.item,
      coords: span.item.coords,
      anchorIndex: span.anchorIndex,
      spanTotal: span.spanTotal,
    })
  }
  return out
}

/** Cierra los días d..d+N−1 (0-based). */
export function staySpanClosesDay(span: StaySpanMapAnchor, dayIndex: number): boolean {
  return dayIndex >= span.anchorIndex && dayIndex <= span.anchorIndex + span.spanTotal - 1
}

/**
 * Abre los días d+1..d+N (0-based), incluida la mañana de checkout
 * (día d+N), que no lleva tarjeta en la Ruta.
 */
export function staySpanOpensDay(span: StaySpanMapAnchor, dayIndex: number): boolean {
  return dayIndex >= span.anchorIndex + 1 && dayIndex <= span.anchorIndex + span.spanTotal
}

export function staySpanPlaceId(
  anchorId: string,
  role: "open" | "close",
  dayNumber: number,
): string {
  return `${anchorId}::${role}::${dayNumber}`
}

export function isStaySpanPlaceId(id: string): boolean {
  return id.includes("::open::") || id.includes("::close::")
}

/**
 * Recorta `spanDays` que se salen del viaje. El dato nunca miente: alargar
 * el viaje después no re-expande la estancia.
 */
export function clipSpanDaysInDays(days: UserDay[]): UserDay[] {
  const numDays = days.length
  let changed = false
  const next = days.map((day, dayIndex) => {
    let itemsChanged = false
    const items = day.items.map((item) => {
      if (item.spanDays === undefined) return item
      const parsed = parseSpanDays(item.spanDays)
      if (parsed == null) {
        itemsChanged = true
        const rest = { ...item }
        delete rest.spanDays
        return rest
      }
      const clipped = clipSpanToTrip(dayIndex, parsed, numDays)
      if (clipped < 2) {
        itemsChanged = true
        const rest = { ...item }
        delete rest.spanDays
        return rest
      }
      if (clipped !== item.spanDays) {
        itemsChanged = true
        return { ...item, spanDays: clipped }
      }
      return item
    })
    if (!itemsChanged) return day
    changed = true
    return { ...day, items }
  })
  return changed ? next : days
}

/**
 * Al borrar el día ancla de un stay/activity con span, mueve el ítem al
 * primer día cubierto que sobreviva, conservando `id` (y por tanto la clave
 * de tarea y el coste). Si no queda ningún día cubierto, el ítem se pierde
 * con el día.
 */
export function reanchorSpannedStays(before: UserDay[], after: UserDay[]): UserDay[] {
  if (after.length === 0 || before.length === after.length) return after
  const afterIds = new Set(after.map((d) => d.id))
  const afterHasItem = (id: string) => after.some((d) => d.items.some((i) => i.id === id))

  const rescued: { item: UserDayItem; targetDayId: string; nights: number }[] = []

  before.forEach((day, dayIndex) => {
    if (afterIds.has(day.id)) return
    for (const item of day.items) {
      if (!itemTakesCalendarSpan(item.type)) continue
      if (afterHasItem(item.id)) continue
      const parsed = parseSpanDays(item.spanDays)
      if (parsed == null) continue
      const spanTotal = clipSpanToTrip(dayIndex, parsed, before.length)
      if (spanTotal < 2) continue

      const coveredIds: string[] = []
      for (let k = 0; k < spanTotal; k++) {
        const covered = before[dayIndex + k]
        if (covered) coveredIds.push(covered.id)
      }
      const surviving = coveredIds.filter((id) => afterIds.has(id))
      if (surviving.length === 0) continue

      rescued.push({ item, targetDayId: surviving[0]!, nights: surviving.length })
    }
  })

  if (rescued.length === 0) return after

  const next = after.map((d) => ({ ...d, items: [...d.items] }))
  for (const { item, targetDayId, nights } of rescued) {
    const di = next.findIndex((d) => d.id === targetDayId)
    if (di < 0) continue
    if (next[di]!.items.some((i) => i.id === item.id)) continue
    const target = next[di]!
    const placed = applySpanDays(item, nights, di, next.length)
    next[di] = { ...target, items: [placed, ...target.items] }
  }
  return next
}

/**
 * Pines del mapa: el array completo es la ruta (open/close son vértices).
 * Viaje entero → solo ítems reales. Día enfocado → un pin sintético por
 * ancla si ese día no tiene el stay persistido.
 */
export function filterStaySpanPins<
  T extends { id: string; spanRole?: "open" | "close"; spanAnchorId?: string },
>(places: T[], focusDayNumber: number | null): T[] {
  if (focusDayNumber == null) return places.filter((p) => !p.spanRole)
  const realIds = new Set(places.filter((p) => !p.spanRole).map((p) => p.id))
  const seenAnchor = new Set<string>()
  const out: T[] = []
  for (const p of places) {
    if (!p.spanRole) {
      out.push(p)
      continue
    }
    const anchorId = p.spanAnchorId
    if (anchorId && realIds.has(anchorId)) continue
    if (anchorId) {
      if (seenAnchor.has(anchorId)) continue
      seenAnchor.add(anchorId)
    }
    out.push(p)
  }
  return out
}

/** Unión ordenada de apariciones reales + rango del span, sin duplicados. */
export function unionStayDayIndexes(
  dayIndexes: number[],
  anchorIndex: number,
  spanDays: number | undefined,
  numDays: number,
): number[] {
  const set = new Set<number>()
  for (const i of dayIndexes) {
    if (Number.isInteger(i) && i >= 0 && i < numDays) set.add(i)
  }
  const parsed = parseSpanDays(spanDays)
  if (parsed != null) {
    const total = clipSpanToTrip(anchorIndex, parsed, numDays)
    for (let k = 0; k < total; k++) {
      const idx = anchorIndex + k
      if (idx < numDays) set.add(idx)
    }
  }
  return [...set].sort((a, b) => a - b)
}
