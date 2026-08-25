"use client"

import { useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { TripMember } from "@/hooks/use-trip-members"

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
}: {
  members: TripMember[]
  className?: string
  /** `sm` encaja en las filas de Inicio (junto a la fecha o a las acciones). */
  size?: "sm" | "md"
}) {
  const [open, setOpen] = useState(false)
  if (members.length < 2) return null
  const shown = members.slice(0, 4)
  const extra = members.length - shown.length
  const box =
    size === "sm" ? "h-5 w-5 md:h-7 md:w-7" : "h-6 w-6 md:h-8 md:w-8"
  const type =
    size === "sm" ? "text-[9px] md:text-[10px]" : "text-[10px] md:text-[11px]"
  const listed = [...members].sort((a, b) => Number(b.isOwner) - Number(a.isOwner))
  const names = listed.map(memberLabel)
  const label = `Editores: ${names.join(", ")}`

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn("relative z-[1] flex -space-x-2 rounded-full", className)}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (typeof window !== "undefined" && window.matchMedia("(hover: none)").matches) {
              setOpen((v) => !v)
            }
          }}
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
