import Link from "next/link"
import { BadgeCheck, Link2, Server, Undo2, type LucideIcon } from "lucide-react"
import { BrandMark } from "@/components/brand-mark"
import { PartnerButtonPreview } from "@/components/partners/partner-button-preview"
import { Button } from "@/components/ui/button"

function Guarantee({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon
  title: string
  children: React.ReactNode
}) {
  return (
    <li>
      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5">
        <Icon className="h-[18px] w-[18px] text-white/70" aria-hidden />
      </span>
      <h3 className="mt-3 text-base font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-6 text-white/70">{children}</p>
    </li>
  )
}

/**
 * Réplica del snippet real del kit (`partner-button.ts`) dentro de un post
 * ficticio. En tarjeta clara, la variante color (marrón).
 */
function BlogPostMockup() {
  return (
    <div aria-hidden className="pointer-events-none select-none lg:w-[340px] lg:shrink-0">
      <div className="rounded-xl bg-white p-5 shadow-[0_16px_48px_-12px_rgb(0_0_0/0.45)]">
        <div className="flex flex-col gap-2">
          <div className="h-2 w-full rounded-full bg-neutral-200" />
          <div className="h-2 w-11/12 rounded-full bg-neutral-200" />
          <div className="h-2 w-4/5 rounded-full bg-neutral-200" />
        </div>
        <div className="mt-5">
          <PartnerButtonPreview mode="mock" />
        </div>
        <div className="mt-5 flex flex-col gap-2">
          <div className="h-2 w-3/4 rounded-full bg-neutral-200" />
          <div className="h-2 w-1/2 rounded-full bg-neutral-200" />
        </div>
      </div>
      <p className="mt-3 text-center text-[11px] text-white/50">
        El botón, al final de tu artículo
      </p>
    </div>
  )
}

export function ForBloggers() {
  return (
    <section id="blogueros" className="bg-[hsl(20_8%_11%)] py-24 text-white sm:py-32">
      <div className="landing-reveal mx-auto w-full max-w-6xl px-6">
        <div className="flex flex-col gap-12 lg:flex-row lg:items-center lg:justify-between lg:gap-16">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <BrandMark variant="negative" className="h-8" />
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/60">
                Para blogueros
              </p>
            </div>
            <h2 className="mt-6 max-w-2xl text-balance text-3xl font-semibold tracking-[-0.03em] sm:text-4xl lg:text-5xl">
              Una herramienta al final de tu post.{" "}
              <span className="block text-white/50">
                No una plataforma que se queda con tus lectores.
              </span>
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/70">
              Tu lector pulsa un botón bajo tu artículo y convierte tu ruta en su plan.
              Tu contenido, tu marca y tu monetización siguen siendo tuyos.
            </p>
          </div>
          <BlogPostMockup />
        </div>

        <ul className="mt-16 grid gap-x-8 gap-y-10 border-t border-white/10 pt-12 sm:grid-cols-2">
          <Guarantee icon={BadgeCheck} title="Atribución en cada tarjeta.">
            Cada lugar consolidado muestra «vía @tualias» y enlaza a tu post original. El plan
            lleva tu firma, no la nuestra.
          </Guarantee>
          <Guarantee icon={Link2} title="Tus enlaces de afiliación, intactos.">
            Conservamos el href exacto de tu artículo. Si el lector reserva, la comisión sigue
            siendo tuya.
          </Guarantee>
          <Guarantee icon={Undo2} title="El lector vuelve a tu post.">
            El botón abre WanderPlanner en una pestaña nueva: tu artículo permanece abierto y tu
            tráfico no se va.
          </Guarantee>
          <Guarantee icon={Server} title="No te machaca el hosting.">
            Tu post se descarga una vez por versión del contenido, no una vez por lector. Mil
            clics = una petición a tu servidor.
          </Guarantee>
        </ul>

        <div className="mt-14 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Button
            asChild
            size="lg"
            className="h-12 bg-white px-8 text-base text-[hsl(20_8%_14%)] hover:bg-white/90"
          >
            <Link href="/partners">Generar mi botón</Link>
          </Button>
          <p className="text-sm text-white/60">
            Dos minutos: pegas la URL de tu post y te llevas el snippet HTML.
          </p>
        </div>
      </div>
    </section>
  )
}
