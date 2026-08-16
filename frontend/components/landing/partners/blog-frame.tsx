import { LandingStreetPhoto } from "@/components/landing/landing-mocks"
import { PartnerButtonPreview } from "@/components/partners/partner-button-preview"
import { cn } from "@/lib/utils"

const PANEL_H = "h-[520px]"

export function BlogFrame() {
  return (
    <div
      aria-hidden
      className="relative isolate mx-auto mt-16 w-full max-w-6xl select-none px-4 sm:mt-20 sm:px-6"
    >
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

      <div className="overflow-hidden rounded-xl border border-border bg-canvas text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.05),0_24px_64px_-16px_rgb(0_0_0/0.22)]">
        <div className="pointer-events-none flex items-center gap-3 border-b border-border bg-background px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
          </div>
          <div className="mx-auto flex h-6 w-full max-w-xs items-center justify-center overflow-hidden rounded-md bg-muted px-3">
            <span className="truncate text-[11px] font-medium text-foreground/70">
              unblogdeviajes.com/vietnam-en-12-dias
            </span>
          </div>
          <div className="w-10 shrink-0" />
        </div>

        <div className={cn("pointer-events-none overflow-hidden bg-background", PANEL_H)}>
          <article className="mx-auto w-full max-w-[46ch] px-6 pt-8">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              @unblogdeviajes · 14 marzo
            </p>
            <h2 className="mt-2 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
              Vietnam en 12 días: la ruta completa
            </h2>
            <p className="mt-4 text-[13px] leading-6 text-foreground">
              Si es tu primera vez en Vietnam, esta ruta de 12 días es el itinerario: Hanói, la
              bahía de Ha Long, Sa Pa y el descenso hacia Hoi An. Sin prisas, con los platos que
              merecen cola.
            </p>
            <LandingStreetPhoto className="mt-4 h-28 w-full rounded-lg sm:h-32" />
            <div className="mt-5">
              <PartnerButtonPreview mode="mock" />
            </div>
            <div className="mt-6 flex flex-col gap-2 [mask-image:linear-gradient(to_bottom,#000_10%,transparent_100%)]">
              <div className="h-2 w-full rounded-full bg-neutral-200" />
              <div className="h-2 w-11/12 rounded-full bg-neutral-200" />
              <div className="h-2 w-4/5 rounded-full bg-neutral-200" />
            </div>
          </article>
        </div>
      </div>
    </div>
  )
}
