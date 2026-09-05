/**
 * Selector derivado de tareas del viaje: no duplica ítems ni reservas.
 * Compone la lista agregando `trip.days[].items` por clave derivada
 * (`taskKeyForItem`), más `basics` (`taskKeyForBasic`) y `extraTasks`,
 * y asocia el `TripTaskState` persistido (o `null` si nunca se ha tocado).
 *
 * También expone `pruneTaskStates` (claves vivas) para limpiar huérfanos
 * al serializar y al mutar en memoria ("borrar es olvidar").
 */
import { isMirroredFlightRoundtrip } from "@/lib/flight-search"
import { itemTakesCalendarSpan, parseSpanDays, unionStayDayIndexes } from "@/lib/item-span"
import type {
  BasicCategory,
  ExtraTask,
  ItemType,
  RouteMode,
  TransportRoute,
  Trip,
  TripTaskCategory,
  TripTaskState,
  TripTaskStatus,
  UserBasicItem,
  UserDay,
  UserDayItem,
} from "@/types/itinerary"

const OUTBOUND_TASK_KEY = "leg:outbound"
const RETURN_TASK_KEY = "leg:return"

function addTaskCosts(
  a: number | null | undefined,
  b: number | null | undefined,
): number | null {
  if (a == null && b == null) return null
  return (a ?? 0) + (b ?? 0)
}

function combinedTaskState(
  a: TripTaskState | null,
  b: TripTaskState | null,
): TripTaskState | null {
  if (!b) return a
  if (!a) return b
  return { ...a, cost: addTaskCosts(a.cost, b.cost) }
}

/**
 * Si ida y vuelta son el mismo vuelo espejado, el coste de `leg:return`
 * pasa a `leg:outbound` y se borra la clave de vuelta. Idempotente.
 */
export function foldMirroredFlightReturnCost(
  tasks: Record<string, TripTaskState>,
  days: UserDay[],
): Record<string, TripTaskState> {
  if (!isMirroredFlightRoundtrip(days)) return tasks
  const ret = tasks[RETURN_TASK_KEY]
  if (!ret) return tasks
  const next = { ...tasks }
  const out = next[OUTBOUND_TASK_KEY]
  next[OUTBOUND_TASK_KEY] = out
    ? { ...out, cost: addTaskCosts(out.cost, ret.cost) }
    : { ...ret }
  delete next[RETURN_TASK_KEY]
  return next
}

export type DerivedTaskOrigin = "dayItem" | "basic" | "extra"

/** Dónde pinta T4.2 la tarea. Único sitio que decide pertenencia. */
export type TaskBucket = "main" | "triage" | "dismissed"

export type DerivedTripTask = {
  /** Clave de tarea (`taskKeyForItem` / `taskKeyForBasic` / id del extra). */
  id: string
  origin: DerivedTaskOrigin
  category: TripTaskCategory
  /** Discriminador original: `ItemType` (día), `BasicCategory` (básico) o la categoría del extra. */
  sourceKind: ItemType | BasicCategory | TripTaskCategory
  title: string
  /** `null` = nunca tocada. */
  state: TripTaskState | null
  bucket: TaskBucket
  /** Ids de todas las ocurrencias agregadas. */
  itemIds: string[]
  /** Índices de día (0-based), ordenados y sin repetir. Vacío en básicos/extras. */
  dayIndexes: number[]
  /** Número de ocurrencias persistidas (= `itemIds.length`). En stays
   *  manuales con `spanDays`, `nights` puede ser mayor: no confundir. */
  occurrences: number
  /** Solo alojamiento: noches = días cubiertos (apariciones o `spanDays`). */
  nights?: number
  sourceId?: string
  affiliateUrl?: string | null
  /** Compañía / proveedor (p. ej. Vueling), si el ítem lo trae. */
  vendor?: string | null
  /** Nota o referencia del usuario (p. ej. localizador). */
  detail?: string | null
  /** Tramo de ida/vuelta (T4B.3); ausente en el resto. */
  route?: TransportRoute
  /**
   * Ida y vuelta en avión espejadas: una sola fila (clave `leg:outbound`).
   * La Ruta sigue mostrando dos tarjetas.
   */
  roundtripFlight?: boolean
}

export type TripTaskTotals = {
  byStatus: { pending: number; booked: number; paid: number }
  costByStatus: { pending: number; booked: number; paid: number }
  costByCategory: Partial<Record<TripTaskCategory, number>>
  totalCost: number
}

/** Categorías que no pasan por triaje: entran directo a `main` si no están descartadas. */
const ALWAYS_ACTIONABLE: ReadonlySet<TripTaskCategory> = new Set([
  "accommodation",
  "transport",
  "basic",
  "paperwork",
  "health",
  "other",
])

/** Trim + minúsculas + sin acentos + espacios colapsados. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

/**
 * Única forma de construir la clave de un ítem de día.
 * Prefijo `ItemType` evita colisionar un restaurante con una actividad homónima.
 * No incluye `sourceId`: el mismo hotel desde dos blogs es UNA reserva.
 *
 * Tramos de ida/vuelta (T4B.3): clave semántica `leg:outbound` / `leg:return`
 * (SIN prefijo `transport:`). Motivo: (1) ida y vuelta mantienen coste/estado
 * independientes aunque se editen extremos o medio; (2) el namespace `leg:` no
 * puede colisionar con la ruta normal `ItemType:…` aunque el usuario nombre
 * un ítem «leg:outbound».
 *
 * Traslados internos estructurados (sin `leg`): `route:${item.id}` — estable
 * al editar extremos/medio/día; dos reservas iguales no mezclan coste.
 */
export function taskKeyForItem(
  item: Pick<UserDayItem, "type" | "name" | "route"> & { id?: string },
): string {
  const leg = item.route?.leg
  if (item.type === "transport" && (leg === "outbound" || leg === "return")) {
    return `leg:${leg}`
  }
  if (
    item.type === "transport" &&
    item.route?.from &&
    item.route.to &&
    !leg &&
    item.id
  ) {
    return `route:${item.id}`
  }
  return `${item.type}:${normalizeName(item.name)}`
}

/**
 * Clave de estado que pinta la Ruta. Ida y vuelta en avión espejadas son
 * una sola reserva (`leg:outbound`); la tarjeta de vuelta no mira `leg:return`.
 * `taskKeyForItem` no cambia: sigue siendo la clave de persistencia del ítem.
 */
export function taskKeyForRouteItem(
  item: Pick<UserDayItem, "type" | "name" | "route"> & { id?: string },
  days: UserDay[],
): string {
  if (
    isMirroredFlightRoundtrip(days) &&
    item.type === "transport" &&
    item.route?.leg === "return"
  ) {
    return OUTBOUND_TASK_KEY
  }
  return taskKeyForItem(item)
}

/**
 * Clave de un básico. Incluye categoría + nombre normalizado para deduplicar
 * el mismo seguro/SIM/… llegado desde dos fuentes (no el uuid del ítem).
 */
export function taskKeyForBasic(
  basic: Pick<UserBasicItem, "category" | "name">,
): string {
  return `basic:${basic.category}:${normalizeName(basic.name)}`
}

export function categoryFromItemType(type: ItemType): TripTaskCategory {
  switch (type) {
    case "stay":
      return "accommodation"
    case "transport":
      return "transport"
    case "activity":
      return "activity"
    case "food":
      return "food"
  }
}

/** Todos los básicos del viaje caen en la categoría de vista `basic`. */
export function categoryFromBasic(_category: BasicCategory): TripTaskCategory {
  return "basic"
}

/**
 * Medios que sí se reservan/compran (billete). El resto (coche, other, sin medio)
 * va a triaje y, en main, usa el chip «Hecho» en vez de Reservado/Pagado.
 */
export function isBookableTransportMode(mode: RouteMode | null | undefined): boolean {
  return mode === "flight" || mode === "train" || mode === "bus" || mode === "ferry"
}

/** `cancellable` solo aplica en alojamiento y transporte con billete. */
export function cancellableApplies(
  category: TripTaskCategory,
  routeMode?: RouteMode | null,
): boolean {
  if (category === "accommodation") return true
  if (category === "transport") return isBookableTransportMode(routeMode)
  return false
}

/** El control solo se enseña en Pagado; Reservado no lo pinta. */
export function cancellableControlVisible(
  category: TripTaskCategory,
  routeMode: RouteMode | null | undefined,
  status: TripTaskStatus | null,
): boolean {
  return cancellableApplies(category, routeMode) && status === "paid"
}

function needsTriage(category: TripTaskCategory): boolean {
  return !ALWAYS_ACTIONABLE.has(category)
}

/**
 * Resolutor de tres estados para el indicador de la Ruta
 * (reservado ✓ / pendiente / no aplica). Ausencia → `"pending"`.
 * Única lectura O(1) que T4.2 debe usar sobre `trip.tasks[taskKey]`.
 */
export function resolveTaskStatus(state: TripTaskState | null): TripTaskStatus {
  return state?.status ?? "pending"
}

/**
 * Estado de una tarea del bucket `main`, para totales.
 * `null` / ausente → pending; `notNeeded` no debería llegar aquí (bucket dismissed).
 * No usar desde la Ruta: ahí va `resolveTaskStatus`.
 */
export function effectiveStatus(
  state: TripTaskState | null,
): "pending" | "booked" | "paid" {
  if (state?.status === "booked") return "booked"
  if (state?.status === "paid") return "paid"
  return "pending"
}

/** True si la tarea cuenta como gestionada (reservada, pagada o hecha). */
export function isTaskManaged(state: TripTaskState | null): boolean {
  const s = effectiveStatus(state)
  return s === "booked" || s === "paid"
}

/**
 * Bucket de accionabilidad. T4.2 solo pinta; no decide pertenencia.
 * Extras no pasan por triaje (nunca `"triage"`), pero `notNeeded` → `"dismissed"`.
 * Transporte sin billete (coche / other / sin medio) entra en triaje si no se ha tocado.
 * Activity con enlace de reserva se comporta como un stay → `main`.
 */
export function taskBucket(
  category: TripTaskCategory,
  state: TripTaskState | null,
  origin: DerivedTaskOrigin,
  opts?: { routeMode?: RouteMode | null; hasAffiliate?: boolean },
): TaskBucket {
  const routeMode = opts?.routeMode
  if (state?.status === "notNeeded") return "dismissed"
  if (origin === "extra") return "main"
  if (
    category === "transport" &&
    origin === "dayItem" &&
    !isBookableTransportMode(routeMode) &&
    state === null
  ) {
    return "triage"
  }
  if (needsTriage(category) && state === null) {
    if (category === "activity" && opts?.hasAffiliate) return "main"
    return "triage"
  }
  return "main"
}

/**
 * Elimina del mapa las claves que ya no tienen ninguna ocurrencia viva
 * (ítems de día vía `taskKeyForItem`, o básicos vía `taskKeyForBasic`).
 * Punto único de poda: serialización (`tripToRow`) y mutaciones en memoria.
 */
export function pruneTaskStates(
  trip: Pick<Trip, "days" | "basics" | "tasks">,
): Record<string, TripTaskState> {
  const folded = foldMirroredFlightReturnCost(trip.tasks ?? {}, trip.days ?? [])
  const live = new Set<string>()
  for (const day of trip.days ?? []) {
    for (const item of day.items ?? []) live.add(taskKeyForItem(item))
  }
  for (const basic of trip.basics ?? []) live.add(taskKeyForBasic(basic))

  const next: Record<string, TripTaskState> = {}
  for (const [key, state] of Object.entries(folded)) {
    if (live.has(key)) next[key] = state
  }
  return next
}

/** Aplica poda de tareas al objeto Trip (memoria: "borrar es olvidar"). */
export function withPrunedTasks(trip: Trip): Trip {
  return { ...trip, tasks: pruneTaskStates(trip) }
}

type DayItemGroup = {
  key: string
  type: ItemType
  category: TripTaskCategory
  title: string
  itemIds: string[]
  dayIndexes: number[]
  dayIndexSet: Set<number>
  sourceId?: string
  affiliateUrl: string | null
  vendor: string | null
  detail: string | null
  route?: TransportRoute
}

function aggregateDayItems(trip: Trip): DerivedTripTask[] {
  const groups = new Map<string, DayItemGroup>()
  const order: string[] = []
  const numDays = trip.days.length

  trip.days.forEach((day, dayIndex) => {
    for (const item of day.items) {
      const key = taskKeyForItem(item)
      let group = groups.get(key)
      if (!group) {
        group = {
          key,
          type: item.type,
          category: categoryFromItemType(item.type),
          title: item.name,
          itemIds: [],
          dayIndexes: [],
          dayIndexSet: new Set(),
          sourceId: item.sourceId,
          affiliateUrl: item.affiliateUrl ?? null,
          vendor: item.vendor?.trim() || null,
          detail: item.detail?.trim() || null,
          route: item.route,
        }
        groups.set(key, group)
        order.push(key)
      } else if (item.route) {
        // Mantener el route más reciente (p. ej. tras editar extremos).
        group.title = item.name
        group.route = item.route
      }
      group.itemIds.push(item.id)
      if (!group.dayIndexSet.has(dayIndex)) {
        group.dayIndexSet.add(dayIndex)
        group.dayIndexes.push(dayIndex)
      }
      if (itemTakesCalendarSpan(item.type)) {
        const span = parseSpanDays(item.spanDays)
        if (span != null) {
          for (const idx of unionStayDayIndexes([], dayIndex, span, numDays)) {
            if (!group.dayIndexSet.has(idx)) {
              group.dayIndexSet.add(idx)
              group.dayIndexes.push(idx)
            }
          }
        }
      }
      if (!group.affiliateUrl && item.affiliateUrl) {
        group.affiliateUrl = item.affiliateUrl
      }
      const vendor = item.vendor?.trim()
      if (vendor) group.vendor = vendor
      const detail = item.detail?.trim()
      if (detail) group.detail = detail
    }
  })

  return order.map((key) => {
    const g = groups.get(key)!
    const state = trip.tasks[key] ?? null
    const origin: DerivedTaskOrigin = "dayItem"
    const dayIndexes = [...g.dayIndexes].sort((a, b) => a - b)
    return {
      id: key,
      origin,
      category: g.category,
      sourceKind: g.type,
      title: g.title,
      state,
      bucket: taskBucket(g.category, state, origin, {
        routeMode: g.route?.mode,
        hasAffiliate: Boolean(g.affiliateUrl),
      }),
      itemIds: g.itemIds,
      dayIndexes,
      occurrences: g.itemIds.length,
      nights: g.type === "stay" ? dayIndexes.length : undefined,
      sourceId: g.sourceId,
      affiliateUrl: g.affiliateUrl,
      vendor: g.vendor,
      detail: g.detail,
      route: g.route,
    }
  })
}

type BasicGroup = {
  key: string
  category: BasicCategory
  title: string
  itemIds: string[]
  sourceId?: string
  affiliateUrl: string | null
  vendor: string | null
  detail: string | null
}

function aggregateBasics(trip: Trip): DerivedTripTask[] {
  const groups = new Map<string, BasicGroup>()
  const order: string[] = []

  for (const basic of trip.basics) {
    const key = taskKeyForBasic(basic)
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        category: basic.category,
        title: basic.name,
        itemIds: [],
        sourceId: basic.sourceId,
        affiliateUrl: basic.affiliateUrl,
        vendor: basic.vendor?.trim() || null,
        detail: basic.detail?.trim() || null,
      }
      groups.set(key, group)
      order.push(key)
    }
    group.itemIds.push(basic.id)
    if (!group.affiliateUrl && basic.affiliateUrl) {
      group.affiliateUrl = basic.affiliateUrl
    }
    const vendor = basic.vendor?.trim()
    if (vendor) group.vendor = vendor
    const detail = basic.detail?.trim()
    if (detail) group.detail = detail
  }

  return order.map((key) => {
    const g = groups.get(key)!
    const state = trip.tasks[key] ?? null
    const category = categoryFromBasic(g.category)
    const origin: DerivedTaskOrigin = "basic"
    return {
      id: key,
      origin,
      category,
      sourceKind: g.category,
      title: g.title,
      state,
      bucket: taskBucket(category, state, origin),
      itemIds: g.itemIds,
      dayIndexes: [],
      occurrences: g.itemIds.length,
      sourceId: g.sourceId,
      affiliateUrl: g.affiliateUrl,
      vendor: g.vendor,
      detail: g.detail,
    }
  })
}

function extraTask(extra: ExtraTask): DerivedTripTask {
  const origin: DerivedTaskOrigin = "extra"
  return {
    id: extra.id,
    origin,
    category: extra.category,
    sourceKind: extra.category,
    title: extra.title,
    state: extra.state,
    bucket: taskBucket(extra.category, extra.state, origin),
    itemIds: [extra.id],
    dayIndexes: [],
    occurrences: 1,
  }
}

function mergeMirroredFlightTasks(tasks: DerivedTripTask[]): DerivedTripTask[] {
  const outbound = tasks.find((t) => t.id === OUTBOUND_TASK_KEY)
  const ret = tasks.find((t) => t.id === RETURN_TASK_KEY)
  if (!outbound || !ret) return tasks
  const merged: DerivedTripTask = {
    ...outbound,
    itemIds: [...outbound.itemIds, ...ret.itemIds],
    dayIndexes: [...outbound.dayIndexes, ...ret.dayIndexes],
    occurrences: outbound.occurrences + ret.occurrences,
    roundtripFlight: true,
    state: combinedTaskState(outbound.state, ret.state),
    route: outbound.route,
  }
  return tasks
    .filter((t) => t.id !== RETURN_TASK_KEY)
    .map((t) => (t.id === OUTBOUND_TASK_KEY ? merged : t))
}

/**
 * Lista agregada de tareas: una entrada por reserva (clave), no por ocurrencia.
 * Orden: primera aparición en días, luego básicos, luego extras.
 * Ausencia en el mapa → `state: null` (sin centinela).
 * Ida y vuelta en avión espejadas → una sola tarea (`leg:outbound`).
 */
export function buildTripTasks(trip: Trip): DerivedTripTask[] {
  let out = aggregateDayItems(trip)
  if (isMirroredFlightRoundtrip(trip.days)) {
    out = mergeMirroredFlightTasks(out)
  }
  out.push(...aggregateBasics(trip))
  for (const extra of trip.extraTasks) {
    out.push(extraTask(extra))
  }
  return out
}

/**
 * Totales solo sobre el bucket `main`. Excluye `triage` y `dismissed`.
 * El "X de Y gestionadas" = `booked + paid` sobre `booked + paid + pending`.
 * Costes `null` no entran en `costByStatus` / `costByCategory` / `totalCost`.
 * `categories`: si se pasa, solo cuenta tareas de esas categorías (vista por pestaña).
 */
export function computeTripTaskTotals(
  tasks: DerivedTripTask[],
  options?: { categories?: ReadonlyArray<TripTaskCategory> },
): TripTaskTotals {
  const categorySet =
    options?.categories && options.categories.length > 0
      ? new Set(options.categories)
      : null

  const byStatus = { pending: 0, booked: 0, paid: 0 }
  const costByStatus = { pending: 0, booked: 0, paid: 0 }
  const costByCategory: Partial<Record<TripTaskCategory, number>> = {}
  let totalCost = 0

  for (const task of tasks) {
    if (task.bucket !== "main") continue
    if (categorySet && !categorySet.has(task.category)) continue

    const status = effectiveStatus(task.state)
    byStatus[status] += 1

    const cost = task.state?.cost
    if (cost != null && Number.isFinite(cost)) {
      costByStatus[status] += cost
      costByCategory[task.category] = (costByCategory[task.category] ?? 0) + cost
      totalCost += cost
    }
  }

  return {
    byStatus,
    costByStatus,
    costByCategory,
    totalCost,
  }
}

function normalizeCost(cost: number | null | undefined): number | null {
  if (cost == null) return null
  if (!Number.isFinite(cost) || cost < 0) return null
  return cost
}

/** Merge parcial de estado; sella `updatedAt` en ISO UTC. Coste inválido → null. */
export function mergeTaskState(
  current: TripTaskState | null | undefined,
  patch: Partial<TripTaskState>,
  now: string = new Date().toISOString(),
): TripTaskState {
  const nextCost =
    patch.cost !== undefined ? normalizeCost(patch.cost) : (current?.cost ?? null)
  return {
    status: patch.status ?? current?.status ?? "pending",
    cost: nextCost,
    cancellable:
      patch.cancellable !== undefined ? patch.cancellable : (current?.cancellable ?? null),
    notes: patch.notes !== undefined ? patch.notes : (current?.notes ?? null),
    updatedAt: now,
  }
}

export function createExtraTaskState(
  patch: Partial<TripTaskState> = {},
  now: string = new Date().toISOString(),
): TripTaskState {
  return mergeTaskState(null, patch, now)
}
