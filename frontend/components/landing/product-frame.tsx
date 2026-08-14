import { Plus, Search } from "lucide-react"
import { ITEM_DOT_COLORS } from "@/lib/item-styles"
import { cn } from "@/lib/utils"
import { ProductFrameMobile } from "./product-frame-mobile"

const PANEL_H = "h-[520px]"

/** Fila de ítem del timeline: punto de color + texto. Solo decoración. */
export function LandingItemRow({
  dot,
  name,
  meta,
}: {
  dot: string
  name: string
  meta?: string
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border bg-background px-3 py-2">
      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dot)} />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium leading-5 text-foreground">{name}</p>
        {meta ? <p className="truncate text-[11px] leading-4 text-muted-foreground">{meta}</p> : null}
      </div>
    </div>
  )
}

function MockTab({ label, active }: { label: string; active?: boolean }) {
  return (
    <span
      className={cn(
        "relative inline-flex min-h-8 shrink-0 items-center pb-2 text-[11px]",
        active ? "font-semibold text-foreground" : "font-medium text-muted-foreground",
      )}
    >
      <span className="truncate">{label}</span>
      {active ? (
        <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" />
      ) : null}
    </span>
  )
}

/** Miniatura OG inventada: bahía de Ha Long, sin raster. */
function LandingOgThumb({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 56" className={className} aria-hidden>
      <rect width="80" height="56" fill="#c9dce6" />
      <rect y="34" width="80" height="22" fill="#6a9aaa" />
      <path d="M6 40 L22 12 L38 40Z" fill="#3f5c4c" />
      <path d="M28 42 L50 6 L72 42Z" fill="#334a3e" />
      <path d="M56 42 L68 20 L80 42Z" fill="#4a6756" />
    </svg>
  )
}

/** Foto de crónica inventada: terrazas de arroz, sin raster. */
function LandingArticlePhoto({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 168"
      className={className}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <rect width="320" height="168" fill="#d5e4ee" />
      <path d="M0 78 Q80 68 160 80 T320 76 L320 168 L0 168Z" fill="#8fbe6a" />
      <path d="M0 96 Q100 86 200 100 T320 94 L320 122 L0 122Z" fill="#7aa856" />
      <path d="M0 118 Q80 110 180 122 T320 116 L320 144 L0 144Z" fill="#658f44" />
      <path d="M0 140 Q120 132 220 144 T320 140 L320 168 L0 168Z" fill="#4e7334" />
      <path d="M36 78 L54 48 L72 78Z" fill="#5a7268" opacity="0.7" />
      <path d="M198 82 L228 40 L258 82Z" fill="#4d635a" opacity="0.65" />
    </svg>
  )
}

function FuentesPanel({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col overflow-hidden rounded-lg bg-background", className)}>
      <div className="flex shrink-0 items-center gap-1.5 px-3 pt-3">
        <span className="inline-flex min-h-7 items-center rounded-full bg-foreground px-2.5 text-xs font-medium leading-none text-background">
          @unblogdeviajes
        </span>
        <span className="inline-flex size-7 items-center justify-center rounded-full border border-input text-foreground">
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
      </div>

      <div className="mt-3 flex shrink-0 items-start gap-3 px-3">
        <LandingOgThumb className="h-14 w-20 shrink-0 rounded-lg border border-border" />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-foreground">
            Vietnam en 12 días: la ruta completa
          </p>
          <p className="truncate text-xs text-muted-foreground">
            unblogdeviajes.com/vietnam-en-12-dias
          </p>
        </div>
      </div>

      <div className="mt-3 flex shrink-0 items-end gap-3 overflow-hidden px-3">
        <MockTab label="Crónica" active />
        <MockTab label="Ruta" />
        <MockTab label="Desplazamientos" />
        <MockTab label="Descuentos" />
      </div>

      <div className="shrink-0 px-3 pb-2 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <div className="flex h-9 items-center rounded-md border border-input bg-background pl-8 pr-3 text-[13px] text-muted-foreground">
            Buscar actividad, lugar o restaurante
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-3 [mask-image:linear-gradient(to_bottom,#000_78%,transparent_100%)]">
        <p className="text-[13px] leading-5 text-foreground">
          Si es tu primera vez en Vietnam, esta{" "}
          <span className="font-semibold">ruta de 12 días</span> es el{" "}
          <span className="font-semibold">itinerario perfecto</span>: Hanói, la bahía de Ha Long,
          Sa Pa y el descenso hacia Hoi An. Sin prisas, con los platos que merecen cola y un
          homestay entre arrozales.
        </p>
        <LandingArticlePhoto className="mt-3 h-28 w-full rounded-xl" />
        <p className="mt-3 text-[13px] font-semibold tracking-tight text-foreground">
          Día 1 · Hanói
        </p>
        <p className="mt-1.5 text-[13px] leading-5 text-foreground">
          El casco viejo se recorre a pie: el lago Hoan Kiem al amanecer y un bún chả a la hora de
          comer, en cualquiera de los locales que no salen en la guía.
        </p>
      </div>
    </div>
  )
}

function TripPanel({ className }: { className?: string }) {
  return (
    <div className={cn("min-w-0 overflow-hidden rounded-lg bg-background p-3", className)}>
      {/* El último día se corta a propósito: el degradado lo convierte en «sigue». */}
      <div className="flex h-full flex-col gap-2 [mask-image:linear-gradient(to_bottom,#000_84%,transparent_100%)]">
        <div>
          <p className="text-sm font-semibold tracking-tight">Vietnam en 12 días</p>
          <p className="text-[11px] text-muted-foreground">14 – 25 marzo · 2 viajeros</p>
        </div>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Día 1 · Hanói
        </p>
        <LandingItemRow dot={ITEM_DOT_COLORS.activity} name="Casco viejo y lago Hoan Kiem" />
        <LandingItemRow
          dot={ITEM_DOT_COLORS.food}
          name="Bún chả en el casco viejo"
          meta="vía @unblogdeviajes"
        />
        <LandingItemRow
          dot={ITEM_DOT_COLORS.stay}
          name="Hotel junto al lago"
          meta="vía @unblogdeviajes"
        />
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Día 2 · Ha Long
        </p>
        <LandingItemRow
          dot={ITEM_DOT_COLORS.transport}
          name="Bus a la bahía de Ha Long"
          meta="3 h · vía @unblogdeviajes"
        />
        <LandingItemRow dot={ITEM_DOT_COLORS.activity} name="Crucero y cueva Sung Sot" />
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Día 3 · Sa Pa
        </p>
        <LandingItemRow
          dot={ITEM_DOT_COLORS.stay}
          name="Homestay entre arrozales"
          meta="vía @unblogdeviajes"
        />
        <LandingItemRow dot={ITEM_DOT_COLORS.activity} name="Trekking al pueblo de Cat Cat" />
      </div>
    </div>
  )
}

function AssistantPanel({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2 overflow-hidden rounded-lg bg-background p-3",
        className,
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Asistente
      </p>
      <div className="ml-auto max-w-[85%] rounded-2xl bg-muted px-3 py-2 text-[13px]">
        Solo tenemos 10 días, ¿qué quitarías?
      </div>
      <p className="max-w-[95%] text-[13px] leading-5 text-foreground">
        Quitaría Ninh Binh y le daría ese día a Hoi An: el trayecto os come una mañana entera.
        Muevo el crucero al día 3 y os libero el 9 y el 10.
      </p>
      <div className="flex w-fit items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-[11px] font-medium text-foreground">
        ✓ 2 días liberados
      </div>
      <div className="mt-auto flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
            ¿Dónde cambio dinero?
          </span>
          <span className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
            Reordena el norte
          </span>
        </div>
        <div className="flex items-center justify-between rounded-full border border-border px-3.5 py-2 text-[12px] text-muted-foreground">
          Pregunta sobre tu viaje…
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
            ↑
          </span>
        </div>
      </div>
    </div>
  )
}

export function ProductFrame() {
  return (
    <div
      aria-hidden
      className="relative isolate mx-auto mt-16 w-full max-w-6xl select-none px-4 sm:mt-20 sm:px-6"
    >
      {/* Glow con las 4 tintas de ítem, difuso pero visible, detrás del marco. */}
      <div
        className="pointer-events-none absolute inset-x-0 -top-1 -bottom-1 -z-10 rounded-[5rem] blur-xl"
        style={{
          background:
            "radial-gradient(42% 55% at 16% 12%, hsl(199 89% 48% / 0.28), transparent 68%)," +
            "radial-gradient(42% 55% at 84% 10%, hsl(262 83% 58% / 0.26), transparent 68%)," +
            "radial-gradient(48% 50% at 68% 90%, hsl(21 90% 48% / 0.20), transparent 70%)," +
            "radial-gradient(45% 50% at 30% 92%, hsl(152 69% 31% / 0.20), transparent 70%)",
        }}
      />

      <div className="overflow-hidden rounded-xl border border-border bg-canvas shadow-[0_1px_2px_rgb(0_0_0/0.05),0_24px_64px_-16px_rgb(0_0_0/0.22)]">
        <div className="pointer-events-none flex items-center gap-3 border-b border-border bg-background px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
          </div>
          <div className="mx-auto flex h-6 w-full max-w-xs items-center justify-center overflow-hidden rounded-md bg-muted px-3">
            <span className="truncate text-[11px] font-medium text-foreground/70">
              wanderplanner.ai/trips/vietnam-en-12-dias
            </span>
          </div>
          <div className="w-10 shrink-0" />
        </div>

        <div className="pointer-events-none hidden gap-2 p-2 sm:gap-2.5 sm:p-2.5 lg:flex">
          <FuentesPanel className={cn("flex-1", PANEL_H)} />
          <TripPanel className={cn("flex-1", PANEL_H)} />
          <AssistantPanel className={cn("flex-1", PANEL_H)} />
        </div>

        <ProductFrameMobile>
          <div className="p-2">
            <FuentesPanel className={PANEL_H} />
          </div>
          <div className="p-2">
            <TripPanel className={PANEL_H} />
          </div>
          <div className="p-2">
            <AssistantPanel className={PANEL_H} />
          </div>
        </ProductFrameMobile>
      </div>
    </div>
  )
}
