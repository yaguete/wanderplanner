import type { Metadata } from "next"
import Link from "next/link"
import { LegalMail, LegalSection } from "@/components/legal/legal-document"

/**
 * URL de soporte del envío al directorio de complementos (T9.8).
 *
 * La visita el revisor de OpenAI, así que responde antes de que pregunte: qué
 * es, cómo se conecta, qué datos recibe el asistente y cómo se corta el acceso.
 * El mismo texto alimenta la descripción larga del listado.
 */
export const metadata: Metadata = {
  title: "Soporte",
  description:
    "Cómo conectar WanderPlanner a un asistente, qué puede leer, cómo revocar el acceso y dónde escribirnos.",
}

const TOC = [
  { id: "complemento", label: "El complemento" },
  { id: "conectar", label: "Conectarlo" },
  { id: "permisos", label: "Permisos" },
  { id: "revocar", label: "Cortar el acceso" },
  { id: "problemas", label: "Problemas frecuentes" },
  { id: "contacto", label: "Contacto" },
] as const

const linkClass = "font-medium text-foreground underline underline-offset-4"

export default function SoportePage() {
  return (
    <main
      id="contenido"
      className="legal-main relative mx-auto w-full max-w-2xl px-6 pb-24 pt-24 sm:pt-28"
    >
      <h1 className="text-balance text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
        Soporte
      </h1>
      <p className="mt-6 text-pretty text-base leading-7 text-foreground/70">
        Dudas sobre WanderPlanner y sobre el complemento que conecta tus viajes a un
        asistente. Si no encuentras lo que buscas, escríbenos: contestamos nosotros, no
        un formulario.
      </p>

      <nav aria-label="Índice" className="mt-8 flex flex-wrap gap-x-4 gap-y-1.5">
        {TOC.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className="text-sm text-foreground/50 underline-offset-4 hover:text-foreground hover:underline"
          >
            {item.label}
          </a>
        ))}
      </nav>

      <div className="legal-prose mt-14">
        <LegalSection id="complemento" title="El complemento">
          <p>
            WanderPlanner guarda tus viajes y los artículos de blogs que tú eliges como
            fuentes. El complemento deja que un asistente consulte ese plan: qué tienes
            cada día, qué recomiendan tus artículos sobre un sitio, qué te falta por
            cerrar, cuánto llevas gastado y qué trámites pide el país al que vas.
          </p>
          <p>
            Es <strong>solo lectura</strong>. El asistente no puede crear ni cambiar nada
            de tu viaje: para eso entras en WanderPlanner.
          </p>
        </LegalSection>

        <LegalSection id="conectar" title="Conectarlo">
          <p>
            Desde el asistente, añade WanderPlanner como complemento. Se abrirá una
            pantalla nuestra pidiéndote que autorices el acceso; si no tienes la sesión
            iniciada, primero te pediremos entrar o crear una cuenta, y después volverás
            a esa misma pantalla.
          </p>
          <p>
            Para que sirva de algo necesitas <strong>al menos un viaje con alguna
            fuente añadida</strong>. Un viaje vacío no tiene nada que consultar, y el
            asistente te dirá justamente eso.
          </p>
        </LegalSection>

        <LegalSection id="permisos" title="Permisos">
          <p>
            La pantalla de autorización enumera lo que el asistente va a recibir:
            identificarte en WanderPlanner, tu correo, tu nombre y foto, y mantener la
            conexión abierta.
          </p>
          <p>
            Lo que sí recibe: tu identidad básica para saber de quién es la cuenta, y el
            contenido de los viajes que las herramientas de lectura le entregan en cada
            consulta. El detalle, campo por campo, está en la{" "}
            <Link href="/legal/privacidad#asistentes" className={linkClass}>
              política de privacidad
            </Link>
            .
          </p>
          <p>
            No le enviamos el texto completo de los artículos, las coordenadas de los
            sitios ni los correos de quienes comparten un viaje contigo.
          </p>
        </LegalSection>

        <LegalSection id="revocar" title="Cortar el acceso">
          <p>
            Entra en{" "}
            <Link href="/account/settings" className={linkClass}>
              Configuración
            </Link>{" "}
            y revoca la aplicación. El asistente pierde el acceso de inmediato; si ya
            tenía un permiso en curso, puede seguir siendo válido unos minutos hasta que
            caduque. Borrar la cuenta también corta todas las autorizaciones.
          </p>
        </LegalSection>

        <LegalSection id="problemas" title="Problemas frecuentes">
          <p>
            <strong>Dice que no tengo viajes.</strong> Comprueba que has entrado con la
            misma cuenta que autorizaste. Si acabas de crearla, todavía no hay nada que
            enseñar: crea un viaje en WanderPlanner y vuelve a preguntar.
          </p>
          <p>
            <strong>No encuentra recomendaciones.</strong> El complemento solo responde
            con lo que dicen tus fuentes; si ese viaje no tiene artículos sobre el sitio
            por el que preguntas, te lo dirá en vez de inventárselo. Añade una fuente en
            el panel de Fuentes.
          </p>
          <p>
            <strong>Me pide volver a conectar.</strong> La autorización se ha revocado o
            ha caducado. Vuelve a añadir el complemento desde el asistente y apruébalo de
            nuevo.
          </p>
          <p>
            <strong>Tarda o falla al consultar trámites.</strong> Esa consulta sale a
            nuestro servidor y puede tardar la primera vez del día. Si insiste en fallar,
            escríbenos.
          </p>
        </LegalSection>

        <LegalSection id="contacto" title="Contacto">
          <p>
            Escríbenos a <LegalMail /> y te respondemos. Cuéntanos qué preguntaste y qué
            te contestó el asistente: con eso solemos ver el problema a la primera.
          </p>
          <p>
            Para ejercer tus derechos sobre los datos, o saber qué proveedores usamos, el
            procedimiento está en la{" "}
            <Link href="/legal/privacidad" className={linkClass}>
              política de privacidad
            </Link>
            .
          </p>
        </LegalSection>
      </div>
    </main>
  )
}
