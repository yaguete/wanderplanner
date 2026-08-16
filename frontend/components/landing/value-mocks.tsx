import type { ReactNode } from "react"
import { ITEM_DOT_COLORS } from "@/lib/item-styles"
import { cn } from "@/lib/utils"
import { LandingItemRow, LandingStreetPhoto, MockTab } from "./landing-mocks"

const ITEM_GLOW =
  "radial-gradient(42% 55% at 16% 12%, hsl(199 89% 48% / 0.28), transparent 68%)," +
  "radial-gradient(42% 55% at 84% 10%, hsl(262 83% 58% / 0.26), transparent 68%)," +
  "radial-gradient(48% 50% at 68% 90%, hsl(21 90% 48% / 0.20), transparent 70%)," +
  "radial-gradient(45% 50% at 30% 92%, hsl(152 69% 31% / 0.20), transparent 70%)"

/** Halo más contenido: marca al centro, un susurro de las tintas de ítem. */
const NEGATIVE_GLOW =
  "radial-gradient(55% 50% at 50% 0%, #9F817340, transparent 72%)," +
  "radial-gradient(38% 45% at 12% 18%, hsl(199 89% 48% / 0.16), transparent 70%)," +
  "radial-gradient(36% 42% at 88% 14%, hsl(262 83% 58% / 0.14), transparent 70%)"

export function MockupWell({
  children,
  className,
  tone = "light",
}: {
  children: ReactNode
  className?: string
  tone?: "light" | "negative"
}) {
  const negative = tone === "negative"
  return (
    <div className={cn("relative isolate", className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-1 -z-10 rounded-[2.5rem] blur-xl"
        style={{ background: negative ? NEGATIVE_GLOW : ITEM_GLOW }}
      />
      <div
        className={cn(
          "flex h-[34rem] flex-col overflow-hidden rounded-xl",
          negative
            ? "border-white/10 bg-[hsl(20_8%_14%)] shadow-[0_1px_2px_rgb(0_0_0/0.35),0_28px_64px_-18px_rgb(0_0_0/0.55)]"
            : "border-border bg-canvas shadow-[0_1px_2px_rgb(0_0_0/0.05),0_24px_64px_-16px_rgb(0_0_0/0.18)]",
        )}
      >
        {children}
      </div>
    </div>
  )
}

/** Subrayado de tinta del tipo: no es un <mark>, no es color de texto. */
function InkMark({ tone, children }: { tone: "food" | "activity"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "font-semibold",
        tone === "food" && "shadow-[inset_0_-0.35em_0_hsl(160_84%_39%/0.16)]",
        tone === "activity" && "shadow-[inset_0_-0.35em_0_hsl(263_70%_50%/0.16)]",
      )}
    >
      {children}
    </span>
  )
}

/** Frase del artículo → ítem extraído, apilados para caber en columna. */
function ExtractRow({
  day,
  text,
  item,
}: {
  day: string
  text: ReactNode
  item: ReactNode
}) {
  return (
    <div className="mt-3">
      <p className="text-[13px] font-semibold tracking-tight text-foreground">{day}</p>
      <p className="mt-1.5 text-[13px] leading-5 text-foreground">{text}</p>
      <div className="mt-2 min-w-0">{item}</div>
    </div>
  )
}

/** Diagrama: el artículo se convierte en ítems. Conectores solo en lg. */
export function MockFuentes() {
  return (
    <MockupWell className="w-full">
      <div className="pointer-events-none flex h-full select-none flex-col p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-md border border-border bg-background px-3 py-1.5 text-[12px] text-muted-foreground">
            unblogdeviajes.com/vietnam-en-12-dias
          </div>
          <div className="flex w-fit items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-600" />
            Extrayendo la ruta…
          </div>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-background p-3 sm:p-4">
          <p className="text-[13px] leading-5 text-foreground">
            Si es tu primera vez en Vietnam, esta ruta de 12 días es el itinerario: Hanói, la bahía,
            Sa Pa y el descenso hacia Hoi An.
          </p>
          <LandingStreetPhoto className="mt-3 h-24 w-full rounded-lg sm:h-28" />

          <ExtractRow
            day="Día 1 · Hanói"
            text={
              <>
                El casco viejo se recorre a pie: el lago Hoan Kiem al amanecer y un{" "}
                <InkMark tone="food">bún chả</InkMark> a la hora de comer, en un local que no sale
                en la guía.
              </>
            }
            item={
              <LandingItemRow
                dot={ITEM_DOT_COLORS.food}
                name="Bún chả en el casco viejo"
                meta="vía @unblogdeviajes"
              />
            }
          />
          <ExtractRow
            day="Día 2 · Ha Long"
            text={
              <>
                Por la mañana, crucero por la <InkMark tone="activity">bahía de Ha Long</InkMark> y
                la cueva Sung Sot.
              </>
            }
            item={
              <LandingItemRow
                dot={ITEM_DOT_COLORS.activity}
                name="Crucero por la bahía de Ha Long"
                meta="vía @unblogdeviajes"
              />
            }
          />
        </div>
      </div>
    </MockupWell>
  )
}

function TaskCostRow({ label, cost }: { label: string; cost: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-[13px]">
      <span className="min-w-0 truncate text-foreground">{label}</span>
      <span className="shrink-0 tabular-nums text-muted-foreground">{cost}</span>
    </div>
  )
}

/** Panel Mi viaje: pestañas reales, timeline de tipos y tira de coste. */
export function MockAgencia() {
  return (
    <MockupWell className="w-full">
      <div className="pointer-events-none flex h-full select-none flex-col bg-background p-3 sm:p-4">
        <div>
          <p className="text-sm font-semibold tracking-tight">Vietnam en 12 días</p>
          <p className="text-[11px] text-muted-foreground">14 – 25 marzo · 2 viajeros</p>
        </div>
        <div className="mt-3 flex items-end gap-3 overflow-hidden">
          <MockTab label="Ruta" active />
          <MockTab label="Actividades" />
          <MockTab label="Alojamientos" />
          <MockTab label="Transporte" />
          <MockTab label="Básicos" />
        </div>
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2 [mask-image:linear-gradient(to_bottom,#000_78%,transparent_100%)]">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Día 1 · Hanói
          </p>
          <LandingItemRow dot={ITEM_DOT_COLORS.activity} name="Casco viejo y lago Hoan Kiem" />
          <LandingItemRow
            dot={ITEM_DOT_COLORS.food}
            name="Bún chả en el casco viejo"
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
            dot={ITEM_DOT_COLORS.stay}
            name="Hotel junto al muelle"
            meta="vía @unblogdeviajes"
          />
        </div>
        <div className="mt-3 border-t border-border pt-2">
          <TaskCostRow label="Comprar los vuelos" cost="620 €" />
          <TaskCostRow label="Reservar hotel en Hanói · 3 noches" cost="180 €" />
          <TaskCostRow label="e-visa" cost="25 €" />
          <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-border pt-2 text-[13px]">
            <span className="font-semibold text-foreground">Total estimado · 2 viajeros</span>
            <span className="shrink-0 font-semibold tabular-nums">1.240 €</span>
          </div>
        </div>
      </div>
    </MockupWell>
  )
}

function CheckRow({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-2 text-[13px] text-foreground">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border bg-background text-[10px] text-muted-foreground">
        ✓
      </span>
      {label}
    </li>
  )
}

/** Conversación: visado y abrigo citados en prosa + checklist Básicos. */
export function MockOficiales() {
  return (
    <MockupWell className="w-full">
      <div className="pointer-events-none flex h-full select-none flex-col gap-3 p-3 sm:p-4">
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden rounded-lg bg-background px-4 pb-4 pt-5 [mask-image:linear-gradient(to_bottom,#000_88%,transparent_100%)]">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Asistente
          </p>
          <div className="ml-auto max-w-[90%] rounded-2xl bg-muted px-3 py-2 text-[13px]">
            ¿Necesito visado para Vietnam?
          </div>
          <p className="max-w-[95%] text-[13px] leading-5 text-foreground">
            Sí, e-visa de 90 días. Ficha del MAE, actualizada el 3 de marzo.
          </p>
          <div className="ml-auto max-w-[90%] rounded-2xl bg-muted px-3 py-2 text-[13px]">
            ¿Hay vacunas obligatorias?
          </div>
          <p className="max-w-[95%] text-[13px] leading-5 text-foreground">
            No. El MAE recomienda hepatitis A y fiebre tifoidea. Misma ficha, 3 de marzo.
          </p>
          <div className="ml-auto max-w-[90%] rounded-2xl bg-muted px-3 py-2 text-[13px]">
            ¿Llevo abrigo a Sa Pa en marzo?
          </div>
          <p className="max-w-[95%] text-[13px] leading-5 text-foreground">
            Mañanas de 11–13 °C y humedad; una capa cortavientos basta. Según Time and Date, media
            de marzo en Sa Pa.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Básicos
            </p>
            <p className="text-[11px] text-muted-foreground">Recomendaciones del MAE</p>
          </div>
          <ul className="mt-2.5 flex flex-col gap-2">
            <CheckRow label="e-visa" />
            <CheckRow label="Vacunas recomendadas" />
            <CheckRow label="Pasaporte con 6 meses" />
          </ul>
        </div>
      </div>
    </MockupWell>
  )
}
