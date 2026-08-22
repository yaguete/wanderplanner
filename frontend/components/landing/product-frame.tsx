import type { ReactNode } from "react"
import { Plus, Search } from "lucide-react"
import { ITEM_DOT_COLORS } from "@/lib/item-styles"
import type { ItemType } from "@/types/itinerary"
import { cn } from "@/lib/utils"
import {
  LandingAlhambraPhoto,
  LandingAlhambraThumb,
  LandingArticlePhoto,
  LandingItemRow,
  LandingOgThumb,
  MockTab,
} from "./landing-mocks"
import { ProductFrameMobile } from "./product-frame-mobile"

const PANEL_H = "h-[520px]"

type FrameItem = {
  type: ItemType
  name: string
  meta?: string
}

type FrameDay = {
  heading: string
  items: readonly FrameItem[]
}

type ProductFrameScene = {
  tripPath: string
  handle: string
  sourceTitle: string
  sourceUrl: string
  Thumb: typeof LandingOgThumb
  Photo: typeof LandingArticlePhoto
  lead: ReactNode
  chronicleDay: string
  chronicleBody: string
  tripTitle: string
  tripMeta: string
  days: readonly FrameDay[]
  assistantQuestion: string
  assistantAnswer: ReactNode
  assistantChip?: string
  assistantSuggestions: readonly [string, string]
}

const VIETNAM: ProductFrameScene = {
  tripPath: "wanderplanner.ai/trips/vietnam-en-12-dias",
  handle: "@unblogdeviajes",
  sourceTitle: "Vietnam en 12 días: la ruta completa",
  sourceUrl: "unblogdeviajes.com/vietnam-en-12-dias",
  Thumb: LandingOgThumb,
  Photo: LandingArticlePhoto,
  lead: (
    <>
      Si es tu primera vez en Vietnam, esta{" "}
      <span className="font-semibold">ruta de 12 días</span> es el{" "}
      <span className="font-semibold">itinerario perfecto</span>: Hanói, la bahía de Ha Long,
      Sa Pa y el descenso hacia Hoi An. Sin prisas, con los platos que merecen cola y un
      homestay entre arrozales.
    </>
  ),
  chronicleDay: "Día 1 · Hanói",
  chronicleBody:
    "El casco viejo se recorre a pie: el lago Hoan Kiem al amanecer y un bún chả a la hora de comer, en cualquiera de los locales que no salen en la guía.",
  tripTitle: "Vietnam en 12 días",
  tripMeta: "14 – 25 marzo · 2 viajeros",
  days: [
    {
      heading: "Día 1 · Hanói",
      items: [
        { type: "activity", name: "Casco viejo y lago Hoan Kiem" },
        { type: "food", name: "Bún chả en el casco viejo", meta: "vía @unblogdeviajes" },
        { type: "stay", name: "Hotel junto al lago", meta: "vía @unblogdeviajes" },
      ],
    },
    {
      heading: "Día 2 · Ha Long",
      items: [
        {
          type: "transport",
          name: "Bus a la bahía de Ha Long",
          meta: "3 h · vía @unblogdeviajes",
        },
        { type: "activity", name: "Crucero y cueva Sung Sot" },
      ],
    },
    {
      heading: "Día 3 · Sa Pa",
      items: [
        { type: "stay", name: "Homestay entre arrozales", meta: "vía @unblogdeviajes" },
        { type: "activity", name: "Trekking al pueblo de Cat Cat" },
      ],
    },
  ],
  assistantQuestion: "Solo tenemos 10 días, ¿qué quitarías?",
  assistantAnswer:
    "Quitaría Ninh Binh y le daría ese día a Hoi An: el trayecto os come una mañana entera. Muevo el crucero al día 3 y os libero el 9 y el 10.",
  assistantChip: "✓ 2 días liberados",
  assistantSuggestions: ["¿Dónde cambio dinero?", "Reordena el norte"],
}

const GRANADA: ProductFrameScene = {
  tripPath: "wanderplanner.ai/trips/granada-en-2-dias",
  handle: "@lacosmopolilla",
  sourceTitle: "Granada en 2 días: imprescindibles",
  sourceUrl: "lacosmopolilla.com/que-ver-en-granada-en-2-dias",
  Thumb: LandingAlhambraThumb,
  Photo: LandingAlhambraPhoto,
  lead: (
    <>
      Si es tu primera vez en Granada, esta{" "}
      <span className="font-semibold">ruta de 2 días</span> es el{" "}
      <span className="font-semibold">itinerario de una granaína</span>: centro, Albayzín, la
      Alhambra y el Sacromonte. Sin prisas, con las tapas de la Calle Navas y el atardecer en San
      Nicolás.
    </>
  ),
  chronicleDay: "Día 1 · Centro y Albayzín",
  chronicleBody:
    "Empieza en Bib-Rambla: churros, la Catedral y la Capilla Real. Por la tarde, Carrera del Darro y el atardecer en el Mirador de San Nicolás.",
  tripTitle: "Granada en 2 días",
  tripMeta: "14 – 15 marzo · 2 viajeros",
  days: [
    {
      heading: "Día 1 · Centro y Albayzín",
      items: [
        { type: "activity", name: "Catedral y Capilla Real" },
        { type: "food", name: "Tapeo en la Calle Navas", meta: "vía @lacosmopolilla" },
        { type: "stay", name: "Palacio de los Gamboa", meta: "vía @lacosmopolilla" },
      ],
    },
    {
      heading: "Día 2 · Alhambra",
      items: [
        {
          type: "transport",
          name: "Minibús C30 a la Alhambra",
          meta: "vía @lacosmopolilla",
        },
        { type: "activity", name: "Palacios Nazaríes y Generalife" },
      ],
    },
    {
      heading: "Día 2 · Sacromonte",
      items: [
        { type: "activity", name: "Zambra en cueva", meta: "vía @lacosmopolilla" },
        { type: "activity", name: "Paseo por el Realejo" },
      ],
    },
  ],
  assistantQuestion: "¿Cuánto cuesta visitar la Alhambra? ¿Debo reservar con mucha antelación?",
  assistantAnswer: (
    <>
      La entrada general ronda los 19 €, solo en el Patronato (
      <span className="wp-ext-link font-medium underline underline-offset-2">cómpralas aquí</span>
      ). Reserva con 2–3 meses de antelación: si no, te quedas fuera. Si ya no hay cupo, una visita
      guiada o la Granada City Card suelen tener hueco.
    </>
  ),
  assistantSuggestions: ["¿Dónde tapeo?", "¿Hará frío?"],
}

const SCENES = {
  vietnam: VIETNAM,
  granada: GRANADA,
} as const

export type ProductFrameSceneId = keyof typeof SCENES

function FuentesPanel({
  scene,
  className,
}: {
  scene: ProductFrameScene
  className?: string
}) {
  return (
    <div className={cn("flex min-w-0 flex-col overflow-hidden rounded-lg bg-background", className)}>
      <div className="flex shrink-0 items-center gap-1.5 px-3 pt-3">
        <span className="inline-flex min-h-7 items-center rounded-full bg-foreground px-2.5 text-xs font-medium leading-none text-background">
          {scene.handle}
        </span>
        <span className="inline-flex size-7 items-center justify-center rounded-full border border-input text-foreground">
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
      </div>

      <div className="mt-3 flex shrink-0 items-start gap-3 px-3">
        <scene.Thumb className="h-14 w-20 shrink-0 rounded-lg border border-border" />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-foreground">
            {scene.sourceTitle}
          </p>
          <p className="truncate text-xs text-muted-foreground">{scene.sourceUrl}</p>
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
        <p className="text-[13px] leading-5 text-foreground">{scene.lead}</p>
        <scene.Photo className="mt-3 h-28 w-full rounded-xl" />
        <p className="mt-3 text-[13px] font-semibold tracking-tight text-foreground">
          {scene.chronicleDay}
        </p>
        <p className="mt-1.5 text-[13px] leading-5 text-foreground">{scene.chronicleBody}</p>
      </div>
    </div>
  )
}

function TripPanel({
  scene,
  className,
}: {
  scene: ProductFrameScene
  className?: string
}) {
  return (
    <div className={cn("min-w-0 overflow-hidden rounded-lg bg-background p-3", className)}>
      {/* El último día se corta a propósito: el degradado lo convierte en «sigue». */}
      <div className="flex h-full flex-col gap-2 [mask-image:linear-gradient(to_bottom,#000_84%,transparent_100%)]">
        <div>
          <p className="text-sm font-semibold tracking-tight">{scene.tripTitle}</p>
          <p className="text-[11px] text-muted-foreground">{scene.tripMeta}</p>
        </div>
        {scene.days.map((day) => (
          <div key={day.heading} className="contents">
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {day.heading}
            </p>
            {day.items.map((item) => (
              <LandingItemRow
                key={item.name}
                dot={ITEM_DOT_COLORS[item.type]}
                name={item.name}
                meta={item.meta}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function AssistantPanel({
  scene,
  className,
}: {
  scene: ProductFrameScene
  className?: string
}) {
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
      <div className="mt-3 flex flex-col gap-3.5">
        <div className="ml-auto max-w-[85%] rounded-2xl bg-muted px-3 py-2 text-[13px]">
          {scene.assistantQuestion}
        </div>
        <p className="max-w-[95%] text-[13px] leading-5 text-foreground">{scene.assistantAnswer}</p>
        {scene.assistantChip ? (
          <div className="flex w-fit items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-[11px] font-medium text-foreground">
            {scene.assistantChip}
          </div>
        ) : null}
      </div>
      <div className="mt-auto flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {scene.assistantSuggestions.map((label) => (
            <span
              key={label}
              className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground"
            >
              {label}
            </span>
          ))}
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

export function ProductFrame({ scene = "vietnam" }: { scene?: ProductFrameSceneId }) {
  const content = SCENES[scene]
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
              {content.tripPath}
            </span>
          </div>
          <div className="w-10 shrink-0" />
        </div>

        <div className="pointer-events-none hidden gap-2 p-2 sm:gap-2.5 sm:p-2.5 lg:flex">
          <FuentesPanel scene={content} className={cn("flex-1", PANEL_H)} />
          <TripPanel scene={content} className={cn("flex-1", PANEL_H)} />
          <AssistantPanel scene={content} className={cn("flex-1", PANEL_H)} />
        </div>

        <ProductFrameMobile>
          <div className="p-2">
            <FuentesPanel scene={content} className={PANEL_H} />
          </div>
          <div className="p-2">
            <TripPanel scene={content} className={PANEL_H} />
          </div>
          <div className="p-2">
            <AssistantPanel scene={content} className={PANEL_H} />
          </div>
        </ProductFrameMobile>
      </div>
    </div>
  )
}
