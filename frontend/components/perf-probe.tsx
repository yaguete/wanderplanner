"use client"

/**
 * Sonda de rendimiento temporal. Encendida sola en `next dev`; en el build de
 * producción hace falta `?perf=1`.
 *
 * Mide cada click en un botón con dos relojes distintos:
 *
 * - `evento`: Event Timing API — desde que el navegador registra el click hasta
 *   que pinta el resultado. Incluye el input delay (main thread ocupado) y la
 *   presentación. Es lo que de verdad se siente, y es la métrica de INP.
 * - `react`: desde el handler hasta el segundo rAF. Solo el trabajo de React.
 *
 * Si `evento` es mucho mayor que `react`, el problema no es renderizar: es que
 * el hilo principal ya estaba ocupado, o que pintar el resultado cuesta.
 *
 * Borrar cuando se cierre la investigación de agilidad de las cards.
 */

import { Profiler, useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

function readEnabled(): boolean {
  if (process.env.NODE_ENV === "development") return true
  if (typeof window === "undefined") return false
  return new URLSearchParams(window.location.search).get("perf") === "1"
}

type Sample = {
  id: number
  label: string
  /** pointerdown → click: cuánto has tenido el botón pulsado (no es culpa de la app). */
  hold: number
  /** Handler de React → segundo rAF. */
  react: number
  /** Event Timing: duración total percibida. */
  event?: number
  /** Event Timing: cuánto esperó el evento a que el hilo principal se liberase. */
  inputDelay?: number
  longest: number
  panels: [string, number][]
}

const store = {
  windowStart: 0,
  lastPointerDown: 0,
  seq: 0,
  panels: new Map<string, number>(),
  longest: 0,
  samples: [] as Sample[],
  listeners: new Set<() => void>(),
  emit() {
    for (const l of this.listeners) l()
  },
}

/** Envuelve un panel para atribuirle su tiempo de render (no pinta DOM). */
export function PerfPanel({ id, children }: { id: string; children: ReactNode }) {
  const [enabled] = useState(readEnabled)
  if (!enabled) return <>{children}</>
  return (
    <Profiler
      id={id}
      onRender={(_id, _phase, actualDuration) => {
        if (store.windowStart === 0) return
        store.panels.set(id, (store.panels.get(id) ?? 0) + actualDuration)
      }}
    >
      {children}
    </Profiler>
  )
}

export function PerfProbe() {
  const [enabled, setEnabled] = useState(false)
  const [, force] = useState(0)

  useEffect(() => setEnabled(readEnabled()), [])

  useEffect(() => {
    if (!enabled) return

    const rerender = () => force((n) => n + 1)
    store.listeners.add(rerender)

    const observers: PerformanceObserver[] = []

    try {
      const longTasks = new PerformanceObserver((list) => {
        if (store.windowStart === 0) return
        for (const entry of list.getEntries()) {
          store.longest = Math.max(store.longest, entry.duration)
        }
      })
      longTasks.observe({ entryTypes: ["longtask"] })
      observers.push(longTasks)
    } catch {
      /* sin long tasks: el resto sigue valiendo */
    }

    try {
      const events = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name !== "click") continue
          const timing = entry as PerformanceEventTiming
          // A la muestra más reciente que aún no tenga dato de evento.
          const target = store.samples.find((s) => s.event === undefined)
          if (!target) continue
          target.event = timing.duration
          target.inputDelay = timing.processingStart - timing.startTime
          store.emit()
        }
      })
      // `durationThreshold` es de Event Timing; lib.dom no lo declara todavía.
      const init: PerformanceObserverInit & { durationThreshold: number } = {
        type: "event",
        buffered: true,
        durationThreshold: 16,
      }
      events.observe(init)
      observers.push(events)
    } catch {
      /* Event Timing no soportado: queda el reloj de React */
    }

    const onPointerDown = () => {
      store.lastPointerDown = performance.now()
    }

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const button = target?.closest("button")
      if (!button) return

      const label =
        button.getAttribute("aria-label") ?? button.textContent?.trim().slice(0, 28) ?? "botón"

      const t0 = performance.now()
      store.windowStart = t0
      store.panels.clear()
      store.longest = 0
      const id = ++store.seq

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          store.windowStart = 0
          store.samples = [
            {
              id,
              label,
              hold: store.lastPointerDown > 0 ? t0 - store.lastPointerDown : 0,
              react: performance.now() - t0,
              longest: store.longest,
              panels: [...store.panels.entries()].sort((a, b) => b[1] - a[1]),
            },
            ...store.samples,
          ].slice(0, 6)
          store.emit()
        })
      })
    }

    // Captura: se ejecuta antes que el handler de React (montado en el root).
    document.addEventListener("pointerdown", onPointerDown, true)
    document.addEventListener("click", onClick, true)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true)
      document.removeEventListener("click", onClick, true)
      for (const o of observers) o.disconnect()
      store.listeners.delete(rerender)
    }
  }, [enabled])

  if (!enabled || typeof document === "undefined") return null

  // Portal a <body>: inmune a `overflow`/`contain` de los paneles.
  return createPortal(
    <div className="pointer-events-none fixed bottom-3 right-3 z-[9999] max-w-[24rem] rounded-lg bg-black/85 px-3 py-2 font-mono text-[11px] leading-relaxed text-white shadow-lg">
      <div className="mb-1 font-semibold text-emerald-300">perf · latencia por click</div>
      {store.samples.length === 0 ? (
        <div className="text-white/60">pulsa una flecha…</div>
      ) : (
        store.samples.map((s) => (
          <div key={s.id} className="mb-1">
            <span className="text-amber-300">
              {s.event !== undefined ? `${s.event.toFixed(0)} ms` : `${s.react.toFixed(0)} ms*`}
            </span>{" "}
            <span className="text-white/70">{s.label}</span>
            <div className="pl-3 text-white/55">
              react {s.react.toFixed(0)}
              {s.inputDelay !== undefined ? ` · espera ${s.inputDelay.toFixed(0)}` : ""}
              {s.longest > 0 ? ` · task ${s.longest.toFixed(0)}` : ""}
              {s.hold > 0 ? ` · pulsado ${s.hold.toFixed(0)}` : ""}
            </div>
            {s.panels.length > 0 ? (
              <div className="pl-3 text-white/40">
                {s.panels.map(([id, ms]) => `${id} ${ms.toFixed(0)}`).join(" · ")}
              </div>
            ) : null}
          </div>
        ))
      )}
    </div>,
    document.body,
  )
}
