"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { LogOut, PanelLeftClose, PanelLeftOpen, Settings, User, UserPlus } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { BrandMark, BrandWordmark } from "@/components/brand-mark"
import { TripPanelToggles } from "@/components/trip-panel-toggles"
import { useAuth } from "@/lib/auth-context"
import { useSidebarRail, useTripChrome } from "@/lib/trip-chrome-context"
import { useIsMobile } from "@/hooks/use-mobile"
import { displayNameFor, initialsFor } from "@/lib/user-display"
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
  const router = useRouter()
  const pathname = usePathname()
  const { user, profile, isGuest, signOut } = useAuth()
  const isMobile = useIsMobile()
  const { chrome, chromeHydrated } = useTripChrome()
  const rail = useSidebarRail()

  const name = displayNameFor(user, profile)
  const initials = initialsFor(name)
  const avatarUrl = (user?.user_metadata?.avatar_url as string | undefined) ?? null

  const handleSignOut = async () => {
    await signOut()
    window.location.assign("/")
  }

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
        showPanelToggles ? "relative" : undefined,
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
        <div className="pointer-events-none absolute inset-x-0 flex justify-center">
          <div className="pointer-events-auto">
            <TripPanelToggles panels={chrome.panels} onToggle={chrome.onTogglePanel} />
          </div>
        </div>
      ) : null}

      <div className="flex-1" />

      <span className="hidden text-sm text-muted-foreground sm:inline">{name}</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="rounded-full outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Abrir menú de cuenta"
        >
          <Avatar className="size-7">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
            <AvatarFallback className="bg-secondary text-[10px] font-medium text-secondary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="truncate text-sm font-medium">{name}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {isGuest ? "Estás probando sin cuenta" : user?.email ?? ""}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {isGuest ? (
            <DropdownMenuItem onSelect={() => router.push("/signup")}>
              <UserPlus className="h-4 w-4" />
              Guardar mi viaje
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem onSelect={() => router.push("/account")}>
                <User className="h-4 w-4" />
                Perfil
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push("/account/settings")}>
                <Settings className="h-4 w-4" />
                Configuración
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem onSelect={() => void handleSignOut()}>
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
