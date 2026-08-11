"use client"

/**
 * Sección «Trámites del destino»: sugerencias lazy de GET /country-tasks.
 * Presentacional respecto a mutaciones (callbacks); el fetch vive aquí porque
 * es un extra no bloqueante de la pestaña Básicos.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  effectiveCountryCodesForTasks,
  fetchCountryTasks,
  filterVisibleSuggestions,
  hasDismissedActiveCountryTasks,
  invalidateCountryTasksCache,
  suggestionToExtraTaskInput,
  type CountryTaskSuggestion,
  type CountryTasksResult,
} from "@/lib/country-tasks"
import type { Source, Trip, TripTaskCategory, TripTaskState } from "@/types/itinerary"

export type CountryTasksSectionProps = {
  trip: Trip
  sources: Source[]
  onAccept: (data: {
    id: string
    title: string
    category: TripTaskCategory
    state?: Partial<TripTaskState>
  }) => void
  onDismiss: (taskId: string) => void
  onReevaluate: (activeCountryCodes: string[]) => void
}

export function CountryTasksSection({
  trip,
  sources,
  onAccept,
  onDismiss,
  onReevaluate,
}: CountryTasksSectionProps) {
  const codes = useMemo(
    () => effectiveCountryCodesForTasks(trip, sources),
    [trip, sources],
  )
  const codesKey = useMemo(() => codes.slice().sort().join(","), [codes])

  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [result, setResult] = useState<CountryTasksResult | null>(null)
  const [reevaluating, setReevaluating] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const codesRef = useRef(codes)
  codesRef.current = codes

  const load = useCallback(async (opts?: { bypassCache?: boolean }) => {
    const current = codesRef.current
    if (current.length === 0) {
      setResult({
        disclaimer:
          "Las recomendaciones del MAE están redactadas para ciudadanos españoles.",
        briefSource: "Ministerio de Asuntos Exteriores (España)",
        suggestions: [],
        sources: [],
        errors: [],
      })
      setPhase("ready")
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhase("loading")
    const data = await fetchCountryTasks(current, {
      signal: controller.signal,
      bypassCache: opts?.bypassCache,
    })
    if (controller.signal.aborted) return
    if (!data) {
      setResult(null)
      setPhase("error")
      return
    }
    setResult(data)
    setPhase("ready")
  }, [])

  useEffect(() => {
    void load()
    return () => {
      abortRef.current?.abort()
    }
  }, [codesKey, load])

  const visible = useMemo(
    () => (result ? filterVisibleSuggestions(trip, result.suggestions) : []),
    [result, trip],
  )

  const showReevaluate = hasDismissedActiveCountryTasks(trip, codes)

  const handleReevaluate = useCallback(async () => {
    if (reevaluating) return
    setReevaluating(true)
    try {
      const current = codesRef.current
      onReevaluate(current)
      invalidateCountryTasksCache(current)
      await load({ bypassCache: true })
    } finally {
      setReevaluating(false)
    }
  }, [load, onReevaluate, reevaluating])

  // Sin destinos y sin nada que mostrar: no ocupar espacio.
  if (codes.length === 0 && phase !== "loading") return null

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border/70 bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Trámites del destino
          </p>
          {result?.disclaimer ? (
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              {result.disclaimer}
            </p>
          ) : null}
          {result?.sources && result.sources.length > 0 ? (
            <ul className="mt-1.5 m-0 list-none space-y-0.5 p-0">
              {result.sources.map((src) => (
                <li key={src.countryCode} className="text-[11px] text-muted-foreground">
                  {src.url ? (
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      Fuente: MAE
                      {src.name ? ` (${src.name})` : ""}
                    </a>
                  ) : (
                    <span className="font-medium text-foreground">
                      Fuente: MAE
                      {src.name ? ` (${src.name})` : ""}
                    </span>
                  )}
                  {src.briefFetchedAt ? (
                    <span>
                      {" · "}
                      consultado {formatBriefDate(src.briefFetchedAt)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {showReevaluate ? (
          <button
            type="button"
            onClick={() => void handleReevaluate()}
            disabled={reevaluating}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1",
              "text-[11px] font-medium text-foreground transition-colors",
              "hover:bg-muted disabled:opacity-60",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
            aria-label="Reevaluar trámites del destino"
          >
            {reevaluating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            )}
            Reevaluar
          </button>
        ) : null}
      </div>

      {phase === "loading" && visible.length === 0 ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Consultando recomendaciones…
        </div>
      ) : null}

      {phase === "error" ? (
        <p className="py-1 text-xs text-muted-foreground">
          No se pudieron cargar las sugerencias de trámites. Puedes seguir
          gestionando el resto de tareas con normalidad.
        </p>
      ) : null}

      {phase === "ready" && visible.length === 0 && result && result.errors.length === 0 ? (
        <p className="py-1 text-xs text-muted-foreground">
          No hay trámites previos sugeridos para {codes.join(", ")}.
        </p>
      ) : null}

      {visible.length > 0 ? (
        <ul className="m-0 list-none divide-y divide-border/60 p-0">
          {visible.map((s) => (
            <SuggestionRow
              key={s.id}
              suggestion={s}
              onAccept={() => {
                const input = suggestionToExtraTaskInput(s)
                onAccept(input)
              }}
              onDismiss={() => onDismiss(s.id)}
            />
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function formatBriefDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(d)
  } catch {
    return iso.slice(0, 10)
  }
}

function SuggestionRow({
  suggestion,
  onAccept,
  onDismiss,
}: {
  suggestion: CountryTaskSuggestion
  onAccept: () => void
  onDismiss: () => void
}) {
  return (
    <li className="flex flex-col gap-2 py-2.5 @md:flex-row @md:items-start @md:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{suggestion.title}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {suggestion.countryName}
          {suggestion.leadTimeDays != null
            ? ` · ~${suggestion.leadTimeDays} días de antelación`
            : ""}
        </p>
        {suggestion.details ? (
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            {suggestion.details}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <button
          type="button"
          onClick={onAccept}
          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
        >
          Añadir
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Descartar
        </button>
      </div>
    </li>
  )
}
