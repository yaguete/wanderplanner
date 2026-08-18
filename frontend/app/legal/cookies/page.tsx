import type { Metadata } from "next"
import Link from "next/link"
import {
  LegalDocument,
  LegalMail,
  LegalSection,
  LegalTable,
} from "@/components/legal/legal-document"
import { STORAGE_INVENTORY } from "@/lib/legal"

export const metadata: Metadata = {
  title: "Política de cookies",
  description: "Qué guarda WanderPlanner en tu navegador y cómo cambiar tu elección.",
}

const TOC = [
  { id: "que-guardamos", label: "Qué guardamos" },
  { id: "medicion", label: "Medición de visitas" },
  { id: "cambiar", label: "Cambiar tu elección" },
] as const

export default function CookiesPage() {
  return (
    <LegalDocument
      title="Política de cookies"
      lede={<p>Qué deja WanderPlanner en tu navegador y cómo cambiarlo.</p>}
      toc={TOC}
    >
      <LegalSection id="que-guardamos" title="Qué guardamos">
        <p>
          Mientras no entras en tu cuenta, WanderPlanner no pone ninguna cookie. Lo que
          guardamos después es lo justo para que el servicio funcione: tu sesión, tus
          preferencias de pantalla y una caché de cosas que ya has visto, para no volver a
          pedirlas. Nada de eso sirve para seguirte por otras webs.
        </p>
        <LegalTable
          columns={["Qué", "Tipo", "Para qué", "Cuánto dura"]}
          rows={STORAGE_INVENTORY.map((row) => [
            <code key={row.name} className="text-xs text-foreground">
              {row.name}
            </code>,
            row.kind,
            row.purpose,
            row.duration,
          ])}
        />
        <p>
          El mapa y las fotos de los artículos se cargan desde servidores de otros
          (Mapbox, el blog original), que pueden dejar sus propias cookies. Esas no las
          ponemos nosotros.
        </p>
      </LegalSection>

      <LegalSection id="medicion" title="Medición de visitas">
        <p>
          Es lo único para lo que te pedimos permiso. Usamos Vercel Web Analytics (páginas
          vistas) y Vercel Speed Insights (si la página carga rápido). Ninguno de los dos
          usa cookies. Hasta que aceptas no cargamos nada suyo.
        </p>
      </LegalSection>

      <LegalSection id="cambiar" title="Cambiar tu elección">
        <p>
          Pulsa «Configurar», junto a Cookies, en el pie de página: vuelve a salir la
          pregunta. También puedes borrar los datos de este sitio desde tu navegador.
        </p>
        <p>
          Si algo no queda claro, escríbenos a <LegalMail />. Lo demás está en la{" "}
          <Link href="/legal/privacidad" className="font-medium text-foreground underline underline-offset-4">
            política de privacidad
          </Link>
          .
        </p>
      </LegalSection>
    </LegalDocument>
  )
}
