"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2 } from "lucide-react"
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
import { cn } from "@/lib/utils"

export default function TripsHomePage() {
  const { trips, createTrip, deleteTrip } = useTrips()
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deletingTripId, setDeletingTripId] = useState<string | null>(null)

  const tripToDelete = deletingTripId ? trips.find((t) => t.id === deletingTripId) : null

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-10">
        <div className="mb-8 flex flex-col gap-4 sm:mb-9 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Viajes
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Consolida artículos de blogueros y revistas en una sola ruta editable.
            </p>
          </div>
          <Button type="button" className="shrink-0" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Nuevo viaje
          </Button>
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {trips.map((trip) => {
            const itemCount = trip.days.reduce((sum, d) => sum + d.items.length, 0)
            return (
              <div key={trip.id} className="group/card relative">
                <button
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
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "absolute right-2 top-2 h-8 w-8 rounded-md bg-background/90",
                    "opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover/card:opacity-100",
                    "hover:bg-destructive hover:text-destructive-foreground",
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeletingTripId(trip.id)
                  }}
                  aria-label="Eliminar viaje"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )
          })}

          <button
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
        </div>
      </div>

      <NewTripDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreate={(data: NewTripData) => {
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
              las fuentes e ítems del itinerario.
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
