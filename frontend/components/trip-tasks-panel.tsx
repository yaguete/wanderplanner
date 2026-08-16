"use client"

/**
 * Vista de gestión por categoría (presentacional): lista derivada de
 * `buildTripTasks` filtrada por `categories`. Sin `useTrips()`; mutaciones
 * llegan por callbacks desde ItineraryPanel.
 */
import { useEffect, useMemo, useState } from "react"
import {
  Check,
  CheckSquare,
  ChevronDown,
  ExternalLink,
  Info,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/empty-state"
import { AddExtraTaskDialog } from "@/components/add-extra-task-dialog"
import { CountryTasksSection } from "@/components/country-tasks-section"
import { FlightSearchLink } from "@/components/flight-search-link"
import { cn } from "@/lib/utils"
import {
  TASK_CATEGORY_LABELS,
  TASK_CATEGORY_ORDER,
  formatTaskDays,
  formatTaskMeta,
  formatTripCurrency,
  parseCostInput,
  taskActionTitle,
  taskGroupKey,
} from "@/lib/task-labels"
import {
  buildTripTasks,
  cancellableApplies,
  computeTripTaskTotals,
  isBookableTransportMode,
  isTaskManaged,
  type DerivedTripTask,
  type TripTaskTotals,
} from "@/lib/trip-tasks"
import { flightSearchHrefForItem } from "@/lib/flight-search"
import type { Source, Trip, TripTaskCategory, TripTaskState, UserDayItem } from "@/types/itinerary"

export type TripTasksPanelProps = {
  trip: Trip
  /** Categorías visibles en esta pestaña. */
  categories: TripTaskCategory[]
  onSetTaskState: (taskKey: string, patch: Partial<TripTaskState>) => void
  onAddExtraTask: (data: { title: string; category: TripTaskCategory }) => void
  onRemoveExtraTask: (taskId: string) => void
  /** Quitar básico(s) del viaje desde la fila de tarea. */
  onRemoveBasic?: (basicIds: string[]) => void
  /** Categoría preseleccionada en «Añadir tarea». */
  defaultCategory?: TripTaskCategory
  /** Copy del CTA al final de la lista (p. ej. «Añadir actividad»). */
  addActionLabel?: string
  /**
   * Si se pasa, el CTA lo invoca en lugar de abrir AddExtraTaskDialog.
   * Útil en Transporte para abrir el diálogo de traslado.
   */
  onAddAction?: () => void
  /**
   * Editar un traslado desde la fila de tarea (abre la modal de transporte / ida-vuelta).
   */
  onEditTransportItem?: (payload: { dayId: string; item: UserDayItem }) => void
  /** Copy del empty state. */
  emptyTitle?: string
  emptyDescription?: string
  /** Si true, no renderiza el resumen embebido (va en la cabecera del padre). */
  hideSummary?: boolean
  /** Control externo del diálogo de tarea manual. */
  extraDialogOpen?: boolean
  onExtraDialogOpenChange?: (open: boolean) => void
  /**
   * Fuentes del viaje + callbacks para sugerencias MAE (solo pestaña Básicos).
   * Si faltan, no se muestra la sección de trámites.
   */
  countryTasks?: {
    sources: Source[]
    onAccept: (data: {
      id: string
      title: string
      category: TripTaskCategory
      state?: Partial<TripTaskState>
    }) => void
    onDismiss: (taskId: string) => void
    onReevaluate: (activeCountryCodes: string[]) => void
  }
}

function useTaskTotals(
  trip: Trip,
  categories?: ReadonlyArray<TripTaskCategory>,
): TripTaskTotals {
  return useMemo(
    () => computeTripTaskTotals(buildTripTasks(trip), { categories }),
    [trip, categories],
  )
}

function managedCounts(totals: TripTaskTotals) {
  const managed = totals.byStatus.booked + totals.byStatus.paid
  const total = managed + totals.byStatus.pending
  return { managed, total }
}

/** Fragmento «X de Y gestionadas» para la meta de cabecera; null si no hay tareas. */
export function TripTasksManagedFragment({ totals }: { totals: TripTaskTotals }) {
  const { managed, total } = managedCounts(totals)
  if (total === 0) return null
  return (
    <>
      {" · "}
      <span className="font-medium text-foreground">
        {managed} de {total}
      </span>{" "}
      gestionadas
    </>
  )
}

/** Fila de resumen embebida: «X de Y gestionadas · total». */
export function TripTasksSummaryLine({ trip }: { trip: Trip }) {
  const totals = useTaskTotals(trip)
  const { managed, total } = managedCounts(totals)
  const currency = trip.currency || "EUR"

  if (total === 0) {
    return <p className="text-xs text-muted-foreground">Sin tareas aún</p>
  }

  return (
    <p className="text-xs tabular-nums text-muted-foreground">
      <span className="font-medium text-foreground">
        {managed} de {total}
      </span>{" "}
      gestionadas
      {totals.totalCost > 0 ? (
        <>
          {" · "}
          <span className="font-medium text-foreground">
            {formatTripCurrency(totals.totalCost, currency)}
          </span>
        </>
      ) : null}
    </p>
  )
}

/** Desglose de costes por pestaña: Reservado · Gastado (las cards siguen diciendo Pagado). */
export function TripTasksSummaryDetail({
  trip,
  categories,
}: {
  trip: Trip
  categories?: ReadonlyArray<TripTaskCategory>
}) {
  const totals = useTaskTotals(trip, categories)
  const currency = trip.currency || "EUR"
  const booked = totals.costByStatus.booked
  const paid = totals.costByStatus.paid

  if (booked <= 0 && paid <= 0) {
    return <div className="min-h-0" />
  }

  return (
    <p className="truncate text-right text-xs tabular-nums text-muted-foreground">
      {booked > 0 ? (
        <span>Reservado {formatTripCurrency(booked, currency)}</span>
      ) : null}
      {booked > 0 && paid > 0 ? " · " : null}
      {paid > 0 ? (
        <span className="text-emerald-700">
          Gastado {formatTripCurrency(paid, currency)}
        </span>
      ) : null}
    </p>
  )
}

/** Hairline de progreso (1.5 px) para el borde inferior de la cabecera. */
export function TripTasksProgressHairline({ totals }: { totals: TripTaskTotals }) {
  const { managed, total } = managedCounts(totals)
  if (total === 0) return null
  const pct = Math.min(100, (managed / total) * 100)

  return (
    <div
      className="absolute inset-x-0 bottom-0 h-[2px] bg-border/70"
      aria-hidden
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full bg-foreground/70 transition-[width] duration-300 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

/** @deprecated Preferir Line + Detail en la cabecera del panel. */
export function TripTasksSummary({ trip }: { trip: Trip }) {
  return (
    <div className="space-y-1">
      <TripTasksSummaryLine trip={trip} />
      <TripTasksSummaryDetail trip={trip} />
    </div>
  )
}

function matchesCategories(
  task: DerivedTripTask,
  categories: ReadonlySet<TripTaskCategory>,
): boolean {
  return categories.has(task.category) || categories.has(taskGroupKey(task.category))
}

function findTransportItem(
  trip: Pick<Trip, "days">,
  task: DerivedTripTask,
): { dayId: string; item: UserDayItem } | null {
  for (const dayIndex of task.dayIndexes) {
    const day = trip.days[dayIndex]
    if (!day) continue
    const item = day.items.find((i) => {
      if (i.type !== "transport" || !task.itemIds.includes(i.id)) return false
      if (task.roundtripFlight && i.route?.leg === "return") return false
      return true
    })
    if (item) return { dayId: day.id, item }
  }
  return null
}

/** Chip «Hecho» (trámites / trayectos sin billete) vs Reservado·Pagado. */
function usesDoneChip(task: DerivedTripTask): boolean {
  if (task.category === "paperwork" || task.category === "health") return true
  if (task.category === "transport" && !isBookableTransportMode(task.route?.mode)) {
    return true
  }
  return false
}

export function TripTasksPanel({
  trip,
  categories,
  onSetTaskState,
  onAddExtraTask,
  onRemoveExtraTask,
  onRemoveBasic,
  defaultCategory = "other",
  addActionLabel = "Añadir tarea",
  onAddAction,
  onEditTransportItem,
  emptyTitle = "Sin tareas todavía",
  emptyDescription = "Consolida ítems en la Ruta o añade una tarea a mano.",
  hideSummary = false,
  extraDialogOpen: controlledOpen,
  onExtraDialogOpenChange,
  countryTasks,
}: TripTasksPanelProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const extraDialogOpen = controlledOpen ?? internalOpen
  const setExtraDialogOpen = onExtraDialogOpenChange ?? setInternalOpen

  const categorySet = useMemo(() => new Set(categories), [categories])

  const tasks = useMemo(() => buildTripTasks(trip), [trip])
  const mainTasks = useMemo(
    () => tasks.filter((t) => t.bucket === "main" && matchesCategories(t, categorySet)),
    [tasks, categorySet],
  )
  const triageTasks = useMemo(
    () => tasks.filter((t) => t.bucket === "triage" && matchesCategories(t, categorySet)),
    [tasks, categorySet],
  )
  const dismissedTasks = useMemo(
    () =>
      tasks.filter((t) => t.bucket === "dismissed" && matchesCategories(t, categorySet)),
    [tasks, categorySet],
  )

  const groupedMain = useMemo(() => groupByCategory(mainTasks), [mainTasks])
  const isEmpty =
    mainTasks.length === 0 && triageTasks.length === 0 && dismissedTasks.length === 0

  const addButton = (
    <button
      type="button"
      onClick={() => {
        if (onAddAction) {
          onAddAction()
          return
        }
        setExtraDialogOpen(true)
      }}
      className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-foreground transition-colors hover:text-muted-foreground"
    >
      <Plus className="h-3.5 w-3.5 shrink-0" />
      {addActionLabel}
    </button>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!hideSummary ? (
        <div className="shrink-0 border-b border-border px-4 py-2.5">
          <TripTasksSummary trip={trip} />
        </div>
      ) : null}

      <div
        className={cn(
          // Móvil: scrollea el documento (ver `trips-shell`), no esta lista.
          "px-4 pb-6 max-md:pb-[var(--wp-nav-clearance)] md:min-h-0 md:flex-1 md:overflow-y-auto",
          hideSummary ? "pt-0" : "pt-2",
        )}
      >
        <div className="panel-column flex flex-col gap-6">
          {countryTasks ? (
            <CountryTasksSection
              trip={trip}
              sources={countryTasks.sources}
              onAccept={countryTasks.onAccept}
              onDismiss={countryTasks.onDismiss}
              onReevaluate={countryTasks.onReevaluate}
            />
          ) : null}

          {isEmpty ? (
            <EmptyState
              icon={CheckSquare}
              title={emptyTitle}
              description={emptyDescription}
              className={countryTasks ? "py-6" : "py-10"}
            />
          ) : (
            <>
              {groupedMain.map(({ category, list }) => (
                <section key={category} className="flex flex-col gap-0">
                  {groupedMain.length > 1 ? (
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {TASK_CATEGORY_LABELS[category]}
                    </p>
                  ) : null}
                  <ul className="m-0 list-none divide-y divide-border/70 p-0">
                    {list.map((task, index) => (
                      <li key={task.id} className="m-0 p-0">
                        <TaskRow
                          task={task}
                          trip={trip}
                          currency={trip.currency || "EUR"}
                          startDate={trip.startDate}
                          compactTop={index === 0 && groupedMain.length === 1}
                          onSetTaskState={onSetTaskState}
                          onRemoveExtraTask={
                            task.origin === "extra" ? onRemoveExtraTask : undefined
                          }
                          onRemoveBasic={
                            task.origin === "basic" ? onRemoveBasic : undefined
                          }
                          onEditTransport={
                            onEditTransportItem &&
                            task.origin === "dayItem" &&
                            task.category === "transport"
                              ? () => {
                                  const found = findTransportItem(trip, task)
                                  if (found) onEditTransportItem(found)
                                }
                              : undefined
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}

              {triageTasks.length > 0 ? (
                <TriageSection
                  tasks={triageTasks}
                  startDate={trip.startDate}
                  onSetTaskState={onSetTaskState}
                />
              ) : null}

              {dismissedTasks.length > 0 ? (
                <DismissedSection
                  tasks={dismissedTasks}
                  onSetTaskState={onSetTaskState}
                />
              ) : null}
            </>
          )}

          <div className="flex justify-end">{addButton}</div>
        </div>
      </div>

      <AddExtraTaskDialog
        open={extraDialogOpen}
        onOpenChange={setExtraDialogOpen}
        onSubmit={onAddExtraTask}
        defaultCategory={defaultCategory}
      />
    </div>
  )
}

function groupByCategory(
  tasks: DerivedTripTask[],
): { category: TripTaskCategory; list: DerivedTripTask[] }[] {
  const buckets = new Map<TripTaskCategory, DerivedTripTask[]>()
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

/** Toggle unido Reservado | Pagado (mismo cromo que el antiguo Cancelable). */
function BookingStatusToggle({
  value,
  onChange,
}: {
  value: "pending" | "booked" | "paid" | "notNeeded"
  onChange: (next: "booked" | "paid") => void
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md bg-muted p-0.5"
      role="group"
      aria-label="Estado de reserva"
    >
      <button
        type="button"
        aria-pressed={value === "booked"}
        onClick={() => onChange("booked")}
        className={cn(
          "inline-flex min-h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          value === "booked"
            ? "bg-background font-semibold text-foreground shadow-sm ring-1 ring-border"
            : "font-medium text-muted-foreground hover:text-foreground",
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            value === "booked" ? "bg-muted-foreground" : "bg-muted-foreground/30",
          )}
          aria-hidden
        />
        Reservado
      </button>
      <button
        type="button"
        aria-pressed={value === "paid"}
        onClick={() => onChange("paid")}
        className={cn(
          "inline-flex min-h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          value === "paid"
            ? "bg-background font-semibold text-foreground shadow-sm ring-1 ring-border"
            : "font-medium text-muted-foreground hover:text-foreground",
        )}
      >
        {value === "paid" ? (
          <Check className="h-3 w-3 shrink-0 text-emerald-600" strokeWidth={2.4} aria-hidden />
        ) : (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden />
        )}
        Pagado
      </button>
    </div>
  )
}

function DoneChip({
  active,
  onClick,
}: {
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 rounded-md bg-muted px-2.5 text-[11px] transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "font-semibold text-foreground shadow-sm ring-1 ring-border bg-background"
          : "font-medium text-muted-foreground hover:text-foreground",
      )}
    >
      {active ? (
        <Check className="h-3 w-3 shrink-0 text-emerald-600" strokeWidth={2.4} aria-hidden />
      ) : (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden />
      )}
      Hecho
    </button>
  )
}

function TaskRow({
  task,
  trip,
  currency,
  startDate,
  compactTop = false,
  onSetTaskState,
  onRemoveExtraTask,
  onRemoveBasic,
  onEditTransport,
}: {
  task: DerivedTripTask
  trip: Pick<Trip, "startDate" | "numDays" | "numTravelers" | "days">
  currency: string
  startDate: string | null
  /** Primera fila tras el resumen: menos padding superior y sin borde de lista arriba. */
  compactTop?: boolean
  onSetTaskState: (taskKey: string, patch: Partial<TripTaskState>) => void
  onRemoveExtraTask?: (taskId: string) => void
  onRemoveBasic?: (basicIds: string[]) => void
  onEditTransport?: () => void
}) {
  const status = task.state?.status ?? "pending"
  const managed = isTaskManaged(task.state)
  const doneChip = usesDoneChip(task)
  const dayMeta = formatTaskDays(task.dayIndexes, task.nights, startDate, {
    roundtrip: task.roundtripFlight,
  })
  const meta = formatTaskMeta({
    dayMeta,
    vendor: task.category === "accommodation" ? null : task.vendor,
    detail: task.detail,
  })
  const showCancellable =
    cancellableApplies(task.category, task.route?.mode) &&
    (status === "booked" || status === "paid")
  const cost = task.state?.cost ?? null
  const nights = task.nights && task.nights > 1 ? task.nights : null
  const perNight = cost != null && nights != null ? cost / nights : null
  const canRemove =
    (task.origin === "extra" && onRemoveExtraTask) ||
    (task.origin === "basic" && onRemoveBasic)

  const toggleStatus = (next: "booked" | "paid") => {
    onSetTaskState(task.id, { status: status === next ? "pending" : next })
  }

  const flightSearch =
    task.route && task.dayIndexes.length > 0
      ? flightSearchHrefForItem({
          route: task.route,
          dayIndex: task.dayIndexes[0]!,
          trip,
          days: trip.days,
        })
      : null

  return (
    <div className={cn("flex flex-col gap-2 pb-3", compactTop ? "pt-1" : "pt-3")}>
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p
              className={cn(
                "min-w-0 text-sm font-medium leading-snug text-foreground transition-[color,text-decoration-color] duration-200",
                managed && "text-muted-foreground line-through decoration-muted-foreground/50",
              )}
            >
              {taskActionTitle(task)}
            </p>
            {task.affiliateUrl ? (
              <a
                href={task.affiliateUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="wp-ext-link inline-flex shrink-0 items-center gap-1 text-xs font-medium"
              >
                {task.category === "basic" || task.origin === "basic" ? "Contratar" : "Reservar"}
                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
              </a>
            ) : null}
            {flightSearch ? <FlightSearchLink search={flightSearch} showCodes /> : null}
          </div>
          {meta ? (
            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{meta}</p>
          ) : null}
        </div>
        {canRemove ? (
          <button
            type="button"
            onClick={() => {
              if (task.origin === "extra" && onRemoveExtraTask) {
                onRemoveExtraTask(task.id)
              } else if (task.origin === "basic" && onRemoveBasic) {
                onRemoveBasic(task.itemIds)
              }
            }}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-foreground/60 transition-colors hover:bg-muted hover:text-destructive"
            aria-label={
              task.origin === "basic" ? "Quitar básico del viaje" : "Eliminar tarea"
            }
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {doneChip ? (
          <DoneChip
            active={status === "booked" || status === "paid"}
            onClick={() =>
              onSetTaskState(task.id, {
                // «Hecho» cuenta como gastado (paid), no como reservado.
                status: status === "booked" || status === "paid" ? "pending" : "paid",
              })
            }
          />
        ) : (
          <BookingStatusToggle value={status} onChange={toggleStatus} />
        )}
        <CostInput
          value={cost}
          currency={currency}
          onChange={(next) => onSetTaskState(task.id, { cost: next })}
        />
        {perNight != null ? (
          <span className="text-[11px] tabular-nums text-muted-foreground">
            ≈ {formatTripCurrency(perNight, currency)}/noche
          </span>
        ) : null}
        {showCancellable ? (
          <CancellableDropdown
            value={task.state?.cancellable ?? null}
            onChange={(next) => onSetTaskState(task.id, { cancellable: next })}
          />
        ) : null}
        {onEditTransport ? (
          <button
            type="button"
            onClick={onEditTransport}
            className={cn(
              "inline-flex min-h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-colors",
              "text-muted-foreground hover:text-foreground hover:underline",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <Pencil className="h-3 w-3 shrink-0" strokeWidth={1.8} aria-hidden />
            Editar
          </button>
        ) : null}
      </div>
    </div>
  )
}

function CostInput({
  value,
  currency,
  onChange,
}: {
  value: number | null
  currency: string
  onChange: (next: number | null) => void
}) {
  const [draft, setDraft] = useState(() => (value == null ? "" : String(value)))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (focused) return
    setDraft(value == null ? "" : String(value))
  }, [value, focused])

  const suffix = currency.trim().toUpperCase() || "EUR"
  const showPlaceholder = !focused && draft === ""

  return (
    <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <input
        type="text"
        inputMode="decimal"
        value={showPlaceholder ? "" : draft}
        placeholder="—"
        aria-label="Coste total"
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          setDraft(value == null ? "" : String(value))
        }}
        onChange={(e) => {
          const raw = e.target.value
          setDraft(raw)
          if (raw.trim() === "") {
            onChange(null)
            return
          }
          const parsed = parseCostInput(raw)
          if (parsed != null) onChange(parsed)
        }}
        className={cn(
          "h-7 w-[4.75rem] rounded-md bg-transparent px-1.5",
          "text-right text-xs tabular-nums text-foreground outline-none",
          "placeholder:text-muted-foreground/70",
          "hover:bg-muted/50",
          "focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring",
          "transition-colors",
        )}
      />
      <span className="tabular-nums">{suffix}</span>
    </label>
  )
}

function CancellableDropdown({
  value,
  onChange,
}: {
  value: boolean | null
  onChange: (next: boolean | null) => void
}) {
  const radioValue = value === true ? "yes" : value === false ? "no" : "unset"
  const triggerLabel =
    value === true ? "Cancelable" : value === false ? "No cancelable" : "Cancelabilidad"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex min-h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-colors",
            "text-muted-foreground hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value != null && "text-foreground",
          )}
          aria-label="Cancelabilidad"
        >
          {triggerLabel}
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[10.5rem]">
        <DropdownMenuRadioGroup
          value={radioValue}
          onValueChange={(v) => {
            if (v === "yes") onChange(true)
            else if (v === "no") onChange(false)
            else onChange(null)
          }}
        >
          <DropdownMenuRadioItem value="yes" className="text-xs">
            Cancelable
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="no" className="text-xs">
            No cancelable
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="unset" className="text-xs">
            Sin indicar
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TriageSection({
  tasks,
  startDate,
  onSetTaskState,
}: {
  tasks: DerivedTripTask[]
  startDate: string | null
  onSetTaskState: (taskKey: string, patch: Partial<TripTaskState>) => void
}) {
  const [open, setOpen] = useState(false)
  const grouped = useMemo(() => groupByCategory(tasks), [tasks])

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center justify-between rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5",
          "text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <span>
          Podrían requerir reserva{" "}
          <span className="font-normal text-muted-foreground">({tasks.length})</span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="flex flex-col gap-4 pt-3">
          <p className="flex items-start gap-2 text-xs leading-snug text-muted-foreground">
            <Info
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/80"
              strokeWidth={2}
              aria-hidden
            />
            <span>¿No estás seguro/a? Pregunta al asistente.</span>
          </p>
          {grouped.map(({ category, list }) => (
            <div key={category}>
              {grouped.length > 1 ? (
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {TASK_CATEGORY_LABELS[category]}
                </p>
              ) : null}
              <ul className="m-0 list-none divide-y divide-border/70 p-0">
                {list.map((task) => (
                  <li
                    key={task.id}
                    className="flex flex-col gap-2 py-3 @md:flex-row @md:items-center @md:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {taskActionTitle(task)}
                      </p>
                      {formatTaskDays(task.dayIndexes, undefined, startDate) ? (
                        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                          {formatTaskDays(task.dayIndexes, undefined, startDate)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onSetTaskState(task.id, { status: "pending" })}
                        className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                      >
                        {usesDoneChip(task) ? "Incluir" : "Reservar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => onSetTaskState(task.id, { status: "notNeeded" })}
                        className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        No hace falta
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function DismissedSection({
  tasks,
  onSetTaskState,
}: {
  tasks: DerivedTripTask[]
  onSetTaskState: (taskKey: string, patch: Partial<TripTaskState>) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center justify-between rounded-lg px-1 py-2",
          "text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <span>
          Sin reserva <span className="font-normal">({tasks.length})</span>
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <ul className="m-0 list-none divide-y divide-border/50 border-y border-border/50 p-0 pt-1">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex items-center justify-between gap-3 py-2.5"
            >
              <p className="min-w-0 truncate text-sm text-muted-foreground">
                {taskActionTitle(task)}
              </p>
              <button
                type="button"
                onClick={() => onSetTaskState(task.id, { status: "pending" })}
                className="shrink-0 text-xs font-medium text-foreground hover:underline"
              >
                Restaurar
              </button>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}
