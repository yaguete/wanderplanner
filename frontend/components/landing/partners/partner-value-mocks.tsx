import { ExternalLink } from "lucide-react"
import { ITEM_DOT_COLORS } from "@/lib/item-styles"
import { LandingItemRow, MockTab } from "@/components/landing/landing-mocks"
import { MockupWell } from "@/components/landing/value-mocks"

function BrowserChrome({ url }: { url: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-border bg-background px-3 py-2">
      <div className="flex gap-1.5">
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
      </div>
      <div className="mx-auto flex h-5 w-full max-w-[14rem] items-center justify-center overflow-hidden rounded-md bg-muted px-2">
        <span className="truncate text-[10px] font-medium text-foreground/70">{url}</span>
      </div>
    </div>
  )
}

function DiscountRow({ name, href }: { name: string; href: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border bg-background px-3 py-2">
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange-600" />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium leading-5 text-foreground">{name}</p>
        <p className="flex items-center gap-1 truncate text-[11px] leading-4 text-muted-foreground">
          <span className="truncate">{href}</span>
          <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
        </p>
      </div>
    </div>
  )
}

/** Columna Mi viaje: cada ítem lleva la firma del blog. */
export function MockAtribucion() {
  return (
    <MockupWell className="w-full">
      <div className="pointer-events-none flex h-full select-none flex-col bg-background p-3 text-foreground sm:p-4">
        <div>
          <p className="text-sm font-semibold tracking-tight">Vietnam en 12 días</p>
          <p className="text-[11px] text-muted-foreground">14 – 25 marzo · 2 viajeros</p>
        </div>
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Día 1 · Hanói
          </p>
          <LandingItemRow
            dot={ITEM_DOT_COLORS.activity}
            name="Casco viejo y lago Hoan Kiem"
            meta="vía @unblogdeviajes"
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
          <div className="mt-1 rounded-lg border border-border bg-canvas px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Fuente
            </p>
            <p className="mt-1 truncate text-[13px] font-medium text-foreground">
              Vietnam en 12 días: la ruta completa
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              unblogdeviajes.com/vietnam-en-12-dias
            </p>
          </div>
        </div>
      </div>
    </MockupWell>
  )
}

/** Pestaña Descuentos: el href del artículo se conserva. */
export function MockAfiliacion() {
  return (
    <MockupWell className="w-full">
      <div className="pointer-events-none flex h-full select-none flex-col bg-background p-3 text-foreground sm:p-4">
        <div>
          <p className="text-sm font-semibold tracking-tight">@unblogdeviajes</p>
          <p className="truncate text-[11px] text-muted-foreground">
            unblogdeviajes.com/vietnam-en-12-dias
          </p>
        </div>
        <div className="mt-3 flex items-end gap-3 overflow-hidden">
          <MockTab label="Crónica" />
          <MockTab label="Ruta" />
          <MockTab label="Desplazamientos" />
          <MockTab label="Descuentos" active />
        </div>
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2">
          <DiscountRow
            name="eSIM Vietnam · 10 días"
            href="unblogdeviajes.com/vietnam-en-12-dias"
          />
          <DiscountRow
            name="Seguro IATI 5% dto."
            href="unblogdeviajes.com/vietnam-en-12-dias"
          />
          <DiscountRow
            name="Crucero Ha Long"
            href="unblogdeviajes.com/vietnam-en-12-dias"
          />
        </div>
      </div>
    </MockupWell>
  )
}

/** El post sigue detrás; WanderPlanner se abre en pestaña nueva. */
export function MockLectorVuelve() {
  return (
    <MockupWell className="w-full">
      <div className="relative h-full overflow-hidden bg-canvas p-4 text-foreground">
        <div className="pointer-events-none absolute inset-x-5 top-5 overflow-hidden rounded-lg border border-border bg-background shadow-sm">
          <BrowserChrome url="unblogdeviajes.com/vietnam-en-12-dias" />
          <div className="p-3">
            <p className="text-[11px] font-medium text-muted-foreground">@unblogdeviajes</p>
            <p className="mt-1 text-[13px] font-semibold tracking-tight">Vietnam en 12 días</p>
            <div className="mt-3 flex flex-col gap-1.5">
              <div className="h-1.5 w-full rounded-full bg-neutral-200" />
              <div className="h-1.5 w-5/6 rounded-full bg-neutral-200" />
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-8 bottom-4 top-[7.5rem] overflow-hidden rounded-lg border border-border bg-background shadow-[0_16px_40px_-12px_rgb(0_0_0/0.35)]">
          <BrowserChrome url="wanderplanner.ai/trips/vietnam-en-12-dias" />
          <div className="flex h-full flex-col gap-2 p-3">
            <p className="text-sm font-semibold tracking-tight">Vietnam en 12 días</p>
            <p className="text-[11px] text-muted-foreground">vía @unblogdeviajes</p>
            <LandingItemRow
              dot={ITEM_DOT_COLORS.food}
              name="Bún chả en el casco viejo"
              meta="vía @unblogdeviajes"
            />
            <LandingItemRow
              dot={ITEM_DOT_COLORS.activity}
              name="Crucero por la bahía de Ha Long"
              meta="vía @unblogdeviajes"
            />
          </div>
        </div>
      </div>
    </MockupWell>
  )
}
