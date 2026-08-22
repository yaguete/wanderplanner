import { MAX_SOURCES_PER_TRIP } from "@/lib/trip-sources"
import type { ComponentType, ReactNode } from "react"
import {
  MockOnboardingAssistant,
  MockOnboardingFuentes,
  MockOnboardingMecanismo,
  MockOnboardingMiViaje,
} from "./onboarding-mocks"

export type OnboardingSlideId = "mecanismo" | "fuentes" | "viaje" | "asistente"

export type OnboardingSlide = {
  id: OnboardingSlideId
  /** Nombre del panel junto a la ardilla (slides 2–4). Mismo lockup que el wordmark. */
  kicker?: string
  title: string
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
    title: "Ese viaje que te ha gustado. Ahora, hagámoslo a tu manera.",
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
    title: "Convierte el artículo o reel que te ha gustado en actividades y alojamientos listos para reservar",
    body: (
      <>
        Puedes leer la <PanelName>Crónica</PanelName> tal y como aparece en la web original, o puedes o ir directamente a la pestaña <PanelName>Ruta</PanelName> para empezar a ubicar las activades, alojamientos o lugares que se recomiendan en tu propio plan de viaje.
      </>
    ),
    footer: `¿Aún no tienes ninguna fuente? No te preocupes, elige un destino y nosotros te sugerimos artículos de los mejores blogs y revistas de viaje.`,
    Mock: MockOnboardingFuentes,
  },
  {
    id: "viaje",
    kicker: "Viaje",
    title: "Personaliza la ruta a tu gusto, con todas las compras y reservas a un click",
    body: "Coges lo que más gusta de cada fuente y lo añades a tu ruta. Convínalo con tus propios planes, y luego refina los últimos detalles con el asistente.",
    footer: "WanderPlanner lleva la cuenta de lo que falta por reservar y de lo que cuesta.",
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
]
