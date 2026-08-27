import type { ReactNode } from "react"
import {
  ArrowDown,
  Bed,
  BookOpen,
  CalendarDays,
  Car,
  Copy,
  Home,
  List,
  Luggage,
  Mail,
  Map as MapIcon,
  MapPin,
  Route,
  Share2,
  Ticket,
  UserPlus,
  UtensilsCrossed,
} from "lucide-react"
import { LandingArticlePhoto } from "@/components/landing/landing-mocks"
import { ITEM_COLORS, ITEM_DOT_COLORS, ITEM_LABELS } from "@/lib/item-styles"
import { cn } from "@/lib/utils"
import type { ItemType } from "@/types/itinerary"

/**
 * Móvil: apaisado, llena el hueco (el retrato se quedaba en miniatura).
 * Desktop: retrato fijo 67:84.
 */
export const ONBOARDING_MOCK_FRAME =
  "relative isolate mx-auto h-full w-full sm:h-[24rem] sm:w-[19.1rem] sm:max-w-[19.1rem] sm:flex-none"

function OnboardingWell({ children }: { children: ReactNode }) {
  return (
    <div className={ONBOARDING_MOCK_FRAME}>
      <div
        aria-hidden
        className="landing-item-glow pointer-events-none absolute -inset-2 -z-10 rounded-[2rem] blur-xl"
      />
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-canvas shadow-[0_1px_2px_rgb(0_0_0/0.05),0_16px_40px_-12px_rgb(0_0_0/0.16)] dark:bg-background dark:shadow-[0_0_0_1px_hsl(var(--border))]">
        {children}
      </div>
    </div>
  )
}

function InkMark({ tone, children }: { tone: "food" | "activity"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "font-semibold",
        tone === "food" &&
          "shadow-[inset_0_-0.35em_0_hsl(160_84%_39%/0.16)] dark:shadow-[inset_0_-0.35em_0_hsl(160_84%_50%/0.4)]",
        tone === "activity" &&
          "shadow-[inset_0_-0.35em_0_hsl(263_70%_50%/0.16)] dark:shadow-[inset_0_-0.35em_0_hsl(263_70%_62%/0.4)]",
      )}
    >
      {children}
    </span>
  )
}

function FuenteTab({
  label,
  icon: Icon,
  active,
}: {
  label: string
  icon: typeof BookOpen
  active?: boolean
}) {
  return (
    <span
      className={cn(
        "relative inline-flex min-h-8 shrink-0 items-center gap-1 pb-2 text-[11px]",
        active ? "font-semibold text-foreground" : "font-medium text-muted-foreground",
      )}
    >
      <Icon className="h-3 w-3 shrink-0" strokeWidth={active ? 2.25 : 2} aria-hidden />
      {label}
      {active ? (
        <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" />
      ) : null}
    </span>
  )
}

function PillTab({
  label,
  icon: Icon,
  active,
}: {
  label: string
  icon: typeof Route
  active?: boolean
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 flex-1 items-center justify-center gap-0.5 rounded-md px-1 py-1 text-[9px] font-medium",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      <span className={cn("truncate", !active && "hidden")}>{label}</span>
    </span>
  )
}

function CompactItem({
  dot,
  name,
  meta,
}: {
  dot: string
  name: string
  meta?: string
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-background px-2.5 py-2">
      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dot)} />
      <div className="min-w-0">
        <p className="truncate text-[12px] font-medium leading-4 text-foreground">{name}</p>
        {meta ? (
          <p className="truncate text-[10px] leading-4 text-muted-foreground">{meta}</p>
        ) : null}
      </div>
    </div>
  )
}

const PLANNED_ICONS = {
  food: UtensilsCrossed,
  activity: MapPin,
  stay: Home,
} as const

function PlannedCard({
  type,
  name,
  meta,
}: {
  type: "food" | "activity" | "stay"
  name: string
  meta: string
}) {
  const Icon = PLANNED_ICONS[type]
  const colors = ITEM_COLORS[type]
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
      <div className="flex items-center gap-2.5 px-2.5 py-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
          <Icon className={cn("h-3.5 w-3.5", colors.text)} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[12px] font-bold leading-4 tracking-tight text-foreground">
            {name}
          </p>
          <p className="truncate text-[10px] leading-4 text-muted-foreground">
            <span className="font-medium">{ITEM_LABELS[type as ItemType]}</span> {meta}
          </p>
        </div>
      </div>
    </div>
  )
}

/** Slide 1: de un artículo externo a un viaje con días. */
export function MockOnboardingMecanismo() {
  return (
    <OnboardingWell>
      <div className="pointer-events-none flex h-full select-none flex-col p-3" aria-hidden>
        <div className="overflow-hidden rounded-lg border border-border bg-background">
          <LandingArticlePhoto className="h-16 w-full" />
          <div className="px-2.5 py-2">
            <p className="truncate text-[12px] font-semibold leading-4 text-foreground">
              Bali y Java en 12 días
            </p>
            <p className="truncate text-[10px] text-muted-foreground">
              unblogdeviajes.com/bali-java-12-dias
            </p>
          </div>
        </div>

        <div className="flex justify-center py-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
            <ArrowDown className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background p-2.5">
          <p className="text-[12px] font-semibold tracking-tight text-foreground">Tu viaje</p>
          <p className="text-[10px] text-muted-foreground">12 días · 2 viajeros</p>
          <div className="mt-2 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Día 1 · Ubud
            </p>
            <CompactItem
              dot={ITEM_DOT_COLORS.food}
              name="Nasi campur en un warung"
            />
            <p className="pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground max-sm:hidden">
              Día 5 · Bromo
            </p>
            <div className="max-sm:hidden">
              <CompactItem
                dot={ITEM_DOT_COLORS.activity}
                name="Amanecer en el volcán"
              />
            </div>
          </div>
        </div>
      </div>
    </OnboardingWell>
  )
}

/** Slide 2: dentro de Fuentes, Crónica se destila en Ruta. */
export function MockOnboardingFuentes() {
  return (
    <OnboardingWell>
      <div className="pointer-events-none flex h-full select-none flex-col p-3" aria-hidden>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex min-h-6 items-center rounded-full bg-foreground px-2 text-[10px] font-medium text-background">
            @unblogdeviajes
          </span>
        </div>
        <div className="mt-2 flex items-end gap-3">
          <FuenteTab label="Crónica" icon={BookOpen} />
          <FuenteTab label="Ruta" icon={MapPin} active />
        </div>
        <p className="mt-2.5 text-[12px] leading-4 text-foreground">
          En Ubud, un <InkMark tone="food">nasi campur en un warung</InkMark> que no sale en la
          guía. Y el día 5, madrugón para el{" "}
          <InkMark tone="activity">amanecer en el Bromo</InkMark>.
        </p>
        <div className="flex justify-center py-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
            <ArrowDown className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <CompactItem
            dot={ITEM_DOT_COLORS.food}
            name="Nasi campur en un warung de Ubud"
            meta="vía @unblogdeviajes"
          />
          <div className="max-sm:hidden">
            <CompactItem
              dot={ITEM_DOT_COLORS.activity}
              name="Amanecer en el volcán Bromo"
              meta="vía @unblogdeviajes"
            />
          </div>
        </div>
      </div>
    </OnboardingWell>
  )
}

/** Slide 3: Mi viaje de verdad — píldoras, no pestañas subrayadas. */
export function MockOnboardingMiViaje() {
  return (
    <OnboardingWell>
      <div
        className="pointer-events-none flex h-full select-none flex-col bg-background p-2.5"
        aria-hidden
      >
        <div>
          <p className="text-[13px] font-semibold tracking-tight text-foreground">
            Bali y Java en 12 días
          </p>
          <p className="text-[10px] text-muted-foreground">14 – 25 marzo · 2 viajeros</p>
        </div>
        <div className="mt-2 inline-flex w-full items-center rounded-lg bg-muted p-0.5">
          <PillTab label="Ruta" icon={Route} active />
          <PillTab label="Actividades" icon={Ticket} />
          <PillTab label="Alojamientos" icon={Bed} />
          <PillTab label="Transporte" icon={Car} />
          <PillTab label="Básicos" icon={Luggage} />
        </div>
        <div className="mt-2 inline-flex w-fit items-center rounded-lg bg-muted p-0.5">
          <span className="inline-flex items-center gap-1 rounded-md bg-background px-2 py-1 text-[10px] font-medium text-foreground shadow-sm">
            <List className="h-3 w-3" aria-hidden />
            Lista
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-muted-foreground">
            <CalendarDays className="h-3 w-3" aria-hidden />
            Calendario
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-muted-foreground">
            <MapIcon className="h-3 w-3" aria-hidden />
            Mapa
          </span>
        </div>
        <p className="mt-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Día 5 · Ubud
        </p>
        <div className="mt-1.5 min-h-0 flex-1 space-y-1.5 overflow-hidden">
          <PlannedCard
            type="food"
            name="Nasi campur en un warung de Ubud"
            meta="vía @unblogdeviajes"
          />
          <div className="max-sm:hidden">
            <PlannedCard
              type="activity"
              name="Amanecer en el volcán Bromo"
              meta="vía @unblogdeviajes"
            />
          </div>
          <div className="max-sm:hidden">
            <PlannedCard type="stay" name="Casa entre arrozales" meta="añadido por ti" />
          </div>
        </div>
        <div className="mt-2 border-t border-border pt-1.5 text-[11px]">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-muted-foreground">Reservar hotel · 3 noches</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">180 €</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2 border-t border-border pt-1.5">
            <span className="font-semibold text-foreground">Total estimado</span>
            <span className="shrink-0 font-semibold tabular-nums">890 €</span>
          </div>
        </div>
      </div>
    </OnboardingWell>
  )
}

function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[90%] rounded-2xl bg-muted px-2.5 py-1.5 text-[12px] leading-4 text-foreground">
        {children}
      </div>
    </div>
  )
}

function AssistantTurn({
  children,
  cite,
}: {
  children: ReactNode
  cite: string
}) {
  return (
    <div className="space-y-1">
      <p className="text-[12px] leading-4 text-foreground">{children}</p>
      <p className="text-[10px] leading-4 text-muted-foreground">{cite}</p>
    </div>
  )
}

/** Slide 4: chat real — burbuja a la derecha, respuesta a ancho, chips abajo. */
export function MockOnboardingAssistant() {
  return (
    <OnboardingWell>
      <div className="pointer-events-none flex h-full select-none flex-col bg-background" aria-hidden>
        <p className="shrink-0 px-3 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Asistente
        </p>
        <div className="mt-2 min-h-0 flex-1 space-y-3 overflow-hidden px-3">
          <UserBubble>¿Necesito visado?</UserBubble>
          <AssistantTurn cite="Ficha del MAE, 3 de marzo.">
            Visa de llegada de pago, 30 días, y el pasaporte con 6 meses.
          </AssistantTurn>
          <div className="max-sm:hidden">
            <UserBubble>¿Me cuadra el día 5?</UserBubble>
            <AssistantTurn cite="Calendario oficial de Bali.">
              Tu día 5 cae en Nyepi: la isla entera para 24 h, aeropuerto incluido. Tienes el Bromo
              esa mañana.
            </AssistantTurn>
          </div>
        </div>
        <div className="shrink-0 space-y-1.5 px-3 pb-3 pt-2">
          <div className="flex flex-wrap items-start gap-1.5">
            <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-primary">
              ¿Va bien con niños?
            </span>
            <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-primary">
              ¿Hay vacunas?
            </span>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
            Pregunta sobre tu viaje…
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
              ↑
            </span>
          </div>
        </div>
      </div>
    </OnboardingWell>
  )
}

function HeaderAction({
  icon: Icon,
  label,
}: {
  icon: typeof UserPlus
  label: string
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-muted-foreground">
      <Icon className="h-3 w-3" strokeWidth={1.8} aria-hidden />
      {label}
    </span>
  )
}

function InviteMember({
  name,
  role,
}: {
  name: string
  role: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[11px] leading-4">
      <span className="truncate text-foreground">{name}</span>
      <span className="shrink-0 text-[10px] text-muted-foreground">{role}</span>
    </div>
  )
}

function MockWhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

function ShareChip({
  icon,
  label,
  primary,
}: {
  icon: ReactNode
  label: string
  primary?: boolean
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium",
        primary
          ? "bg-primary text-primary-foreground"
          : "border border-border bg-background text-foreground",
      )}
    >
      {icon}
      {label}
    </span>
  )
}

/** Slide 5: Invitar edita el plan; Compartir pega la ruta. */
export function MockOnboardingInvitar() {
  return (
    <OnboardingWell>
      <div
        className="pointer-events-none flex h-full select-none flex-col bg-background p-2.5"
        aria-hidden
      >
        <div className="flex items-center justify-end gap-0.5">
          <HeaderAction icon={Share2} label="Compartir" />
          <HeaderAction icon={UserPlus} label="Invitar" />
        </div>

        <div className="mt-2 flex min-h-0 flex-1 gap-2 max-sm:flex-row sm:flex-col">
          <div className="flex min-w-0 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card p-2.5 max-sm:min-h-0 max-sm:flex-1">
            <p className="text-[12px] font-semibold tracking-tight text-foreground">
              Invitar a este viaje
            </p>
            <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
              Podréis editar el plan a la vez.
            </p>
            <div className="mt-2 flex items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5">
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                correo@ejemplo.com
              </span>
              <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                Enviar
              </span>
            </div>
            <div className="mt-2 space-y-1 border-t border-border pt-1.5">
              <InviteMember name="Tú" role="Dueño" />
              <InviteMember name="Marta" role="Puede editar" />
              <div className="max-sm:hidden">
                <InviteMember name="laura@…" role="Pendiente" />
              </div>
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card p-2.5">
            <p className="text-[12px] font-semibold tracking-tight text-foreground">
              Comparte tu ruta
            </p>
            <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
              Un resumen listo para pegar.
            </p>
            <div className="mt-2 min-h-0 flex-1 overflow-hidden rounded-md bg-muted/40 px-2.5 py-2">
              <p className="line-clamp-4 text-[11px] leading-4 text-muted-foreground sm:line-clamp-5">
                Mira lo que estoy montando: Bali y Java, 12 días, del 14 al 25 de marzo. Ubud, un
                nasi campur que no sale en la guía, y el día 5 madrugón para el Bromo. ¿Qué le
                quitarías?
              </p>
              <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground max-sm:hidden">
                — Montada con wanderplanner.ai
              </p>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              <ShareChip primary icon={<Copy className="h-3 w-3" aria-hidden />} label="Copiar" />
              <ShareChip icon={<MockWhatsAppIcon />} label="WhatsApp" />
              <span className="max-sm:hidden">
                <ShareChip icon={<Mail className="h-3 w-3" aria-hidden />} label="Email" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </OnboardingWell>
  )
}
