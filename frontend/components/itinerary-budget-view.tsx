"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ExternalLink, Plus, Wallet } from "lucide-react"
import { AddExtraTaskDialog } from "@/components/add-extra-task-dialog"
import { CostInput } from "@/components/cost-input"
import { EmptyState } from "@/components/empty-state"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  TASK_CATEGORY_LABELS,
  TASK_CATEGORY_ORDER,
  formatTaskDays,
  formatTaskMeta,
  formatTripCurrency,
} from "@/lib/task-labels"
import { stayReserveHref } from "@/lib/booking-search"
import { outbound } from "@/lib/funnel-analytics"
import { TASK_CATEGORY_ICONS } from "@/lib/item-styles"
import {
  applyBudgetEdit,
  persistCapFromDisplay,
  round2,
  type BudgetCapEdit,
  type BudgetLine,
  type BudgetLineStatus,
  type TripBudgetView,
} from "@/lib/trip-budget"
import type { DerivedTripTask } from "@/lib/trip-tasks"
import { cn } from "@/lib/utils"
import type { Trip, TripBudget, TripTaskCategory, TripTaskState } from "@/types/itinerary"

export function budgetChromeHeadline(view: TripBudgetView): string {
  const counted = formatTripCurrency(view.counted, view.currency)
  if (view.caps.effective == null) {
    return view.counted > 0 ? counted : "Sin importes"
  }
  return `${counted} de ${formatTripCurrency(view.caps.effective, view.currency)}`
}

export type ItineraryBudgetViewProps = {
  trip: Trip
  view: TripBudgetView
  onSetTaskState: (taskKey: string, patch: Partial<TripTaskState>) => void
  onSetBudget: (next: TripBudget | null) => void
  onAddExtraTask: (data: {
    title: string
    category: TripTaskCategory
    state?: Partial<TripTaskState>
  }) => void
  onEditTrip?: () => void
}

const STATUS_LABEL: Record<BudgetLineStatus, string> = {
  estimated: "Estimado",
  booked: "Reservado",
  paid: "Pagado",
}

export function ItineraryBudgetView({
  trip,
  view,
  onSetTaskState,
  onSetBudget,
  onAddExtraTask,
  onEditTrip,
}: ItineraryBudgetViewProps) {
  const hasCap = view.caps.effective != null
  const [envelopeOpen, setEnvelopeOpen] = useState(hasCap)
  const [breakdownOpen, setBreakdownOpen] = useState(
    Object.keys(view.caps.byCategory).length > 0,
  )
  const [capUnit, setCapUnit] = useState<"trip" | "person">("trip")
  const [extraOpen, setExtraOpen] = useState(false)

  const travelers =
    trip.numTravelers != null && trip.numTravelers >= 1 ? trip.numTravelers : null
  const showPersonToggle = travelers != null && travelers > 1
  const unitIsPerson = showPersonToggle && capUnit === "person"
  const noPricesYet = view.counted === 0 && view.coverage.total > 0
  const nothingToValue = view.coverage.total === 0

  const persistCap = (entered: number | null, stored: number | null): number | null =>
    persistCapFromDisplay(entered, stored, {
      perPerson: unitIsPerson,
      travelers,
    })
  const displayCap = (stored: number | null): number | null => {
    if (stored == null) return null
    if (unitIsPerson && travelers) return round2(stored / travelers)
    return stored
  }

  const persistBudget = (edit: BudgetCapEdit) => {
    onSetBudget(applyBudgetEdit(trip.budget, edit))
  }

  const gapsCount = view.coverage.total - view.coverage.priced

  return (
    <div className="px-4 pb-6 pt-2 max-md:pb-[var(--wp-nav-clearance)] md:min-h-0 md:flex-1 md:overflow-y-auto">
      <div className="panel-column space-y-8">
        {nothingToValue ? (
          <EmptyState
            icon={Wallet}
            title="Aún no hay gestiones que valorar"
            description="Cuando añadas alojamientos, vuelos o actividades a la ruta, aparecerán aquí."
          />
        ) : (
          <>
            <Verdict
              view={view}
              trip={trip}
              onEditTrip={onEditTrip}
              onScrollToGaps={() => {
                document.getElementById("wp-budget-gaps")?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                })
              }}
              gapsCount={gapsCount}
            />

            <Collapsible open={envelopeOpen} onOpenChange={setEnvelopeOpen}>
              <div className="rounded-lg border border-border/70 bg-muted/20">
                <CollapsibleTrigger
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                >
                  <span className="text-sm font-medium text-foreground">
                    ¿Cuánto te quieres gastar?
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      envelopeOpen && "rotate-180",
                    )}
                    aria-hidden
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 px-3 pb-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <CostInput
                      value={displayCap(view.caps.declaredTotal)}
                      currency={view.currency}
                      commit="blur"
                      ariaLabel="Techo del viaje"
                      onChange={(next) =>
                        persistBudget({
                          field: "total",
                          value: persistCap(next, view.caps.declaredTotal),
                        })
                      }
                    />
                    {showPersonToggle ? (
                      <div
                        className="inline-flex items-center gap-0.5 rounded-md bg-muted p-0.5"
                        role="group"
                        aria-label="Techo como total o por persona"
                      >
                        <UnitChip
                          active={!unitIsPerson}
                          onClick={() => setCapUnit("trip")}
                          label="Del viaje"
                        />
                        <UnitChip
                          active={unitIsPerson}
                          onClick={() => setCapUnit("person")}
                          label="Por persona"
                        />
                      </div>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    El techo se guarda como total del viaje
                    {unitIsPerson && travelers ? ` (${travelers} personas).` : "."} Vaciar el
                    campo lo quita.
                  </p>
                  <button
                    type="button"
                    onClick={() => setBreakdownOpen((v) => !v)}
                    className="text-xs font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    {breakdownOpen ? "Ocultar desglose" : "Desglosar por tipo"}
                  </button>
                  {breakdownOpen ? (
                    <div className="space-y-2">
                      <p className="text-[11px] text-muted-foreground">
                        Lo que no desgloses queda en Otras, para que el total no cambie. Si el
                        desglose suma más, el total sube.
                      </p>
                      {TASK_CATEGORY_ORDER.map((cat) => {
                        const Icon = TASK_CATEGORY_ICONS[cat]
                        return (
                        <div key={cat} className="flex items-center justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            <span className="min-w-0 truncate">{TASK_CATEGORY_LABELS[cat]}</span>
                          </span>
                          <CostInput
                            value={displayCap(view.caps.byCategory[cat] ?? null)}
                            currency={view.currency}
                            commit="blur"
                            ariaLabel={`Techo de ${TASK_CATEGORY_LABELS[cat]}`}
                            onChange={(next) =>
                              persistBudget({
                                field: cat,
                                value: persistCap(next, view.caps.byCategory[cat] ?? null),
                              })
                            }
                          />
                        </div>
                        )
                      })}
                    </div>
                  ) : null}
                </CollapsibleContent>
              </div>
            </Collapsible>

            {noPricesYet ? (
              <p className="text-sm text-muted-foreground">
                Pon precio a lo que ya sabes y te digo si cabe.
              </p>
            ) : null}

            {view.groups.length > 0 ? (
              <div className="space-y-4">
                {view.groups.map((group) => (
                  <BillGroup
                    key={group.category}
                    group={group}
                    currency={view.currency}
                    startDate={trip.startDate}
                    numTravelers={trip.numTravelers}
                    onSetTaskState={onSetTaskState}
                    highlightOver
                  />
                ))}
              </div>
            ) : null}

            <div id="wp-budget-gaps" className="scroll-mt-4">
              {view.unpriced.length > 0 ? (
                <UnpricedBlock
                  groups={view.unpriced}
                  currency={view.currency}
                  startDate={trip.startDate}
                  numTravelers={trip.numTravelers}
                  onSetTaskState={onSetTaskState}
                  defaultOpen={noPricesYet}
                />
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setExtraOpen(true)}
              className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-foreground transition-colors hover:text-muted-foreground"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              Añadir gasto
            </button>
          </>
        )}
      </div>

      <AddExtraTaskDialog
        open={extraOpen}
        onOpenChange={setExtraOpen}
        onSubmit={onAddExtraTask}
        defaultCategory="other"
        showCategoryPicker
        showAmount
        currency={view.currency}
      />
    </div>
  )
}

function UnitChip({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-7 items-center rounded-md px-2.5 text-[11px] transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-background font-semibold text-foreground shadow-sm ring-1 ring-border"
          : "font-medium text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  )
}

function Verdict({
  view,
  trip,
  onEditTrip,
  onScrollToGaps,
  gapsCount,
}: {
  view: TripBudgetView
  trip: Trip
  onEditTrip?: () => void
  onScrollToGaps: () => void
  gapsCount: number
}) {
  const { verdict, currency } = view
  const over = verdict.kind === "over"
  const cap = verdict.cap
  const fill =
    cap != null && cap > 0 ? Math.min(100, (verdict.counted / cap) * 100) : 0

  const rateBits = useMemo(() => {
    const bits: string[] = []
    if (view.rates.perDay != null) {
      bits.push(`${formatTripCurrency(view.rates.perDay, currency)}/día`)
    }
    if (view.rates.perTravelerDay != null) {
      bits.push(`${formatTripCurrency(view.rates.perTravelerDay, currency)}/persona/día`)
    } else if (view.rates.perTraveler != null) {
      bits.push(`${formatTripCurrency(view.rates.perTraveler, currency)}/persona`)
    }
    return bits
  }, [view.rates, currency])

  return (
    <section className="space-y-3">
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {cap != null ? (
            <p
              aria-live="polite"
              className="text-2xl font-semibold tabular-nums tracking-tight text-foreground"
            >
              {formatTripCurrency(verdict.counted, currency)}
              <span className="ml-1.5 text-base font-medium text-muted-foreground">
                de {formatTripCurrency(cap, currency)}
              </span>
            </p>
          ) : (
            <p
              aria-live="polite"
              className="text-2xl font-semibold tabular-nums tracking-tight text-foreground"
            >
              Llevas {formatTripCurrency(verdict.counted, currency)}
            </p>
          )}
          {view.counted > 0 ? (
            <p className="text-xs tabular-nums text-muted-foreground">
              <SplitBit
                label="Estimado"
                amount={view.split.estimated}
                currency={currency}
              />
              {view.split.estimated > 0 &&
              (view.split.booked > 0 || view.split.paid > 0)
                ? " · "
                : null}
              <SplitBit
                label="Reservado"
                amount={view.split.booked}
                currency={currency}
              />
              {view.split.booked > 0 && view.split.paid > 0 ? " · " : null}
              {view.split.paid > 0 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-success">
                      Pagado {formatTripCurrency(view.split.paid, currency)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Pagado o cerrado (trámites marcados como hechos)
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </p>
          ) : null}
        </div>
        {verdict.kind === "under" ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Te quedan{" "}
            <span className="font-medium text-foreground">
              {formatTripCurrency(verdict.delta, currency)}
            </span>
          </p>
        ) : null}
        {over ? (
          <p className="mt-1 text-sm text-warning-foreground">
            Te pasas{" "}
            <span className="font-medium">
              {formatTripCurrency(Math.abs(verdict.delta), currency)}
            </span>
          </p>
        ) : null}
        {verdict.kind === "noCap" && verdict.counted > 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Pon un techo para ver si el viaje entra.
          </p>
        ) : null}
      </div>

      {cap != null ? (
        <div
          role="progressbar"
          aria-valuenow={Math.min(verdict.counted, cap)}
          aria-valuemin={0}
          aria-valuemax={cap}
          aria-label="Contado frente al techo"
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn("h-full rounded-full", over ? "bg-warning" : "bg-foreground/70")}
            style={{ width: `${fill}%` }}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs tabular-nums text-muted-foreground">
        <button
          type="button"
          onClick={onScrollToGaps}
          className="text-left font-medium text-foreground underline-offset-2 hover:underline"
        >
          Precio en {view.coverage.priced} de {view.coverage.total} gestiones
          {gapsCount > 0 ? ` · ${gapsCount} sin precio` : null}
        </button>
        {rateBits.length ? <span>{rateBits.join(" · ")}</span> : null}
        {trip.numTravelers == null && onEditTrip ? (
          <button
            type="button"
            onClick={onEditTrip}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            ¿Cuántos viajáis?
          </button>
        ) : null}
      </div>

    </section>
  )
}

function SplitBit({
  label,
  amount,
  currency,
}: {
  label: string
  amount: number
  currency: string
}) {
  if (amount <= 0) return null
  return (
    <span>
      {label} {formatTripCurrency(amount, currency)}
    </span>
  )
}

function UnpricedBlock({
  groups,
  currency,
  startDate,
  numTravelers,
  onSetTaskState,
  defaultOpen,
}: {
  groups: TripBudgetView["unpriced"]
  currency: string
  startDate: string | null
  numTravelers: number | null
  onSetTaskState: ItineraryBudgetViewProps["onSetTaskState"]
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const tasks = groups.flatMap((g) => g.tasks)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border border-border/70 bg-muted/20">
        <CollapsibleTrigger
          className={cn(
            "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <span className="text-sm font-medium text-foreground">
            Sin precio aún
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              {tasks.length}
            </span>
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="m-0 list-none divide-y divide-border/70 px-3 p-0">
            {tasks.map((task) => (
              <UnpricedRow
                key={task.id}
                task={task}
                currency={currency}
                startDate={startDate}
                numTravelers={numTravelers}
                onSetTaskState={onSetTaskState}
              />
            ))}
          </ul>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

function BillGroup({
  group,
  currency,
  startDate,
  numTravelers,
  onSetTaskState,
  highlightOver = false,
}: {
  group: TripBudgetView["groups"][number]
  currency: string
  startDate: string | null
  numTravelers: number | null
  onSetTaskState: ItineraryBudgetViewProps["onSetTaskState"]
  highlightOver?: boolean
}) {
  const [open, setOpen] = useState(false)
  const over = highlightOver && group.over > 0
  const Icon = TASK_CATEGORY_ICONS[group.category]

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-2 py-1 text-left text-xs",
          over ? "text-warning-foreground" : "text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 truncate font-semibold uppercase tracking-[0.18em]">
          {TASK_CATEGORY_LABELS[group.category]}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 tabular-nums">
          {formatTripCurrency(group.subtotal, currency)}
          {group.cap != null ? (
            <span className="text-muted-foreground">
              / {formatTripCurrency(group.cap, currency)}
            </span>
          ) : null}
          {over ? (
            <span className="font-medium">+{formatTripCurrency(group.over, currency)}</span>
          ) : null}
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="m-0 list-none divide-y divide-border/70 p-0">
          {group.lines.map((line) => (
            <BillRow
              key={line.task.id}
              line={line}
              currency={currency}
              startDate={startDate}
              numTravelers={numTravelers}
              onSetTaskState={onSetTaskState}
            />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

function viewHrefForTask(
  task: DerivedTripTask,
  opts: {
    startDate: string | null
    currency: string
    numTravelers: number | null
  },
): string | null {
  return (
    stayReserveHref({
      type: task.sourceKind,
      name: task.title,
      sourceId: task.sourceId,
      affiliateUrl: task.affiliateUrl,
      startDate: opts.startDate,
      dayIndexes: task.dayIndexes,
      currency: opts.currency,
      numTravelers: opts.numTravelers,
    }) ?? task.affiliateUrl?.trim() ?? null
  )
}

function BudgetViewLink({
  task,
  startDate,
  currency,
  numTravelers,
}: {
  task: DerivedTripTask
  startDate: string | null
  currency: string
  numTravelers: number | null
}) {
  const href = viewHrefForTask(task, { startDate, currency, numTravelers })
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="wp-ext-link ml-1.5 inline-flex items-center gap-1 whitespace-nowrap align-baseline text-xs font-medium"
      onClick={() =>
        outbound(href, {
          surface: "budget_row",
          affiliate: task.affiliateUrl ? "partner" : "auto",
        })
      }
    >
      Ver
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
    </a>
  )
}

function BillRow({
  line,
  currency,
  startDate,
  numTravelers,
  onSetTaskState,
}: {
  line: BudgetLine
  currency: string
  startDate: string | null
  numTravelers: number | null
  onSetTaskState: ItineraryBudgetViewProps["onSetTaskState"]
}) {
  const title = line.task.title
  const dayMeta = formatTaskDays(line.task.dayIndexes, line.task.nights, startDate, {
    roundtrip: line.task.roundtripFlight,
  })
  const meta = formatTaskMeta({ dayMeta, vendor: line.task.vendor, detail: line.task.detail })
  const perNight =
    line.task.nights && line.task.nights > 1 && line.cost > 0
      ? line.cost / line.task.nights
      : null

  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium leading-snug text-foreground">
          {title}
          <BudgetViewLink
            task={line.task}
            startDate={startDate}
            currency={currency}
            numTravelers={numTravelers}
          />
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
          <span
            className={cn(
              "tabular-nums",
              line.status === "paid" && "text-success",
            )}
          >
            {STATUS_LABEL[line.status]}
          </span>
          {meta ? <span className="tabular-nums">{meta}</span> : null}
          {perNight != null ? (
            <span className="tabular-nums">
              ≈ {formatTripCurrency(perNight, currency)}/noche
            </span>
          ) : null}
        </p>
      </div>
      <CostInput
        value={line.cost}
        currency={currency}
        commit="blur"
        jumpOnEnter
        ariaLabel={`Coste total de ${title}`}
        onChange={(next) => onSetTaskState(line.task.id, { cost: next })}
      />
    </li>
  )
}

function UnpricedRow({
  task,
  currency,
  startDate,
  numTravelers,
  onSetTaskState,
}: {
  task: DerivedTripTask
  currency: string
  startDate: string | null
  numTravelers: number | null
  onSetTaskState: ItineraryBudgetViewProps["onSetTaskState"]
}) {
  const title = task.title
  const dayMeta = formatTaskDays(task.dayIndexes, task.nights, startDate, {
    roundtrip: task.roundtripFlight,
  })
  const meta = formatTaskMeta({ dayMeta, vendor: task.vendor, detail: task.detail })

  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium leading-snug text-foreground">
          {title}
          <BudgetViewLink
            task={task}
            startDate={startDate}
            currency={currency}
            numTravelers={numTravelers}
          />
        </p>
        {meta ? (
          <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{meta}</p>
        ) : null}
      </div>
      <CostInput
        value={null}
        currency={currency}
        commit="blur"
        jumpOnEnter
        ariaLabel={`Coste total de ${title}`}
        onChange={(next) => onSetTaskState(task.id, { cost: next })}
      />
    </li>
  )
}
