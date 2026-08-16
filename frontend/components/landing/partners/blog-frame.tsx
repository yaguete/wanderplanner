import { LandingStreetPhoto } from "@/components/landing/landing-mocks"
import { PartnerButtonPreview } from "@/components/partners/partner-button-preview"
import { cn } from "@/lib/utils"

const PANEL_H = "h-[520px]"

const FRAME_GLOW =
  "radial-gradient(55% 50% at 50% 0%, #9F817340, transparent 72%)," +
  "radial-gradient(38% 45% at 12% 18%, hsl(199 89% 48% / 0.16), transparent 70%)," +
  "radial-gradient(36% 42% at 88% 14%, hsl(262 83% 58% / 0.14), transparent 70%)"

export function BlogFrame() {
  return (
    <div
      aria-hidden
      className="relative isolate mx-auto mt-16 w-full max-w-6xl select-none px-4 sm:mt-20 sm:px-6"
    >
      <div
        className="pointer-events-none absolute inset-x-0 -top-1 -bottom-1 -z-10 rounded-[5rem] blur-xl"
        style={{ background: FRAME_GLOW }}
      />

      <div className="overflow-hidden rounded-xl border border-white/10 bg-[hsl(20_8%_14%)] shadow-[0_1px_2px_rgb(0_0_0/0.35),0_28px_64px_-18px_rgb(0_0_0/0.55)]">
        <div className="pointer-events-none flex items-center gap-3 border-b border-white/10 bg-white/[0.03] px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
          </div>
          <div className="mx-auto flex h-6 w-full max-w-xs items-center justify-center overflow-hidden rounded-md bg-white/[0.06] px-3">
            <span className="truncate text-[11px] font-medium text-white/55">
              unblogdeviajes.com/vietnam-en-12-dias
            </span>
          </div>
          <div className="w-10 shrink-0" />
        </div>

        <div className={cn("pointer-events-none overflow-hidden", PANEL_H)}>
          <article className="mx-auto w-full max-w-[46ch] px-6 pt-8">
            <p className="text-[11px] font-medium uppercase tracking-wider text-white/50">
              @unblogdeviajes · 14 marzo
            </p>
            <h2 className="mt-2 text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Vietnam en 12 días: la ruta completa
            </h2>
            <p className="mt-4 text-[13px] leading-6 text-white/70">
              Si es tu primera vez en Vietnam, esta ruta de 12 días es el itinerario: Hanói, la
              bahía de Ha Long, Sa Pa y el descenso hacia Hoi An. Sin prisas, con los platos que
              merecen cola.
            </p>
            <LandingStreetPhoto className="mt-4 h-28 w-full rounded-lg ring-1 ring-white/10 sm:h-32" />
            <div className="mt-5">
              <PartnerButtonPreview mode="mock" variant="negative" />
            </div>
            <div className="mt-6 flex flex-col gap-2 [mask-image:linear-gradient(to_bottom,#000_10%,transparent_100%)]">
              <div className="h-2 w-full rounded-full bg-white/10" />
              <div className="h-2 w-11/12 rounded-full bg-white/10" />
              <div className="h-2 w-4/5 rounded-full bg-white/10" />
            </div>
          </article>
        </div>
      </div>
    </div>
  )
}
