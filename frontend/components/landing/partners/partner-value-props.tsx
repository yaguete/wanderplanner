import type { ReactNode } from "react"
import {
  BadgeCheck,
  Link2,
  Server,
  Undo2,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { MockAfiliacion, MockAtribucion, MockLectorVuelve } from "./partner-value-mocks"

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
        <span className="block text-white/50">{titleMuted}</span>
      </h2>
      <p className="mt-5 max-w-xl text-pretty text-base leading-7 text-white/70">{body}</p>
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
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
        <Icon className="h-[18px] w-[18px] text-white/70" aria-hidden />
      </span>
      <p className="max-w-md text-sm leading-6 text-white sm:mt-3">{children}</p>
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
        "mt-8 grid gap-x-8 gap-y-10 border-t-0 pt-0 sm:grid-cols-2 sm:pt-0",
        className,
      )}
    >
      {children}
    </ul>
  )
}

export function PartnerValueProps() {
  return (
    <>
      <section id="atribucion" className="scroll-mt-24 pb-6 pt-12 sm:pb-24 sm:pt-32">
        <div className="landing-reveal mx-auto w-full max-w-6xl px-6">
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16">
            <div className="min-w-0 lg:order-1">
              <ValueCopy
                title="Tu firma en cada tarjeta."
                titleMuted="El plan lleva tu nombre."
                body="Cuando el lector consolida un lugar, la tarjeta muestra «vía @tualias» y enlaza a tu post. No hay itinerario anónimo: si sale de tu crónica, se lee tu crónica."
              />
              <CapabilityGrid>
                <Capability icon={BadgeCheck}>
                  Cada ítem muestra quién lo recomendó y abre el original.
                </Capability>
                <Capability icon={Link2}>
                  El plan no se firma con nuestra marca. Se firma con la tuya.
                </Capability>
              </CapabilityGrid>
            </div>
            <MockAtribucion />
          </div>
        </div>
      </section>

      <section id="afiliacion" className="scroll-mt-24 bg-white/[0.03] pb-6 pt-8 sm:py-28">
        <div className="landing-reveal mx-auto w-full max-w-6xl px-6">
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
            <div className="min-w-0">
              <ValueCopy
                title="Si reservan, la comisión es tuya."
                titleMuted="El href no se toca."
                body="Conservamos el enlace exacto de tu artículo. Aparece en la tarjeta, en Descuentos y en las tareas. Si el lector reserva hotel, seguro o SIM, la comisión sigue siendo tuya."
              />
              <CapabilityGrid>
                <Capability icon={Link2}>
                  El href del post llega intacto, sin reescritura.
                </Capability>
                <Capability icon={BadgeCheck}>
                  No sustituimos tu afiliación por ninguna otra.
                </Capability>
              </CapabilityGrid>
            </div>
            <MockAfiliacion />
          </div>
        </div>
      </section>

      <section id="trafico" className="scroll-mt-24 pb-8 pt-8 sm:pb-32 sm:pt-24">
        <div className="landing-reveal mx-auto w-full max-w-6xl px-6">
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16">
            <div className="min-w-0 lg:order-1">
              <ValueCopy
                title="Tu artículo se queda abierto."
                titleMuted="El plan se abre al lado."
                body="El botón abre WanderPlanner en una pestaña nueva: tu post no se va y el lector puede volver a la crónica. Tampoco machacamos tu hosting: el artículo se lee una vez por versión, no una vez por clic."
              />
              <CapabilityGrid>
                <Capability icon={Undo2}>
                  target=_blank: tu tráfico no se fuga.
                </Capability>
                <Capability icon={Server}>
                  Refrescamos la ruta cuando la actualizas, no en cada clic.
                </Capability>
              </CapabilityGrid>
            </div>
            <MockLectorVuelve />
          </div>
        </div>
      </section>
    </>
  )
}
