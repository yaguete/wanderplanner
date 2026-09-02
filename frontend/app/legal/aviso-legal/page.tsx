import type { Metadata } from "next"
import Link from "next/link"
import {
  LegalDocument,
  LegalHolder,
  LegalMail,
  LegalSection,
} from "@/components/legal/legal-document"
import { LEGAL, MAE_TRAVEL_ADVICE_URL } from "@/lib/legal"

export const metadata: Metadata = {
  title: "Aviso legal",
  description: "Titular, condiciones de uso e información legal de WanderPlanner.",
}

const TOC = [
  { id: "servicio", label: "Qué es WanderPlanner" },
  { id: "contenido-terceros", label: "Artículos y publicaciones" },
  { id: "inteligencia-artificial", label: "Inteligencia artificial" },
  { id: "enlaces-comerciales", label: "Enlaces que salen del sitio" },
  { id: "uso", label: "Uso del servicio" },
  { id: "titular", label: "Titular" },
  { id: "ley", label: "Ley aplicable" },
] as const

export default function AvisoLegalPage() {
  return (
    <LegalDocument
      title="Aviso legal"
      lede={
        <p>
          Quién está detrás de WanderPlanner y con qué condiciones puedes usarlo.
        </p>
      }
      toc={TOC}
    >
      <LegalSection id="servicio" title="Qué es WanderPlanner">
        <p>
          Pegas el artículo de un viajero en el que confías, o buscas un destino, y
          WanderPlanner lo convierte en un itinerario tuyo: días, sitios, tareas y un
          asistente al que preguntar. Es gratuito.
        </p>
        <p>
          Si tienes un blog, en{" "}
          <Link href="/partners" className="font-medium text-foreground underline underline-offset-4">
            /partners
          </Link>{" "}
          puedes generar un botón para el final de tus posts. Tu marca, tu tráfico y tus
          enlaces de afiliación siguen siendo tuyos.
        </p>
      </LegalSection>

      <LegalSection id="contenido-terceros" title="Artículos y publicaciones de otros">
        <p>
          Los artículos y publicaciones que procesamos son de sus autores. Los leemos porque tú
          pegas la URL o porque el propio autor nos lo pide desde su blog, conservamos siempre
          la atribución y enlazamos al original.
        </p>
        <p>
          Si eres el autor y quieres que retiremos un artículo o una publicación, escríbenos a{" "}
          <LegalMail /> con la dirección. Lo hacemos en un plazo máximo de 72 horas laborables.
          De una publicación de Instagram conservamos el texto del pie y, si hace falta, la
          transcripción del texto que aparece en las fotos; las imágenes no se guardan.
        </p>
      </LegalSection>

      <LegalSection id="inteligencia-artificial" title="Inteligencia artificial">
        <p>
          El itinerario, las respuestas del asistente y el resumen de la ruta para
          compartir los genera un sistema de inteligencia artificial. Puede equivocarse:
          inventar un horario, colocar mal un sitio u olvidar un trámite. Lo que ves es una
          propuesta que decides tú, nunca una reserva ni un consejo profesional.
        </p>
        <p>
          También puedes conectar un asistente de terceros para consultar tus viajes en
          modo lectura. Lo que ve y cómo se corta esa conexión está en la{" "}
          <Link href="/legal/privacidad#asistentes" className="font-medium text-foreground underline underline-offset-4">
            política de privacidad
          </Link>
          .
        </p>
        <p>
          Los trámites de país que sugerimos resumen las{" "}
          <a
            href={MAE_TRAVEL_ADVICE_URL}
            className="font-medium text-foreground underline underline-offset-4"
            rel="noreferrer"
            target="_blank"
          >
            Recomendaciones de viaje del Ministerio de Asuntos Exteriores
          </a>
          . Consulta siempre la fuente oficial antes de viajar.
        </p>
      </LegalSection>

      <LegalSection id="enlaces-comerciales" title="Enlaces que salen del sitio">
        <p>
          Si el artículo original traía enlaces de afiliación del autor, los conservamos:
          quien cobra, si cobra, es él. Si el enlace es de Booking y el viaje tiene fechas,
          las añadimos al mismo enlace; el afiliado del autor no cambia.
        </p>
        <p>
          Si un alojamiento no venía de una fuente —te lo recomienda el asistente o lo
          añades tú—, el enlace de reserva va a Booking con nuestro identificador de
          afiliado: el nombre del hotel, el destino, las fechas y el número de viajeros
          viajan en la dirección. Si reservas por ahí, Booking puede pagarnos una
          comisión. Eso no sustituye nunca el enlace de un bloguero. En el mismo formulario
          hay búsquedas a Airbnb y a HomeExchange con el destino, las fechas y el número
          de viajeros ya puestos; hoy no cobramos comisión por esos clics, y si algún día
          lo hacemos se dirá aquí.
        </p>
        <p>
          «Buscar vuelos» te lleva a Skyscanner con el origen, el destino, las fechas y el
          número de viajeros ya puestos, así que Skyscanner ve esos datos. Hoy no cobramos
          comisión por esos clics; si algún día lo hacemos, se dirá aquí.
        </p>
        <p>
          Si una actividad no venía de una fuente —te la recomienda el asistente o la
          añades tú—, los botones de búsqueda te llevan a Civitatis y a GetYourGuide (a
          través de Stay22) con nuestro identificador de afiliado: el destino y, en
          GetYourGuide, las fechas y el número de viajeros van en la dirección. Stay22 es
          un intermediario: ve destino y fechas para redirigirte. Eso no sustituye nunca el
          enlace de un bloguero.
        </p>
      </LegalSection>

      <LegalSection id="uso" title="Uso del servicio">
        <p>
          Necesitas al menos 14 años. Hay límites de uso para que las herramientas de IA no
          se disparen de coste; si los superas, el servicio te avisa. Podemos suspender una
          cuenta que ataque el servicio, extraiga sitios ajenos a destajo o suplante a
          alguien.
        </p>
        <p>
          El servicio se ofrece tal cual, sin garantía de estar siempre disponible. No
          respondemos de reservas perdidas, información desactualizada ni de lo que hagas
          con un itinerario generado. La marca y el código son nuestros; tus viajes y tus
          notas son tuyos.
        </p>
      </LegalSection>

      <LegalSection id="titular" title="Titular">
        <p>
          WanderPlanner.ai es un servicio de <LegalHolder />
          {LEGAL.nif ? <> ({LEGAL.nif})</> : null}, persona física residente en{" "}
          {LEGAL.country}.
          {LEGAL.address ? (
            <> Domicilio a efectos de notificaciones: {LEGAL.address}.</>
          ) : null}
          {!LEGAL.nif || !LEGAL.address ? (
            <>
              {" "}
              Facilitamos {!LEGAL.nif && !LEGAL.address ? "el NIF y el domicilio" : null}
              {!LEGAL.nif && LEGAL.address ? "el NIF" : null}
              {LEGAL.nif && !LEGAL.address ? "el domicilio" : null} a efectos de
              notificaciones a quien lo solicite en <LegalMail />.
            </>
          ) : (
            <>
              {" "}
              Puedes escribirnos a <LegalMail />.
            </>
          )}
        </p>
      </LegalSection>

      <LegalSection id="ley" title="Ley aplicable">
        <p>
          Se aplica la ley española. Para cualquier disputa, y salvo que las normas de
          consumo digan otra cosa, los juzgados del domicilio del titular.
        </p>
        <p>
          Qué hacemos con tus datos está en la{" "}
          <Link href="/legal/privacidad" className="font-medium text-foreground underline underline-offset-4">
            política de privacidad
          </Link>{" "}
          y en la de{" "}
          <Link href="/legal/cookies" className="font-medium text-foreground underline underline-offset-4">
            cookies
          </Link>
          .
        </p>
      </LegalSection>
    </LegalDocument>
  )
}
