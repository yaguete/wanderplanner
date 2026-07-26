"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Compass, Map, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useTrips } from "@/lib/trip-context"
import { NewTripDialog } from "@/components/new-trip-dialog"
import { useRegistrationGate } from "@/components/auth/registration-gate"

export function AppSidebar({
  className,
  onNavigate,
}: {
  className?: string
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { trips, createTrip } = useTrips()
  const { requireAccount } = useRegistrationGate()
  const [newTripOpen, setNewTripOpen] = useState(false)

  const isHome = pathname === "/trips" || pathname === "/trips/"
  const activeTripId = pathname.match(/^\/trips\/([^/]+)/)?.[1] ?? null

  return (
    <aside
      className={cn(
        "flex h-full w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        className,
      )}
    >
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-0.5 p-2">
          <Link
            href="/trips"
            onClick={(e) => {
              if (!requireAccount("home")) {
                e.preventDefault()
                return
              }
              onNavigate?.()
            }}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
              isHome
                ? "bg-background text-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent",
            )}
          >
            <Compass
              className={cn("h-4 w-4 shrink-0", isHome ? "text-primary" : undefined)}
            />
            Inicio
          </Link>

          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium text-sidebar-foreground/80 outline-none transition-colors hover:bg-sidebar-accent">
              <Map className="h-4 w-4 shrink-0" />
              Tus viajes
            </CollapsibleTrigger>
            <CollapsibleContent>
              <nav className="mt-0.5 space-y-0.5 pl-1">
                {trips
                  .filter((t) => !t.archived)
                  .map((t) => {
                    const isActive = activeTripId === t.id
                    return (
                      <Link
                        key={t.id}
                        href={`/trips/${t.id}`}
                        onClick={onNavigate}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] leading-snug transition-colors",
                          isActive
                            ? "bg-background font-medium text-foreground"
                            : "text-sidebar-foreground/75 hover:bg-sidebar-accent/80",
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            isActive ? "bg-primary" : "bg-sidebar-foreground/30",
                          )}
                          aria-hidden
                        />
                        <span className="truncate">{t.name}</span>
                      </Link>
                    )
                  })}
                {trips.filter((t) => !t.archived).length === 0 ? (
                  <p className="px-2.5 py-2 text-xs text-muted-foreground">Todavía no hay viajes</p>
                ) : null}
              </nav>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-sidebar-border p-2">
        <Button
          className="w-full"
          size="sm"
          onClick={() => {
            if (requireAccount("new-trip")) setNewTripOpen(true)
          }}
        >
          <Plus className="h-4 w-4" />
          Nuevo viaje
        </Button>
      </div>

      <NewTripDialog
        open={newTripOpen}
        onOpenChange={setNewTripOpen}
        onSubmit={(data) => {
          const trip = createTrip(data)
          setNewTripOpen(false)
          onNavigate?.()
          router.push(`/trips/${trip.id}`)
        }}
      />
    </aside>
  )
}
