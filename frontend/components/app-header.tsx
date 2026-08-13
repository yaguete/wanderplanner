"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { LogOut, Settings, UserPlus } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { BrandLockup, BrandMark } from "@/components/brand-mark"
import { TripPanelToggles } from "@/components/trip-panel-toggles"
import { useAuth } from "@/lib/auth-context"
import { useSidebarRail, useTripChrome } from "@/lib/trip-chrome-context"
import { useIsMobile } from "@/hooks/use-mobile"
import { displayNameFor, initialsFor } from "@/lib/user-display"
import { cn } from "@/lib/utils"

type AppHeaderProps = {
  leading?: ReactNode
}

export function AppHeader({ leading }: AppHeaderProps) {
  const router = useRouter()
  const { user, profile, isGuest, signOut } = useAuth()
  const isMobile = useIsMobile()
  const { chrome, chromeHydrated } = useTripChrome()
  const rail = useSidebarRail()

  const name = displayNameFor(user, profile)
  const initials = initialsFor(name)
  const avatarUrl = (user?.user_metadata?.avatar_url as string | undefined) ?? null

  const handleSignOut = async () => {
    await signOut()
    router.push("/")
    router.refresh()
  }

  const showPanelToggles = !isMobile && chrome !== null

  return (
    <header
      className={cn(
        "flex h-12 shrink-0 items-center gap-2.5 bg-canvas",
        // Desktop: sin padding izquierdo — la marca ocupa exactamente el ancho del sidebar.
        isMobile ? "px-3 sm:px-4" : "pr-3 sm:pr-4",
        showPanelToggles ? "relative" : undefined,
      )}
    >
      {leading}

      {/* Marca al rincón, misma columna que el sidebar (w-14 rail / w-56 expandido). */}
      <div
        className={cn(
          "flex shrink-0 items-center",
          !isMobile && (rail ? "w-14 justify-center" : "w-56 px-2"),
          isMobile && "min-w-0",
          !isMobile && !chromeHydrated && "invisible",
        )}
      >
        <Link
          href="/trips"
          className={cn(
            "flex min-w-0 outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring",
            !isMobile && rail && "justify-center",
            // Expandido: mismo inset que Inicio / Tus viajes (px-2.5 dentro del p-2 del aside).
            !isMobile && !rail && "px-2.5",
          )}
        >
          {isMobile || !rail ? <BrandLockup /> : <BrandMark />}
        </Link>
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
            <DropdownMenuItem onSelect={() => router.push("/account")}>
              <Settings className="h-4 w-4" />
              Ajustes
            </DropdownMenuItem>
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
