"use client"

import { useState, type ReactNode } from "react"
import { BookOpen, Map as MapIcon, MoreHorizontal, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatPublishedAt, type ReferenceFeedItem } from "@/lib/reference-feed"
import { cn } from "@/lib/utils"

function FeedRowAction({
  label,
  onClick,
  alwaysVisible = false,
  children,
}: {
  label: string
  onClick: () => void
  alwaysVisible?: boolean
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8 rounded-md bg-background/90",
            alwaysVisible
              ? "opacity-100"
              : "opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover/row:opacity-100",
          )}
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

function FeedRowMenu({
  onRead,
  onAdd,
  onCreate,
}: {
  onRead: () => void
  onAdd: () => void
  onCreate: () => void
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted"
          aria-label="Más acciones"
        >
          <MoreHorizontal className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10.5rem]">
        <DropdownMenuItem onSelect={onRead}>
          Leer
          <BookOpen className="ml-auto" strokeWidth={1.8} aria-hidden />
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onAdd}>
          Añadir
          <Plus className="ml-auto" strokeWidth={1.8} aria-hidden />
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onCreate}>
          Crear viaje
          <MapIcon className="ml-auto" strokeWidth={1.8} aria-hidden />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ReferenceFeedRow({
  item,
  alreadyIn,
  onRead,
  onAdd,
  onCreate,
  actionsAlwaysVisible = false,
}: {
  item: ReferenceFeedItem
  alreadyIn: string | null
  onRead: () => void
  onAdd: () => void
  onCreate: () => void
  /** En el modal de búsqueda: las acciones se ven sin hover. */
  actionsAlwaysVisible?: boolean
}) {
  const [broken, setBroken] = useState(false)
  const showImage = Boolean(item.imageUrl) && !broken
  const dateLabel = formatPublishedAt(item.publishedAt)
  const meta = [dateLabel, item.host, item.instant ? "Listo para consolidar" : null]
    .filter(Boolean)
    .join(" · ")

  return (
    <li className="group/row relative">
      <div className="flex w-full items-start gap-3 py-3 pl-3 pr-14 sm:gap-4 sm:pl-4 md:pr-48">
        <div className="relative mt-0.5 h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted sm:h-14 sm:w-14">
          {showImage ? (
            <img
              src={item.imageUrl ?? ""}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setBroken(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug tracking-tight">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {item.title}
            </a>
          </h3>
          <p className="mt-1 text-[12px] leading-snug tabular-nums text-muted-foreground">
            {meta}
            {alreadyIn ? ` · ${alreadyIn}` : ""}
          </p>
        </div>
      </div>
      <div className="absolute right-2 top-3 sm:right-3">
        <div className="md:hidden">
          <FeedRowMenu onRead={onRead} onAdd={onAdd} onCreate={onCreate} />
        </div>
        <div className="hidden items-center gap-1 md:flex">
          <FeedRowAction label="Leer" onClick={onRead} alwaysVisible={actionsAlwaysVisible}>
            <BookOpen className="h-3.5 w-3.5" />
          </FeedRowAction>
          <FeedRowAction label="Añadir" onClick={onAdd} alwaysVisible={actionsAlwaysVisible}>
            <Plus className="h-3.5 w-3.5" />
          </FeedRowAction>
          <FeedRowAction label="Crear viaje" onClick={onCreate} alwaysVisible={actionsAlwaysVisible}>
            <MapIcon className="h-3.5 w-3.5" />
          </FeedRowAction>
        </div>
      </div>
    </li>
  )
}
