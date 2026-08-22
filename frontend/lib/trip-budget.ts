/**
 * Techo, veredicto, cobertura y cuenta del viaje. Puro: sin I/O, sin React, sin Intl.
 * Totales solo del bucket `main` (igual que las pestañas); triage/dismissed fuera.
 * No reimplementa la agregación ni el plegado ida/vuelta: parte de `buildTripTasks`.
 */
import type {
  DerivedTripTask,
} from "@/lib/trip-tasks"
import { buildTripTasks } from "@/lib/trip-tasks"
import { TASK_CATEGORY_LABELS, TASK_CATEGORY_ORDER, taskGroupKey } from "@/lib/task-labels"
import type {
  TaskGroupCategory,
  Trip,
  TripBudget,
  TripTaskState,
} from "@/types/itinerary"

export type BudgetLineStatus = "estimated" | "booked" | "paid"

export type BudgetLine = {
  task: DerivedTripTask
  cost: number
  status: BudgetLineStatus
}

export type BudgetGroup = {
  category: TaskGroupCategory
  lines: BudgetLine[]
  subtotal: number
  cap: number | null
  over: number
}

/** Tareas `main` sin importe: sin `cost` centinela. */
export type UnpricedGroup = {
  category: TaskGroupCategory
  tasks: DerivedTripTask[]
}

export type BudgetCaps = {
  declaredTotal: number | null
  byCategory: Partial<Record<TaskGroupCategory, number>>
  sumByCategory: number
  effective: number | null
  unassigned: number | null
  categoriesExceedTotal: boolean
}

export type BudgetVerdict = {
  kind: "noCap" | "under" | "over"
  counted: number
  cap: number | null
  delta: number
}

export type TripBudgetView = {
  currency: string
  caps: BudgetCaps
  counted: number
  split: { estimated: number; booked: number; paid: number }
  /** Gestiones `main` con precio / total `main`. */
  coverage: { priced: number; total: number }
  verdict: BudgetVerdict
  rates: {
    perDay: number | null
    perTraveler: number | null
    perTravelerDay: number | null
    capPerDay: number | null
  }
  /** Con precio, orden TASK_CATEGORY_ORDER; líneas desc por importe. */
  groups: BudgetGroup[]
  /** `main` sin importe. */
  unpriced: UnpricedGroup[]
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Importe inválido o ≤ 0 → null (el setter no persiste un techo de cero). */
function capFromInput(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null
  return round2(n)
}

/**
 * Normaliza lo que escribe la UI: claves vacías fuera, objeto vacío → null.
 * Un 0 explícito se borra (vaciar el campo = sin techo).
 */
export function normalizeTripBudget(next: TripBudget | null): TripBudget | null {
  if (!next) return null
  const total = capFromInput(next.total)
  const byCategory: Partial<Record<TaskGroupCategory, number>> = {}
  for (const key of TASK_CATEGORY_ORDER) {
    const n = capFromInput(next.byCategory[key])
    if (n != null) byCategory[key] = n
  }
  if (total == null && Object.keys(byCategory).length === 0) return null
  return { total, byCategory }
}

function sumExceptOther(byCategory: Partial<Record<TaskGroupCategory, number>>): number {
  let sum = 0
  for (const key of TASK_CATEGORY_ORDER) {
    if (key === "other") continue
    const n = byCategory[key]
    if (n != null) sum = round2(sum + n)
  }
  return sum
}

function hasNonOtherBreakdown(byCategory: Partial<Record<TaskGroupCategory, number>>): boolean {
  return TASK_CATEGORY_ORDER.some((key) => key !== "other" && byCategory[key] != null)
}

/** El resto del techo global vive en Otras, solo cuando ya hay desglose. */
function restToOther(
  total: number,
  byCategory: Partial<Record<TaskGroupCategory, number>>,
): Partial<Record<TaskGroupCategory, number>> {
  const next: Partial<Record<TaskGroupCategory, number>> = { ...byCategory }
  delete next.other
  if (!hasNonOtherBreakdown(next)) return next
  const remainder = round2(total - sumExceptOther(next))
  if (remainder > 0) next.other = remainder
  return next
}

/**
 * Convierte el techo tecleado (total o por persona) al valor persistido.
 * Si el valor mostrado es el mismo que el almacenado redondeado, se conserva
 * el original: 3000 / 7 → 428,57 → 3000, no 2999,99.
 */
export function persistCapFromDisplay(
  entered: number | null,
  stored: number | null,
  opts: { perPerson: boolean; travelers: number | null },
): number | null {
  if (entered == null) return null
  const { perPerson, travelers } = opts
  if (!perPerson || travelers == null || travelers < 2) return entered
  if (stored != null && entered === round2(stored / travelers)) return stored
  return round2(entered * travelers)
}

export type BudgetCapEdit =
  | { field: "total"; value: number | null }
  | { field: TaskGroupCategory; value: number | null }

/**
 * El techo global y el desglose se compensan: lo no asignado va a Otras.
 * Si el desglose (o Otras a mano) supera el global, el global sube a esa suma.
 */
export function applyBudgetEdit(current: TripBudget | null, edit: BudgetCapEdit): TripBudget | null {
  const cats: Partial<Record<TaskGroupCategory, number>> = { ...(current?.byCategory ?? {}) }
  const previousTotal = capFromInput(current?.total ?? null)

  if (edit.field === "total") {
    const requested = capFromInput(edit.value)
    if (requested == null) {
      delete cats.other
      return normalizeTripBudget({ total: null, byCategory: cats })
    }
    const allocated = sumExceptOther(cats)
    const total = round2(Math.max(requested, allocated))
    return normalizeTripBudget({ total, byCategory: restToOther(total, cats) })
  }

  const value = capFromInput(edit.value)
  if (value == null) delete cats[edit.field]
  else cats[edit.field] = value

  if (edit.field === "other") {
    const allocated = sumExceptOther(cats)
    const other = cats.other ?? null
    if (other == null) {
      const total = allocated > 0 ? allocated : previousTotal
      return normalizeTripBudget({ total, byCategory: cats })
    }
    return normalizeTripBudget({
      total: round2(allocated + other),
      byCategory: cats,
    })
  }

  const allocated = sumExceptOther(cats)
  if (previousTotal == null) {
    delete cats.other
    return normalizeTripBudget({ total: null, byCategory: cats })
  }
  const total = round2(Math.max(previousTotal, allocated))
  return normalizeTripBudget({ total, byCategory: restToOther(total, cats) })
}

export function groupTasksByCategory(
  tasks: DerivedTripTask[],
): { category: TaskGroupCategory; list: DerivedTripTask[] }[] {
  const buckets = new Map<TaskGroupCategory, DerivedTripTask[]>()
  for (const task of tasks) {
    const key = taskGroupKey(task.category)
    const list = buckets.get(key)
    if (list) list.push(task)
    else buckets.set(key, [task])
  }
  return TASK_CATEGORY_ORDER.filter((c) => (buckets.get(c)?.length ?? 0) > 0).map(
    (category) => ({ category, list: buckets.get(category)! }),
  )
}

function taskCost(task: DerivedTripTask): number | null {
  const cost = task.state?.cost
  if (cost == null || !Number.isFinite(cost) || cost < 0) return null
  return cost
}

function lineStatus(state: TripTaskState | null): BudgetLineStatus {
  if (state?.status === "booked") return "booked"
  if (state?.status === "paid") return "paid"
  return "estimated"
}

export function resolveBudgetCaps(budget: TripBudget | null): BudgetCaps {
  const declaredTotal =
    budget?.total != null && Number.isFinite(budget.total) && budget.total >= 0
      ? round2(budget.total)
      : null
  const byCategory: Partial<Record<TaskGroupCategory, number>> = {}
  let sumByCategory = 0
  if (budget) {
    for (const key of TASK_CATEGORY_ORDER) {
      const v = budget.byCategory[key]
      if (v != null && Number.isFinite(v) && v >= 0) {
        const n = round2(v)
        byCategory[key] = n
        sumByCategory = round2(sumByCategory + n)
      }
    }
  }
  const effective =
    declaredTotal != null ? declaredTotal : sumByCategory > 0 ? sumByCategory : null
  const unassigned = declaredTotal != null ? round2(declaredTotal - sumByCategory) : null
  const categoriesExceedTotal =
    declaredTotal != null && sumByCategory > declaredTotal
  return {
    declaredTotal,
    byCategory,
    sumByCategory,
    effective,
    unassigned,
    categoriesExceedTotal,
  }
}

function toPricedLine(task: DerivedTripTask): BudgetLine | null {
  const cost = taskCost(task)
  if (cost == null) return null
  return { task, cost, status: lineStatus(task.state) }
}

function groupsFromLines(
  lines: BudgetLine[],
  caps: Partial<Record<TaskGroupCategory, number>>,
): BudgetGroup[] {
  const buckets = new Map<TaskGroupCategory, BudgetLine[]>()
  for (const line of lines) {
    const key = taskGroupKey(line.task.category)
    const list = buckets.get(key)
    if (list) list.push(line)
    else buckets.set(key, [line])
  }
  return TASK_CATEGORY_ORDER.flatMap((category) => {
    const list = buckets.get(category)
    if (!list?.length) return []
    const sorted = [...list].sort((a, b) => b.cost - a.cost)
    const subtotal = round2(sorted.reduce((s, l) => s + l.cost, 0))
    const cap = caps[category] ?? null
    const over = cap != null ? round2(Math.max(0, subtotal - cap)) : 0
    return [{ category, lines: sorted, subtotal, cap, over }]
  })
}

function groupsFromUnpriced(tasks: DerivedTripTask[]): UnpricedGroup[] {
  const buckets = new Map<TaskGroupCategory, DerivedTripTask[]>()
  for (const task of tasks) {
    const key = taskGroupKey(task.category)
    const list = buckets.get(key)
    if (list) list.push(task)
    else buckets.set(key, [task])
  }
  return TASK_CATEGORY_ORDER.flatMap((category) => {
    const list = buckets.get(category)
    if (!list?.length) return []
    return [{ category, tasks: list }]
  })
}

export function buildTripBudgetView(trip: Trip): TripBudgetView {
  const tasks = buildTripTasks(trip)
  const main = tasks.filter((t) => t.bucket === "main")

  const pricedLines: BudgetLine[] = []
  const unpricedTasks: DerivedTripTask[] = []
  for (const task of main) {
    const line = toPricedLine(task)
    if (line) pricedLines.push(line)
    else unpricedTasks.push(task)
  }

  const split = { estimated: 0, booked: 0, paid: 0 }
  for (const line of pricedLines) {
    split[line.status] = round2(split[line.status] + line.cost)
  }
  const counted = round2(split.estimated + split.booked + split.paid)

  const caps = resolveBudgetCaps(trip.budget)
  let verdictKind: BudgetVerdict["kind"] = "noCap"
  let delta = 0
  if (caps.effective != null) {
    delta = round2(caps.effective - counted)
    verdictKind = delta < 0 ? "over" : "under"
  }
  const verdict: BudgetVerdict = {
    kind: verdictKind,
    counted,
    cap: caps.effective,
    delta,
  }

  const dayCount = trip.days.length
  const travelers =
    trip.numTravelers != null && Number.isFinite(trip.numTravelers) && trip.numTravelers >= 1
      ? Math.floor(trip.numTravelers)
      : null
  const perDay = dayCount > 0 ? round2(counted / dayCount) : null
  const perTraveler = travelers != null ? round2(counted / travelers) : null
  const perTravelerDay =
    perDay != null && travelers != null ? round2(perDay / travelers) : null
  const capPerDay =
    caps.effective != null && dayCount > 0 ? round2(caps.effective / dayCount) : null

  return {
    currency: (trip.currency || "EUR").trim().toUpperCase() || "EUR",
    caps,
    counted,
    split,
    coverage: { priced: pricedLines.length, total: main.length },
    verdict,
    rates: { perDay, perTraveler, perTravelerDay, capPerDay },
    groups: groupsFromLines(pricedLines, caps.byCategory),
    unpriced: groupsFromUnpriced(unpricedTasks),
  }
}

/** Una línea de briefing; cifras, no adjetivos. */
export function formatBudgetBriefingMarkdown(view: TripBudgetView): string {
  const lines: string[] = ["## Presupuesto del viaje"]
  const cur = view.currency
  if (view.caps.effective == null) {
    lines.push("- techo: (sin techo)")
    if (view.counted > 0) {
      lines.push(
        `- apuntado: ${view.counted} ${cur} — estimado ${view.split.estimated} · reservado ${view.split.booked} · pagado ${view.split.paid}`,
      )
    }
    lines.push(
      `- cobertura: ${view.coverage.priced} de ${view.coverage.total} gestiones con precio · ${view.coverage.total - view.coverage.priced} sin valorar`,
    )
    return lines.join("\n")
  }

  const declared =
    view.caps.declaredTotal != null
      ? `${view.caps.declaredTotal} ${cur} declarado · efectivo ${view.caps.effective} ${cur}`
      : `efectivo ${view.caps.effective} ${cur} (suma de grupos)`
  lines.push(`- techo: ${declared}`)

  const groupBits = TASK_CATEGORY_ORDER.flatMap((cat) => {
    const cap = view.caps.byCategory[cat]
    if (cap == null) return []
    if (cat === "other" && hasNonOtherBreakdown(view.caps.byCategory)) {
      return [`Otras (resto) ${cap}`]
    }
    return [`${TASK_CATEGORY_LABELS[cat]} ${cap}`]
  })
  if (
    view.caps.unassigned != null &&
    view.caps.unassigned > 0 &&
    view.caps.byCategory.other == null &&
    hasNonOtherBreakdown(view.caps.byCategory)
  ) {
    groupBits.push(`Otras (resto) ${view.caps.unassigned}`)
  }
  if (groupBits.length) {
    lines.push(`- techo por grupo: ${groupBits.join(" · ")}`)
  }

  lines.push(
    `- apuntado: ${view.counted} ${cur} — estimado ${view.split.estimated} · reservado ${view.split.booked} · pagado ${view.split.paid}`,
  )
  lines.push(
    `- cobertura: ${view.coverage.priced} de ${view.coverage.total} gestiones con precio · ${view.coverage.total - view.coverage.priced} sin valorar`,
  )

  const rateBits: string[] = []
  if (view.rates.perDay != null) {
    rateBits.push(`${view.rates.perDay} ${cur}/día`)
  }
  if (view.rates.perTraveler != null) {
    rateBits.push(`${view.rates.perTraveler} ${cur}/persona`)
  }
  if (rateBits.length) lines.push(`- ritmo: ${rateBits.join(" · ")}`)

  const overGroups = view.groups.filter((g) => g.over > 0)
  if (overGroups.length) {
    lines.push(
      `- grupos por encima de su techo: ${overGroups
        .map((g) => `${TASK_CATEGORY_LABELS[g.category]} (+${g.over})`)
        .join(" · ")}`,
    )
  }
  if (view.verdict.kind === "over") {
    lines.push(`- viaje: se pasa ${Math.abs(view.verdict.delta)} ${cur}`)
  } else if (view.verdict.kind === "under") {
    lines.push(`- viaje: quedan ${view.verdict.delta} ${cur}`)
  }
  return lines.join("\n")
}
