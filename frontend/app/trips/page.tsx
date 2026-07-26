"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Archive,
  ArchiveRestore,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import { NewTripDialog, type NewTripData } from "@/components/new-trip-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import type { Trip } from "@/types/itinerary"
import { cn } from "@/lib/utils"

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

function TripActions({
  trip,
  onArchive,
  onUnarchive,
  onEdit,
  onDelete,
}: {
  trip: Trip
  onArchive: () => void
  onUnarchive: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const archived = Boolean(trip.archived)
  const btnClass = cn(
    "h-8 w-8 rounded-md bg-background/90",
    "opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover/card:opacity-100 sm:group-hover/row:opacity-100",
  )

  return (
    <div className="flex items-center gap-1">
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
    </div>
  )
}

export default function TripsHomePage() {
  const { trips, createTrip, updateTrip, deleteTrip, archiveTrip, unarchiveTrip } = useTrips()
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTripId, setEditingTripId] = useState<string | null>(null)
  const [deletingTripId, setDeletingTripId] = useState<string | null>(null)
  const [filter, setFilter] = useState<TripFilter>("active")
  const [viewMode, setViewMode] = useState<ViewMode>(readViewMode)

  const tripToDelete = deletingTripId ? trips.find((t) => t.id === deletingTripId) : null
  const editingTrip = editingTripId ? trips.find((t) => t.id === editingTripId) : null
  const formOpen = dialogOpen || !!editingTrip

  const activeTrips = useMemo(() => trips.filter((t) => !t.archived), [trips])
  const archivedTrips = useMemo(() => trips.filter((t) => t.archived), [trips])
  const visibleTrips = filter === "active" ? activeTrips : archivedTrips

  const setView = (mode: ViewMode) => {
    setViewMode(mode)
    try {
      localStorage.setItem(VIEW_KEY, mode)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-10">
        <div className="mb-6 sm:mb-8">
          <div className="max-w-xl">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Viajes
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Consolida artículos de blogueros y revistas en una sola ruta editable.
            </p>
          </div>
        </div>

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

        {visibleTrips.length === 0 ? (
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
              <Button type="button" className="mt-4" onClick={() => setDialogOpen(true)}>
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
                <div key={trip.id} className="group/card relative">
                  <button
                    type="button"
                    onClick={() => router.push(`/trips/${trip.id}`)}
                    className="w-full overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:bg-muted/40"
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
                      <p className="mt-0.5 text-[13px] tabular-nums text-muted-foreground">
                        {formatTripDates(trip.startDate, trip.endDate) ?? "Sin fechas"}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {trip.numDays != null && (
                          <Badge variant="secondary" className="rounded-md text-[11px] font-medium">
                            {trip.numDays} días
                          </Badge>
                        )}
                        <Badge variant="secondary" className="rounded-md text-[11px] font-medium">
                          {trip.sourceIds.length} fuentes
                        </Badge>
                        <Badge variant="secondary" className="rounded-md text-[11px] font-medium">
                          {itemCount} ítems
                        </Badge>
                      </div>
                    </div>
                  </button>
                  <div className="absolute right-2 top-2">
                    <TripActions
                      trip={trip}
                      onArchive={() => archiveTrip(trip.id)}
                      onUnarchive={() => unarchiveTrip(trip.id)}
                      onEdit={() => setEditingTripId(trip.id)}
                      onDelete={() => setDeletingTripId(trip.id)}
                    />
                  </div>
                </div>
              )
            })}

            {filter === "active" ? (
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className="group flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-transparent p-8 transition-colors hover:border-foreground/30 hover:bg-muted/30"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground transition-colors group-hover:border-foreground group-hover:bg-foreground group-hover:text-background">
                  <Plus className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground">
                  Nuevo viaje
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
                  <li key={trip.id} className="group/row relative">
                    <button
                      type="button"
                      onClick={() => router.push(`/trips/${trip.id}`)}
                      className="flex w-full items-center gap-3 py-3 pl-3 pr-28 text-left transition-colors hover:bg-muted/40 sm:gap-4 sm:pl-4 sm:pr-32"
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
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <h3 className="truncate text-sm font-semibold tracking-tight">
                            {trip.name}
                          </h3>
                          <span className="text-[12px] tabular-nums text-muted-foreground">
                            {formatTripDates(trip.startDate, trip.endDate) ?? "Sin fechas"}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {trip.numDays != null && (
                            <Badge variant="secondary" className="rounded-md text-[11px] font-medium">
                              {trip.numDays} días
                            </Badge>
                          )}
                          <Badge variant="secondary" className="rounded-md text-[11px] font-medium">
                            {trip.sourceIds.length} fuentes
                          </Badge>
                          <Badge variant="secondary" className="rounded-md text-[11px] font-medium">
                            {itemCount} ítems
                          </Badge>
                        </div>
                      </div>
                    </button>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 sm:right-3">
                      <TripActions
                        trip={trip}
                        onArchive={() => archiveTrip(trip.id)}
                        onUnarchive={() => unarchiveTrip(trip.id)}
                        onEdit={() => setEditingTripId(trip.id)}
                        onDelete={() => setDeletingTripId(trip.id)}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
            {filter === "active" ? (
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className="flex w-full items-center gap-3 border-t border-dashed border-border px-3 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground sm:px-4"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed border-border sm:h-14 sm:w-14">
                  <Plus className="h-4 w-4" />
                </span>
                Nuevo viaje
              </button>
            ) : null}
          </div>
        )}
      </div>

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
            })
            if (!result.ok) return { error: result.error }
            setEditingTripId(null)
            return
          }
          const trip = createTrip(data)
          setDialogOpen(false)
          router.push(`/trips/${trip.id}`)
        }}
      />

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
