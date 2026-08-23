import { ArrowRight } from "lucide-react"
import { LandingItemRow, LandingOgThumb } from "@/components/landing/landing-mocks"
import { ITEM_DOT_COLORS } from "@/lib/item-styles"
import { PartnerBrowserFrame } from "./partner-browser-frame"

/**
 * Ilustración de una landing co-branded. Misma familia que BlogFrame:
 * cromo negativo, @unblogdeviajes, Vietnam. No es una página real.
 */
export function LandingFrame() {
  return (
    <PartnerBrowserFrame url="wanderplanner.ai/unblogdeviajes">
      <article className="mx-auto w-full max-w-[46ch] px-6 pt-8">
        <p className="text-[11px] font-medium uppercase tracking-wider text-white/50">
          @unblogdeviajes
        </p>
        <h2 className="mt-2 text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Los viajes que te inspiran,{" "}
          <span className="text-white/50">convertidos en tu itinerario</span>
        </h2>
        <p className="mt-4 text-[13px] leading-6 text-white/70">
          Una landing a nombre de unblogdeviajes: el lector busca un destino entre sus guías y se
          lleva el plan.
        </p>

        <div className="mt-5 flex rounded-full border border-white/15 p-1">
          <span className="min-w-0 flex-1 rounded-full bg-white px-3 py-1.5 text-center text-[12px] font-medium text-[hsl(20_8%_14%)] sm:text-[13px]">
            Busca un destino
          </span>
          <span className="min-w-0 flex-1 rounded-full px-3 py-1.5 text-center text-[12px] font-medium text-white/60 sm:text-[13px]">
            Crea tu cuenta
          </span>
        </div>
        <div className="mt-3 flex h-11 items-center gap-2 rounded-full border border-white/15 bg-white/5 pl-4 pr-1.5">
          <span className="min-w-0 flex-1 truncate text-[13px] text-white/40">
            Vietnam, Japón, Islandia…
          </span>
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-[hsl(20_8%_14%)]">
            <ArrowRight className="size-4" aria-hidden />
          </span>
        </div>

        <div className="mt-5 flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-3">
          <LandingOgThumb className="h-14 w-20 shrink-0 rounded-md ring-1 ring-white/10" />
          <div className="min-w-0">
            <p className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-white">
              Vietnam en 12 días: la ruta completa
            </p>
            <p className="mt-0.5 truncate text-[11px] text-white/55">
              unblogdeviajes.com/vietnam-en-12-dias
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2 [mask-image:linear-gradient(to_bottom,#000_45%,transparent_100%)]">
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
        </div>
      </article>
    </PartnerBrowserFrame>
  )
}
