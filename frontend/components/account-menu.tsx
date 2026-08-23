"use client"

import { forwardRef, useState, type ReactNode } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Info, LogOut, MoreHorizontal, Settings, User, UserPlus } from "lucide-react"
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
import { useAuth } from "@/lib/auth-context"
import { useTrips } from "@/lib/trip-context"
import { displayNameFor, initialsFor } from "@/lib/user-display"
import { openOnboarding } from "@/lib/onboarding"
import { cn } from "@/lib/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { buttonVariants } from "@/components/ui/button"

export function useAccountIdentity(): {
  name: string
  initials: string
  avatarUrl: string | null
  email: string | null
  isGuest: boolean
} {
  const { user, profile, isGuest } = useAuth()
  const name = displayNameFor(user, profile)
  const initials = initialsFor(name)
  const avatarUrl = (user?.user_metadata?.avatar_url as string | undefined) ?? null
  const email = user?.email ?? null
  return { name, initials, avatarUrl, email, isGuest }
}

export function AccountAvatar({ className }: { className?: string }) {
  const { initials, avatarUrl } = useAccountIdentity()
  return (
    <Avatar className={cn("size-7 shrink-0 border border-foreground/20", className)}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
      <AvatarFallback className="bg-secondary text-[10px] font-medium text-secondary-foreground">
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}

type AccountMenuProps = {
  children: ReactNode
  side: "top" | "right" | "bottom"
  align: "start" | "end"
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Si hay tooltip, el menú se controla para no reaparecer al devolver el foco. */
  tooltip?: string
}

export function AccountMenu({
  children,
  side,
  align,
  open,
  onOpenChange,
  tooltip,
}: AccountMenuProps) {
  const router = useRouter()
  const { name, email, isGuest } = useAccountIdentity()
  const { signOut } = useAuth()
  const { trips } = useTrips()
  const [internalOpen, setInternalOpen] = useState(false)
  const [tooltipLocked, setTooltipLocked] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const isControlled = open !== undefined
  const menuOpen = isControlled ? open : internalOpen
  const trackOpen = isControlled || Boolean(tooltip)
  const guestTripName =
    trips.find((t) => !t.archived)?.name?.trim() || "tu viaje"

  const handleOpenChange = (next: boolean) => {
    if (!isControlled) setInternalOpen(next)
    onOpenChange?.(next)
    // Tras Esc el foco vuelve al botón; sin esto el tooltip (delay 0) salta encima.
    if (tooltip && !next) setTooltipLocked(true)
  }

  const handleSignOut = async () => {
    await signOut()
    window.location.assign("/")
  }

  const trigger = <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>

  return (
    <>
    <DropdownMenu
      open={trackOpen ? menuOpen : undefined}
      onOpenChange={trackOpen ? handleOpenChange : onOpenChange}
    >
      {tooltip ? (
        <Tooltip open={menuOpen || tooltipLocked ? false : undefined}>
          <TooltipTrigger
            asChild
            onPointerMove={() => setTooltipLocked(false)}
            onBlur={() => setTooltipLocked(false)}
          >
            {trigger}
          </TooltipTrigger>
          <TooltipContent side="right">{tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent
        side={side}
        align={align}
        collisionPadding={8}
        className="w-56"
      >
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{name}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">
            {isGuest ? "Estás probando sin cuenta" : email ?? ""}
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
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => openOnboarding()}>
          <Info className="h-4 w-4" />
          Cómo funciona
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={
            isGuest
              ? (event) => {
                  event.preventDefault()
                  setDiscardOpen(true)
                }
              : () => void handleSignOut()
          }
        >
          <LogOut className="h-4 w-4" />
          {isGuest ? "Salir y descartar el viaje" : "Cerrar sesión"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {isGuest ? (
      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Salir y perder el viaje?</AlertDialogTitle>
            <AlertDialogDescription>
              Si sales, perderás «{guestTripName}»: no tiene cuenta a la que volver. ¿Seguro?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "text-destructive hover:bg-destructive/10 hover:text-destructive",
              )}
              onClick={() => void handleSignOut()}
            >
              Salir y descartar
            </button>
            <AlertDialogCancel className="mt-0">Seguir aquí</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                router.push("/signup")
              }}
            >
              Crear cuenta y guardar
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    ) : null}
    </>
  )
}

export const SidebarAccountFooter = forwardRef<HTMLDivElement, { rail: boolean }>(
  function SidebarAccountFooter({ rail }, ref) {
    const pathname = usePathname()
    const { name, email, isGuest } = useAccountIdentity()
    const isAccount = pathname.startsWith("/account")
    const caption = isGuest ? "Guarda tu viaje" : email

    const button = (
      <button
        type="button"
        className={cn(
          "outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
          "data-[state=open]:bg-sidebar-accent",
          rail
            ? "flex h-9 w-9 items-center justify-center rounded-md"
            : "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left",
          isAccount
            ? "bg-background text-foreground"
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent",
        )}
        aria-label={`Cuenta de ${name}`}
      >
        <AccountAvatar />
        {rail ? null : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium leading-snug">{name}</span>
              {caption ? (
                <span className="block truncate text-[11px] leading-snug text-muted-foreground">
                  {caption}
                </span>
              ) : null}
            </span>
            <MoreHorizontal className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
          </>
        )}
      </button>
    )

    return (
      <div ref={ref} className={rail ? "flex justify-center" : undefined}>
        <AccountMenu
          side={rail ? "right" : "top"}
          align={rail ? "end" : "start"}
          tooltip={rail ? name : undefined}
        >
          {button}
        </AccountMenu>
      </div>
    )
  },
)
SidebarAccountFooter.displayName = "SidebarAccountFooter"
