"use client"

import type { ReactNode } from "react"
import { Check, ExternalLink, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { BASIC_ICONS, BASIC_LABELS, ITEM_COLORS, ITEM_LABELS, ITEM_TYPE_ICONS } from "@/lib/item-styles"
import { itemProvenanceLabel, MANUAL_SOURCE_ID } from "@/lib/item-provenance"
import type { BasicCategory, ItemType } from "@/types/itinerary"

function TypeBadge({ type }: { type: ItemType }) {
  const colors = ITEM_COLORS[type]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]",
        colors.bg,
        colors.border,
        colors.text,
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", colors.dot)} aria-hidden />
      {ITEM_LABELS[type]}
    </span>
  )
}

function AddedBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
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
  thumbnail: ReactNode
  isAdded?: boolean
  addedLabel?: string
  action: ReactNode
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
  onRemove: () => void
  moveControls?: ReactNode
  className?: string
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
}

export type TravelItemCardProps =
  | SourceCardProps
  | PlannedCardProps
  | BasicSourceCardProps
  | BasicPlannedCardProps

export function TravelItemCard(props: TravelItemCardProps) {
  if (props.variant === "source") {
    return (
      <div
        className={cn(
          "flex items-center gap-3 overflow-hidden rounded-2xl border border-border bg-card p-2.5 shadow-sm transition-shadow hover:shadow-md",
          props.isAdded && "opacity-70",
          props.className,
        )}
      >
        {props.thumbnail}
        <div className="min-w-0 flex-1 pr-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <TypeBadge type={props.type} />
            {props.addedLabel ? <AddedBadge label={props.addedLabel} /> : null}
          </div>
          <p className="mt-1.5 line-clamp-1 text-[15px] font-semibold leading-snug text-foreground">
            {props.title}
          </p>
          {props.detail ? (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{props.detail}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center">{props.action}</div>
      </div>
    )
  }

  if (props.variant === "basic-source") {
    const textBlock = (
      <div className="min-w-0 flex-1 pr-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {BASIC_LABELS[props.category]}
          </span>
          {props.isAdded ? <AddedBadge label="Añadido" /> : null}
        </div>
        <p className="mt-1.5 line-clamp-1 text-[15px] font-semibold leading-snug text-foreground">
          {props.title}
        </p>
        {props.detail ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{props.detail}</p>
        ) : null}
      </div>
    )
    const main = (
      <>
        {props.thumbnail}
        {textBlock}
      </>
    )
    return (
      <div
        className={cn(
          "flex items-stretch gap-3 overflow-hidden rounded-2xl border border-border bg-card p-2.5 shadow-sm transition-shadow hover:shadow-md",
          props.isAdded && "opacity-70",
          props.className,
        )}
      >
        {props.href ? (
          <a
            href={props.href}
            target="_blank"
            rel="noreferrer noopener"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring"
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
          {props.href ? <ExternalLink className="ml-0.5 h-3 w-3 shrink-0 opacity-70" aria-hidden /> : null}
        </p>
      </div>
    )
    return (
      <div className={cn("min-w-0 rounded-2xl border border-border/80 bg-card shadow-sm", props.className)}>
        <div className="flex min-h-0 items-stretch">
          {props.href ? (
            <a
              href={props.href}
              target="_blank"
              rel="noreferrer noopener"
              className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring"
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
  const TypeIcon = ITEM_TYPE_ICONS[props.type]
  const typeLabel = ITEM_LABELS[props.type]
  const region = props.regionLabel?.trim() ? props.regionLabel.trim() : null
  const provenance = itemProvenanceLabel({
    sourceId: props.sourceId,
    sourceAuthor: props.sourceAuthor,
  })
  const icon = (
    <span
      className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-foreground"
      aria-label={typeLabel}
    >
      <TypeIcon className="h-4 w-4" aria-hidden />
      <span
        className={cn("absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-background", colors.dot)}
        aria-hidden
      />
    </span>
  )
  const titleAndMeta = (
    <div className="min-w-0 flex-1">
      <p className="line-clamp-2 text-[15px] font-bold leading-snug tracking-tight text-foreground">
        {props.title}
      </p>
      {props.sourceId === MANUAL_SOURCE_ID && props.detail?.trim() ? (
        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{props.detail.trim()}</p>
      ) : null}
      <p className="mt-1 flex items-center gap-1 text-xs leading-snug text-muted-foreground">
        <span className="truncate">
          <span className={cn("mr-1 font-medium", colors.text)}>{typeLabel}</span>
          {region ? <span title={region}>{region} </span> : null}
          {provenance}
        </span>
        {props.href ? <ExternalLink className="h-3 w-3 shrink-0 opacity-70" aria-hidden /> : null}
      </p>
    </div>
  )

  return (
    <div className={cn("min-w-0 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm", props.className)}>
      <div className="flex min-h-0 items-stretch">
        {props.href ? (
          <a
            href={props.href}
            target="_blank"
            rel="noreferrer noopener"
            className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring"
          >
            {icon}
            {titleAndMeta}
          </a>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3">
            {icon}
            {titleAndMeta}
          </div>
        )}
        <div className="flex shrink-0 items-center gap-1 pr-1">
          {props.moveControls}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              props.onRemove()
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-muted hover:text-destructive"
            aria-label="Quitar ítem"
          >
            <X className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </div>
  )
}
