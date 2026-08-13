import type { Metadata } from "next"
import { AuthShell } from "@/components/auth/auth-shell"
import { PartnerButtonBuilder } from "@/components/partners/partner-button-builder"

export const metadata: Metadata = {
  title: "Kit de partners",
  description:
    "Genera el botón «Planifica esta ruta con WanderPlanner» para tu blog: enlace, snippet HTML y garantías de atribución y afiliación.",
}

export default function PartnersPage() {
  return (
    <AuthShell
      width="2xl"
      title="Kit de partners"
      subtitle="Genera el botón para tu post. Precalentamos la ruta para que el primer lector no espere."
      footer={
        <>
          ¿Dudas? Escríbenos a{" "}
          <a
            href="mailto:hola@wanderplanner.ai"
            className="font-medium text-foreground underline underline-offset-4"
          >
            hola@wanderplanner.ai
          </a>
          .
        </>
      }
    >
      <div className="flex flex-col gap-10">
        <PartnerButtonBuilder />

        <section className="flex flex-col gap-4 border-t border-border pt-6">
          <h2 className="text-base font-semibold tracking-tight">
            Garantías para tu blog
          </h2>
          <ul className="flex flex-col gap-3 text-sm text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Atribución en cada tarjeta. </span>
              Cada ítem consolidado muestra «vía @aliasdelpartner» y la fuente enlaza a tu post original.
            </li>
            <li>
              <span className="font-medium text-foreground">Tus enlaces de afiliación intactos. </span>
              Conservamos el href exacto del artículo: aparece en la tarjeta, en la pestaña
              Descuentos y en el panel de tareas.
            </li>
            <li>
              <span className="font-medium text-foreground">El lector vuelve a tu post. </span>
              El botón abre WanderPlanner en una pestaña nueva: tu artículo permanece abierto.
            </li>
            <li>
              <span className="font-medium text-foreground">No te machaca el hosting. </span>
              Tu post se resintetiza solo cuando lo actualices, no cada vez que acceda algún lector.
            </li>
          </ul>
        </section>
      </div>
    </AuthShell>
  )
}
