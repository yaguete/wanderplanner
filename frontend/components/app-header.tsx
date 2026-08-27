"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { BrandMark, BrandWordmark } from "@/components/brand-mark"
import { TripPanelToggles } from "@/components/trip-panel-toggles"
import {
  AccountIdentityButton,
  AccountMenu,
  useAccountIdentity,
} from "@/components/account-menu"
import { useSidebarRail, useTripChrome } from "@/lib/trip-chrome-context"
import { tripIdFromPath } from "@/lib/trip-paths"
import { InviteTripButton } from "@/components/invite-trip-button"
import { ShareRouteButton } from "@/components/share-route-button"
import { useOpeningTrip } from "@/components/opening-trip"
import { useTrips } from "@/lib/trip-context"
import { useAuth } from "@/lib/auth-context"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

function HeaderAccountMenu({ className }: { className?: string }) {
  const { name } = useAccountIdentity()
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {/* Móvil: el nombre queda fuera del botón (el chip de dos líneas es de desktop). */}
      <span className="hidden text-sm text-muted-foreground sm:inline md:hidden">{name}</span>
      <AccountMenu side="bottom" align="end">
        <AccountIdentityButton details="desktop" />
      </AccountMenu>
    </div>
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
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors",
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
      <TooltipContent side="bottom">Espacio insuficiente para expandir</TooltipContent>
    </Tooltip>
  )
}

type AppHeaderProps = {
  leading?: ReactNode
}

export function AppHeader({ leading }: AppHeaderProps) {
  const pathname = usePathname()
  const { user } = useAuth()
  const { getTrip } = useTrips()
  const isMobile = useIsMobile()
  const { chrome, chromeHydrated } = useTripChrome()
  const { clearOpeningTrip } = useOpeningTrip()
  const rail = useSidebarRail()

  const showPanelToggles = !isMobile && chrome !== null
  const tripId = tripIdFromPath(pathname)
  const onTripDetail = Boolean(tripId)
  const openTrip = tripId ? getTrip(tripId) : undefined
  const isTripOwner = Boolean(openTrip && (!openTrip.ownerId || openTrip.ownerId === user?.id))
  // Desktop en detalle: la marca ocupa el ancho del sidebar. En listado/cuenta no hay aside.
  const alignToSidebar = !isMobile && onTripDetail
  // Listado y cuenta: misma columna que el canvas (`max-w-5xl` + px de la página).
  const insetToContent = !onTripDetail
  const accountInset = pathname.startsWith("/account")

  return (
    <header
      className={cn(
        "shrink-0 bg-canvas",
        // Móvil: el documento scrollea bajo el header (ver `trips-shell`), así
        // que se queda pegado arriba. El alto sale de `--wp-header-height`,
        // que es de donde cuelgan las cabeceras de panel. El padding extra
        // de listado/cuenta es solo desktop: no toca esa variable.
        "max-md:sticky max-md:top-0 max-md:z-30",
        insetToContent && "md:pt-6",
        // Detalle del viaje: el panel es blanco; listado, perfil y configuración comparten el canvas.
        isMobile && onTripDetail && "bg-background",
      )}
    >
      <div
        className={cn(
          "flex h-12 w-full items-center gap-2.5",
          insetToContent
            ? cn(
                "mx-auto max-w-5xl",
                accountInset ? "px-6 sm:px-8" : "px-4 sm:px-8",
              )
            : alignToSidebar
              ? "pr-3 sm:pr-4"
              : "px-3 sm:px-4",
        )}
      >
      {leading}

      {/* Detalle: w-56 / rail alineados al aside. Listado y cuenta: wordmark al rincón del canvas, sin colapso. */}
      <div
        className={cn(
          "flex shrink-0 items-center",
          alignToSidebar && (rail ? undefined : "w-56 px-2"),
          !alignToSidebar && "min-w-0",
          alignToSidebar && !chromeHydrated && "invisible",
        )}
      >
        <Link
          href="/trips"
          aria-label="WanderPlanner"
          onClick={() => clearOpeningTrip()}
          className={cn(
            "flex min-w-0 items-center outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring",
            // Rail: la ardilla sigue centrada en w-14 (eje de los iconos del aside).
            alignToSidebar && rail && "w-14 justify-center",
            // Expandido: mismo inset que Inicio / Tus viajes (px-2.5 dentro del p-2 del aside).
            alignToSidebar && !rail && "px-2.5",
          )}
        >
          {alignToSidebar && rail ? (
            <BrandMark />
          ) : alignToSidebar ? (
            <BrandWordmark />
          ) : (
            <>
              {/* Listado/cuenta: ardilla + wordmark solo en desktop. `items-baseline`
                  pone las patas en la línea base; el BrandLockup de landing no, porque
                  el nombre apoya en la base del logo (`items-end` + dip del wordmark). */}
              <span className="hidden min-w-0 items-baseline gap-2 md:flex">
                {/* 1px óptico: el trazo de las patas si no se come medio píxel por debajo de la línea. */}
                <BrandMark className="-translate-y-px" />
                <BrandWordmark />
              </span>
              <BrandWordmark className="md:hidden" />
            </>
          )}
        </Link>
        {alignToSidebar ? <SidebarCollapseControl /> : null}
      </div>

      {showPanelToggles && chrome ? (
        <TripPanelToggles
          className="shrink-0"
          panels={chrome.panels}
          onToggle={chrome.onTogglePanel}
        />
      ) : null}

      <div className="flex-1" />

      <div className="flex items-center gap-1.5">
        {openTrip ? (
          <>
            <ShareRouteButton trip={openTrip} />
            <InviteTripButton tripId={openTrip.id} isOwner={isTripOwner} />
          </>
        ) : null}

        {/* Detalle desktop: el avatar vive en el pie del sidebar. En el resto, cabecera.
            md:hidden en detalle: media query, no useIsMobile() — el hook es false al hidratar. */}
        <HeaderAccountMenu className={onTripDetail ? "md:hidden" : undefined} />
      </div>
      </div>
    </header>
  )
}
