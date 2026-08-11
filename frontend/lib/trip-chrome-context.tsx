"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

export type TripDesktopPanel = "sources" | "plan" | "assistant"

export type TripPanelState = {
  sources: boolean
  plan: boolean
  assistant: boolean
}

/** Chrome del detalle desktop: solo toggles de panel (el título vive en el panel Viaje). */
export type TripChrome = {
  panels: TripPanelState
  onTogglePanel: (panel: TripDesktopPanel) => void
}

type TripChromeContextValue = {
  chrome: TripChrome | null
  setChrome: (chrome: TripChrome | null) => void
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void
  /** Colapso forzado por viewport estrecho (3 paneles); no se persiste. */
  autoCollapsed: boolean
  setAutoCollapsed: (collapsed: boolean) => void
  /** True tras leer `wp-sidebar-collapsed` (evita flash del ancho de marca/sidebar). */
  chromeHydrated: boolean
}

const SIDEBAR_KEY = "wp-sidebar-collapsed"

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "1"
  } catch {
    return false
  }
}

const TripChromeContext = createContext<TripChromeContextValue | null>(null)

export function TripChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChrome] = useState<TripChrome | null>(null)
  // false en SSR y primer paint; localStorage tras montar (evita hydration mismatch).
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(false)
  const [chromeHydrated, setChromeHydrated] = useState(false)
  const [autoCollapsed, setAutoCollapsed] = useState(false)

  useEffect(() => {
    setSidebarCollapsedState(readSidebarCollapsed())
    setChromeHydrated(true)
  }, [])

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsedState(collapsed)
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0")
    } catch {
      /* ignore */
    }
  }, [])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsedState((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0")
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const value = useMemo(
    () => ({
      chrome,
      setChrome,
      sidebarCollapsed,
      setSidebarCollapsed,
      toggleSidebar,
      autoCollapsed,
      setAutoCollapsed,
      chromeHydrated,
    }),
    [
      chrome,
      sidebarCollapsed,
      setSidebarCollapsed,
      toggleSidebar,
      autoCollapsed,
      chromeHydrated,
    ],
  )

  return (
    <TripChromeContext.Provider value={value}>{children}</TripChromeContext.Provider>
  )
}

export function useTripChrome() {
  const ctx = useContext(TripChromeContext)
  if (!ctx) {
    throw new Error("useTripChrome must be used within TripChromeProvider")
  }
  return ctx
}

/** Efectivo: preferencia del usuario O auto-colapso por viewport. */
export function useSidebarRail(): boolean {
  const { sidebarCollapsed, autoCollapsed } = useTripChrome()
  return sidebarCollapsed || autoCollapsed
}
