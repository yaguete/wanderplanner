import { MAX_SOURCES_PER_TRIP } from "@/lib/trip-sources"
import type { ComponentType, ReactNode } from "react"
import {
  MockOnboardingAssistant,
  MockOnboardingFuentes,
  MockOnboardingMecanismo,
  MockOnboardingMiViaje,
  MockOnboardingInvitar,
} from "./onboarding-mocks"

export type OnboardingSlideId =
  | "mecanismo"
  | "fuentes"
  | "viaje"
  | "asistente"
  | "invitar"

export type OnboardingSlide = {
  id: OnboardingSlideId
  /** Nombre junto a la ardilla (slides 2–5). Mismo lockup que el wordmark. */
  kicker?: string
  title: ReactNode
  body: ReactNode
  footer: ReactNode
  Mock: ComponentType
}

function PanelName({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-foreground">{children}</strong>
}

export const ONBOARDING_SLIDES: readonly OnboardingSlide[] = [
  {
    id: "mecanismo",
    title: (
      <>
        Ese viaje te ha gustado.
        <br />
        Ahora, hagámoslo a tu manera.
      </>
    ),
    body: "WanderPlanner organiza todo lo que has encontrado y te ayuda a adaptar y configurar tu propia ruta.",
    footer: (
      <>
        Sin capturas, sin notas sueltas, sin un Google Doc o un Excel a medias. Todo en un solo lugar: tus <PanelName>fuentes</PanelName> de inspiración, tu plan de{" "}
        <PanelName>viaje</PanelName> y un <PanelName>asistente</PanelName> que te ayuda a tomar decisiones.
      </>
    ),
    Mock: MockOnboardingMecanismo,
  },
  {
    id: "fuentes",
    kicker: "Fuentes",
    title: "El post o reel se transforma en actividades y alojamientos listos para reservar",
    body: (
      <>
        En la pestaña <PanelName>Ruta</PanelName> tienes todo el itinerario listo para añadir a tu propio plan de viaje. En <PanelName>Crónica</PanelName> encontrarás el texto tal y como aparece en la web original. 
      </>
    ),
    footer: `Puedes añadir hasta 5 fuentes diferentes para cada viaje (post, artículos, reels, ...). Añade tus propias fuentes o selecciona una de las sugeridas.`,
    Mock: MockOnboardingFuentes,
  },
  {
    id: "viaje",
    kicker: "Viaje",
    title: "Personaliza la ruta a tu gusto, con todas las compras y reservas a un clic",
    body: "Coges lo que más gusta de cada fuente y lo añades a tu ruta. Convínalo con tus propios planes, y luego refina los últimos detalles con el asistente. Los descuentos y promociones de afiliado siguen ahí.",
    footer: "Además, WanderPlanner lleva la cuenta de lo que lo que te falta por hacer, y de lo que cuesta.",
    Mock: MockOnboardingMiViaje,
  },
  {
    id: "asistente",
    kicker: "Asistente",
    title: "Revisa tu plan y evita sorpresas: confirma trámites, horarios y consejos prácticos",
    body: "El asistente revisa fuentes oficiales para anticipar trámites recomendados para tu destino (como vacunas o visados). Pero también te avisa si el museo cierra justo tu día, o si ese plan es adecuado para hacer con niños.",
    footer: "Tiene en cuenta qué tipo de viajero/a eres, qué esperas de tu viaje, y las fuentes que has añadido. No inventa: cita de dónde saca la información, y si no sabe, lo dice.",
    Mock: MockOnboardingAssistant,
  },
  {
    id: "invitar",
    kicker: "Invitar · Compartir",
    title: (
      <>
        Invita a quien planifica contigo.
        <br />
        Comparte la ruta con el resto.
      </>
    ),
    body: (
      <>
        Con <PanelName>Invitar</PanelName>, añades a otras personas a tu plan para construirlo conjuntamente. Con{" "}
        <PanelName>Compartir</PanelName>, obtienes un resumen para pegar en WhatsApp, email o Telegram (es para contar qué vais a hacer, no para que lo toquen).
      </>
    ),
    footer:
      "El asistente de cada uno sigue siendo privado. El resumen no habla de lo que cuesta: es el recado del plan, no la cuenta.",
    Mock: MockOnboardingInvitar,
  },
]
