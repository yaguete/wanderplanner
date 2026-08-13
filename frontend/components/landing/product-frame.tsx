import { ITEM_DOT_COLORS } from "@/lib/item-styles"
import { cn } from "@/lib/utils"

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

export function ProductFrame() {
  return (
    <div
      aria-hidden
      className="pointer-events-none relative isolate mx-auto mt-16 w-full max-w-6xl select-none px-4 sm:mt-20 sm:px-6"
    >
      {/* Glow con las 4 tintas de ítem, difuso pero visible, detrás del marco. */}
      <div
        className="absolute inset-x-6 -top-12 bottom-8 -z-10 rounded-[3rem] blur-2xl"
        style={{
          background:
            "radial-gradient(42% 55% at 16% 12%, hsl(199 89% 48% / 0.28), transparent 68%)," +
            "radial-gradient(42% 55% at 84% 10%, hsl(262 83% 58% / 0.26), transparent 68%)," +
            "radial-gradient(48% 50% at 68% 90%, hsl(21 90% 48% / 0.20), transparent 70%)," +
            "radial-gradient(45% 50% at 30% 92%, hsl(152 69% 31% / 0.20), transparent 70%)",
        }}
      />

      <div className="overflow-hidden rounded-xl border border-border bg-canvas shadow-[0_1px_2px_rgb(0_0_0/0.05),0_24px_64px_-16px_rgb(0_0_0/0.22)]">
        {/* Firma de color: las 4 tintas de tipo de ítem, en hilo fino. */}
        <div
          className="h-[3px]"
          style={{
            background:
              "linear-gradient(90deg, #0284c7 0%, #7c3aed 34%, #ea580c 67%, #059669 100%)",
          }}
        />
        <div className="flex items-center gap-3 border-b border-border bg-background px-4 py-2.5">
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

        <div className="flex gap-2 p-2 sm:gap-2.5 sm:p-2.5">
          <div className="hidden h-[380px] min-w-0 flex-1 flex-col gap-2 overflow-hidden rounded-lg bg-background p-3 lg:flex">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Fuentes
            </p>
            <div className="rounded-lg border border-border bg-muted px-3 py-2">
              <p className="text-[13px] font-medium">Vietnam en 12 días: la ruta completa</p>
              <p className="text-[11px] text-muted-foreground">vía @unblogdeviajes · 34 lugares</p>
            </div>
            <LandingItemRow
              dot={ITEM_DOT_COLORS.activity}
              name="Crucero por la bahía de Ha Long"
              meta="Actividad · Día 4"
            />
            <LandingItemRow
              dot={ITEM_DOT_COLORS.food}
              name="Bún chả en el casco viejo"
              meta="Restaurante · Hanói"
            />
            <LandingItemRow
              dot={ITEM_DOT_COLORS.stay}
              name="Homestay entre arrozales"
              meta="Alojamiento · Sa Pa"
            />
            <div className="rounded-lg border border-dashed border-border px-3 py-2 text-center text-[11px] text-muted-foreground">
              + 31 lugares más del artículo
            </div>
            <div className="mt-auto rounded-md border border-border px-3 py-2 text-[12px] text-muted-foreground">
              Pega la URL de otro artículo…
            </div>
          </div>

          <div className="h-[380px] min-w-0 flex-1 overflow-hidden rounded-lg bg-background p-3">
            {/* El día 2 se corta a propósito: el degradado lo convierte en «sigue». */}
            <div className="flex h-full flex-col gap-2 [mask-image:linear-gradient(to_bottom,#000_84%,transparent_100%)]">
            <div>
              <p className="text-sm font-semibold tracking-tight">Vietnam en 12 días</p>
              <p className="text-[11px] text-muted-foreground">14 – 25 marzo · 2 viajeros</p>
            </div>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Día 1 · Hanói
            </p>
            <LandingItemRow
              dot={ITEM_DOT_COLORS.activity}
              name="Casco viejo y lago Hoan Kiem"
            />
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
            <LandingItemRow
              dot={ITEM_DOT_COLORS.activity}
              name="Crucero y cueva Sung Sot"
            />
            </div>
          </div>

          <div className="hidden h-[380px] min-w-0 flex-1 flex-col gap-2 overflow-hidden rounded-lg bg-background p-3 lg:flex">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Asistente
            </p>
            <div className="ml-auto max-w-[85%] rounded-2xl bg-muted px-3 py-2 text-[13px]">
              Solo tenemos 10 días, ¿qué quitarías?
            </div>
            <p className="max-w-[95%] text-[13px] leading-5 text-foreground">
              Quitaría Ninh Binh y le daría ese día a Hoi An: el trayecto os come una mañana
              entera. Muevo el crucero al día 3 y os libero el 9 y el 10.
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
        </div>
      </div>
    </div>
  )
}
