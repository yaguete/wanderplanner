import { ExternalLink, Plus, Search } from "lucide-react"
import { ITEM_DOT_COLORS } from "@/lib/item-styles"
import { LandingArticlePhoto, LandingItemRow, LandingOgThumb, MockTab } from "@/components/landing/landing-mocks"
import { MockupWell } from "@/components/landing/value-mocks"

function DiscountRow({ name, href }: { name: string; href: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange-400" />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium leading-5 text-white">{name}</p>
        <p className="flex items-center gap-1 truncate text-[11px] leading-4 text-white/55">
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
    <MockupWell className="w-full" tone="negative">
      <div className="pointer-events-none flex h-full select-none flex-col p-3 sm:p-4">
        <div>
          <p className="text-sm font-semibold tracking-tight text-white">Vietnam en 12 días</p>
          <p className="text-[11px] text-white/55">14 – 25 marzo · 2 viajeros</p>
        </div>
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
            Día 1 · Hanói
          </p>
          <LandingItemRow
            tone="negative"
            dot={ITEM_DOT_COLORS.activity}
            name="Casco viejo y lago Hoan Kiem"
            meta="vía @unblogdeviajes"
          />
          <LandingItemRow
            tone="negative"
            dot={ITEM_DOT_COLORS.food}
            name="Bún chả en el casco viejo"
            meta="vía @unblogdeviajes"
          />
          <LandingItemRow
            tone="negative"
            dot={ITEM_DOT_COLORS.stay}
            name="Hotel junto al lago"
            meta="vía @unblogdeviajes"
          />
          <div className="mt-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
              Fuente
            </p>
            <p className="mt-1 truncate text-[13px] font-medium text-white">
              Vietnam en 12 días: la ruta completa
            </p>
            <p className="truncate text-[11px] text-white/55">
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
    <MockupWell className="w-full" tone="negative">
      <div className="pointer-events-none flex h-full select-none flex-col p-3 sm:p-4">
        <div>
          <p className="text-sm font-semibold tracking-tight text-white">@unblogdeviajes</p>
          <p className="truncate text-[11px] text-white/55">
            unblogdeviajes.com/vietnam-en-12-dias
          </p>
        </div>
        <div className="mt-3 flex items-end gap-3 overflow-hidden">
          <MockTab tone="negative" label="Crónica" />
          <MockTab tone="negative" label="Ruta" />
          <MockTab tone="negative" label="Desplazamientos" />
          <MockTab tone="negative" label="Descuentos" active />
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
          <DiscountRow name="Crucero Ha Long" href="unblogdeviajes.com/vietnam-en-12-dias" />
        </div>
      </div>
    </MockupWell>
  )
}

/** Crónica de la fuente: el artículo sigue a la vista. Equivalente negativo del panel Fuentes. */
export function MockLectorVuelve() {
  return (
    <MockupWell className="w-full" tone="negative">
      <div className="pointer-events-none flex h-full select-none flex-col">
        <div className="flex shrink-0 items-center gap-1.5 px-3 pt-3">
          <span className="inline-flex min-h-7 items-center rounded-full bg-white px-2.5 text-xs font-medium leading-none text-[hsl(20_8%_14%)]">
            @unblogdeviajes
          </span>
          <span className="inline-flex size-7 items-center justify-center rounded-full border border-white/15 text-white">
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
        </div>

        <div className="mt-3 flex shrink-0 items-start gap-3 px-3">
          <LandingOgThumb className="h-14 w-20 shrink-0 rounded-lg ring-1 ring-white/10" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-white">
              Vietnam en 12 días: la ruta completa
            </p>
            <p className="truncate text-xs text-white/55">unblogdeviajes.com/vietnam-en-12-dias</p>
          </div>
        </div>

        <div className="mt-3 flex shrink-0 items-end gap-3 overflow-hidden px-3">
          <MockTab tone="negative" label="Crónica" active />
          <MockTab tone="negative" label="Ruta" />
          <MockTab tone="negative" label="Desplazamientos" />
          <MockTab tone="negative" label="Descuentos" />
        </div>

        <div className="shrink-0 px-3 pb-2 pt-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/45" />
            <div className="flex h-9 items-center rounded-md border border-white/10 bg-white/[0.04] pl-8 pr-3 text-[13px] text-white/45">
              Buscar actividad, lugar o restaurante
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-3 [mask-image:linear-gradient(to_bottom,#000_78%,transparent_100%)]">
          <p className="text-[13px] leading-5 text-white/80">
            Si es tu primera vez en Vietnam, esta{" "}
            <span className="font-semibold text-white">ruta de 12 días</span> es el{" "}
            <span className="font-semibold text-white">itinerario perfecto</span>: Hanói, la bahía
            de Ha Long, Sa Pa y el descenso hacia Hoi An. Sin prisas, con los platos que merecen
            cola y un homestay entre arrozales.
          </p>
          <LandingArticlePhoto className="mt-3 h-28 w-full rounded-xl ring-1 ring-white/10" />
          <p className="mt-3 text-[13px] font-semibold tracking-tight text-white">Día 1 · Hanói</p>
          <p className="mt-1.5 text-[13px] leading-5 text-white/70">
            El casco viejo se recorre a pie: el lago Hoan Kiem al amanecer y un bún chả a la hora
            de comer, en cualquiera de los locales que no salen en la guía.
          </p>
        </div>
      </div>
    </MockupWell>
  )
}
