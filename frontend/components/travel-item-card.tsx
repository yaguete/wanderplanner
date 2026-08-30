"use client"

import { createElement, type ReactNode } from "react"
import {
  Car,
  Check,
  ExternalLink,
  Home,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Lightbulb,
  Search,
  Ticket,
  Trash2,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { FlightSearchLink } from "@/components/flight-search-link"
import { outbound, type OutboundAffiliate, type OutboundSurface } from "@/lib/funnel-analytics"
import { sanitizeAffiliateUrl } from "@/lib/affiliate-url"
import { BASIC_ICONS, BASIC_LABELS, ITEM_COLORS, ITEM_LABELS } from "@/lib/item-styles"
import { itemProvenanceLabel } from "@/lib/item-provenance"
import type { FlightSearchHit } from "@/lib/flight-search"
import type { BasicCategory, ItemType } from "@/types/itinerary"
import { useFinePointer } from "@/hooks/use-fine-pointer"

/** Hover de 1px solo con puntero fino; no se pega en táctil. */
const CARD_MOTION =
  "transition-[transform,box-shadow] duration-150 ease-out [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-px [@media(hover:hover)_and_(pointer:fine)]:hover:shadow-md"

function TypeBadge({ type, label }: { type: ItemType; label?: string }) {
  const colors = ITEM_COLORS[type]
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]",
        colors.bg,
        colors.border,
        colors.text,
      )}
    >
      {label ?? ITEM_LABELS[type]}
    </span>
  )
}

function AddedBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium tabular-nums text-success">
      <Check className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden />
      {label}
    </span>
  )
}

type SourceCardProps = {
  variant: "source"
  title: string
  detail?: string | null
  type: ItemType
  /** Override del badge (p. ej. «Desplazamiento» solo en Fuentes). */
  typeLabel?: string
  thumbnail: ReactNode
  isAdded?: boolean
  addedLabel?: string
  action: ReactNode
  /** Desktop: toda la card (salvo miniatura, lupita, enlace y acción) abre el selector de día. */
  onSelect?: () => void
  /** Busca el nombre en la Crónica de la fuente. */
  onFindInSource?: () => void
  /** Enlace de afiliado (tours/alojamientos); icono junto a la lupa, no convierte la card en `<a>`. */
  href?: string | null
  outboundSurface?: OutboundSurface
  outboundAffiliate?: OutboundAffiliate | "auto"
  className?: string
}

type PlannedCardProps = {
  variant: "planned"
  title: string
  type: ItemType
  sourceId: string
  sourceAuthor: string
  detail?: string | null
  regionLabel?: string | null
  href?: string | null
  /** Override del badge (p. ej. «Lugar» vs «Actividad»). */
  typeLabel?: string
  onRemove: () => void
  /** Etiqueta accesible del botón quitar (eco: «Acortar la estancia»). */
  removeAriaLabel?: string
  /** Editar tramo de ida/vuelta o traslado (T4B.3). */
  onEdit?: () => void
  /** Etiqueta accesible del botón editar. */
  editAriaLabel?: string
  /** Subtítulo extra bajo el título (p. ej. «Avión · Ida»). */
  routeSummary?: string | null
  /** Meta de estancia (p. ej. «3 noches»). No reutiliza `routeSummary`. */
  spanLabel?: string | null
  /** Icono/etiqueta específicos de medio de transporte. */
  transportIcon?: LucideIcon
  transportIconLabel?: string
  moveControls?: ReactNode
  /**
   * Adornos no interactivos junto al título (punto pendiente / check).
   * Van dentro del bloque enlazado; no meter botones aquí.
   */
  titleAdornment?: ReactNode
  /**
   * Indicador interactivo (p. ej. «Sin reserva»).
   * Hermano del bloque enlazado — nunca dentro del `<a>` afiliado.
   */
  taskIndicator?: ReactNode
  /** T4B.3b: enlace Skyscanner prerellenado. Fuera del `<a>` de affiliateUrl. */
  flightSearch?: FlightSearchHit | null
  className?: string
  outboundSurface?: OutboundSurface
  outboundAffiliate?: OutboundAffiliate | "auto"
}

type BasicSourceCardProps = {
  variant: "basic-source"
  title: string
  detail?: string | null
  category: BasicCategory
  thumbnail: ReactNode
  isAdded?: boolean
  href?: string | null
  onAdd: () => void
  className?: string
  outboundSurface?: OutboundSurface
  outboundAffiliate?: OutboundAffiliate | "auto"
}

type BasicPlannedCardProps = {
  variant: "basic-planned"
  title: string
  category: BasicCategory
  sourceId: string
  sourceAuthor: string
  vendor?: string | null
  href?: string | null
  onRemove: () => void
  className?: string
  outboundSurface?: OutboundSurface
  outboundAffiliate?: OutboundAffiliate | "auto"
}

export type TravelItemCardProps =
  | SourceCardProps
  | PlannedCardProps
  | BasicSourceCardProps
  | BasicPlannedCardProps

function trackCardOutbound(
  href: string | null | undefined,
  surface?: OutboundSurface,
  affiliate?: OutboundAffiliate | "auto",
) {
  if (!href || !surface) return
  outbound(href, { surface, affiliate: affiliate ?? "auto" })
}

/**
 * Overflow de Editar/Eliminar. El trigger es una elipsis horizontal
 * (`···`), no el kebab vertical: el asa de arrastre ya es un grid de
 * puntos y juntos se leían como el mismo control.
 */
function ItemOverflowMenu({
  onEdit,
  editAriaLabel,
  onRemove,
  removeLabel,
}: {
  onEdit?: () => void
  editAriaLabel?: string
  onRemove: () => void
  removeLabel: string
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted"
          aria-label="Más acciones"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[10.5rem]"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {onEdit ? (
          <DropdownMenuItem
            aria-label={editAriaLabel}
            onSelect={() => onEdit()}
          >
            Editar
            <Pencil className="ml-auto" strokeWidth={1.8} aria-hidden />
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          onSelect={() => onRemove()}
        >
          {onEdit ? "Eliminar" : removeLabel}
          <Trash2 className="ml-auto" strokeWidth={1.8} aria-hidden />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Nota en ficha de Ruta: tooltip al hover, popover al tap (como el calendario). */
function ItemNoteHint({ note }: { note: string }) {
  const finePointer = useFinePointer() === true
  const trigger = (
    <button
      type="button"
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted"
      aria-label="Ver nota"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <Lightbulb className="h-4 w-4" strokeWidth={1.8} aria-hidden />
    </button>
  )
  const body = (
    <p className="m-0 whitespace-pre-wrap break-words">{note}</p>
  )

  if (finePointer) {
    return (
      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent side="top" className="max-h-64 max-w-xs overflow-y-auto text-xs">
          {body}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="max-h-64 w-auto max-w-xs overflow-y-auto p-3 text-xs"
        collisionPadding={{ bottom: 80, top: 8, left: 8, right: 8 }}
      >
        {body}
      </PopoverContent>
    </Popover>
  )
}

export function TravelItemCard(props: TravelItemCardProps) {
  const href = sanitizeAffiliateUrl(props.href)
  if (props.variant === "source") {
    return (
      <div
        className={cn(
          "relative flex items-center gap-3 overflow-hidden rounded-2xl border border-border bg-card p-2.5 shadow-sm",
          CARD_MOTION,
          props.onSelect && "cursor-pointer",
          props.className,
        )}
      >
        {props.onSelect ? (
          <button
            type="button"
            onClick={props.onSelect}
            className="absolute inset-0 z-0 rounded-2xl outline-none ring-inset focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Añadir al itinerario"
          />
        ) : null}
        <div
          className={cn(
            "relative z-[1] pointer-events-auto shrink-0",
            props.isAdded && "opacity-70",
          )}
        >
          {props.thumbnail}
        </div>
        <div className="relative z-[1] pointer-events-none min-w-0 flex-1 pr-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn(props.isAdded && "opacity-70")}>
              <TypeBadge type={props.type} label={props.typeLabel} />
            </span>
            {props.addedLabel ? <AddedBadge label={props.addedLabel} /> : null}
          </div>
          <div className={cn(props.isAdded && "opacity-70")}>
            <div className="mt-1.5 flex items-center gap-0.5">
              <p className="min-w-0 flex-1 line-clamp-1 text-[15px] font-semibold leading-snug text-foreground">
                {props.title}
              </p>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={(e) => {
                    e.stopPropagation()
                    trackCardOutbound(href, props.outboundSurface, props.outboundAffiliate)
                  }}
                  className="pointer-events-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none ring-offset-2 transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Abrir enlace de «${props.title}»`}
                  title="Abrir enlace"
                >
                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                </a>
              ) : null}
              {props.onFindInSource ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    props.onFindInSource?.()
                  }}
                  className="pointer-events-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none ring-offset-2 transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Buscar «${props.title}» en la crónica`}
                  title="Buscar en la crónica"
                >
                  <Search className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                </button>
              ) : null}
            </div>
            {props.detail ? (
              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{props.detail}</p>
            ) : null}
          </div>
        </div>
        <div
          className={cn(
            "relative z-[1] flex shrink-0 items-center",
            props.onSelect && "pointer-events-none",
            props.isAdded && "opacity-70",
          )}
        >
          {props.action}
        </div>
      </div>
    )
  }

  if (props.variant === "basic-source") {
    const textBlock = (
      <div className="min-w-0 flex-1 pr-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground",
              props.isAdded && "opacity-70",
            )}
          >
            {BASIC_LABELS[props.category]}
          </span>
          {props.isAdded ? <AddedBadge label="Añadido" /> : null}
        </div>
        <div className={cn(props.isAdded && "opacity-70")}>
          <p className="mt-1.5 line-clamp-1 text-[15px] font-semibold leading-snug text-foreground">
            {props.title}
          </p>
          {props.detail ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{props.detail}</p>
          ) : null}
        </div>
      </div>
    )
    const main = (
      <>
        <span className={cn("shrink-0", props.isAdded && "opacity-70")}>{props.thumbnail}</span>
        {textBlock}
      </>
    )
    return (
      <div
        className={cn(
          "flex items-stretch gap-3 overflow-hidden rounded-2xl border border-border bg-card p-2.5 shadow-sm",
          CARD_MOTION,
          props.className,
        )}
      >
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() =>
              trackCardOutbound(href, props.outboundSurface, props.outboundAffiliate)
            }
          >
            {main}
          </a>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">{main}</div>
        )}
        <div className="flex shrink-0 items-center self-center">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0 rounded-full border border-border p-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
            aria-label="Añadir a básicos del viaje"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              props.onAdd()
            }}
            disabled={props.isAdded}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  if (props.variant === "basic-planned") {
    const Icon = BASIC_ICONS[props.category]
    const provenance = itemProvenanceLabel({
      sourceId: props.sourceId,
      sourceAuthor: props.sourceAuthor,
    })
    const textBlock = (
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[15px] font-bold leading-snug tracking-tight text-foreground">
          {props.title}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-1 text-xs leading-snug text-muted-foreground">
          {BASIC_LABELS[props.category]} {provenance}
          {props.vendor ? <span className="text-muted-foreground/80"> · {props.vendor}</span> : null}
          {href ? <ExternalLink className="wp-ext-link ml-0.5 h-3 w-3 shrink-0" aria-hidden /> : null}
        </p>
      </div>
    )
    return (
      <div
        className={cn(
          "min-w-0 rounded-2xl border border-border/80 bg-card shadow-sm",
          CARD_MOTION,
          props.className,
        )}
      >
        <div className="flex min-h-0 items-stretch">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() =>
                trackCardOutbound(href, props.outboundSurface, props.outboundAffiliate)
              }
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground" aria-hidden>
                <Icon className="h-4 w-4" />
              </span>
              {textBlock}
            </a>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground" aria-hidden>
                <Icon className="h-4 w-4" />
              </span>
              {textBlock}
            </div>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              props.onRemove()
            }}
            className="inline-flex w-10 shrink-0 items-center justify-center self-stretch rounded-r-2xl text-foreground/70 transition-colors hover:bg-muted hover:text-destructive"
            aria-label="Quitar de básicos"
          >
            <X className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>
      </div>
    )
  }

  // planned
  const colors = ITEM_COLORS[props.type]
  const typeLabel = props.typeLabel ?? ITEM_LABELS[props.type]
  const iconA11y = props.transportIconLabel ?? typeLabel
  const region = props.regionLabel?.trim() ? props.regionLabel.trim() : null
  const routeSummary = props.routeSummary?.trim() ? props.routeSummary.trim() : null
  const spanLabel = props.spanLabel?.trim() ? props.spanLabel.trim() : null
  const provenance = itemProvenanceLabel({
    sourceId: props.sourceId,
    sourceAuthor: props.sourceAuthor,
  })
  const icon = (
    <span
      className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted"
      aria-label={iconA11y}
    >
      {props.transportIcon ? (
        createElement(props.transportIcon, {
          className: cn("h-4 w-4", colors.text),
          "aria-hidden": true,
        })
      ) : props.type === "activity" ? (
        href?.trim() ? (
          <Ticket className={cn("h-4 w-4", colors.text)} aria-hidden />
        ) : (
          <MapPin className={cn("h-4 w-4", colors.text)} aria-hidden />
        )
      ) : props.type === "transport" ? (
        <Car className={cn("h-4 w-4", colors.text)} aria-hidden />
      ) : props.type === "stay" ? (
        <Home className={cn("h-4 w-4", colors.text)} aria-hidden />
      ) : props.type === "food" ? (
        <UtensilsCrossed className={cn("h-4 w-4", colors.text)} aria-hidden />
      ) : null}
    </span>
  )
  const titleAndMeta = (
    <div className="min-w-0 flex-1">
      <div className="flex w-fit max-w-full items-start gap-1.5">
        <p className="min-w-0 line-clamp-2 text-[15px] font-bold leading-snug tracking-tight text-foreground">
          {props.title}
        </p>
        {props.titleAdornment}
      </div>
      {routeSummary ? (
        <p className="mt-0.5 flex items-center gap-1 text-xs leading-snug text-muted-foreground">
          <span className="truncate">
            {routeSummary} · {provenance}
          </span>
          {href ? (
            <ExternalLink className="wp-ext-link h-3 w-3 shrink-0" aria-hidden />
          ) : null}
        </p>
      ) : (
        <p className="mt-1 flex items-center gap-1 text-xs leading-snug text-muted-foreground">
          <span className="truncate">
            <span className="mr-1 font-medium">{typeLabel}</span>
            {spanLabel ? <span> {spanLabel} </span> : null}
            {region ? <span title={region}>{region} </span> : null}
            {provenance}
          </span>
          {href ? (
            <ExternalLink className="wp-ext-link h-3 w-3 shrink-0" aria-hidden />
          ) : null}
        </p>
      )}
    </div>
  )

  const bodyPad = props.moveControls ? "py-3 pl-1 pr-3" : "px-3 py-3"

  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm",
        CARD_MOTION,
        props.className,
      )}
      data-wp-drag-card=""
    >
      <div className="flex min-h-0 items-stretch">
        {props.moveControls ? (
          <div className="flex shrink-0 items-center self-stretch pl-0.5">
            {props.moveControls}
          </div>
        ) : null}
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            draggable={false}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-3 outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring",
              bodyPad,
            )}
            onClick={() =>
              trackCardOutbound(href, props.outboundSurface, props.outboundAffiliate)
            }
          >
            {icon}
            {titleAndMeta}
          </a>
        ) : (
          <div className={cn("flex min-w-0 flex-1 items-center gap-3", bodyPad)}>
            {icon}
            {titleAndMeta}
          </div>
        )}
        <div className="flex shrink-0 items-center gap-1 pr-1">
          {props.taskIndicator}
          {props.detail?.trim() ? <ItemNoteHint note={props.detail.trim()} /> : null}
          {props.onEdit ? (
            <ItemOverflowMenu
              onEdit={props.onEdit}
              editAriaLabel={props.editAriaLabel}
              onRemove={props.onRemove}
              removeLabel={props.removeAriaLabel ?? "Quitar ítem"}
            />
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                props.onRemove()
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-muted hover:text-destructive"
              aria-label={props.removeAriaLabel ?? "Quitar ítem"}
            >
              <X className="h-4 w-4" strokeWidth={1.8} />
            </button>
          )}
        </div>
      </div>
      {props.flightSearch ? (
        <div className="border-t border-border/60 px-3 py-1.5">
          <FlightSearchLink search={props.flightSearch} showCodes />
        </div>
      ) : null}
    </div>
  )
}
