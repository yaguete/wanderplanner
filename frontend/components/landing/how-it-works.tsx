import { ITEM_DOT_COLORS } from "@/lib/item-styles"
import { LandingItemRow } from "@/components/landing/product-frame"

/** Tarjeta de paso: mockup sobre canvas (como el workspace real) + texto sobre blanco. */
function StepCard({
  dotClass,
  number,
  title,
  body,
  children,
}: {
  dotClass: string
  number: string
  title: string
  body: string
  children: React.ReactNode
}) {
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
      <div
        aria-hidden
        className="pointer-events-none m-2 flex h-48 select-none flex-col gap-2 overflow-hidden rounded-lg bg-canvas p-4 [mask-image:linear-gradient(to_bottom,#000_72%,transparent_98%)]"
      >
        {children}
      </div>
      <div className="p-5 pt-2">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${dotClass}`} />
          <p className="text-sm font-semibold tabular-nums text-muted-foreground">{number}</p>
        </div>
        <h3 className="mt-2 text-xl font-semibold tracking-tight">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
      </div>
    </article>
  )
}

export function HowItWorks() {
  return (
    <section className="bg-background pb-24 pt-20 sm:pb-32 sm:pt-24">
      <div className="landing-reveal mx-auto w-full max-w-6xl px-6">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Cómo funciona
        </p>
        <h2 className="mt-4 max-w-3xl text-balance text-3xl font-semibold tracking-[-0.03em] sm:text-4xl lg:text-5xl">
          Del artículo al itinerario en tres pasos
        </h2>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          <StepCard
            dotClass="bg-sky-600"
            number="01"
            title="Pega el artículo."
            body="La URL del post de tu bloguero favorito. Extraemos su ruta real: lugares, comidas, trayectos. No nos inventamos nada."
          >
            <div className="rounded-md border border-border bg-background px-3 py-2 text-[12px] text-muted-foreground">
              unblogdeviajes.com/vietnam-en-12-dias
            </div>
            <div className="flex w-fit items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-600" />
              Extrayendo la ruta…
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
          </StepCard>

          <StepCard
            dotClass="bg-orange-600"
            number="02"
            title="Se ordena en días."
            body="Alojamientos, restaurantes y planes caen en un calendario que puedes reordenar, recortar o ampliar como quieras."
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Día 1 · Hanói
            </p>
            <LandingItemRow dot={ITEM_DOT_COLORS.activity} name="Casco viejo y lago Hoan Kiem" />
            <LandingItemRow
              dot={ITEM_DOT_COLORS.food}
              name="Bún chả en el casco viejo"
              meta="vía @unblogdeviajes"
            />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Día 2 · Ha Long
            </p>
            <LandingItemRow
              dot={ITEM_DOT_COLORS.transport}
              name="Bus a la bahía de Ha Long"
              meta="3 h · vía @unblogdeviajes"
            />
          </StepCard>

          <StepCard
            dotClass="bg-violet-600"
            number="03"
            title="El asistente lo afina."
            body="Conoce tus blogs y tu forma de viajar: recorta días, mueve planes y propone alternativas que encajan contigo."
          >
            <div className="ml-auto max-w-[85%] rounded-2xl bg-background px-3 py-2 text-[13px] shadow-[0_1px_2px_rgb(0_0_0/0.05)]">
              Solo tenemos 10 días, ¿qué quitarías?
            </div>
            <p className="max-w-[95%] text-[13px] leading-5 text-foreground">
              Quitaría Ninh Binh y le daría ese día a Hoi An: el trayecto os come una mañana
              entera.
            </p>
            <div className="flex w-fit items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground">
              ✓ 2 días liberados
            </div>
          </StepCard>
        </div>
      </div>
    </section>
  )
}
