/**
 * CTA de DiscoverCars para el alquiler añadido a mano / asistente.
 * Analogía de [`booking-search.ts`](./booking-search.ts): el href se pinta
 * al vuelo y **no** se persiste en `affiliateUrl`.
 *
 * Contrato verificado el 6 sep 2026 en navegador:
 * `https://www.discovercars.com/es?a_aid=lacosmopolilla` abre la home
 * española con el afiliado. Las búsquedas reales van a
 * `/es/search/<id>?sq=<base64>` con IDs internos de locación, edad y
 * residencia — no hay un query string reutilizable de ciudad/fechas.
 * Un 200 en `/spain/madrid` no demuestra prefill: el slug es inglés y
 * adivinarlo desde «Edimburgo» o «Roma» es el mismo engaño que HomeExchange
 * sin `/es`. Por eso v1 **solo** usa la home + `a_aid`.
 *
 * Copy junto al CTA: «Elige la ciudad y las fechas en DiscoverCars».
 */
export const DISCOVERCARS_AFFILIATE_AID = "lacosmopolilla"

const DISCOVERCARS_HOME = "https://www.discovercars.com/es"

export function isDiscoverCarsUrl(href: string | null | undefined): boolean {
  if (!href) return false
  try {
    const host = new URL(href).hostname.replace(/^www\./i, "").toLowerCase()
    return host === "discovercars.com" || host.endsWith(".discovercars.com")
  } catch {
    return false
  }
}

export function isOwnDiscoverCarsUrl(href: string | null | undefined): boolean {
  if (!href || !isDiscoverCarsUrl(href)) return false
  try {
    return new URL(href).searchParams.get("a_aid") === DISCOVERCARS_AFFILIATE_AID
  } catch {
    return false
  }
}

/** Home española + afiliado propio. Ciudad y fechas las elige la persona. */
export function buildDiscoverCarsSearchUrl(_params?: {
  city?: string | null
  pickupISO?: string | null
  returnISO?: string | null
}): string {
  const url = new URL(DISCOVERCARS_HOME)
  url.searchParams.set("a_aid", DISCOVERCARS_AFFILIATE_AID)
  return url.toString()
}

/**
 * Href del CTA. No se llama si hay `affiliateUrl` de fuente (el caller
 * ya aplicó precedencia). Ignora ciudad/fechas hasta que exista contrato.
 */
export function carRentalFormSearchHref(_params?: {
  city?: string | null
  startDate?: string | null
  pickupIndex?: number
  returnIndex?: number
  affiliateUrl?: string | null
}): string {
  return buildDiscoverCarsSearchUrl()
}
