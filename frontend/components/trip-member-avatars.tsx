"use client"

import type { MouseEvent, PointerEvent } from "react"
import { UserPlus } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { TripMember } from "@/hooks/use-trip-members"

function stopCardNavigation(e: MouseEvent | PointerEvent) {
  e.preventDefault()
  e.stopPropagation()
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

function memberLabel(m: TripMember): string {
  const name = m.displayName.trim()
  return name || "Viajero"
}

export function TripMemberAvatars({
  members,
  className,
  size = "md",
  onOpenInvite,
}: {
  members: TripMember[]
  className?: string
  /** `sm` encaja en las filas de Inicio (junto a la fecha o a las acciones). */
  size?: "sm" | "md"
  /** Abre la hoja de Invitar de ese viaje (añadir / quitar). */
  onOpenInvite: () => void
}) {
  const openInvite = (e: MouseEvent | PointerEvent) => {
    stopCardNavigation(e)
    onOpenInvite()
  }

  if (members.length < 2) {
    return (
      <button
        type="button"
        aria-label="Invitar"
        title="Invitar"
        className={cn(
          "relative z-[1] inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
          "text-muted-foreground transition-colors",
          "hover:bg-muted hover:text-foreground",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={openInvite}
      >
        <UserPlus className="h-4 w-4" strokeWidth={1.8} aria-hidden />
      </button>
    )
  }

  const shown = members.slice(0, 4)
  const extra = members.length - shown.length
  const box =
    size === "sm" ? "h-5 w-5 md:h-7 md:w-7" : "h-6 w-6 md:h-8 md:w-8"
  const type =
    size === "sm" ? "text-[9px] md:text-[10px]" : "text-[10px] md:text-[11px]"
  const listed = [...members].sort((a, b) => Number(b.isOwner) - Number(a.isOwner))
  const names = listed.map(memberLabel)
  const label = `Invitar o gestionar editores: ${names.join(", ")}`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn("relative z-[1] flex -space-x-2 rounded-full", className)}
          onPointerDown={(e) => {
            e.stopPropagation()
            // En táctil el tooltip (delay 0) se come el primer tap; abrimos ya.
            if (e.pointerType === "mouse") return
            openInvite(e)
          }}
          onClick={openInvite}
        >
          {shown.map((m) => (
            <Avatar key={m.userId} className={cn(box, "border-2 border-background")}>
              {m.avatarUrl ? <AvatarImage src={m.avatarUrl} alt="" /> : null}
              <AvatarFallback className={type}>{initials(memberLabel(m))}</AvatarFallback>
            </Avatar>
          ))}
          {extra > 0 ? (
            <Avatar className={cn(box, "border-2 border-background")}>
              <AvatarFallback className={type}>+{extra}</AvatarFallback>
            </Avatar>
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="px-3 py-1.5 text-sm">
        <ul className="text-left">
          {listed.map((m) => (
            <li key={m.userId}>{memberLabel(m)}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  )
}
