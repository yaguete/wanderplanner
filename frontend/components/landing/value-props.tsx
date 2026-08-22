import type { ReactNode } from "react"
import {
  BookOpen,
  Bot,
  CalendarDays,
  Landmark,
  Link2,
  ShieldCheck,
  UtensilsCrossed,
  Wallet,
  FileText,
  BadgeCheck,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { MockAgencia, MockFuentes, MockOficiales } from "./value-mocks"

function ValueCopy({
  title,
  titleMuted,
  body,
}: {
  title: string
  titleMuted: string
  body: string
}) {
  return (
    <div>
      <h2 className="text-balance text-3xl font-semibold tracking-[-0.03em] sm:text-4xl lg:text-5xl">
        {title}{" "}
        <span className="block text-foreground/45">{titleMuted}</span>
      </h2>
      <p className="mt-5 max-w-xl text-pretty text-base leading-7 text-foreground/70">
        {body}
      </p>
    </div>
  )
}

function Capability({
  icon: Icon,
  children,
}: {
  icon: LucideIcon
  children: ReactNode
}) {
  return (
    <li className="flex items-start gap-3 sm:block">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
        <Icon className="h-[18px] w-[18px] text-muted-foreground" aria-hidden />
      </span>
      <p className="max-w-md text-sm leading-6 text-foreground sm:mt-3">{children}</p>
    </li>
  )
}

function CapabilityGrid({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <ul
      className={cn(
        "mt-14 grid gap-x-8 gap-y-10 border-t border-border pt-10 sm:grid-cols-2 sm:pt-12",
        className,
      )}
    >
      {children}
    </ul>
  )
}

export function ValueProps({
  sections = ["fuentes", "plan", "oficial"],
}: {
  /** Home: las tres. `/lacosmopolilla` omite fuentes. */
  sections?: readonly ("fuentes" | "plan" | "oficial")[]
}) {
  const show = (id: "fuentes" | "plan" | "oficial") => sections.includes(id)
  return (
    <>
      {show("fuentes") ? (
        <section
          id="fuentes"
          className="scroll-mt-24 bg-background pb-20 pt-24 sm:pb-24 sm:pt-32"
        >
          <div className="landing-reveal mx-auto w-full max-w-6xl px-6">
            <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16">
              <div className="min-w-0 lg:order-1">
                <ValueCopy
                  title="No se lo inventa."
                  titleMuted="Lo ha leído."
                  body="Añade las referencias en las que confías y aquí se convierten en días, planes y reservas. Cada información y actividad se enlaza al original y lo compruebas en un clic."
                />
                <CapabilityGrid className="mt-8 border-t-0 pt-0 sm:pt-0">
                  <Capability icon={FileText}>
                    Nos basamos en tus referencias favoritas, experiencias reales y fuentes oficiales.
                  </Capability>
                  <Capability icon={BadgeCheck}>
                    Cada sitio lleva la firma de quien lo recomendó, con su crónica siempre a la vista.
                  </Capability>
                  <Capability icon={Link2}>
                    Los enlaces del blog llegan intactos: sus descuentos siguen funcionando.
                  </Capability>
                </CapabilityGrid>
              </div>
              <MockFuentes />
            </div>
          </div>
        </section>
      ) : null}

      {show("plan") ? (
        <section id="plan" className="scroll-mt-24 bg-canvas py-20 sm:py-28">
          <div className="landing-reveal mx-auto w-full max-w-6xl px-6">
            <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
              <div className="min-w-0">
                <ValueCopy
                  title="El plan de una agencia."
                  titleMuted="Sin la agencia."
                  body="Organiza trayectos, reserva alojamientos y planifica actividades desde un solo lugar. Adapta y personaliza tus Guías de Viaje favoritas según tus necesidades."
                />
                <CapabilityGrid className="mt-8 border-t-0 pt-0 sm:pt-0">
                  <Capability icon={CalendarDays}>
                    Optimiza el itinerario desde el mapa y el calendario.
                  </Capability>
                  <Capability icon={UtensilsCrossed}>
                    Qué hacer, dónde comer y dónde dormir, con la firma de tus fuentes.
                  </Capability>
                  <Capability icon={Wallet}>
                    Planifica tareas, gestiones y costes de tu viaje.
                  </Capability>
                  <Capability icon={Bot}>
                    ¿Tienes dudas o no sabes si falta algo? Pregunta al asistente.
                  </Capability>
                </CapabilityGrid>
              </div>
              <MockAgencia />
            </div>
          </div>
        </section>
      ) : null}

      {show("oficial") ? (
        <section
          id="oficial"
          className="scroll-mt-24 bg-background pb-24 pt-20 sm:pb-32 sm:pt-24"
        >
          <div className="landing-reveal mx-auto w-full max-w-6xl px-6">
            <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16">
              <div className="min-w-0 lg:order-1">
                <ValueCopy
                  title="Del visado"
                  titleMuted="al abrigo."
                  body="El asistente consulta información oficial para visados, sanidad y seguridad. Lo práctico —qué tienes que echarte a la mochila— lo busca y también lo cita."
                />
                <CapabilityGrid className="mt-8 border-t-0 pt-0 sm:pt-0">
                  <Capability icon={Landmark}>
                    Visados, sanidad y seguridad, de la ficha país oficial.
                  </Capability>
                  <Capability icon={ShieldCheck}>
                    Comprueba los trámites que hay que hacer antes de salir.
                  </Capability>
                  <Capability icon={BookOpen}>
                    Averigua qué tiempo hará y qué meter en la maleta.
                  </Capability>
                </CapabilityGrid>
              </div>
              <MockOficiales />
            </div>
          </div>
        </section>
      ) : null}
    </>
  )
}
