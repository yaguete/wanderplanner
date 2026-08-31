"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Archive,
  ArchiveRestore,
  LayoutGrid,
  List,
  LogOut,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import { NewTripDialog, type NewTripData } from "@/components/new-trip-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { countriesPlainList } from "@/lib/countries"
import { formatTripDates } from "@/lib/trip-dates"
import { useTrips } from "@/lib/trip-context"
import { useAuth } from "@/lib/auth-context"
import { useOpeningTrip } from "@/components/opening-trip"
import { useRegistrationGate } from "@/components/auth/registration-gate"
import { useMyTripInvites, useMyTripOccupants } from "@/hooks/use-trip-members"
import { TripMemberAvatars } from "@/components/trip-member-avatars"
import { InviteTripDialog } from "@/components/invite-trip-dialog"
import { createClient } from "@/lib/supabase/client"
import {
  acceptStatusFromPayload,
  isFailedAcceptStatus,
  tripIdFromAcceptPayload,
} from "@/lib/trip-invite-url"
import type { Trip } from "@/types/itinerary"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type TripFilter = "active" | "archived"
type ViewMode = "grid" | "list"

const VIEW_KEY = "wp-trips-view"

function readViewMode(): ViewMode {
  if (typeof window === "undefined") return "grid"
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid"
  } catch {
    return "grid"
  }
}

function tripItemCount(trip: Trip): number {
  return trip.days.reduce((sum, d) => sum + d.items.length, 0)
}

function tripStatsLine(trip: Trip, itemCount: number): string {
  const parts: string[] = []
  if (trip.numDays != null) {
    parts.push(`${trip.numDays} ${trip.numDays === 1 ? "día" : "días"}`)
  }
  parts.push(
    `${trip.sourceIds.length} ${trip.sourceIds.length === 1 ? "fuente" : "fuentes"}`,
  )
  parts.push(`${itemCount} ítems`)
  return parts.join(" · ")
}

function TripActions({
  trip,
  isOwner,
  onArchive,
  onUnarchive,
  onEdit,
  onDelete,
  onLeave,
}: {
  trip: Trip
  isOwner: boolean
  onArchive: () => void
  onUnarchive: () => void
  onEdit: () => void
  onDelete: () => void
  onLeave: () => void
}) {
  const archived = Boolean(trip.archived)
  const btnClass = cn(
    "h-8 w-8 rounded-md bg-background/90",
    "opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover/card:opacity-100 sm:group-hover/row:opacity-100",
  )

  return (
    <div className="flex items-center gap-1">
      {isOwner ? (
        <>
          {archived ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={btnClass}
              aria-label={`Desarchivar ${trip.name}`}
              title="Desarchivar"
              onClick={(e) => {
                e.stopPropagation()
                onUnarchive()
              }}
            >
              <ArchiveRestore className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={btnClass}
              aria-label={`Archivar ${trip.name}`}
              title="Archivar"
              onClick={(e) => {
                e.stopPropagation()
                onArchive()
              }}
            >
              <Archive className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={btnClass}
            aria-label={`Editar ${trip.name}`}
            title="Editar"
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(btnClass, "hover:bg-destructive hover:text-destructive-foreground")}
            aria-label={`Eliminar ${trip.name}`}
            title="Eliminar"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={btnClass}
          aria-label={`Salir de ${trip.name}`}
          title="Salir del viaje"
          onClick={(e) => {
            e.stopPropagation()
            onLeave()
          }}
        >
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}

export default function TripsHomePage() {
  const { trips, isLoading, createTrip, updateTrip, deleteTrip, archiveTrip, unarchiveTrip, leaveTrip, reloadTrips } =
    useTrips()
  const { user, isGuest } = useAuth()
  const router = useRouter()
  const { openingTrip, beginOpenTrip } = useOpeningTrip()
  const { requireAccount } = useRegistrationGate()
  const { invites, reload: reloadInvites } = useMyTripInvites()
  const { byTripId: occupantsByTrip, reload: reloadOccupants } = useMyTripOccupants()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [inviteTripId, setInviteTripId] = useState<string | null>(null)
  const openNewTripDialog = () => {
    if (requireAccount("new-trip")) setDialogOpen(true)
  }
  const [editingTripId, setEditingTripId] = useState<string | null>(null)
  const [deletingTripId, setDeletingTripId] = useState<string | null>(null)
  const [filter, setFilter] = useState<TripFilter>("active")
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [leavingTripId, setLeavingTripId] = useState<string | null>(null)

  useEffect(() => {
    setViewMode(readViewMode())
  }, [])

  // El invitado aterriza aquí tras confirmar su correo: `upgradeGuest` manda el
  // enlace a `/auth/callback?next=/trips?confirmed=1` en vez de dejarlo caer en
  // el Site URL (la landing), que es donde no puede seguir editando nada.
  // Se limpia el query con `replaceState` —no `router.replace`, que remontaría
  // el listado— para que recargar no repita el aviso.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("confirmed") !== "1") return
    toast.success("Correo confirmado. Tu viaje ya está guardado en tu cuenta.")
    params.delete("confirmed")
    const query = params.toString()
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    )
  }, [])

  const isOwnerOf = (trip: Trip) => !trip.ownerId || trip.ownerId === user?.id

  const tripToDelete = deletingTripId ? trips.find((t) => t.id === deletingTripId) : null
  const tripToLeave = leavingTripId ? trips.find((t) => t.id === leavingTripId) : null
  const tripToInvite = inviteTripId ? trips.find((t) => t.id === inviteTripId) : null
  const editingTrip = editingTripId ? trips.find((t) => t.id === editingTripId) : null
  const formOpen = dialogOpen || !!editingTrip

  const openInvite = (trip: Trip) => {
    if (isGuest && !requireAccount("invite")) return
    setInviteTripId(trip.id)
  }

  const activeTrips = useMemo(() => trips.filter((t) => !t.archived), [trips])
  const archivedTrips = useMemo(() => trips.filter((t) => t.archived), [trips])
  const visibleTrips = filter === "active" ? activeTrips : archivedTrips

  // `visibleTrips` es un array nuevo en cada mutación del viaje (portadas,
  // Realtime…). Sin esta clave, el backfill de portadas relanza el prefetch de
  // las 6 rutas una vez por foto aplicada.
  const prefetchKey = visibleTrips
    .slice(0, 6)
    .map((t) => t.id)
    .join(",")
  useEffect(() => {
    if (!prefetchKey) return
    for (const id of prefetchKey.split(",")) {
      router.prefetch(`/trips/${id}`)
    }
  }, [prefetchKey, router])

  const setView = (mode: ViewMode) => {
    setViewMode(mode)
    try {
      localStorage.setItem(VIEW_KEY, mode)
    } catch {
      /* ignore */
    }
  }

  return (
    // Móvil: scrollea el documento (ver `trips-shell`), no este contenedor.
    <div className="flex-1 md:overflow-auto">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-10">
        <div className="mb-6 sm:mb-8">
          <div className="max-w-xl">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Tus viajes
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Consolida fuentes en las que confías en una ruta editable.
            </p>
          </div>
        </div>

        {invites.length > 0 ? (
          <ul className="mb-6 space-y-2">
            {invites.map((inv) => (
              <li
                key={inv.inviteId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
              >
                <p className="text-sm">
                  <span className="font-medium">{inv.inviterName}</span>
                  {" te invita a editar "}
                  <span className="font-medium">{inv.tripName}</span>
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={async () => {
                      const supabase = createClient()
                      const { data, error } = await supabase.rpc("accept_trip_invite_by_id", {
                        p_invite_id: inv.inviteId,
                      })
                      if (error) {
                        toast.error("No se pudo aceptar la invitación")
                        return
                      }
                      const status = acceptStatusFromPayload(data)
                      if (isFailedAcceptStatus(status)) {
                        toast.error(
                          status === "expired"
                            ? "Esta invitación ha caducado"
                            : "No encontramos esa invitación",
                        )
                        await reloadInvites()
                        return
                      }
                      const tripId = tripIdFromAcceptPayload(data) || inv.tripId
                      await reloadInvites()
                      await reloadTrips()
                      beginOpenTrip({ id: tripId, name: inv.tripName })
                      router.push(`/trips/${tripId}`)
                    }}
                  >
                    Aceptar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const supabase = createClient()
                      const { error } = await supabase.rpc("decline_trip_invite", {
                        p_invite_id: inv.inviteId,
                      })
                      if (error) {
                        toast.error("No se pudo rechazar la invitación")
                        return
                      }
                      await reloadInvites()
                    }}
                  >
                    Rechazar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div
            className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5"
            role="tablist"
            aria-label="Filtrar viajes"
          >
            <button
              type="button"
              role="tab"
              aria-selected={filter === "active"}
              onClick={() => setFilter("active")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                filter === "active"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Activos
              <span className="ml-1.5 tabular-nums text-muted-foreground">
                {activeTrips.length}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === "archived"}
              onClick={() => setFilter("archived")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                filter === "archived"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Archivados
              <span className="ml-1.5 tabular-nums text-muted-foreground">
                {archivedTrips.length}
              </span>
            </button>
          </div>

          <div
            className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5"
            role="group"
            aria-label="Modo de vista"
          >
            <button
              type="button"
              onClick={() => setView("grid")}
              aria-pressed={viewMode === "grid"}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                viewMode === "grid"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-label="Vista en cuadrícula"
              title="Cuadrícula"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              aria-pressed={viewMode === "list"}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                viewMode === "list"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-label="Vista en lista"
              title="Lista"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center rounded-xl border border-dashed border-border px-6 py-14">
            <Spinner className="size-5 text-muted-foreground" />
          </div>
        ) : visibleTrips.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
            <p className="text-sm font-medium text-foreground">
              {filter === "active" ? "No hay viajes activos" : "No hay viajes archivados"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {filter === "active"
                ? "Crea un viaje o desarchiva uno existente."
                : "Los viajes que archives aparecerán aquí."}
            </p>
            {filter === "active" ? (
              <Button type="button" className="mt-4" onClick={openNewTripDialog}>
                <Plus className="h-4 w-4" />
                Nuevo viaje
              </Button>
            ) : null}
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
            {visibleTrips.map((trip) => {
              const itemCount = tripItemCount(trip)
              return (
                <div
                  key={trip.id}
                  className={cn(
                    "group/card relative",
                    openingTrip?.id === trip.id && "z-[1]",
                  )}
                >
                  <Link
                    href={`/trips/${trip.id}`}
                    onClick={(e) => beginOpenTrip({ id: trip.id, name: trip.name }, e)}
                    aria-busy={openingTrip?.id === trip.id || undefined}
                    className={cn(
                      "block w-full overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:bg-muted/40",
                      openingTrip?.id === trip.id && "ring-2 ring-foreground/15",
                    )}
                  >
                    <div className="relative h-28 overflow-hidden bg-muted sm:h-32">
                      {trip.coverUrl ? (
                        <img
                          src={trip.coverUrl}
                          alt={countriesPlainList(trip.countries) || trip.name}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : (
                        <div className="cover-fallback flex h-full items-center justify-center">
                          <span className="text-3xl opacity-80" aria-hidden>
                            {trip.cover || "✈️"}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="text-[15px] font-semibold tracking-tight">{trip.name}</h3>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-[13px] tabular-nums text-muted-foreground">
                          {formatTripDates(trip.startDate, trip.endDate) ?? "Sin fechas"}
                        </p>
                        <TripMemberAvatars
                          members={occupantsByTrip[trip.id] ?? []}
                          size="sm"
                          className="shrink-0"
                          onOpenInvite={() => openInvite(trip)}
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {trip.numDays != null && (
                          <Badge variant="secondary" className="rounded-md text-[11px] font-medium">
                            {trip.numDays} {trip.numDays === 1 ? "día" : "días"}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="rounded-md text-[11px] font-medium">
                          {trip.sourceIds.length}{" "}
                          {trip.sourceIds.length === 1 ? "fuente" : "fuentes"}
                        </Badge>
                        <Badge variant="secondary" className="rounded-md text-[11px] font-medium">
                          {itemCount} ítems
                        </Badge>
                      </div>
                    </div>
                  </Link>
                  <div className="absolute right-2 top-2">
                    <TripActions
                      trip={trip}
                      isOwner={isOwnerOf(trip)}
                      onArchive={() => archiveTrip(trip.id)}
                      onUnarchive={() => unarchiveTrip(trip.id)}
                      onEdit={() => setEditingTripId(trip.id)}
                      onDelete={() => setDeletingTripId(trip.id)}
                      onLeave={() => setLeavingTripId(trip.id)}
                    />
                  </div>
                </div>
              )
            })}

            {filter === "active" ? (
              <button
                type="button"
                onClick={openNewTripDialog}
                className="group flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-transparent p-8 transition-colors hover:border-foreground/30 hover:bg-muted/30"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted text-foreground transition-colors group-hover:border-foreground group-hover:bg-foreground group-hover:text-background">
                  <Plus className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.5} />
                </div>
                <span className="text-center text-sm">
                  <span className="text-muted-foreground group-hover:text-foreground">
                    ¿Tienes otro viaje en mente?
                  </span>
                  <br />
                  <span className="font-medium text-foreground">Empieza a planificarlo</span>
                </span>
              </button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <ul className="divide-y divide-border">
              {visibleTrips.map((trip) => {
                const itemCount = tripItemCount(trip)
                return (
                  <li
                    key={trip.id}
                    className={cn("group/row relative", openingTrip?.id === trip.id && "z-[1]")}
                  >
                    <Link
                      href={`/trips/${trip.id}`}
                      onClick={(e) => beginOpenTrip({ id: trip.id, name: trip.name }, e)}
                      aria-busy={openingTrip?.id === trip.id || undefined}
                      className={cn(
                        "flex w-full items-center gap-3 py-3 pl-3 pr-40 text-left transition-colors hover:bg-muted/40 sm:gap-4 sm:pl-4 sm:pr-48",
                        openingTrip?.id === trip.id && "bg-muted/40",
                      )}
                    >
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted sm:h-14 sm:w-14">
                        {trip.coverUrl ? (
                          <img
                            src={trip.coverUrl}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xl" aria-hidden>
                            {trip.cover || "✈️"}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <h3 className="truncate text-sm font-semibold tracking-tight">
                            {trip.name}
                          </h3>
                          <span className="text-[12px] tabular-nums text-muted-foreground">
                            {formatTripDates(trip.startDate, trip.endDate) ?? "Sin fechas"}
                          </span>
                        </div>
                        <p className="mt-1 text-[12px] leading-snug tabular-nums text-muted-foreground">
                          {tripStatsLine(trip, itemCount)}
                        </p>
                      </div>
                    </Link>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 sm:right-3">
                      <div className="flex items-center gap-2">
                        <TripMemberAvatars
                          members={occupantsByTrip[trip.id] ?? []}
                          size="sm"
                          onOpenInvite={() => openInvite(trip)}
                        />
                        <TripActions
                          trip={trip}
                          isOwner={isOwnerOf(trip)}
                          onArchive={() => archiveTrip(trip.id)}
                          onUnarchive={() => unarchiveTrip(trip.id)}
                          onEdit={() => setEditingTripId(trip.id)}
                          onDelete={() => setDeletingTripId(trip.id)}
                          onLeave={() => setLeavingTripId(trip.id)}
                        />
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
            {filter === "active" ? (
              <button
                type="button"
                onClick={openNewTripDialog}
                className="group flex w-full items-center gap-3 border-t border-dashed border-border px-3 py-3 text-left text-sm transition-colors hover:bg-muted/30 sm:px-4"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed border-border text-foreground transition-colors group-hover:border-foreground/30 sm:h-14 sm:w-14">
                  <Plus className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.5} />
                </span>
                <span>
                  <span className="text-muted-foreground group-hover:text-foreground">
                    ¿Tienes otro viaje en mente?
                  </span>
                  <br />
                  <span className="font-medium text-foreground">Empieza a planificarlo</span>
                </span>
              </button>
            ) : null}
          </div>
        )}
      </div>

      {tripToInvite ? (
        <InviteTripDialog
          tripId={tripToInvite.id}
          isOwner={isOwnerOf(tripToInvite)}
          open
          onOpenChange={(open) => {
            if (!open) {
              setInviteTripId(null)
              void reloadOccupants()
            }
          }}
        />
      ) : null}

      <NewTripDialog
        open={formOpen}
        mode={editingTrip ? "edit" : "create"}
        initial={
          editingTrip
            ? {
                name: editingTrip.name,
                startDate: editingTrip.startDate,
                endDate: editingTrip.endDate,
                numDays: editingTrip.numDays,
                expectations: editingTrip.expectations ?? null,
                origin: editingTrip.origin ?? null,
                numTravelers: editingTrip.numTravelers ?? null,
                currency: editingTrip.currency || "EUR",
              }
            : null
        }
        itineraryDayCount={editingTrip?.days.length}
        onOpenChange={(open) => {
          if (!open) {
            setDialogOpen(false)
            setEditingTripId(null)
          }
        }}
        onSubmit={(data: NewTripData) => {
          if (editingTrip) {
            const result = updateTrip(editingTrip.id, {
              name: data.name,
              startDate: data.startDate,
              endDate: data.endDate,
              numDays: data.numDays,
              expectations: data.expectations,
              origin: data.origin,
              numTravelers: data.numTravelers,
              currency: data.currency,
            })
            if (!result.ok) return { error: result.error }
            setEditingTripId(null)
            return
          }
          const trip = createTrip(data)
          setDialogOpen(false)
          beginOpenTrip({ id: trip.id, name: trip.name })
          router.push(`/trips/${trip.id}`)
        }}
      />

      <Dialog open={!!leavingTripId} onOpenChange={(open) => !open && setLeavingTripId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Salir del viaje</DialogTitle>
            <DialogDescription>
              ¿Seguro que quieres salir de <strong>{tripToLeave?.name}</strong>? Dejarás de ver
              el plan. Tus conversaciones con el asistente se quedan en tu cuenta.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLeavingTripId(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (leavingTripId) void leaveTrip(leavingTripId)
                setLeavingTripId(null)
              }}
            >
              Salir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingTripId} onOpenChange={(open) => !open && setDeletingTripId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar viaje</DialogTitle>
            <DialogDescription>
              ¿Seguro que quieres eliminar <strong>{tripToDelete?.name}</strong>? Se perderán todas
              las fuentes e ítems del itinerario. Si solo quieres ocultarlo, archívalo en su lugar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeletingTripId(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deletingTripId) deleteTrip(deletingTripId)
                setDeletingTripId(null)
              }}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
