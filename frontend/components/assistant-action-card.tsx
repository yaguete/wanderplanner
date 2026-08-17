import { ArrowRightLeft, Link2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { isInspirationalSourceUrl } from "@/lib/inspirational-source"
import { formatTripCurrency } from "@/lib/task-labels"
import type { ChatAction } from "@/hooks/use-assistant-chat"

const ACCEPTED_LABEL: Record<ChatAction["kind"], string> = {
  add_source: "Añadida al viaje",
  add_item: "Añadido al viaje",
  move_item: "Movido en el viaje",
  swap_items: "Intercambiados",
  remove_item: "Quitado del viaje",
  add_transport: "Traslado añadido",
  add_extra_task: "Tarea añadida",
  add_basic: "Añadido a Básicos",
  set_task_cost: "Coste apuntado",
}

function formatMoney(cost: number, currency: string): string {
  return formatTripCurrency(cost, currency)
}

function compactCost(cost: number, currency: string): string {
  const code = currency.trim().toUpperCase() || "EUR"
  if (code === "EUR") {
    const whole = Number.isInteger(cost)
    return `${cost.toLocaleString("es-ES", {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    })}€`
  }
  return formatTripCurrency(cost, code)
}

function titledWithDay(name: string, dayNumber?: number | null): string {
  const title = name.trim() || "Ítem"
  return typeof dayNumber === "number" ? `${title} (día ${dayNumber})` : title
}

function titledWithMoveDays(
  name: string,
  fromDay?: number | null,
  toDay?: number | null,
): string {
  const title = name.trim() || "Ítem"
  if (typeof fromDay !== "number" || typeof toDay !== "number") return title
  if (fromDay === toDay) return `${title} (día ${toDay})`
  return `${title} (día ${fromDay} → día ${toDay})`
}

/** El autor ya va en el título; el modelo a veces lo duplica al final del detalle. */
function detailWithoutAttribution(detail: string, author?: string | null): string {
  let text = detail.trim()
  if (!text) return ""
  text = text.replace(/\s*\(vía\s*@[^)]+\)\s*$/i, "").trim()
  const handle = author?.trim()
  if (handle) {
    const escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    text = text.replace(new RegExp(`\\s*\\(?vía\\s*@?${escaped}\\)?\\s*$`, "i"), "").trim()
  }
  return text
}

function ProposalButtons({
  confirm,
  busy,
  onAccept,
  onDismiss,
  destructive,
}: {
  confirm: string
  busy: boolean
  onAccept: () => void
  onDismiss: () => void
  destructive?: boolean
}) {
  return (
    <div className="mt-2.5 flex gap-2">
      <Button
        type="button"
        size="sm"
        className="h-7 text-xs"
        variant={destructive ? "destructive" : "default"}
        disabled={busy}
        onClick={onAccept}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : confirm}
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={onDismiss}>
        Descartar
      </Button>
    </div>
  )
}

export function ActionCard({
  action,
  busy,
  currency,
  canUndo,
  undone,
  stale,
  onAccept,
  onDismiss,
  onUndo,
}: {
  action: ChatAction
  busy: boolean
  currency: string
  canUndo: boolean
  undone: boolean
  stale?: boolean
  onAccept: () => void
  onDismiss: () => void
  onUndo: () => void
}) {
  if (undone) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Deshecho
      </div>
    )
  }
  if (action.status === "accepted") {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
        <p>{ACCEPTED_LABEL[action.kind]}</p>
        {canUndo ? (
          <button type="button" className="mt-1 text-[11px] underline-offset-2 hover:underline" onClick={onUndo}>
            Deshacer
          </button>
        ) : null}
      </div>
    )
  }
  if (action.status === "dismissed") {
    return (
      <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Propuesta descartada
      </div>
    )
  }
  if (stale && action.status === "pending") {
    return (
      <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Ya no aplica
      </div>
    )
  }

  if (action.kind === "add_source") {
    if (!isInspirationalSourceUrl(action.url)) return null
    return (
      <div className="rounded-lg border border-border bg-background p-3 shadow-sm">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Link2 className="h-3.5 w-3.5 text-primary" />
          Añadir fuente
        </div>
        <p className="text-sm font-medium text-foreground">{action.title}</p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{action.url}</p>
        {action.why ? (
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{action.why}</p>
        ) : null}
        <ProposalButtons confirm="Añadir" busy={busy} onAccept={onAccept} onDismiss={onDismiss} />
      </div>
    )
  }

  if (action.kind === "move_item") {
    return (
      <div className="rounded-lg border border-border bg-background p-3 shadow-sm">
        <p className="text-sm font-medium text-foreground">
          {titledWithMoveDays(action.name ?? "", action.from_day_number, action.to_day_number)}
        </p>
        {action.why ? (
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{action.why}</p>
        ) : null}
        <ProposalButtons confirm="Mover" busy={busy} onAccept={onAccept} onDismiss={onDismiss} />
      </div>
    )
  }

  if (action.kind === "swap_items") {
    return (
      <div className="rounded-lg border border-border bg-background p-3 shadow-sm">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground">
          <ArrowRightLeft className="h-3.5 w-3.5 text-primary" />
          Intercambiar
        </div>
        <p className="text-sm font-medium text-foreground">
          {action.name_a || "Ítem"} ↔ {action.name_b || "Ítem"}
        </p>
        {typeof action.day_number_a === "number" && typeof action.day_number_b === "number" ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Día {action.day_number_a} ↔ día {action.day_number_b}
          </p>
        ) : null}
        {action.why ? (
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{action.why}</p>
        ) : null}
        <ProposalButtons confirm="Intercambiar" busy={busy} onAccept={onAccept} onDismiss={onDismiss} />
      </div>
    )
  }

  if (action.kind === "remove_item") {
    return (
      <div className="rounded-lg border border-destructive/30 bg-background p-3 shadow-sm">
        <p className="text-sm font-medium text-foreground">
          {titledWithDay(action.name ?? "", action.day_number)}
        </p>
        {action.cost_at_risk != null ? (
          <p className="mt-1.5 text-xs text-destructive">
            Se perderán los {formatMoney(action.cost_at_risk, currency)} apuntados.
          </p>
        ) : null}
        {action.why ? (
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{action.why}</p>
        ) : null}
        <ProposalButtons confirm="Quitar" busy={busy} onAccept={onAccept} onDismiss={onDismiss} destructive />
      </div>
    )
  }

  if (action.kind === "add_transport") {
    return (
      <div className="rounded-lg border border-border bg-background p-3 shadow-sm">
        <p className="text-sm font-medium text-foreground">
          {action.from} → {action.to}
        </p>
        {action.why ? (
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{action.why}</p>
        ) : null}
        <ProposalButtons
          confirm={
            typeof action.day_number === "number"
              ? `Añadir al día ${action.day_number}`
              : "Añadir"
          }
          busy={busy}
          onAccept={onAccept}
          onDismiss={onDismiss}
        />
      </div>
    )
  }

  if (action.kind === "add_extra_task") {
    return (
      <div className="rounded-lg border border-border bg-background p-3 shadow-sm">
        <p className="text-sm font-medium text-foreground">{action.title}</p>
        {action.why ? (
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{action.why}</p>
        ) : null}
        <ProposalButtons confirm="Añadir tarea" busy={busy} onAccept={onAccept} onDismiss={onDismiss} />
      </div>
    )
  }

  if (action.kind === "add_basic") {
    return (
      <div className="rounded-lg border border-border bg-background p-3 shadow-sm">
        <div className="mb-1 text-xs font-medium text-foreground">Añadir a Básicos</div>
        <p className="text-sm font-medium text-foreground">{action.name?.trim() || "Oferta"}</p>
        {action.source_author ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground">vía @{action.source_author}</p>
        ) : null}
        {action.why ? (
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{action.why}</p>
        ) : null}
        <ProposalButtons confirm="Añadir" busy={busy} onAccept={onAccept} onDismiss={onDismiss} />
      </div>
    )
  }

  if (action.kind === "set_task_cost") {
    const title = action.task_title?.trim() || "Reserva"
    const cost = compactCost(action.cost, currency)
    return (
      <div className="rounded-lg border border-border bg-background p-3 shadow-sm">
        <p className="text-sm font-medium text-foreground">
          {title}: {cost}
          {action.previous_cost != null
            ? ` (ahora ${compactCost(action.previous_cost, currency)})`
            : ""}
        </p>
        <ProposalButtons confirm="Apuntar" busy={busy} onAccept={onAccept} onDismiss={onDismiss} />
      </div>
    )
  }

  const author = action.source_author?.trim()
  const name = action.name.trim() || "Ítem"
  const detail = action.detail ? detailWithoutAttribution(action.detail, author) : ""
  return (
    <div className="rounded-lg border border-border bg-background p-3 shadow-sm">
      <p className="text-sm font-medium text-foreground">
        {author ? `${name} - vía @${author}` : name}
      </p>
      {detail ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      ) : null}
      <ProposalButtons
        confirm={
          typeof action.day_number === "number"
            ? `Añadir al día ${action.day_number}`
            : "Añadir"
        }
        busy={busy}
        onAccept={onAccept}
        onDismiss={onDismiss}
      />
    </div>
  )
}
