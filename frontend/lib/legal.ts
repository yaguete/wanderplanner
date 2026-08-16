/**
 * Identidad e inventario de almacenamiento para /legal/*.
 * Una sola fuente: las tres páginas y el sitemap leen de aquí.
 *
 * Los proveedores de IA NO se nombran en las páginas: la prosa habla por
 * categorías y se facilitan por correo si alguien los pide (art. 13.1.e RGPD,
 * «categorías de destinatarios»). Lo que sí es obligatorio decir es el país y
 * la garantía, y eso está escrito a mano en #terceros de /legal/privacidad.
 *
 * Si cambias de proveedor a uno de un país nuevo, repasa ese párrafo y el texto
 * del consentimiento en `components/ai-transfer-gate.tsx`.
 */
import { SITE_URL } from "@/lib/site"

const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const

/** `2026-08-16` → `16 de agosto de 2026`. */
export function formatLegalDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map((p) => Number(p))
  if (!year || !month || !day) return isoDate
  const name = MONTHS_ES[month - 1]
  if (!name) return isoDate
  return `${day} de ${name} de ${year}`
}

export const LEGAL = {
  siteName: "WanderPlanner",
  siteUrl: SITE_URL,
  email: "hola@wanderplanner.ai",
  holderName: "Yago López",
  country: "España",
  /** Art. 10 LSSI: obligatorios. Vacío = no inventar; la página lo dice en claro. */
  nif: "",
  address: "",
  updatedAt: "2026-08-16",
} as const

export const MAE_TRAVEL_ADVICE_URL =
  "https://www.exteriores.gob.es/es/ServiciosAlCiudadano/Paginas/Detalle-recomendaciones-de-viaje.aspx"

export const AEPD_URL = "https://www.aepd.es"

export type StorageRow = {
  name: string
  kind: string
  purpose: string
  duration: string
}

/**
 * Agrupado por finalidad, no una fila por clave: la AEPD pide informar, no
 * publicar el mapa de `localStorage`. La analítica no está aquí porque no usa
 * cookies y va en su propio apartado.
 */
export const STORAGE_INVENTORY: readonly StorageRow[] = [
  {
    name: "sb-…",
    kind: "Cookie",
    purpose: "Mantener tu sesión iniciada, tengas cuenta o entres como invitado",
    duration: "Hasta que cierras sesión",
  },
  {
    name: "wp-consent",
    kind: "Almacenamiento local",
    purpose: "Recordar tu respuesta sobre la medición de visitas",
    duration: "13 meses",
  },
  {
    name: "wp-ai-transfer-consent:…",
    kind: "Almacenamiento local",
    purpose:
      "Recordar que aceptaste usar el asistente, sin volver a preguntártelo en cada visita",
    duration: "Hasta que lo borres",
  },
  {
    name: "wp-…",
    kind: "Almacenamiento local y de sesión",
    purpose:
      "Tus preferencias de pantalla y una caché de lo que ya has visto (mapas, fotos, sugerencias), para no volver a pedirlo",
    duration: "Desde la pestaña actual hasta 30 días",
  },
] as const
