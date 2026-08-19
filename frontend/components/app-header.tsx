"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { BrandMark, BrandWordmark } from "@/components/brand-mark"
import { TripPanelToggles } from "@/components/trip-panel-toggles"
import {
  AccountAvatar,
  AccountMenu,
  useAccountIdentity,
} from "@/components/account-menu"
import { useSidebarRail, useTripChrome } from "@/lib/trip-chrome-context"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

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
  const { name } = useAccountIdentity()
  const isMobile = useIsMobile()
  const { chrome, chromeHydrated } = useTripChrome()
  const rail = useSidebarRail()

  const showPanelToggles = !isMobile && chrome !== null
  const onTripDetail = /^\/trips\/[^/]+/.test(pathname)

  return (
    <header
      className={cn(
        "flex h-12 shrink-0 items-center gap-2.5 bg-canvas",
        // Móvil: el documento scrollea bajo el header (ver `trips-shell`), así
        // que se queda pegado arriba. El alto sale de `--wp-header-height`,
        // que es de donde cuelgan las cabeceras de panel.
        "max-md:sticky max-md:top-0 max-md:z-30",
        // Detalle del viaje: el panel es blanco; listado, perfil y configuración comparten el canvas.
        isMobile && onTripDetail && "bg-background",
        // Desktop: sin padding izquierdo — la marca ocupa exactamente el ancho del sidebar.
        isMobile ? "px-3 sm:px-4" : "pr-3 sm:pr-4",
      )}
    >
      {leading}

      {/* Marca al rincón. Expandido: w-56 (columna del aside) + colapso a la derecha del wordmark. Rail: ardilla en w-14 y el botón a su derecha. */}
      <div
        className={cn(
          "flex shrink-0 items-center",
          !isMobile && (rail ? undefined : "w-56 px-2"),
          isMobile && "min-w-0",
          !isMobile && !chromeHydrated && "invisible",
        )}
      >
        <Link
          href="/trips"
          aria-label="WanderPlanner"
          className={cn(
            "flex min-w-0 items-center outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring",
            // Rail: la ardilla sigue centrada en w-14 (eje de los iconos del aside).
            !isMobile && rail && "w-14 justify-center",
            // Expandido: mismo inset que Inicio / Tus viajes (px-2.5 dentro del p-2 del aside).
            !isMobile && !rail && "px-2.5",
          )}
        >
          {isMobile || !rail ? <BrandWordmark /> : <BrandMark />}
        </Link>
        {!isMobile ? <SidebarCollapseControl /> : null}
      </div>

      {showPanelToggles && chrome ? (
        <TripPanelToggles
          className="shrink-0"
          panels={chrome.panels}
          onToggle={chrome.onTogglePanel}
        />
      ) : null}

      <div className="flex-1" />

      {/* md:hidden: media query, no useIsMobile() — el hook es false al hidratar y el avatar parpadearía. */}
      <div className="flex items-center gap-2.5 md:hidden">
        <span className="hidden text-sm text-muted-foreground sm:inline">{name}</span>
        <AccountMenu side="bottom" align="end">
          <button
            type="button"
            className="rounded-full outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Abrir menú de cuenta"
          >
            <AccountAvatar />
          </button>
        </AccountMenu>
      </div>
    </header>
  )
}
