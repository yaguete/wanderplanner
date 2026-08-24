"use client"

import { useState } from "react"
import { UserPlus } from "lucide-react"
import { ShareTripDialog } from "@/components/share-trip-dialog"
import { useRegistrationGate } from "@/components/auth/registration-gate"
import { useAuth } from "@/lib/auth-context"
import { cn } from "@/lib/utils"

export function InviteTripButton({
  tripId,
  isOwner,
}: {
  tripId: string
  isOwner: boolean
}) {
  const { isGuest } = useAuth()
  const { requireAccount } = useRegistrationGate()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (isGuest && !requireAccount("share")) return
          setOpen(true)
        }}
        className={cn(
          "inline-flex h-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors",
          "hover:bg-sidebar-accent hover:text-foreground",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "w-8 md:w-auto md:gap-1.5 md:px-2.5",
        )}
        aria-label="Invitar"
        title="Invitar"
      >
        <UserPlus className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        <span className="hidden text-sm font-medium md:inline">Invitar</span>
      </button>
      <ShareTripDialog tripId={tripId} isOwner={isOwner} open={open} onOpenChange={setOpen} />
    </>
  )
}
