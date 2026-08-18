import type { Metadata } from "next"
import Link from "next/link"
import {
  LegalDocument,
  LegalMail,
  LegalSection,
  LegalTable,
} from "@/components/legal/legal-document"
import { AEPD_URL, LEGAL } from "@/lib/legal"

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Qué datos guarda WanderPlanner, para qué, quién más los ve y cómo ejercer tus derechos.",
}

const TOC = [
  { id: "responsable", label: "Quién trata tus datos" },
  { id: "datos", label: "Qué guardamos y por qué" },
  { id: "terceros", label: "Quién más los ve" },
  { id: "conservacion", label: "Cuánto tiempo" },
  { id: "derechos", label: "Tus derechos" },
] as const

const DATA_ROWS: readonly (readonly string[])[] = [
  [
    "Correo y contraseña",
    "Tener una cuenta y poder entrar. Si entras como invitado, no pedimos ninguno de los dos.",
    "Contrato",
  ],
  [
    "Tu perfil de viajero",
    "Que el asistente y las búsquedas se parezcan a lo que te gusta.",
    "Contrato",
  ],
  [
    "Tus viajes",
    "Destinos, fechas, sitios, transportes, tareas, costes y los artículos que has guardado. Es lo que la app hace.",
    "Contrato",
  ],
  [
    "Conversaciones con el asistente",
    "Responderte y mantener el hilo de cada viaje.",
    "Contrato",
  ],
  [
    "Cuántas veces usas cada función",
    "Aplicar límites de uso para que el coste de las herramientas de IA no se dispare.",
    "Interés legítimo",
  ],
  [
    "Tu dirección IP",
    "Frenar abusos en las partes que funcionan sin cuenta.",
    "Interés legítimo",
  ],
  [
    "Páginas que visitas y cómo cargan",
    "Saber qué funciona en la web. Solo si nos das permiso.",
    "Consentimiento",
  ],
  [
    "Desde qué artículo llegas y si pulsas un enlace de reserva",
    "Contar el botón de los blogs: qué post lo abrió, si creas cuenta y si sales a reservar. Sin tu correo y sin la dirección completa del artículo.",
    "Interés legítimo",
  ],
]

export default function PrivacidadPage() {
  return (
    <LegalDocument
      title="Política de privacidad"
      lede={<p>Qué datos guarda WanderPlanner, para qué y qué puedes pedirnos.</p>}
      toc={TOC}
    >
      <LegalSection id="responsable" title="Quién trata tus datos">
        <p>
          {LEGAL.holderName}, persona física residente en {LEGAL.country}, responsable de{" "}
          {LEGAL.siteName}. Para cualquier cosa relacionada con esta página:{" "}
          <LegalMail />.
        </p>
      </LegalSection>

      <LegalSection id="datos" title="Qué guardamos y por qué">
        <LegalTable columns={["Datos", "Para qué", "Base legal"]} rows={DATA_ROWS} />
        <p>
          La dirección IP la usamos en el momento y no la guardamos en ninguna tabla. Puede
          quedar, como en cualquier web, en los registros de los servidores que nos alojan.
        </p>
        <p>
          Del botón de los blogs guardamos un contador: qué pasó (abrir el enlace, crear
          cuenta, pulsar una reserva), el slug del bloguero y el identificador público del
          artículo —el último trozo de su dirección, no la URL entera—. No va unido a tu
          cuenta ni a tu correo. Esas filas se borran a los 90 días.
        </p>
        <p>WanderPlanner no está pensado para menores de 14 años.</p>
      </LegalSection>

      <LegalSection id="terceros" title="Quién más los ve">
        <p>
          No vendemos tus datos ni los cedemos a nadie para publicidad. Sí nos apoyamos en
          empresas que los tratan por nuestra cuenta para que el servicio funcione:
          Supabase (cuentas, base de datos y correos de acceso), Vercel (alojamiento de la
          web), Fly.io (servidor, en Ámsterdam), Cloudflare (comprobar que no eres un
          robot), Tavily (buscar artículos), Mapbox (mapas y lugares), Google (fotos de
          sitios), Wikimedia (fotos de sitios) y Unsplash (portadas).
        </p>
        <p>
          Para convertir artículos en itinerarios y para el asistente usamos proveedores de
          inteligencia artificial. <strong className="font-medium text-foreground">No les
          enviamos tu nombre ni tu correo</strong>: solo el contenido del viaje y lo que le
          escribes al asistente. Si quieres saber cuáles usamos ahora mismo, pídenoslo en{" "}
          <LegalMail />.
        </p>
        <p>
          Algunos están fuera de la Unión Europea. Con los de Estados Unidos firmamos las
          cláusulas contractuales tipo que aprueba la Comisión Europea. Con los países que
          no tienen un acuerdo de protección de datos con Europa —hoy, China— no vale ese
          contrato, así que te lo preguntamos antes de que uses el asistente por primera
          vez en cada navegador. Si dices que no, el asistente se queda apagado y todo lo
          demás funciona igual.
        </p>
        <p>
          La IA propone y tú decides: no tomamos decisiones automatizadas que te afecten
          legalmente. Y si pulsas «Buscar vuelos», sales a Skyscanner con los datos del vuelo
          en la dirección; si el enlace de un alojamiento es de Booking —el del bloguero o
          el que genera el asistente— y el viaje tiene fechas, van en ese mismo enlace,
          como cuenta el{" "}
          <Link href="/legal/aviso-legal#enlaces-comerciales" className="font-medium text-foreground underline underline-offset-4">
            aviso legal
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection id="conservacion" title="Cuánto tiempo">
        <p>
          Mientras tengas la cuenta. Si la borras, se van contigo el perfil, los viajes y
          las conversaciones del asistente. Las sesiones de invitado que quedan abandonadas
          se limpian periódicamente.
        </p>
        <p>
          Cuando extraemos un artículo guardamos una copia asociada a su dirección web, no
          a ti, para no volver a pedírsela al blog. Esa copia no es un dato tuyo y no
          desaparece al borrar tu cuenta. Los contadores del botón de los blogs se
          borran a los 90 días.
        </p>
      </LegalSection>

      <LegalSection id="derechos" title="Tus derechos">
        <p>
          Puedes pedirnos acceder a tus datos, corregirlos, limitarlos,
          llevártelos u oponerte a que los tratemos, y retirar cuando quieras un
          consentimiento que hayas dado. Escríbenos a <LegalMail /> desde el correo de tu
          cuenta y contestaremos en menos de 30 días. Para borrar la cuenta —perfil,
          viajes, fuentes que añadiste y conversaciones— ve a Configuración; no hace
          falta escribirnos.
        </p>
        <p>
          Si crees que no lo hemos hecho bien, puedes reclamar ante la{" "}
          <a
            href={AEPD_URL}
            className="font-medium text-foreground underline underline-offset-4"
            rel="noreferrer"
            target="_blank"
          >
            Agencia Española de Protección de Datos
          </a>
          .
        </p>
        <p>Si cambiamos algo importante, actualizamos esta página y su fecha.</p>
      </LegalSection>
    </LegalDocument>
  )
}
