"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Compass, Map, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useTrips } from "@/lib/trip-context"
import { NewTripDialog } from "@/components/new-trip-dialog"
import { useRegistrationGate } from "@/components/auth/registration-gate"
import { useSidebarRail, useTripChrome } from "@/lib/trip-chrome-context"

/**
 * Espacio que deja de estar disponible para la lista cuando el CTA se fija al pie:
 * padding del scroll (p-2) + pie (pt-2.5 + botón ~32 + pb-2).
 */
const PINNED_CHROME_PX = 66

function NewTripButton({
  className,
  onClick,
  collapsed,
}: {
  className?: string
  onClick: () => void
  collapsed?: boolean
}) {
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              className,
            )}
            aria-label="Nuevo viaje"
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Nuevo viaje</TooltipContent>
      </Tooltip>
    )
  }

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

function SidebarCollapseControl() {
  const { toggleSidebar, sidebarCollapsed, autoCollapsed } = useTripChrome()
  const rail = useSidebarRail()
  const blocked = autoCollapsed && !sidebarCollapsed

  const button = (
    <button
      type="button"
      onClick={toggleSidebar}
      disabled={blocked}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors",
        "hover:bg-sidebar-accent hover:text-foreground disabled:cursor-default disabled:opacity-40",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
      aria-label={rail ? "Expandir barra lateral" : "Colapsar barra lateral"}
      aria-expanded={!rail}
    >
      {rail ? (
        <PanelLeftOpen className="h-4 w-4" aria-hidden />
      ) : (
        <PanelLeftClose className="h-4 w-4" aria-hidden />
      )}
    </button>
  )

  if (!blocked) return button

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">Espacio insuficiente para expandir</TooltipContent>
    </Tooltip>
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
  const rail = useSidebarRail()
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
    if (!aside || !content || rail) return

    const update = () => {
      setPinNewTrip(content.scrollHeight > aside.clientHeight - PINNED_CHROME_PX)
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(aside)
    ro.observe(content)
    return () => ro.disconnect()
  }, [activeTrips.length, rail])

  const openNewTrip = () => {
    if (requireAccount("new-trip")) setNewTripOpen(true)
  }

  const navLinkClass = (active: boolean) =>
    cn(
      "flex items-center rounded-md text-sm font-medium transition-colors",
      rail ? "h-9 w-9 justify-center" : "gap-2.5 px-2.5 py-2",
      active
        ? "bg-background text-foreground"
        : "text-sidebar-foreground/80 hover:bg-sidebar-accent",
    )

  return (
    <aside
      ref={asideRef}
      className={cn(
        "relative flex h-full shrink-0 flex-col bg-transparent text-sidebar-foreground",
        // Ancho sin transición: animar width re-maqueta el canvas (paneles + Crónica) cada frame.
        rail ? "w-14" : "w-56",
        className,
      )}
    >
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto",
          // Rail: centrar iconos en el eje del logo del header (misma columna w-14).
          rail ? "flex flex-col items-center px-0 pt-1" : "p-2",
        )}
      >
        <div
          ref={contentRef}
          className={cn("space-y-0.5", rail && "flex w-full flex-col items-center")}
        >
          {rail ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/trips"
                  onClick={(e) => {
                    if (!requireAccount("home")) {
                      e.preventDefault()
                      return
                    }
                    onNavigate?.()
                  }}
                  className={navLinkClass(isHome)}
                  aria-label="Inicio"
                >
                  <Compass className={cn("h-4 w-4 shrink-0", isHome ? "text-primary" : undefined)} />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">Inicio</TooltipContent>
            </Tooltip>
          ) : (
            <Link
              href="/trips"
              onClick={(e) => {
                if (!requireAccount("home")) {
                  e.preventDefault()
                  return
                }
                onNavigate?.()
              }}
              className={navLinkClass(isHome)}
            >
              <Compass
                className={cn("h-4 w-4 shrink-0", isHome ? "text-primary" : undefined)}
              />
              Inicio
            </Link>
          )}

          {rail ? (
            <div className="flex w-full flex-col items-center space-y-0.5 pt-1">
              {activeTrips.map((t) => {
                const isActive = activeTripId === t.id
                return (
                  <Tooltip key={t.id}>
                    <TooltipTrigger asChild>
                      <Link
                        href={`/trips/${t.id}`}
                        onClick={onNavigate}
                        className={navLinkClass(isActive)}
                        aria-label={t.name}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            isActive ? "bg-primary" : "bg-sidebar-foreground/30",
                          )}
                          aria-hidden
                        />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">{t.name}</TooltipContent>
                  </Tooltip>
                )
              })}
              <div className="flex justify-center pt-1">
                <NewTripButton collapsed onClick={openNewTrip} />
              </div>
            </div>
          ) : (
            <Collapsible defaultOpen>
              <CollapsibleTrigger className={navLinkClass(false)}>
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
          )}
        </div>

        {!rail && !pinNewTrip ? (
          <div className="pl-1">
            <NewTripButton className="mt-2.5" onClick={openNewTrip} />
          </div>
        ) : null}
      </div>

      {!rail && pinNewTrip ? (
        <div className="relative shrink-0 bg-canvas px-2 pb-2 pt-2.5">
          <div
            className="pointer-events-none absolute inset-x-0 -top-4 h-4 bg-gradient-to-t from-canvas to-transparent"
            aria-hidden
          />
          <div className="pl-1">
            <NewTripButton onClick={openNewTrip} />
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "flex shrink-0 pb-2 pt-1",
          rail ? "w-full justify-center px-0" : "justify-end px-2",
        )}
      >
        <SidebarCollapseControl />
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
