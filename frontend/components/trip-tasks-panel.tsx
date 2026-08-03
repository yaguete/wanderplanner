"use client"

/**
 * Vista de gestión por categoría (presentacional): lista derivada de
 * `buildTripTasks` filtrada por `categories`. Sin `useTrips()`; mutaciones
 * llegan por callbacks desde ItineraryPanel.
 */
import { useEffect, useMemo, useState } from "react"
import { CheckSquare, ChevronDown, ExternalLink, Plus, Trash2 } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { EmptyState } from "@/components/empty-state"
import { AddExtraTaskDialog } from "@/components/add-extra-task-dialog"
import { cn } from "@/lib/utils"
import {
  TASK_CATEGORY_LABELS,
  TASK_CATEGORY_ORDER,
  formatTaskDays,
  formatTripCurrency,
  parseCostInput,
  taskActionTitle,
  taskGroupKey,
} from "@/lib/task-labels"
import {
  buildTripTasks,
  cancellableApplies,
  computeTripTaskTotals,
  type DerivedTripTask,
  type TripTaskTotals,
} from "@/lib/trip-tasks"
import type { Trip, TripTaskCategory, TripTaskState } from "@/types/itinerary"

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
  /** Copy del empty state. */
  emptyTitle?: string
  emptyDescription?: string
  /** Si true, no renderiza el resumen embebido (va en la cabecera/toolbar del padre). */
  hideSummary?: boolean
  /** Si true, no pinta la toolbar (el padre la coloca fuera del scroll). */
  hideToolbar?: boolean
  /** Control externo del diálogo de tarea manual (cuando hideToolbar). */
  extraDialogOpen?: boolean
  onExtraDialogOpenChange?: (open: boolean) => void
}

function useTaskTotals(trip: Trip): TripTaskTotals {
  return useMemo(() => computeTripTaskTotals(buildTripTasks(trip)), [trip])
}

/** Fragmento «X de Y gestionadas» para la meta de cabecera; null si no hay tareas. */
export function TripTasksManagedFragment({ trip }: { trip: Trip }) {
  const totals = useTaskTotals(trip)
  const managed = totals.byStatus.booked
  const total = totals.byStatus.booked + totals.byStatus.pending
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

/** Fila 2 de cabecera (legacy / embebido): «X de Y gestionadas · total». */
export function TripTasksSummaryLine({ trip }: { trip: Trip }) {
  const totals = useTaskTotals(trip)
  const managed = totals.byStatus.booked
  const total = totals.byStatus.booked + totals.byStatus.pending
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

/** Desglose de costes (toolbar de pestañas de categoría). */
export function TripTasksSummaryDetail({ trip }: { trip: Trip }) {
  const totals = useTaskTotals(trip)
  const currency = trip.currency || "EUR"
  const total = totals.byStatus.booked + totals.byStatus.pending
  const perPerson =
    trip.numTravelers != null && trip.numTravelers > 0 && totals.totalCost > 0
      ? totals.totalCost / trip.numTravelers
      : null

  const hasCosts =
    totals.costByStatus.booked > 0 || totals.costByStatus.pending > 0
  const hasDetail =
    total > 0 && (hasCosts || perPerson != null || totals.committedCost > 0)

  if (!hasDetail) {
    return <div className="min-h-0" />
  }

  return (
    <div className="flex min-w-0 flex-col justify-center gap-0.5 text-xs tabular-nums text-muted-foreground">
      {hasCosts ? (
        <p className="truncate">
          <span className="text-emerald-700">
            Reservado {formatTripCurrency(totals.costByStatus.booked, currency)}
          </span>
          {totals.costByStatus.pending > 0 ? (
            <>
              {" · "}
              <span>
                Por reservar {formatTripCurrency(totals.costByStatus.pending, currency)}
              </span>
            </>
          ) : null}
        </p>
      ) : null}
      {perPerson != null ? (
        <p className="truncate">
          {formatTripCurrency(perPerson, currency)} / persona
          {trip.numTravelers === 1 ? "" : ` (${trip.numTravelers})`}
        </p>
      ) : null}
      {totals.committedCost > 0 ? (
        <p className="truncate">
          No cancelable: {formatTripCurrency(totals.committedCost, currency)}
        </p>
      ) : null}
    </div>
  )
}

/** Hairline de progreso (1.5 px) para el borde inferior de la cabecera. */
export function TripTasksProgressHairline({ trip }: { trip: Trip }) {
  const totals = useTaskTotals(trip)
  const total = totals.byStatus.booked + totals.byStatus.pending
  if (total === 0) return null
  const pct = Math.min(100, (totals.byStatus.booked / total) * 100)

  return (
    <div className="absolute inset-x-0 bottom-0 h-[1.5px] bg-muted" aria-hidden>
      <div
        className="h-full bg-primary transition-[width] duration-300 ease-out"
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

export function TripTasksPanel({
  trip,
  categories,
  onSetTaskState,
  onAddExtraTask,
  onRemoveExtraTask,
  onRemoveBasic,
  defaultCategory = "other",
  emptyTitle = "Sin tareas todavía",
  emptyDescription = "Consolida ítems en la Ruta o añade una tarea a mano.",
  hideSummary = false,
  hideToolbar = false,
  extraDialogOpen: controlledOpen,
  onExtraDialogOpenChange,
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!hideSummary ? (
        <div className="shrink-0 border-b border-border px-4 py-2.5">
          <TripTasksSummary trip={trip} />
        </div>
      ) : null}

      {!hideToolbar && !isEmpty ? (
        <div className="flex shrink-0 items-center justify-end px-4 py-2.5">
          <button
            type="button"
            onClick={() => setExtraDialogOpen(true)}
            className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-foreground transition-colors hover:text-muted-foreground"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            Añadir tarea
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-2">
        {isEmpty ? (
          <EmptyState
            icon={CheckSquare}
            title={emptyTitle}
            description={emptyDescription}
            actionLabel="Añadir tarea"
            onAction={() => setExtraDialogOpen(true)}
            className="py-10"
          />
        ) : (
          <div className="flex flex-col gap-6">
            {groupedMain.map(({ category, list }) => (
              <section key={category} className="flex flex-col gap-0">
                {groupedMain.length > 1 ? (
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {TASK_CATEGORY_LABELS[category]}
                  </p>
                ) : null}
                <ul className="m-0 list-none divide-y divide-border/70 border-y border-border/70 p-0">
                  {list.map((task) => (
                    <li key={task.id} className="m-0 p-0">
                      <TaskRow
                        task={task}
                        currency={trip.currency || "EUR"}
                        onSetTaskState={onSetTaskState}
                        onRemoveExtraTask={
                          task.origin === "extra" ? onRemoveExtraTask : undefined
                        }
                        onRemoveBasic={
                          task.origin === "basic" ? onRemoveBasic : undefined
                        }
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            {triageTasks.length > 0 ? (
              <TriageSection tasks={triageTasks} onSetTaskState={onSetTaskState} />
            ) : null}

            {dismissedTasks.length > 0 ? (
              <DismissedSection
                tasks={dismissedTasks}
                onSetTaskState={onSetTaskState}
              />
            ) : null}
          </div>
        )}
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

function TaskRow({
  task,
  currency,
  onSetTaskState,
  onRemoveExtraTask,
  onRemoveBasic,
}: {
  task: DerivedTripTask
  currency: string
  onSetTaskState: (taskKey: string, patch: Partial<TripTaskState>) => void
  onRemoveExtraTask?: (taskId: string) => void
  onRemoveBasic?: (basicIds: string[]) => void
}) {
  const booked = task.state?.status === "booked"
  const dayMeta = formatTaskDays(task.dayIndexes, task.nights)
  const showCancellable = cancellableApplies(task.category)
  const cost = task.state?.cost ?? null
  const nights = task.nights && task.nights > 1 ? task.nights : null
  const perNight = cost != null && nights != null ? cost / nights : null
  const canRemove =
    (task.origin === "extra" && onRemoveExtraTask) ||
    (task.origin === "basic" && onRemoveBasic)

  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex items-start gap-2.5">
        <div className="pt-0.5">
          <Checkbox
            checked={booked}
            onCheckedChange={(c) =>
              onSetTaskState(task.id, { status: c === true ? "booked" : "pending" })
            }
            className="size-4"
            aria-label={booked ? "Marcar como pendiente" : "Marcar como reservado"}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm font-medium leading-snug text-foreground transition-[color,text-decoration-color] duration-200",
              booked && "text-muted-foreground line-through decoration-muted-foreground/50",
            )}
          >
            {taskActionTitle(task)}
          </p>
          {dayMeta ? (
            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{dayMeta}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <CostInput
            value={cost}
            currency={currency}
            onChange={(next) => onSetTaskState(task.id, { cost: next })}
          />
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
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pl-7">
        {perNight != null ? (
          <span className="text-[11px] tabular-nums text-muted-foreground">
            ≈ {formatTripCurrency(perNight, currency)}/noche
          </span>
        ) : null}
        {task.affiliateUrl ? (
          <a
            href={task.affiliateUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {task.category === "basic" || task.origin === "basic" ? "Contratar" : "Reservar"}
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
          </a>
        ) : null}
        {showCancellable ? (
          <CancellableToggle
            value={task.state?.cancellable ?? null}
            onChange={(next) => onSetTaskState(task.id, { cancellable: next })}
          />
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

function CancellableToggle({
  value,
  onChange,
}: {
  value: boolean | null
  onChange: (next: boolean | null) => void
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md bg-muted p-0.5"
      role="group"
      aria-label="Cancelabilidad"
    >
      <button
        type="button"
        aria-pressed={value === true}
        onClick={() => onChange(value === true ? null : true)}
        className={cn(
          "inline-flex min-h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          value === true
            ? "bg-background font-semibold text-foreground shadow-sm ring-1 ring-border"
            : "font-medium text-muted-foreground hover:text-foreground",
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            value === true ? "bg-emerald-500" : "bg-muted-foreground/30",
          )}
          aria-hidden
        />
        Cancelable
      </button>
      <button
        type="button"
        aria-pressed={value === false}
        onClick={() => onChange(value === false ? null : false)}
        className={cn(
          "inline-flex min-h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          value === false
            ? "bg-background font-semibold text-foreground shadow-sm ring-1 ring-border"
            : "font-medium text-muted-foreground hover:text-foreground",
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            value === false ? "bg-amber-500" : "bg-muted-foreground/30",
          )}
          aria-hidden
        />
        No cancelable
      </button>
    </div>
  )
}

function TriageSection({
  tasks,
  onSetTaskState,
}: {
  tasks: DerivedTripTask[]
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
          ¿Algo más que reservar?{" "}
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
          {grouped.map(({ category, list }) => (
            <div key={category}>
              {grouped.length > 1 ? (
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {TASK_CATEGORY_LABELS[category]}
                </p>
              ) : null}
              <ul className="m-0 list-none divide-y divide-border/70 border-y border-border/70 p-0">
                {list.map((task) => (
                  <li
                    key={task.id}
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {taskActionTitle(task)}
                      </p>
                      {formatTaskDays(task.dayIndexes) ? (
                        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                          {formatTaskDays(task.dayIndexes)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onSetTaskState(task.id, { status: "pending" })}
                        className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                      >
                        Reservar
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
