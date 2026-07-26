"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Compass, Map, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useTrips } from "@/lib/trip-context"
import { NewTripDialog } from "@/components/new-trip-dialog"
import { MOCK_USER } from "@/lib/mock-user"
import { BrandMark } from "@/components/app-header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export function MobileNavMenu({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { trips, createTrip } = useTrips()
  const [newTripOpen, setNewTripOpen] = useState(false)

  const isHome = pathname === "/trips" || pathname === "/trips/"
  const activeTripId = pathname.match(/^\/trips\/([^/]+)/)?.[1] ?? null
  const activeTrips = trips.filter((t) => !t.archived)

  const close = () => onOpenChange(false)

  return (
    <>
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className={cn(
              "fixed inset-0 z-50 bg-white/50 backdrop-blur-md",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            )}
          />
          <DialogPrimitive.Content
            className={cn(
              "fixed inset-0 z-50 flex flex-col bg-background/92 backdrop-blur-xl",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-100",
              "duration-300 outline-none",
            )}
          >
            <DialogPrimitive.Title className="sr-only">Menú</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Navegación de WanderPlanner
            </DialogPrimitive.Description>

            <header className="flex shrink-0 items-center justify-between px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
              <div className="flex items-center gap-2.5">
                <BrandMark />
                <span className="text-base font-semibold tracking-tight">WanderPlanner</span>
              </div>
              <DialogPrimitive.Close
                className={cn(
                  "inline-flex h-11 w-11 items-center justify-center rounded-full",
                  "bg-muted/80 text-foreground transition-colors hover:bg-muted",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <X className="h-5 w-5" />
                <span className="sr-only">Cerrar</span>
              </DialogPrimitive.Close>
            </header>

            <div className="flex min-h-0 flex-1 flex-col px-6">
              {/*
                Espaciadores flex arriba/abajo: con pocos viajes el bloque queda centrado.
                Con muchos, los espaciadores ceden y solo la lista hace scroll.
              */}
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 basis-0" aria-hidden />

                <nav className="mx-auto w-full max-w-sm shrink-0">
                  <Link
                    href="/trips"
                    onClick={close}
                    className={cn(
                      "flex items-center gap-3.5 rounded-2xl px-4 py-3.5 text-lg font-medium transition-colors",
                      isHome
                        ? "bg-muted text-foreground"
                        : "text-foreground/75 hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    <Compass
                      className={cn(
                        "h-6 w-6 shrink-0",
                        isHome ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                    Inicio
                  </Link>

                  <div className="mt-4 flex items-center gap-2 px-4 text-sm font-medium text-muted-foreground">
                    <Map className="h-4 w-4" />
                    Tus viajes
                  </div>
                </nav>

                <ul
                  className={cn(
                    "mx-auto min-h-0 w-full max-w-sm space-y-1 overflow-y-auto overscroll-contain",
                    "mt-2 [flex:0_1_auto] [-webkit-overflow-scrolling:touch]",
                  )}
                >
                  {activeTrips.map((t) => {
                    const isActive = activeTripId === t.id
                    return (
                      <li key={t.id}>
                        <Link
                          href={`/trips/${t.id}`}
                          onClick={close}
                          className={cn(
                            "flex items-center gap-3 rounded-2xl px-4 py-3.5 text-base transition-colors",
                            isActive
                              ? "bg-muted font-medium text-foreground"
                              : "text-foreground/75 hover:bg-muted/50 hover:text-foreground",
                          )}
                        >
                          <span
                            className={cn(
                              "h-2 w-2 shrink-0 rounded-full",
                              isActive ? "bg-primary" : "bg-muted-foreground/35",
                            )}
                            aria-hidden
                          />
                          <span className="truncate">{t.name}</span>
                        </Link>
                      </li>
                    )
                  })}
                  {activeTrips.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-muted-foreground">
                      Todavía no hay viajes
                    </p>
                  ) : null}
                </ul>

                <div className="min-h-0 flex-1 basis-0" aria-hidden />
              </div>

              <div className="mx-auto w-full max-w-sm shrink-0 pb-3 pt-4">
                <Button
                  size="lg"
                  className="h-14 w-full rounded-2xl text-base"
                  onClick={() => setNewTripOpen(true)}
                >
                  <Plus className="h-5 w-5" />
                  Nuevo viaje
                </Button>
              </div>
            </div>

            <footer className="shrink-0 border-t border-border/60 px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
              <div className="mx-auto flex w-full max-w-sm items-center gap-3">
                <Avatar className="size-11">
                  {MOCK_USER.avatarUrl ? <AvatarImage src={MOCK_USER.avatarUrl} alt="" /> : null}
                  <AvatarFallback className="bg-secondary text-sm font-medium text-secondary-foreground">
                    {MOCK_USER.name.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{MOCK_USER.name}</p>
                  <p className="text-xs text-muted-foreground">Tu cuenta</p>
                </div>
              </div>
            </footer>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <NewTripDialog
        open={newTripOpen}
        onOpenChange={setNewTripOpen}
        onSubmit={(data) => {
          const trip = createTrip(data)
          setNewTripOpen(false)
          close()
          router.push(`/trips/${trip.id}`)
        }}
      />
    </>
  )
}
