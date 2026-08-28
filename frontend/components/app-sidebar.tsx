"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Compass, Map, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useTrips } from "@/lib/trip-context"
import { NewTripDialog } from "@/components/new-trip-dialog"
import { SidebarAccountFooter } from "@/components/account-menu"
import { useRegistrationGate } from "@/components/auth/registration-gate"
import { useOpeningTrip } from "@/components/opening-trip"
import { useSidebarRail, useTripChrome } from "@/lib/trip-chrome-context"
import { tripRailFlagCode, tripRailFlagSrc, tripRailLetter } from "@/lib/trip-rail-mark"

/**
 * Lo que cuesta fijar el CTA encima de la cuenta, sin la fila de cuenta
 * (esa se mide). p-2 del scroll + pt-2.5 + botón ~32 + hueco pb-2 del CTA.
 */
const PINNED_CHROME_PX = 74

/** Bandera circular del viaje en el rail plegado (`circle-flags`). */
function TripRailMark({
  flagCode,
  name,
  dimmed,
}: {
  flagCode: string | null
  name: string
  dimmed?: boolean
}) {
  const [broken, setBroken] = useState(false)
  const src = flagCode && !broken ? tripRailFlagSrc(flagCode) : null

  return (
    <span
      className={cn(
        "relative flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-foreground/10 transition-opacity",
        dimmed ? "opacity-40 group-hover:opacity-90" : "opacity-100",
      )}
      aria-hidden
    >
      {src ? (
        <img
          key={src}
          src={src}
          alt=""
          width={16}
          height={16}
          className="size-full object-cover"
          draggable={false}
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="text-[9px] font-medium leading-none text-muted-foreground">
          {tripRailLetter(name)}
        </span>
      )}
    </span>
  )
}

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

export function AppSidebar({
  className,
  onNavigate,
}: {
  className?: string
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { trips, createTrip, getTripSources } = useTrips()
  const { requireAccount } = useRegistrationGate()
  const { beginOpenTrip, clearOpeningTrip } = useOpeningTrip()
  const rail = useSidebarRail()
  const { chromeHydrated } = useTripChrome()
  const [newTripOpen, setNewTripOpen] = useState(false)
  /** Si la lista no cabe, el CTA se fija al borde inferior y los viajes pasan por detrás. */
  const [pinNewTrip, setPinNewTrip] = useState(false)
  const asideRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const accountRef = useRef<HTMLDivElement>(null)

  const isHome = pathname === "/trips" || pathname === "/trips/"
  const activeTripId = pathname.match(/^\/trips\/([^/]+)/)?.[1] ?? null
  const activeTrips = trips.filter((t) => !t.archived)

  useEffect(() => {
    const aside = asideRef.current
    const content = contentRef.current
    const account = accountRef.current
    if (rail) {
      setPinNewTrip(false)
      return
    }
    if (!aside || !content) return

    const update = () => {
      const accountH = accountRef.current?.offsetHeight ?? 0
      setPinNewTrip(content.scrollHeight > aside.clientHeight - accountH - PINNED_CHROME_PX)
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(aside)
    ro.observe(content)
    if (account) ro.observe(account)
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
        !chromeHydrated && "invisible",
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
                    clearOpeningTrip()
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
                clearOpeningTrip()
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
                        onPointerDown={(e) => {
                          beginOpenTrip({ id: t.id, name: t.name }, e)
                        }}
                        onClick={(e) => {
                          beginOpenTrip({ id: t.id, name: t.name }, e)
                          onNavigate?.()
                        }}
                        className={cn(navLinkClass(isActive), "group")}
                        aria-label={t.name}
                      >
                        <TripRailMark
                          dimmed={!isActive}
                          name={t.name}
                          flagCode={tripRailFlagCode({
                            name: t.name,
                            countries: t.countries,
                            area: getTripSources(t.id)[0]?.area,
                          })}
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
                        onPointerDown={(e) => {
                          beginOpenTrip({ id: t.id, name: t.name }, e)
                        }}
                        onClick={(e) => {
                          beginOpenTrip({ id: t.id, name: t.name }, e)
                          onNavigate?.()
                        }}
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

      <div
        className={cn(
          "relative shrink-0 bg-canvas",
          rail ? "flex flex-col items-center pb-2" : "px-2 pb-2",
          !rail && pinNewTrip && "pt-2.5",
        )}
      >
        <div
          className="pointer-events-none absolute inset-x-0 -top-4 h-4 bg-gradient-to-t from-canvas to-transparent"
          aria-hidden
        />
        {!rail && pinNewTrip ? (
          <div className="pl-1 pb-2">
            <NewTripButton onClick={openNewTrip} />
          </div>
        ) : null}
        <SidebarAccountFooter ref={accountRef} rail={rail} />
      </div>

      <NewTripDialog
        open={newTripOpen}
        onOpenChange={setNewTripOpen}
        onSubmit={(data) => {
          const trip = createTrip(data)
          setNewTripOpen(false)
          onNavigate?.()
          beginOpenTrip({ id: trip.id, name: trip.name })
          router.push(`/trips/${trip.id}`)
        }}
      />
    </aside>
  )
}
