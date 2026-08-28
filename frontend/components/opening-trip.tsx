"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { usePathname } from "next/navigation"
import { BrandMark } from "@/components/brand-mark"
import { shouldBeginOpenTrip } from "@/lib/trip-open-guard"

export type OpeningTrip = { id: string; name: string }

type ClickModifiers = {
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  button?: number
}

type OpeningTripContextValue = {
  openingTrip: OpeningTrip | null
  beginOpenTrip: (trip: OpeningTrip, event?: ClickModifiers) => void
  clearOpeningTrip: () => void
}

const OpeningTripContext = createContext<OpeningTripContextValue | null>(null)

export function OpeningTripProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [openingTrip, setOpeningTrip] = useState<OpeningTrip | null>(null)
  const seenTargetRef = useRef(false)

  const clearOpeningTrip = useCallback(() => {
    seenTargetRef.current = false
    setOpeningTrip(null)
  }, [])

  const beginOpenTrip = useCallback(
    (trip: OpeningTrip, event?: ClickModifiers) => {
      if (!shouldBeginOpenTrip(event)) return
      if (pathname === `/trips/${trip.id}`) return
      seenTargetRef.current = false
      setOpeningTrip(trip)
    },
    [pathname],
  )

  useEffect(() => {
    if (!openingTrip) {
      seenTargetRef.current = false
      return
    }
    if (pathname === `/trips/${openingTrip.id}`) {
      seenTargetRef.current = true
      return
    }
    if (seenTargetRef.current) clearOpeningTrip()
  }, [pathname, openingTrip, clearOpeningTrip])

  useEffect(() => {
    const onPop = () => clearOpeningTrip()
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [clearOpeningTrip])

  useEffect(() => {
    if (!openingTrip) return
    const id = window.setTimeout(clearOpeningTrip, 15_000)
    return () => window.clearTimeout(id)
  }, [openingTrip, clearOpeningTrip])

  const value = useMemo(
    () => ({ openingTrip, beginOpenTrip, clearOpeningTrip }),
    [openingTrip, beginOpenTrip, clearOpeningTrip],
  )

  return (
    <OpeningTripContext.Provider value={value}>{children}</OpeningTripContext.Provider>
  )
}

export function useOpeningTrip() {
  const ctx = useContext(OpeningTripContext)
  if (!ctx) {
    throw new Error("useOpeningTrip must be used within OpeningTripProvider")
  }
  return ctx
}

export function OpeningTripStatus({ name }: { name?: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <BrandMark className="h-10 wp-squirrel-hop" />
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">Abriendo el viaje</p>
        {name ? (
          <p className="mt-0.5 max-w-[16rem] truncate text-[13px] text-muted-foreground">
            {name}
          </p>
        ) : null}
      </div>
    </div>
  )
}

/** Cubre el canvas del shell hasta que el detalle del viaje pinta. Vive en el layout para sobrevivir al swap de página. */
export function OpeningTripOverlay() {
  const { openingTrip } = useOpeningTrip()
  if (!openingTrip) return null

  return (
    <div
      className="fixed inset-x-0 bottom-0 top-[var(--wp-header-height)] z-20 flex cursor-progress items-center justify-center bg-canvas/70 animate-in fade-in-0 duration-200 md:absolute md:inset-0"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="rounded-2xl border border-border bg-background px-8 py-6 shadow-md animate-in fade-in-0 zoom-in-95 duration-200">
        <OpeningTripStatus name={openingTrip.name} />
      </div>
    </div>
  )
}
