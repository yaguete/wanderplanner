"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Compass, Map, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useTrips } from "@/lib/trip-context"
import { NewTripDialog } from "@/components/new-trip-dialog"
import { useRegistrationGate } from "@/components/auth/registration-gate"

/**
 * Espacio que deja de estar disponible para la lista cuando el CTA se fija al pie:
 * padding del scroll (p-2) + pie (pt-2.5 + botón ~32 + pb-2).
 */
const PINNED_CHROME_PX = 66

function NewTripButton({
  className,
  onClick,
}: {
  className?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-left text-[13px] leading-snug text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>Nuevo viaje</span>
    </button>
  )
}

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
  /** Si la lista no cabe, el CTA se fija al borde inferior y los viajes pasan por detrás. */
  const [pinNewTrip, setPinNewTrip] = useState(false)
  const asideRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const isHome = pathname === "/trips" || pathname === "/trips/"
  const activeTripId = pathname.match(/^\/trips\/([^/]+)/)?.[1] ?? null
  const activeTrips = trips.filter((t) => !t.archived)

  useEffect(() => {
    const aside = asideRef.current
    const content = contentRef.current
    if (!aside || !content) return

    const update = () => {
      // Si el CTA va al pie, la lista solo dispone del alto del aside menos ese bloque.
      setPinNewTrip(content.scrollHeight > aside.clientHeight - PINNED_CHROME_PX)
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(aside)
    ro.observe(content)
    return () => ro.disconnect()
  }, [activeTrips.length])

  const openNewTrip = () => {
    if (requireAccount("new-trip")) setNewTripOpen(true)
  }

  return (
    <aside
      ref={asideRef}
      className={cn(
        "flex h-full w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        className,
      )}
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div ref={contentRef} className="space-y-0.5">
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
                {activeTrips.map((t) => {
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
              </nav>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {!pinNewTrip ? (
          <div className="pl-1">
            <NewTripButton className="mt-2.5" onClick={openNewTrip} />
          </div>
        ) : null}
      </div>

      {pinNewTrip ? (
        <div className="relative shrink-0 bg-sidebar px-2 pb-2 pt-2.5">
          {/* Fundido para que los viajes «pasen por detrás» del CTA fijo. */}
          <div
            className="pointer-events-none absolute inset-x-0 -top-4 h-4 bg-gradient-to-t from-sidebar to-transparent"
            aria-hidden
          />
          <div className="pl-1">
            <NewTripButton onClick={openNewTrip} />
          </div>
        </div>
      ) : null}

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
